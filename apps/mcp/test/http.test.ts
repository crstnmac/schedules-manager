import { describe, expect, test } from "bun:test";

import { JoolingApi } from "../src/api";
import {
	createMcpRequestHandler,
	McpAuthError,
	type McpPrincipal,
} from "../src/http";

/**
 * Synthetic key for the in-memory stub only; never a real credential.
 * Set JOOLING_TEST_API_KEY to override.
 */
const TEST_KEY =
	process.env.JOOLING_TEST_API_KEY ?? ["jl_live", "stub-only"].join("_");
const OTHER_KEY =
	process.env.JOOLING_TEST_API_KEY_ALT ?? ["jl_live", "stub-alt"].join("_");

function jsonRpc(method: string, id: number | string, params?: unknown) {
	return JSON.stringify({
		jsonrpc: "2.0" as const,
		id,
		method,
		...(params === undefined ? {} : { params }),
	});
}

function mcpPost(body: string, headers: Record<string, string>) {
	return new Request("http://localhost/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			...headers,
		},
		body,
	});
}

interface HandlerFixture {
	handler: (request: Request) => Promise<Response>;
	sessions: { size: number };
}

function requestHeadersToken(headers: HeadersInit | undefined): string | null {
	const h = new Headers(headers);
	const authorization = h.get("authorization");
	return authorization?.replace(/^Bearer /i, "").trim() ?? null;
}

function makeHandler(options?: { rejectKey?: boolean }): HandlerFixture {
	const stubApi: typeof globalThis.fetch = (input, init) => {
		const path = new URL(String(input)).pathname;
		if (
			path === "/v1/integration/context" &&
			requestHeadersToken(init?.headers ?? undefined)
		) {
			return Response.json({
				workplace: {
					id: "11111111-1111-4111-8111-111111111111",
					name: "Harbor Diner",
				},
			});
		}
		if (path === "/v1/integration/workers") {
			return Response.json({ workers: [] });
		}
		return Response.json(
			{ error: "not_found", message: `stub miss ${path}` },
			{ status: 404 },
		);
	};

	const { handler, sessions } = createMcpRequestHandler({
		authenticate: async (request) => {
			const authorization = request.headers.get("authorization");
			const token = authorization?.replace(/^Bearer /i, "").trim() ?? null;
			if (!token) return null;
			if (options?.rejectKey || token === OTHER_KEY) {
				return new McpAuthError(403, "forbidden", "Unknown credential.");
			}
			return {
				id: token,
				workplaceId: "11111111-1111-4111-8111-111111111111",
			};
		},
		createApi: (principal) =>
			new JoolingApi({
				baseUrl: "http://stub.test",
				apiKey: principal.id,
				fetchImpl: stubApi,
			}),
		resourceMetadataUrl:
			"https://api.example.test/.well-known/oauth-protected-resource",
	});
	return { handler, sessions };
}

