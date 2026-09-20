import type {
	ApiKeyScope,
	Employment,
	EmploymentPrivilege,
} from "@SchedulesManager/db";
import {
	db,
	employmentLocations,
	employments,
	jwks,
} from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { and, eq } from "drizzle-orm";
import { createLocalJWKSet, type JWK, jwtVerify } from "jose";

import { requireApiKey } from "./api-key-auth";
import { auth } from "./auth";
import { hasPrivilege } from "./context";
import { AuthenticationError, ForbiddenError } from "./errors";

/**
 * The integration scope vocabulary. Workplace API keys carry these literally;
 * human principals (OAuth MCP access tokens, better-auth sessions) hold the
 * mapped Employment privileges instead, and the mapping below decides what
 * they may do.
 */
const PRIVILEGE_BY_SCOPE: Record<ApiKeyScope, EmploymentPrivilege> = {
	"schedule.read": "schedule.view",
	"schedule.write": "schedule.manage",
	"workers.read": "schedule.view",
	"workers.write": "workers.manage",
	"reports.read": "reports.view",
	"requests.read": "schedule.view",
	"requests.write": "approvals.review",
};

const ALL_SCOPES = Object.keys(PRIVILEGE_BY_SCOPE) as ApiKeyScope[];

export interface IntegrationActor {
	/** How the caller authenticated. */
	kind: "apiKey" | "principal";
	workplaceId: string;
	/** Effective integration scopes granted to this actor. */
	scopes: ReadonlySet<string>;
	/**
	 * Profile id of the human behind the actor. API keys surface the Manager
	 * who created them; principals are their own profile. Publication uses it
	 * for attribution.
	 */
	profileId: string | null;
	employmentId: string | null;
	/**
	 * Location ids the actor may see. `null` means unrestricted (API keys and
	 * unscoped managers).
	 */
	locationScope: string[] | null;
	/** Whether the actor may publish (schedule.write +, for principals, schedule.publish). */
	canPublish: boolean;
	can(scope: ApiKeyScope): boolean;
}

function apiKeyActor(
	workplaceId: string,
	scopes: readonly string[],
	createdBy: string | null,
): IntegrationActor {
	const granted = new Set(scopes);
	return {
		kind: "apiKey",
		workplaceId,
		scopes: granted,
		profileId: createdBy,
		employmentId: null,
		locationScope: null,
		canPublish: granted.has("schedule.write"),
		can: (scope) => granted.has(scope),
	};
}

/**
 * Resolves the Workplace an authenticated principal acts on. With an explicit
 * workplace it must be one of their active Employments; with none, it resolves
 * only when exactly one active Employment exists.
 */
export async function resolvePrincipalWorkplace(
	profileId: string,
	requestedWorkplaceId: string | null,
): Promise<{ employment: Employment; workplaceId: string }> {
	const rows = await db
		.select()
		.from(employments)
		.where(
			and(
				eq(employments.profileId, profileId),
				eq(employments.status, "active"),
			),
		);
	if (requestedWorkplaceId) {
		const employment = rows.find(
			(row) => row.workplaceId === requestedWorkplaceId,
		);
		if (!employment) {
			throw new ForbiddenError(
				"You are not an active member of that Workplace",
			);
		}
		return { employment, workplaceId: requestedWorkplaceId };
	}
	if (rows.length === 1 && rows[0]) {
		return { employment: rows[0], workplaceId: rows[0].workplaceId };
	}
	throw new ForbiddenError(
		rows.length === 0
			? "You are not an active member of any Workplace"
			: "You belong to multiple Workplaces; pass x-workplace-id to choose one",
	);
}

/**
 * Managers see every Location; scoped viewer-kind Employment is limited to its
 * explicit assignments. `null` means unrestricted.
 */
async function principalLocationScope(
	employment: Employment,
): Promise<string[] | null> {
	if (employment.kind === "manager") return null;
	const rows = await db
		.select({ locationId: employmentLocations.locationId })
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, employment.id));
	if (rows.length === 0) return null;
	return rows.map((row) => row.locationId);
}

function scopesForPrivileges(employment: Employment): Set<string> {
	const granted = new Set<string>();
	for (const scope of ALL_SCOPES) {
		const privilege = PRIVILEGE_BY_SCOPE[scope];
		if (privilege && hasPrivilege(employment, privilege)) {
			granted.add(scope);
		}
	}
	return granted;
}

async function principalActor(
	profileId: string,
	requestedWorkplaceId: string | null,
): Promise<IntegrationActor> {
	const { employment, workplaceId } = await resolvePrincipalWorkplace(
		profileId,
		requestedWorkplaceId,
	);
	// jooling's integration surface is manager-shaped; worker Employments have
	// their own product surfaces and never act through it.
	if (employment.kind === "worker") {
		throw new ForbiddenError(
			"Integration access requires a manager role at this Workplace",
		);
	}
	const scopes = scopesForPrivileges(employment);
	return {
		kind: "principal",
		workplaceId,
		scopes,
		profileId,
		employmentId: employment.id,
		locationScope: await principalLocationScope(employment),
		canPublish:
			scopes.has("schedule.write") &&
			hasPrivilege(employment, "schedule.publish"),
		can: (scope) => scopes.has(scope),
	};
}

