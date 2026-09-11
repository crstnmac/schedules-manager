import {
	type ApiKey,
	type ApiKeyScope,
	apiKeys,
	db,
} from "@SchedulesManager/db";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { AuthenticationError } from "./auth";
import { ForbiddenError } from "./errors";

export interface GeneratedApiKey {
	token: string;
	prefix: string;
	hash: string;
}

export function hashApiKey(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a `jl_live_<random>` token. Only the hash is stored; the full token is
 * shown to the caller once, and the short prefix identifies it later.
 */
export function generateApiKey(): GeneratedApiKey {
	const token = `jl_live_${randomBytes(32).toString("base64url")}`;
	return { token, prefix: token.slice(0, 16), hash: hashApiKey(token) };
}

function tokenFromHeaders(
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

/**
 * Resolves the Workplace for a scoped API key and enforces its scope. Revoked
 * and expired keys are rejected with 401; a valid key missing the scope is 403.
 */
export async function requireApiKey(
	headers: Headers | Record<string, string | undefined>,
	requiredScope: ApiKeyScope,
): Promise<{ apiKey: ApiKey; workplaceId: string }> {
	const token = tokenFromHeaders(headers);
	if (!token) throw new AuthenticationError("An API key is required");

	const [apiKey] = await db
		.select()
		.from(apiKeys)
		.where(eq(apiKeys.keyHash, hashApiKey(token)))
		.limit(1);
	if (!apiKey) throw new AuthenticationError("Invalid API key");
	if (apiKey.revokedAt)
		throw new AuthenticationError("This API key has been revoked");
	if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
		throw new AuthenticationError("This API key has expired");
	}
	if (!apiKey.scopes.includes(requiredScope)) {
		throw new ForbiddenError(
			`This API key is missing the ${requiredScope} scope`,
		);
	}

	await db
		.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(eq(apiKeys.id, apiKey.id));

	return { apiKey, workplaceId: apiKey.workplaceId };
}
