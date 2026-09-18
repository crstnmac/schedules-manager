import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { generateApiKey } from "../../src/api-key-auth";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
};

const WEEK_START = "2026-09-07";

interface Seed {
	workplaceId: string;
	locationId: string;
	positionId: string;
	managerProfileId: string;
	managerEmploymentId: string;
	workerEmploymentId: string;
	freeWorkerEmploymentId: string;
	fullKey: string;
	readOnlyKey: string;
}

async function seedMcpWorkplace(
	d: Context["database"],
	slug: string,
): Promise<Seed> {
	const managerProfileId = crypto.randomUUID();
	const workerProfileId = crypto.randomUUID();
	const freeWorkerProfileId = crypto.randomUUID();

	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({ name: `MCP ${slug}` })
		.returning();
	const workplaceId = required(workplace).id;

	const [location] = await d.db
		.insert(d.locations)
		.values({ workplaceId, name: `${slug} Floor`, timezone: "UTC" })
		.returning();
	const [position] = await d.db
		.insert(d.positions)
		.values({ workplaceId, name: "Server" })
		.returning();

	await d.db.insert(d.profiles).values([
		{
			id: managerProfileId,
			email: `mcp-${slug}-manager@example.test`,
			fullName: `MCP ${slug} Manager`,
		},
		{
			id: workerProfileId,
			email: `mcp-${slug}-busy@example.test`,
			fullName: "Busy Worker",
		},
		{
			id: freeWorkerProfileId,
			email: `mcp-${slug}-free@example.test`,
			fullName: "Free Worker",
		},
	]);
	const employments = await d.db
		.insert(d.employments)
		.values([
			{ workplaceId, profileId: managerProfileId, kind: "manager" },
			{
				workplaceId,
				profileId: workerProfileId,
				kind: "worker",
				hourlyWageCents: 2000,
			},
			{
				workplaceId,
				profileId: freeWorkerProfileId,
				kind: "worker",
				hourlyWageCents: 1800,
			},
		])
		.returning();

	const fullKey = generateApiKey();
	const readOnlyKey = generateApiKey();
	await d.db.insert(d.apiKeys).values([
		{
			workplaceId,
			name: "MCP full",
			keyPrefix: fullKey.prefix,
			keyHash: fullKey.hash,
			scopes: [
				"schedule.read",
				"schedule.write",
				"workers.read",
				"reports.read",
				"requests.read",
				"requests.write",
			],
			createdBy: managerProfileId,
		},
		{
			workplaceId,
			name: "MCP read only",
			keyPrefix: readOnlyKey.prefix,
			keyHash: readOnlyKey.hash,
			scopes: ["schedule.read"],
			createdBy: managerProfileId,
		},
	]);

	return {
		workplaceId,
		locationId: required(location).id,
		positionId: required(position).id,
		managerProfileId,
		managerEmploymentId: required(
			employments.find((row) => row.profileId === managerProfileId),
		).id,
		workerEmploymentId: required(
			employments.find((row) => row.profileId === workerProfileId),
		).id,
		freeWorkerEmploymentId: required(
			employments.find((row) => row.profileId === freeWorkerProfileId),
		).id,
		fullKey: fullKey.token,
		readOnlyKey: readOnlyKey.token,
	};
}

