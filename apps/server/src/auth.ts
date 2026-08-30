import { env } from "@SchedulesManager/env/server";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

const supabaseIssuer = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
const supabaseJwks = createRemoteJWKSet(
	new URL(`${supabaseIssuer}/.well-known/jwks.json`),
);

export class AuthenticationError extends Error {
	constructor(message = "Authentication required") {
		super(message);
		this.name = "AuthenticationError";
	}
}

export interface AuthenticatedUser extends JWTPayload {
	sub: string;
	email?: string;
	role?: string;
}

export async function verifyAccessToken(authorization: string | undefined) {
	const [scheme, token] = authorization?.split(" ") ?? [];

	if (scheme !== "Bearer" || !token) {
		throw new AuthenticationError();
	}

	try {
		const { payload } = await jwtVerify(token, supabaseJwks, {
			issuer: supabaseIssuer,
			audience: "authenticated",
		});

		if (!payload.sub) {
			throw new AuthenticationError("Token does not identify a user");
		}

		return payload as AuthenticatedUser;
	} catch (error) {
		if (error instanceof AuthenticationError) {
			throw error;
		}

		throw new AuthenticationError("Invalid or expired access token");
	}
}