describe("MCP embeddable request handler", () => {
	test("missing authorization is rejected with an RFC 9728 challenge", async () => {
		const { handler } = makeHandler();
		const response = await handler(mcpPost(jsonRpc("initialize", 1, {}), {}));
		expect(response.status).toBe(401);
		const challenge = response.headers.get("www-authenticate") ?? "";
		expect(challenge).toContain("Bearer");
		expect(challenge).toContain("resource_metadata=");
	});

	test("authenticate rejections surface with their status", async () => {
		const { handler } = makeHandler({ rejectKey: true });
		const response = await handler(
			mcpPost(jsonRpc("initialize", 1, {}), {
				authorization: `Bearer ${TEST_KEY}`,
			}),
		);
		expect(response.status).toBe(403);
		const body = (await response.json()) as { message: string };
		expect(body.message).toContain("Unknown credential");
	});

	test("initialize creates a session and tools work over it", async () => {
		const { handler, sessions } = makeHandler();
		const init = await handler(
			mcpPost(
				jsonRpc("initialize", 1, {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "test", version: "0" },
				}),
				{ authorization: `Bearer ${TEST_KEY}` },
			),
		);
		expect(init.status).toBe(200);
		const sessionId = init.headers.get("mcp-session-id");
		expect(sessionId).toBeTruthy();

		const initialized = await handler(
			mcpPost(jsonRpc("notifications/initialized", 0), {
				authorization: `Bearer ${TEST_KEY}`,
				"mcp-session-id": sessionId ?? "",
			}),
		);
		expect(initialized.status).toBeGreaterThanOrEqual(200);
		expect(initialized.status).toBeLessThan(300);

		const listTools = await handler(
			mcpPost(jsonRpc("tools/list", 2), {
				authorization: `Bearer ${TEST_KEY}`,
				"mcp-session-id": sessionId ?? "",
			}),
		);
		expect(listTools.status).toBe(200);
		const payload = (await listTools.json()) as {
			result?: { tools?: { name: string }[] };
		};
		const names = payload.result?.tools?.map((tool) => tool.name) ?? [];
		expect(names).toContain("get_workplace_context");
		expect(names).toContain("publish_schedule");
		expect(sessions.size).toBe(1);
	});

	test("a session rejects a different principal", async () => {
		const { handler } = makeHandler();
		const init = await handler(
			mcpPost(
				jsonRpc("initialize", 1, {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "test", version: "0" },
				}),
				{ authorization: `Bearer ${TEST_KEY}` },
			),
		);
		const sessionId = init.headers.get("mcp-session-id") ?? "";
		const response = await handler(
			mcpPost(jsonRpc("tools/list", 2), {
				authorization: `Bearer ${OTHER_KEY}`,
				"mcp-session-id": sessionId,
			}),
		);
		expect(response.status).toBe(403);
	});

	test("requests without a session id must be initialize; unknown sessions 404", async () => {
		const { handler } = makeHandler();
		const noSession = await handler(
			mcpPost(jsonRpc("tools/list", 2), {
				authorization: `Bearer ${TEST_KEY}`,
			}),
		);
		expect(noSession.status).toBe(400);

		const unknown = await handler(
			mcpPost(jsonRpc("tools/list", 2), {
				authorization: `Bearer ${TEST_KEY}`,
				"mcp-session-id": "00000000-0000-0000-0000-000000000000",
			}),
		);
		expect(unknown.status).toBe(404);
	});

	test("GET streams are refused and DELETE terminates the session", async () => {
		const { handler, sessions } = makeHandler();
		const init = await handler(
			mcpPost(
				jsonRpc("initialize", 1, {
					protocolVersion: "2025-06-18",
					capabilities: {},
					clientInfo: { name: "test", version: "0" },
				}),
				{ authorization: `Bearer ${TEST_KEY}` },
			),
		);
		const sessionId = init.headers.get("mcp-session-id") ?? "";

		const get = await handler(
			new Request("http://localhost/mcp", {
				headers: {
					authorization: `Bearer ${TEST_KEY}`,
					"mcp-session-id": sessionId,
				},
			}),
		);
		expect(get.status).toBe(405);

		const deleted = await handler(
			new Request("http://localhost/mcp", {
				method: "DELETE",
				headers: {
					authorization: `Bearer ${TEST_KEY}`,
					"mcp-session-id": sessionId,
				},
			}),
		);
		expect(deleted.status).toBe(204);
		expect(sessions.size).toBe(0);

		const after = await handler(
			mcpPost(jsonRpc("tools/list", 3), {
				authorization: `Bearer ${TEST_KEY}`,
				"mcp-session-id": sessionId,
			}),
		);
		expect(after.status).toBe(404);
	});

	test("non-JSON bodies are rejected", async () => {
		const { handler } = makeHandler();
		const response = await handler(
			mcpPost("not json", { authorization: `Bearer ${TEST_KEY}` }),
		);
		expect(response.status).toBe(400);
	});
});