export function registerMcpIntegrationTests(getContext: () => Context) {
	test("MCP integration surface: auth, reads, draft writes, publish, isolation", async () => {
		const { database: d, app } = getContext();
		const request = (
			path: string,
			key: string | null,
			options?: { method?: string; body?: unknown },
		) =>
			app.handle(
				new Request(`http://localhost${path}`, {
					method: options?.method ?? "GET",
					headers: {
						...(key ? { authorization: `Bearer ${key}` } : {}),
						...(options?.body ? { "content-type": "application/json" } : {}),
					},
					body: options?.body ? JSON.stringify(options.body) : undefined,
				}),
			);

		const seed = await seedMcpWorkplace(d, "diner");
		const other = await seedMcpWorkplace(d, "rival");

		// --- Authentication -------------------------------------------------
		const noKey = await request("/v1/integration/context", null);
		expect(noKey.status).toBe(401);

		const badKey = await request(
			"/v1/integration/context",
			"jl_live_not_a_real_key",
		);
		expect(badKey.status).toBe(401);

		const context = await request("/v1/integration/context", seed.fullKey);
		expect(context.status).toBe(200);
		const contextBody = (await context.json()) as {
			workplace: { name: string };
			locations: { id: string; name: string }[];
			positions: { id: string; name: string }[];
		};
		expect(contextBody.workplace.name).toBe("MCP diner");
		expect(contextBody.locations[0]?.id).toBe(seed.locationId);
		expect(contextBody.positions[0]?.name).toBe("Server");

		// --- Workers --------------------------------------------------------
		const workers = await request("/v1/integration/workers", seed.fullKey);
		expect(workers.status).toBe(200);
		const workersBody = (await workers.json()) as {
			workers: { employmentId: string; kind: string }[];
		};
		// Managers are employments too and appear alongside workers.
		const employmentIds = workersBody.workers.map(
			(worker) => worker.employmentId,
		);
		expect(employmentIds).toContain(seed.workerEmploymentId);
		expect(employmentIds).toContain(seed.freeWorkerEmploymentId);
		expect(
			workersBody.workers.filter((worker) => worker.kind === "manager"),
		).toHaveLength(1);

		// --- Scope enforcement ----------------------------------------------
		const readOnlyDenied = await request(
			"/v1/integration/shifts",
			seed.readOnlyKey,
			{
				method: "POST",
				body: {
					locationId: seed.locationId,
					weekStart: WEEK_START,
					date: WEEK_START,
					startMinute: 540,
					endMinute: 1020,
					positionId: seed.positionId,
					employmentId: seed.workerEmploymentId,
				},
			},
		);
		expect(readOnlyDenied.status).toBe(403);

		// --- Workplace isolation ---------------------------------------------
		const crossWorkplace = await request(
			"/v1/integration/workers",
			other.fullKey,
		).then(() =>
			request(
				`/v1/integration/draft?locationId=${seed.locationId}&weekStart=${WEEK_START}`,
				other.fullKey,
			),
		);
		expect(crossWorkplace.status).toBe(403);

		// --- Draft writes ------------------------------------------------------
		const create = await request("/v1/integration/shifts", seed.fullKey, {
			method: "POST",
			body: {
				locationId: seed.locationId,
				weekStart: WEEK_START,
				date: WEEK_START,
				startMinute: 540,
				endMinute: 1020,
				positionId: seed.positionId,
				employmentId: seed.workerEmploymentId,
			},
		});
		expect(create.status).toBe(200);
		const created = (await create.json()) as {
			shiftId: string;
			scheduleId: string;
		};

		const openShiftCreate = await request(
			"/v1/integration/shifts",
			seed.fullKey,
			{
				method: "POST",
				body: {
					locationId: seed.locationId,
					weekStart: WEEK_START,
					date: "2026-09-09",
					startMinute: 600,
					endMinute: 1200,
					positionId: seed.positionId,
				},
			},
		);
		expect(openShiftCreate.status).toBe(200);
		const openShift = (await openShiftCreate.json()) as { shiftId: string };

		const draft = await request(
			`/v1/integration/draft?locationId=${seed.locationId}&weekStart=${WEEK_START}`,
			seed.fullKey,
		);
		expect(draft.status).toBe(200);
		const draftBody = (await draft.json()) as {
			exists: boolean;
			scheduleId: string;
			publishedVersion: unknown;
			shifts: { id: string; workerName: string | null; date: string }[];
		};
		expect(draftBody.exists).toBe(true);
		expect(draftBody.scheduleId).toBe(created.scheduleId);
		expect(draftBody.publishedVersion).toBeNull();
		expect(draftBody.shifts).toHaveLength(2);
		expect(
			draftBody.shifts.find((shift) => shift.id === created.shiftId)
				?.workerName,
		).toBe("Busy Worker");

		// --- Update and delete -------------------------------------------------
		const patch = await request(
			`/v1/integration/shifts/${openShift.shiftId}`,
			seed.fullKey,
			{
				method: "PATCH",
				body: { employmentId: seed.freeWorkerEmploymentId },
			},
		);
		expect(patch.status).toBe(200);

		const deleteShift = await request(
			`/v1/integration/shifts/${openShift.shiftId}`,
			seed.fullKey,
			{ method: "DELETE" },
		);
		expect(deleteShift.status).toBe(200);

		// --- Publish -----------------------------------------------------------
		const publish = await request(
			`/v1/integration/schedules/${created.scheduleId}/publish`,
			seed.fullKey,
			{ method: "POST" },
		);
		expect(publish.status).toBe(200);
		const publishBody = (await publish.json()) as {
			version: { versionNumber: number; workers: number };
			changes: { total: number };
		};
		expect(publishBody.version.versionNumber).toBe(1);
		expect(publishBody.version.workers).toBeGreaterThanOrEqual(1);

		const published = await request(
			`/v1/integration/published?weekStart=${WEEK_START}`,
			seed.fullKey,
		);
		expect(published.status).toBe(200);
		const publishedBody = (await published.json()) as {
			locations: { shifts: { workerName: string | null }[] }[];
		};
		expect(publishedBody.locations[0]?.shifts[0]?.workerName).toBe(
			"Busy Worker",
		);

		// --- Roster --------------------------------------------------------------
		const roster = await request(
			`/v1/integration/roster?date=${WEEK_START}`,
			seed.fullKey,
		);
		expect(roster.status).toBe(200);
		const rosterBody = (await roster.json()) as {
			locations: { published: unknown[]; draft: unknown[] }[];
		};
		expect(rosterBody.locations[0]?.published).toHaveLength(1);

		// --- Availability ---------------------------------------------------------
		const availability = await request(
			`/v1/integration/available-workers?startsAt=2026-09-07T10:00:00Z&endsAt=2026-09-07T18:00:00Z&locationId=${seed.locationId}`,
			seed.fullKey,
		);
		expect(availability.status).toBe(200);
		const availabilityBody = (await availability.json()) as {
			available: { employmentId: string }[];
			unavailable: { employmentId: string; reasons: string[] }[];
		};
		const availableIds = availabilityBody.available.map((w) => w.employmentId);
		expect(availableIds).toContain(seed.freeWorkerEmploymentId);
		expect(availableIds).not.toContain(seed.workerEmploymentId);
		const busy = availabilityBody.unavailable.find(
			(entry) => entry.employmentId === seed.workerEmploymentId,
		);
		expect(busy?.reasons[0]).toContain("Already scheduled");

		// --- Labor ------------------------------------------------------------------
		const labor = await request(
			`/v1/integration/labor?weekStart=${WEEK_START}`,
			seed.fullKey,
		);
		expect(labor.status).toBe(200);
		const laborBody = (await labor.json()) as {
			totals: { scheduledMinutes: number; laborCents: number };
			byWorker: { employmentId: string; minutes: number }[];
		};
		expect(laborBody.totals.scheduledMinutes).toBe(480);
		// 8h at $20/h = $160.00
		expect(laborBody.totals.laborCents).toBe(16000);
		expect(laborBody.byWorker[0]?.employmentId).toBe(seed.workerEmploymentId);

		// --- Time-off ------------------------------------------------------------------
		await d.db.insert(d.timeOffRequests).values({
			employmentId: seed.freeWorkerEmploymentId,
			startsAt: new Date("2026-09-11T00:00:00Z"),
			endsAt: new Date("2026-09-11T23:59:00Z"),
			reason: "Trip",
		});
		const timeOff = await request(
			"/v1/integration/time-off?status=pending",
			seed.fullKey,
		);
		expect(timeOff.status).toBe(200);
		const timeOffBody = (await timeOff.json()) as {
			requests: { workerName: string }[];
		};
		expect(timeOffBody.requests[0]?.workerName).toBe("Free Worker");

		// --- Worker overview -------------------------------------------------------------
		const overview = await request(
			`/v1/integration/worker?employmentId=${seed.workerEmploymentId}&weekStart=${WEEK_START}`,
			seed.fullKey,
		);
		expect(overview.status).toBe(200);
		const overviewBody = (await overview.json()) as {
			scheduledMinutes: number;
			shifts: unknown[];
		};
		expect(overviewBody.scheduledMinutes).toBe(480);
		expect(overviewBody.shifts).toHaveLength(1);
	});

	test("MCP principal path: sessions act with privilege-derived scopes and /mcp challenges unauthenticated callers", async () => {
		const { database: d, app } = getContext();
		const request = (
			path: string,
			key: string | null,
			options?: { method?: string; body?: unknown },
		) =>
			app.handle(
				new Request(`http://localhost${path}`, {
					method: options?.method ?? "GET",
					headers: {
						...(key ? { authorization: `Bearer ${key}` } : {}),
						...(options?.body ? { "content-type": "application/json" } : {}),
					},
					body: options?.body ? JSON.stringify(options.body) : undefined,
				}),
			);

		const seed = await seedMcpWorkplace(d, "bistro");

		// Sessions in this suite are plain better-auth session rows.
		const insertSession = async (userId: string) => {
			const token = `principal-${crypto.randomUUID()}`;
			await d.db.insert(d.session).values({
				token,
				userId,
				expiresAt: new Date(Date.now() + 5 * 60_000),
			});
			return token;
		};
		await d.db.insert(d.user).values({
			id: seed.managerProfileId,
			name: "Bistro Manager",
			email: "mcp-bistro-manager@example.test",
		});
		const managerSession = await insertSession(seed.managerProfileId);

		// A manager session resolves its workplace without x-workplace-id and
		// holds every privilege-derived scope.
		const context = await request("/v1/integration/context", managerSession);
		expect(context.status).toBe(200);
		const contextBody = (await context.json()) as {
			workplace: { id: string };
			credential: { kind: string; scopes: string[] };
		};
		expect(contextBody.workplace.id).toBe(seed.workplaceId);
		expect(contextBody.credential.kind).toBe("principal");
		expect(contextBody.credential.scopes).toContain("schedule.read");
		expect(contextBody.credential.scopes).toContain("schedule.write");

		// A manager session may write draft shifts…
		const write = await request("/v1/integration/shifts", managerSession, {
			method: "POST",
			body: {
				locationId: seed.locationId,
				weekStart: WEEK_START,
				date: WEEK_START,
				startMinute: 480,
				endMinute: 960,
				positionId: seed.positionId,
			},
		});
		expect(write.status).toBe(200);
		const written = (await write.json()) as { scheduleId: string };

		// …but cannot publish without the schedule.publish capability. Restrict
		// the manager's privileges and retry.
		await d.db
			.update(d.employments)
			.set({ privileges: ["schedule.view", "schedule.manage"] })
			.where(eq(d.employments.id, seed.managerEmploymentId));
		const publishDenied = await request(
			`/v1/integration/schedules/${written.scheduleId}/publish`,
			managerSession,
			{ method: "POST" },
		);
		expect(publishDenied.status).toBe(403);

		// A viewer without explicit capabilities reads nothing that needs scopes.
		const viewerProfileId = crypto.randomUUID();
		await d.db.insert(d.user).values({
			id: viewerProfileId,
			name: "Bistro Viewer",
			email: "mcp-bistro-viewer@example.test",
		});
		await d.db.insert(d.profiles).values({
			id: viewerProfileId,
			email: "mcp-bistro-viewer@example.test",
			fullName: "Bistro Viewer",
		});
		await d.db.insert(d.employments).values({
			workplaceId: seed.workplaceId,
			profileId: viewerProfileId,
			kind: "viewer",
			privileges: [],
		});
		const viewerSession = await insertSession(viewerProfileId);
		const viewerDenied = await request(
			"/v1/integration/workers",
			viewerSession,
		);
		expect(viewerDenied.status).toBe(403);

		// A worker session never acts through the manager-shaped integration
		// surface, even though the Workplace membership is valid.
		const workerSession = await insertSession(
			await (async () => {
				const workerUserId = crypto.randomUUID();
				await d.db.insert(d.user).values({
					id: workerUserId,
					name: "Bistro Worker",
					email: "mcp-bistro-worker@example.test",
				});
				await d.db.insert(d.profiles).values({
					id: workerUserId,
					email: "mcp-bistro-worker@example.test",
					fullName: "Bistro Worker",
				});
				await d.db.insert(d.employments).values({
					workplaceId: seed.workplaceId,
					profileId: workerUserId,
					kind: "worker",
				});
				return workerUserId;
			})(),
		);
		const workerDenied = await request(
			"/v1/integration/context",
			workerSession,
		);
		expect(workerDenied.status).toBe(403);

		// --- /mcp endpoint -------------------------------------------------
		const initBody = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "test", version: "0" },
			},
		});

		// No credential: the OAuth resource server answers with an RFC 9728
		// challenge pointing MCP clients at the authorization metadata.
		const challenge = await app.handle(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
				},
				body: initBody,
			}),
		);
		expect(challenge.status).toBe(401);
		const wwwAuthenticate = challenge.headers.get("www-authenticate") ?? "";
		expect(wwwAuthenticate).toContain("Bearer");
		expect(wwwAuthenticate).toContain("resource_metadata=");

		// A Workplace API key initializes a session and lists tools; every tool
		// call executes through the in-process integration loopback.
		const init = await app.handle(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					authorization: `Bearer ${seed.fullKey}`,
				},
				body: initBody,
			}),
		);
		expect(init.status).toBe(200);
		const sessionId = init.headers.get("mcp-session-id") ?? "";
		expect(sessionId).not.toBe("");

		const tools = await app.handle(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					authorization: `Bearer ${seed.fullKey}`,
					"mcp-session-id": sessionId,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
				}),
			}),
		);
		expect(tools.status).toBe(200);
		const toolsBody = (await tools.json()) as {
			result?: { tools?: { name: string }[] };
		};
		const names = toolsBody.result?.tools?.map((tool) => tool.name) ?? [];
		expect(names).toContain("get_workplace_context");
		expect(names).toContain("publish_schedule");

		// The context tool runs end to end through the loopback.
		const contextTool = await app.handle(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					authorization: `Bearer ${seed.fullKey}`,
					"mcp-session-id": sessionId,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: {
						name: "get_workplace_context",
						arguments: {},
					},
				}),
			}),
		);
		expect(contextTool.status).toBe(200);
		const contextToolBody = (await contextTool.json()) as {
			result?: {
				structuredContent?: { workplace: { name: string } };
				isError?: boolean;
			};
		};
		expect(contextToolBody.result?.isError).toBeFalsy();
		expect(contextToolBody.result?.structuredContent?.workplace.name).toBe(
			"MCP bistro",
		);

		// A different credential cannot adopt the open session.
		const hijack = await app.handle(
			new Request("http://localhost/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					authorization: `Bearer ${seed.readOnlyKey}`,
					"mcp-session-id": sessionId,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 4,
					method: "tools/list",
				}),
			}),
		);
		expect(hijack.status).toBe(403);
	});
}
