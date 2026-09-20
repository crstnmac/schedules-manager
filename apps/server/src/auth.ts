import * as authSchema from "@SchedulesManager/db";
import { db, profiles } from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { expo } from "@better-auth/expo";
import { mcp } from "@better-auth/mcp";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { DpopReplayReservations } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins";
import { bearer } from "better-auth/plugins/bearer";
import { sendEmailVerificationEmail, sendPasswordResetEmail } from "./mail";

export { AuthenticationError } from "./errors";

export type AuthenticatedUser = {
	id: string;
	email: string;
	name: string;
	emailVerified: boolean;
	image: string | null;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * The auth instance's type is intentionally narrowed to the surface this app
 * uses. better-auth's fully-inferred type (with the OAuth provider plugin)
 * is not portable across package boundaries for declaration emit, and nothing
 * outside this file needs the wider shape.
 */
export interface JoolingAuth {
	handler: (request: Request) => Promise<Response>;
	options: BetterAuthOptions;
	$context: Promise<{
		baseURL: string;
		internalAdapter: DpopReplayReservations;
	}>;
	api: {
		getSession(input: { headers: Headers }): Promise<{
			user: AuthenticatedUser;
			session: { id: string; userId: string };
		} | null>;
	};
	$Infer: {
		Session: { user: AuthenticatedUser };
	};
}

// The OAuth provider seeds its resource row at plugin init, so plain unit
// runs (bun test, no database) omit it. Integration runs set
// RUN_INTEGRATION_TESTS=1 and every real environment gets the full stack.
const unitTestRun =
	process.env.NODE_ENV === "test" && process.env.RUN_INTEGRATION_TESTS !== "1";

const oauthPlugins: BetterAuthOptions["plugins"] = [
	// Supplies the signing keys and JWKS endpoint the MCP OAuth provider
	// issues and verifies access tokens with.
	jwt(),
	mcp({
		// The web app renders sign-in and consent; the provider redirects
		// there with the signed authorize query and the pages resume the flow
		// against the API.
		loginPage: `${env.APP_URL}/oauth`,
		consentPage: `${env.APP_URL}/consent`,
		resource:
			env.MCP_RESOURCE_URL ?? `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/mcp`,
		// jooling's integration scope vocabulary, shared with Workplace API
		// keys, plus the OIDC baselines MCP clients expect.
		scopes: [
			"openid",
			"profile",
			"email",
			"offline_access",
			"schedule.read",
			"schedule.write",
			"workers.read",
			"workers.write",
			"reports.read",
			"requests.read",
			"requests.write",
		],
		// MCP clients (Claude, assistants, CLIs) self-register as public
		// clients with PKCE; user consent still gates every authorization.
		allowDynamicClientRegistration: true,
		allowUnauthenticatedClientRegistration: true,
	}),
	// MCP 2026-07-28 pins Client ID Metadata Documents draft-00; Claude Code
	// prefers CIMD over the deprecated DCR fallback (plain DCR without
	// application_type is classified "web" and rejects loopback http redirects).
	cimd({
		fetchClientMetadataResource,
		metadataProfile: "mcp-2026-07-28",
	}),
];

const authOptions: BetterAuthOptions = {
	appName: "jooling",
	database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
	emailAndPassword: {
		enabled: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({
			user: authUser,
			url,
		}: {
			user: { email: string; name: string };
			url: string;
		}) => {
			await sendPasswordResetEmail({
				email: authUser.email,
				name: authUser.name,
				url,
			});
		},
	},
	// Verification mail is sent on sign-up so users can prove mailbox control.
	// requireEmailVerification stays off (it would lock existing users out of
	// sign-in); the security-sensitive boundary — claiming invitations — is
	// gated on a live emailVerified check in the invitations routes instead.
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({
			user: authUser,
			url,
		}: {
			user: { email: string; name: string };
			url: string;
		}) => {
			await sendEmailVerificationEmail({
				email: authUser.email,
				name: authUser.name,
				url,
			});
		},
	},
	trustedOrigins: [env.APP_URL, "jooling://"],
	advanced: { database: { generateId: "uuid" as const } },
	databaseHooks: {
		user: {
			create: {
				after: async (createdUser: {
					id: string;
					email: string;
					name: string;
				}) => {
					await db
						.insert(profiles)
						.values({
							id: createdUser.id,
							email: createdUser.email.toLowerCase(),
							fullName: createdUser.name || null,
						})
						.onConflictDoNothing();
				},
			},
		},
	},
	plugins: [expo(), bearer(), ...(unitTestRun ? [] : oauthPlugins)],
};

export const auth = betterAuth(authOptions) as unknown as JoolingAuth;
