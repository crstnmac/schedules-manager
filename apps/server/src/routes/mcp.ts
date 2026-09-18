import { env } from "@SchedulesManager/env/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { Elysia } from "elysia";
import {
	bearerFromRequest,
	createMcpRequestHandler,
	JoolingApi,
	McpAuthError,
} from "mcp";
import { auth, type JoolingAuth } from "../auth";
import { mcpResourceUrl } from "../integration-auth";

const authProxy: JoolingAuth = auth;

interface CreateMcpRoutesOptions {
	/** Executes a request against this same Elysia app (loopback). */
	handleIntegration: (request: Request) => Promise<Response>;
}

/**
 * Hosts the jooling MCP server inside the API process at /mcp.
 *
 * Authentication is OAuth 2.1 via @better-auth/mcp: requireMcpAuth verifies
 * the access token (signature, issuer, audience bound to the MCP resource,
 * expiry, DPoP when bound) and answers unauthenticated calls with RFC 9728
 * challenges that drive MCP clients through authorization. Workplace API keys
 * (`jl_live_…`) remain valid for local/CLI clients.
 *
 * Tool execution reuses the integration endpoints over an in-process loopback,
 * so authorization (scopes for keys, Employment privileges for principals) and
 * location scoping live in exactly one place.
 */
export function createMcpRoutes(options: CreateMcpRoutesOptions) {
	const resourceMetadataUrl = `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource/mcp`;
	const resource = mcpResourceUrl() ?? undefined;

	const { handler } = createMcpRequestHandler({
		authenticate: async (request) => {
			const token = bearerFromRequest(request);
			if (!token) return null;

			// Resolve the caller through the integration surface — the same
			// authorization every tool call will pass through.
			const context = await options.handleIntegration(
				new Request("http://mcp.internal/v1/integration/context", {
					headers: { authorization: `Bearer ${token}` },
				}),
			);
			if (!context.ok) {
				let code = "unauthorized";
				let message = "Authorization failed.";
				try {
					const body = (await context.json()) as {
						error?: string;
						message?: string;
					};
					if (body.error) code = body.error;
					if (body.message) message = body.message;
				} catch {
					// keep fallbacks
				}
				throw new McpAuthError(
					context.status === 401 ? 401 : 403,
					code,
					message,
				);
			}
			const workplace = (await context.json()) as {
				workplace: { id: string };
			};
			// The credential itself is the stable session identity, so a rotated
			// or different key cannot adopt an existing session.
			return { id: token, workplaceId: workplace.workplace.id };
		},
		createApi: (principal, request) => {
			const token = bearerFromRequest(request) ?? "";
			return new JoolingApi({
				baseUrl: "http://mcp.internal",
				apiKey: token,
				fetchImpl: (input, init) => {
					const headers = new Headers(init?.headers);
					headers.set("x-workplace-id", principal.workplaceId);
					const resolved = typeof input === "string" ? input : input.toString();
					return options.handleIntegration(
						new Request(resolved, { ...init, headers }),
					);
				},
			});
		},
		resourceMetadataUrl,
	});

	// OAuth requests (JWTs, or no credential at all) go through requireMcpAuth
	// for signature, issuer, audience, expiry, and DPoP verification plus the
	// RFC 6750/9728 challenges. Workplace API keys are not JWTs — they bypass
	// JWT verification and are resolved by the integration surface instead.
	const oauthHandler = requireMcpAuth(authProxy, handler, { resource });

	const entry = (request: Request): Promise<Response> => {
		const token = bearerFromRequest(request);
		if (token?.startsWith("jl_live_")) return handler(request);
		return oauthHandler(request);
	};

	return new Elysia({ prefix: "/mcp", tags: ["MCP"] }).all(
		"/",
		({ request }) => entry(request),
		{
			detail: {
				summary: "Model Context Protocol endpoint (Streamable HTTP)",
				description:
					"OAuth 2.1 protected resource. MCP clients discover authorization from the WWW-Authenticate challenge; Workplace API keys are accepted for local clients.",
			},
		},
	);
}
