import { afterAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { ApiError, JoolingApi } from "../src/api";
import { createJoolingServer } from "../src/server";

/**
 * Synthetic key for the in-memory stub only; never a real credential.
 * Set JOOLING_TEST_API_KEY to override.
 */
const TEST_API_KEY =
	process.env.JOOLING_TEST_API_KEY ?? ["jl_live", "stub-only"].join("_");

/** Minimal in-memory jooling API for exercising tools end to end. */
function stubApi(responses: {
	context?: unknown;
	status?: number;
	statusBody?: { error: string; message: string };
}) {
	const calls: { method: string; path: string; body?: unknown }[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		const path = url.pathname.replace("/v1/integration", "");
		calls.push({
			method: init?.method ?? "GET",
			path,
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});
		if (responses.status) {
			return new Response(
				JSON.stringify(
					responses.statusBody ?? {
						error: "http_error",
						message: "stub failure",
					},
				),
				{ status: responses.status },
			);
		}
		const payload =
			path === "/context"
				? (responses.context ?? {})
				: ((responses as Record<string, unknown>)[path.split("/")[1] ?? ""] ??
					{});
		return new Response(JSON.stringify(payload), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	};
	return { fetchImpl, calls };
}

async function connectedClient(api: JoolingApi) {
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const server = createJoolingServer(api);
	await server.connect(serverTransport);
	const client = new Client({ name: "test-client", version: "0.0.0" });
	await client.connect(clientTransport);
	return { client, server };
}

const WORKPLACE_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";

const contextPayload = {
	workplace: {
		id: WORKPLACE_ID,
		name: "Harbor Diner",
		weekStartDay: 1,
		noticeWindowHours: 48,
		overtimeWeeklyMinutes: 2400,
		overtimeDailyMinutes: 0,
		laborCostPercentGoal: 25,
	},
	locations: [
		{
			id: LOCATION_ID,
			name: "Downtown",
			timezone: "America/Chicago",
			addressLine: "1 Main St",
		},
	],
	positions: [{ id: POSITION_ID, name: "Line Cook" }],
	credential: { kind: "apiKey", scopes: ["schedule.read", "schedule.write"] },
};

describe("jooling MCP server tools", () => {
	const cleanup: (() => Promise<void>)[] = [];

	afterAll(async () => {
		await Promise.all(cleanup.map((close) => close()));
	});

	test("exposes the scheduling tool catalog with annotations", async () => {
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl: stubApi({ context: contextPayload }).fetchImpl,
		});
		const { client, server } = await connectedClient(api);
		cleanup.push(() => client.close());
		cleanup.push(() => server.close());

		const tools = await client.listTools();
		const names = tools.tools.map((tool) => tool.name);
		expect(names).toContain("get_workplace_context");
		expect(names).toContain("get_published_schedule");
		expect(names).toContain("find_available_workers");
		expect(names).toContain("create_draft_shift");
		expect(names).toContain("publish_schedule");

		const publish = tools.tools.find(
			(tool) => tool.name === "publish_schedule",
		);
		expect(publish?.annotations?.readOnlyHint).toBe(false);
		const reads = tools.tools.find(
			(tool) => tool.name === "get_published_schedule",
		);
		expect(reads?.annotations?.readOnlyHint).toBe(true);
	});

	test("get_workplace_context returns structured content and text", async () => {
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl: stubApi({ context: contextPayload }).fetchImpl,
		});
		const { client, server } = await connectedClient(api);
		cleanup.push(() => client.close());
		cleanup.push(() => server.close());

		const result = await client.callTool({
			name: "get_workplace_context",
			arguments: {},
		});
		expect(result.isError).toBeFalsy();
		const structured = result.structuredContent as typeof contextPayload;
		expect(structured.workplace.name).toBe("Harbor Diner");
		const text = result.content?.[0];
		expect(text && text.type === "text" ? text.text : "").toContain(
			"Harbor Diner",
		);
	});

	test("create_draft_shift posts the draft and reports invisibility to Workers", async () => {
		const { fetchImpl, calls } = stubApi({
			context: contextPayload,
		});
		const wrappedFetch: typeof fetch = async (input, init) => {
			// Record every call first, then intercept the create response.
			const url = new URL(String(input));
			calls.push({
				method: init?.method ?? "GET",
				path: url.pathname.replace("/v1/integration", ""),
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
			});
			if (
				(init?.method ?? "GET") === "POST" &&
				String(input).endsWith("/shifts")
			) {
				return new Response(
					JSON.stringify({
						shiftId: "shift-1",
						scheduleId: "schedule-1",
					}),
					{ status: 200 },
				);
			}
			return fetchImpl(input, init);
		};
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl: wrappedFetch,
		});
		const { client, server } = await connectedClient(api);
		cleanup.push(() => client.close());
		cleanup.push(() => server.close());

		const result = await client.callTool({
			name: "create_draft_shift",
			arguments: {
				locationId: LOCATION_ID,
				weekStart: "2026-09-21",
				date: "2026-09-21",
				startMinute: 540,
				endMinute: 1080,
				positionId: POSITION_ID,
			},
		});
		expect(result.isError).toBeFalsy();
		const createCall = calls.find((call) => call.path === "/shifts");
		expect(createCall?.method).toBe("POST");
		expect(createCall?.body).toEqual({
			locationId: LOCATION_ID,
			weekStart: "2026-09-21",
			date: "2026-09-21",
			startMinute: 540,
			endMinute: 1080,
			positionId: POSITION_ID,
		});
		const text = result.content?.[0];
		expect(text && text.type === "text" ? text.text : "").toContain(
			"NOT visible to Workers",
		);
	});

	test("publish_schedule resolves the schedule from the draft when given location + week", async () => {
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = new URL(String(input));
			const path = url.pathname.replace("/v1/integration", "");
			if (path === "/draft") {
				return Response.json({
					exists: true,
					locationId: LOCATION_ID,
					locationName: "Downtown",
					weekStart: "2026-09-21",
					scheduleId: "schedule-42",
					publishedVersion: null,
					shifts: [],
				});
			}
			if (path === "/schedules/schedule-42/publish") {
				expect(init?.method).toBe("POST");
				return Response.json({
					version: {
						id: "version-1",
						versionNumber: 3,
						publishedAt: "2026-09-18T12:00:00Z",
						workers: 7,
					},
					changes: { total: 4, material: 2, acceptancesRequired: 1 },
				});
			}
			throw new Error(`Unexpected stub call ${init?.method} ${path}`);
		};
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl,
		});
		const { client, server } = await connectedClient(api);
		cleanup.push(() => client.close());
		cleanup.push(() => server.close());

		const result = await client.callTool({
			name: "publish_schedule",
			arguments: {
				locationId: LOCATION_ID,
				weekStart: "2026-09-21",
			},
		});
		expect(result.isError).toBeFalsy();
		const structured = result.structuredContent as {
			version: { versionNumber: number };
		};
		expect(structured.version.versionNumber).toBe(3);
		const text = result.content?.[0];
		expect(text && text.type === "text" ? text.text : "").toContain(
			"Published version 3 to 7 workers",
		);
	});

	test("API authorization failures surface as tool errors with a scope hint", async () => {
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl: stubApi({
				status: 403,
				statusBody: {
					error: "forbidden",
					message: "This API key is missing the reports.read scope",
				},
			}).fetchImpl,
		});
		const { client, server } = await connectedClient(api);
		cleanup.push(() => client.close());
		cleanup.push(() => server.close());

		const result = await client.callTool({
			name: "get_labor_summary",
			arguments: { weekStart: "2026-09-21" },
		});
		expect(result.isError).toBe(true);
		const text = result.content?.[0];
		const message = text && text.type === "text" ? text.text : "";
		expect(message).toContain("403 forbidden");
		expect(message).toContain("reports.read");
	});

	test("workplace context resource serves the context payload", async () => {
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl: stubApi({ context: contextPayload }).fetchImpl,
		});
		const { client, server } = await connectedClient(api);
		cleanup.push(() => client.close());
		cleanup.push(() => server.close());

		const resources = await client.listResources();
		expect(resources.resources.map((resource) => resource.uri)).toContain(
			"jooling://workplace-context",
		);

		const read = await client.readResource({
			uri: "jooling://workplace-context",
		});
		const parsed = JSON.parse(
			read.contents[0]?.text ?? "{}",
		) as typeof contextPayload;
		expect(parsed.workplace.name).toBe("Harbor Diner");
	});

	test("weekly-review prompt guides the review workflow", async () => {
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl: stubApi({ context: contextPayload }).fetchImpl,
		});
		const { client, server } = await connectedClient(api);
		cleanup.push(() => client.close());
		cleanup.push(() => server.close());

		const prompts = await client.listPrompts();
		expect(prompts.prompts.map((prompt) => prompt.name)).toContain(
			"weekly-review",
		);
		const prompt = await client.getPrompt({
			name: "weekly-review",
			arguments: { weekStart: "2026-09-21" },
		});
		const first = prompt.messages[0];
		const text =
			first.content.type === "text"
				? first.content.text
				: JSON.stringify(first);
		expect(text).toContain("2026-09-21");
		expect(text).toContain("get_labor_summary");
	});
});

describe("ApiError mapping", () => {
	test("non-JSON error bodies fall back to the HTTP status", async () => {
		const fetchImpl: typeof fetch = async () =>
			new Response("gateway exploded", { status: 502 });
		const api = new JoolingApi({
			baseUrl: "http://stub",
			apiKey: TEST_API_KEY,
			fetchImpl,
		});
		try {
			await api.getContext();
			throw new Error("expected getContext to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			const apiError = error as ApiError;
			expect(apiError.status).toBe(502);
			expect(apiError.code).toBe("http_error");
		}
	});
});
