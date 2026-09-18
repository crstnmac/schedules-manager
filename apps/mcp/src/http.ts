import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { JoolingApi } from "./api";
import { createJoolingServer } from "./server";
import { type McpSession, McpSessionRegistry } from "./sessions";

const UNAUTHORIZED_BODY = JSON.stringify({
	error: "unauthorized",
	message:
		"Authorization required. MCP clients follow the OAuth flow advertised in the WWW-Authenticate challenge; local clients may present a Workplace API key as `Authorization: Bearer jl_live_...`.",
});

function unauthorized(resourceMetadataUrl: string | null): Response {
	const challenge: string[] = ['Bearer realm="jooling"'];
	if (resourceMetadataUrl) {
		challenge.push(`resource_metadata="${resourceMetadataUrl}"`);
	}
	return new Response(UNAUTHORIZED_BODY, {
		status: 401,
		headers: {
			"www-authenticate": challenge.join(", "),
			"content-type": "application/json",
		},
	});
}

function errorBody(status: number, code: string, message: string): Response {
	return new Response(JSON.stringify({ error: code, message }), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/**
 * The authenticated caller of an MCP request. The host application resolves
 * this from its own credential system (OAuth access token or API key).
 */
export function bearerFromRequest(request: Request): string | null {
	const header = request.headers.get("authorization");
	if (header?.toLowerCase().startsWith("bearer ")) {
		return header.slice("bearer ".length).trim() || null;
	}
	return request.headers.get("x-api-key")?.trim() || null;
}

export interface McpPrincipal {
	/** Stable identity of the human; later requests must match the session. */
	id: string;
	/** Workplace the session operates on. */
	workplaceId: string;
}

/** Raised by `authenticate` to reject a request with a specific status. */
export class McpAuthError extends Error {
	readonly status: number;
	readonly code: string;
	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = "McpAuthError";
		this.status = status;
		this.code = code;
	}
}

export interface McpRequestHandlerOptions {
	/**
	 * Resolves the caller from the request. Called for every request, before
	 * session dispatch — authentication is stateless; only the MCP protocol
	 * session is stateful.
	 */
	authenticate: (
		request: Request,
	) => Promise<McpPrincipal | McpAuthError | null>;
	/**
	 * Builds the data client the MCP tools talk to. Typically a JoolingApi
	 * bound to the request's credential so every tool call carries the same
	 * authority the session was opened with.
	 */
	createApi: (principal: McpPrincipal, request: Request) => JoolingApi;
	/**
	 * RFC 9728 protected-resource metadata URL advertised in 401 challenges
	 * so MCP clients can discover the authorization flow. The host usually
	 * gets this from its OAuth plugin.
	 */
	resourceMetadataUrl?: string | null;
	/** Injectable for tests. */
	randomUUID?: () => string;
}

/**
 * Web-standard request handler for the MCP Streamable HTTP transport,
 * embeddable in any host (Elysia, Bun.serve, workers). One McpServer instance
 * per protocol session, bound to the principal that opened it.
 */
export function createMcpRequestHandler(options: McpRequestHandlerOptions): {
	handler: (request: Request) => Promise<Response>;
	sessions: McpSessionRegistry;
} {
	const registry = new McpSessionRegistry();
	const randomUUID =
		options.randomUUID ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);

	async function resolvePrincipal(
		request: Request,
	): Promise<McpPrincipal | Response> {
		let principal: McpPrincipal | McpAuthError | null;
		try {
			principal = await options.authenticate(request);
		} catch (error) {
			if (error instanceof McpAuthError) principal = error;
			else throw error;
		}
		if (!principal) return unauthorized(options.resourceMetadataUrl ?? null);
		if (principal instanceof McpAuthError) {
			return errorBody(principal.status, principal.code, principal.message);
		}
		return principal;
	}

	async function newSession(
		principal: McpPrincipal,
		request: Request,
	): Promise<McpSession> {
		const server: McpServer = createJoolingServer(
			options.createApi(principal, request),
		);
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			enableJsonResponse: true,
		});
		transport.onclose = () => {
			if (transport.sessionId) registry.delete(transport.sessionId);
		};
		await server.connect(transport);

		// The transport assigns its real session id while handling initialize,
		// so the registry key is filled in by the caller after handleRequest.
		return {
			id: "",
			transport,
			server,
			principalId: principal.id,
			workplaceId: principal.workplaceId,
			createdAt: Date.now(),
		};
	}

	async function handlePost(request: Request): Promise<Response> {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return errorBody(400, "bad_request", "Request body must be JSON.");
		}

		const method =
			typeof body === "object" && body !== null && "method" in body
				? String((body as { method?: unknown }).method)
				: undefined;
		const sessionIdHeader = request.headers.get("mcp-session-id");

		if (!sessionIdHeader) {
			// A request without a session id must be an initialize request.
			if (method !== "initialize") {
				return errorBody(
					400,
					"bad_request",
					"Missing Mcp-Session-Id. Initialize first.",
				);
			}
			const principal = await resolvePrincipal(request);
			if (principal instanceof Response) return principal;
			if (registry.atCapacity()) {
				return errorBody(503, "overloaded", "Too many open MCP sessions.");
			}
			const session = await newSession(principal, request);
			const response = await session.transport.handleRequest(request, {
				parsedBody: body,
			});
			const assigned = session.transport.sessionId;
			if (assigned) {
				session.id = assigned;
				registry.set(session);
			} else {
				await session.transport.close();
			}
			return response;
		}

		const principal = await resolvePrincipal(request);
		if (principal instanceof Response) return principal;

		const session = registry.get(sessionIdHeader);
		if (!session) {
			return errorBody(404, "not_found", "Unknown or expired MCP session.");
		}
		if (
			session.principalId !== principal.id ||
			session.workplaceId !== principal.workplaceId
		) {
			return errorBody(
				403,
				"forbidden",
				"This session belongs to a different principal.",
			);
		}
		return session.transport.handleRequest(request, { parsedBody: body });
	}

	async function handleDelete(request: Request): Promise<Response> {
		const principal = await resolvePrincipal(request);
		if (principal instanceof Response) return principal;

		const session = registry.get(request.headers.get("mcp-session-id"));
		if (!session) {
			return errorBody(404, "not_found", "Unknown or expired MCP session.");
		}
		if (
			session.principalId !== principal.id ||
			session.workplaceId !== principal.workplaceId
		) {
			return errorBody(
				403,
				"forbidden",
				"This session belongs to a different principal.",
			);
		}
		await session.transport.close();
		registry.delete(session.id);
		return new Response(null, { status: 204 });
	}

	const handler = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({
				status: "ok",
				sessions: registry.size,
			});
		}

		if (url.pathname !== "/mcp") {
			return errorBody(
				404,
				"not_found",
				"Unknown path; the MCP endpoint is /mcp.",
			);
		}

		switch (request.method) {
			case "POST":
				return handlePost(request);
			case "DELETE":
				return handleDelete(request);
			case "GET":
				// This server does not offer server-initiated streams.
				return new Response(
					"This server does not support GET streams; POST messages to /mcp.",
					{ status: 405, headers: { allow: "POST, DELETE" } },
				);
			default:
				return new Response(null, {
					status: 405,
					headers: { allow: "POST, DELETE" },
				});
		}
	};

	return { handler, sessions: registry };
}