function bearerToken(
	headers: Headers | Record<string, string | undefined>,
): string | null {
	const requestHeaders =
		headers instanceof Headers
			? headers
			: new Headers(
					Object.entries(headers).filter(
						(entry): entry is [string, string] => entry[1] !== undefined,
					),
				);
	const authorization = requestHeaders.get("authorization");
	if (authorization?.toLowerCase().startsWith("bearer ")) {
		return authorization.slice("bearer ".length).trim() || null;
	}
	return requestHeaders.get("x-api-key")?.trim() || null;
}

function requestedWorkplaceId(
	headers: Headers | Record<string, string | undefined>,
): string | null {
	const requestHeaders =
		headers instanceof Headers
			? headers
			: new Headers(
					Object.entries(headers).filter(
						(entry): entry is [string, string] => entry[1] !== undefined,
					),
				);
	return requestHeaders.get("x-workplace-id")?.trim() || null;
}

function looksLikeJwt(token: string): boolean {
	return token.split(".").length === 3;
}

async function verifyMcpAccessToken(token: string): Promise<{
	profileId: string;
	scopes: string[];
}> {
	const resource = mcpResourceUrl();
	// Same issuer/audience binding that requireMcpAuth enforces on /mcp; a
	// token accepted for tools is accepted here and vice versa. Issuer comes
	// from auth context — better-auth appends /api/auth to the raw
	// BETTER_AUTH_URL, and the tokens' iss uses that normalized value.
	const { baseURL } = await auth.$context;
	const { payload } = await jwtVerify(token, await localJwks(), {
		issuer: baseURL.replace(/\/$/, ""),
		audience: resource ?? undefined,
	});
	const scopeClaim = payload.scope;
	const scopes = Array.isArray(scopeClaim)
		? scopeClaim.map(String)
		: typeof scopeClaim === "string"
			? scopeClaim.split(" ").filter(Boolean)
			: [];
	return { profileId: String(payload.sub ?? ""), scopes };
}

// MCP access tokens are signed by the jwt() plugin's keys, which it stores in
// the jwks table (expired keys keep a 30-day grace period). Read them directly
// — a short cache avoids a database round trip on every integration call.
let cachedJwks: { keys: JWK[] } | null = null;
let cachedJwksAt = 0;

async function localJwks() {
	if (!cachedJwks || Date.now() - cachedJwksAt > 60_000) {
		const rows = await db.select().from(jwks);
		const keys = rows
			.filter((row) => !row.expiresAt || row.expiresAt.getTime() > Date.now())
			.map((row) => ({
				kid: row.id,
				alg: row.alg ?? "EdDSA",
				...(JSON.parse(row.publicKey) as Record<string, unknown>),
			}));
		cachedJwks = { keys: keys as JWK[] };
		cachedJwksAt = Date.now();
	}
	return createLocalJWKSet({ keys: cachedJwks.keys });
}

/**
 * Resolves who is calling an integration endpoint and what they may do.
 *
 * Credentials, in order:
 * 1. `jl_live_…` Workplace API keys — scope-checked literally, workplace-bound.
 * 2. MCP OAuth access tokens (JWTs) — verified against the authorization
 *    server, audience-bound to this resource, scopes from the token claim.
 * 3. better-auth session tokens — scopes derived from Employment privileges.
 *
 * Throws AuthenticationError (401) / ForbiddenError (403).
 */
export async function requireIntegrationActor(
	headers: Headers | Record<string, string | undefined>,
	requiredScope?: ApiKeyScope,
): Promise<IntegrationActor> {
	const token = bearerToken(headers);
	if (!token) {
		throw new AuthenticationError(
			"Present a Workplace API key or an authorized access token as Bearer",
		);
	}

	if (token.startsWith("jl_live_")) {
		const actor = await requireApiKey(headers, requiredScope);
		return apiKeyActor(
			actor.workplaceId,
			actor.apiKey.scopes,
			actor.apiKey.createdBy,
		);
	}

	let principal: { profileId: string; scopes: string[] } | null = null;
	if (looksLikeJwt(token)) {
		principal = await verifyMcpAccessToken(token);
	} else {
		const session = await auth.api.getSession({
			headers:
				headers instanceof Headers
					? headers
					: new Headers(
							Object.entries(headers).filter(
								(entry): entry is [string, string] => entry[1] !== undefined,
							),
						),
		});
		if (!session) {
			throw new AuthenticationError("This session is no longer valid");
		}
		principal = { profileId: session.user.id, scopes: [] };
	}

	const actor = await principalActor(
		principal.profileId,
		requestedWorkplaceId(headers),
	);
	if (requiredScope && !actor.can(requiredScope)) {
		throw new ForbiddenError(
			`This credential is missing the ${requiredScope} scope`,
		);
	}
	return actor;
}

export function mcpResourceUrl(): string | null {
	return (
		env.MCP_RESOURCE_URL ?? `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/mcp`
	);
}
