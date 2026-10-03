import { expect, test } from "bun:test";
import { generateApiKey } from "../../src/api-key-auth";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

/**
 * Location scope, as in other multi-location scheduling tools: a Viewer
 * assigned to Locations manages only those Locations and the people who work
 * there (plus people without assignments, who work everywhere). Full Managers
 * see everything, and API keys inherit their creator's scope.
 */
export function registerLocationScopeTests(getContext: () => Context) {
	async function seed() {
		const { database: d, token } = getContext();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Two Site Bistro" })
			.returning();
		if (!workplace) throw new Error("Missing workplace fixture");
		const [north, south] = await d.db
			.insert(d.locations)
			.values([
				{
					workplaceId: workplace.id,
					name: "North",
					timezone: "America/Chicago",
				},
				{
					workplaceId: workplace.id,
					name: "South",
					timezone: "America/Chicago",
				},
			])
			.returning();
		if (!north || !south) throw new Error("Missing location fixtures");

		const person = async (
			kind: "manager" | "viewer" | "worker",
			locationId: string | null,
			privileges: string[] | null = null,
		) => {
			const profileId = crypto.randomUUID();
			const email = `scope-${profileId}@example.test`;
			await d.db.insert(d.profiles).values({ id: profileId, email });
			const [employment] = await d.db
				.insert(d.employments)
				.values({ workplaceId: workplace.id, profileId, kind, privileges })
				.returning();
			if (!employment) throw new Error("Missing employment fixture");
			if (locationId) {
				await d.db
					.insert(d.employmentLocations)
					.values({ employmentId: employment.id, locationId });
			}
			return {
				profileId,
				employmentId: employment.id,
				auth: `Bearer ${await token(profileId, email)}`,
			};
		};

		const manager = await person("manager", null);
		const northLead = await person("viewer", north.id, [
			"schedule.view",
			"schedule.manage",
			"approvals.review",
			"workers.manage",
		]);
		const northWorker = await person("worker", north.id);
		const southWorker = await person("worker", south.id);
		const floater = await person("worker", null);
		return {
			d,
			workplace,
			north,
			south,
			manager,
			northLead,
			northWorker,
			southWorker,
			floater,
		};
	}

	const get = (path: string, auth: string) =>
		getContext().app.handle(
			new Request(`http://localhost${path}`, {
				headers: { authorization: auth },
			}),
		);

	test("a Location-scoped Viewer only opens their own Location's schedule", async () => {
		const { north, south, northLead, manager } = await seed();
		const month = "2026-09-01";
		expect(
			(await get(`/v1/locations/${north.id}/calendar/${month}`, northLead.auth))
				.status,
		).toBe(200);
		expect(
			(await get(`/v1/locations/${south.id}/calendar/${month}`, northLead.auth))
				.status,
		).toBe(403);
		expect(
			(await get(`/v1/locations/${south.id}/calendar/${month}`, manager.auth))
				.status,
		).toBe(200);
	});

	test("the worker directory shows a scoped Viewer only their people", async () => {
		const { workplace, northLead, manager, northWorker, southWorker, floater } =
			await seed();
		const ids = async (auth: string) => {
			const response = await get(
				`/v1/workplaces/${workplace.id}/workers`,
				auth,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				workers: { employmentId: string }[];
			};
			return new Set(body.workers.map((worker) => worker.employmentId));
		};
		const scoped = await ids(northLead.auth);
		expect(scoped.has(northWorker.employmentId)).toBe(true);
		expect(scoped.has(floater.employmentId)).toBe(true);
		expect(scoped.has(southWorker.employmentId)).toBe(false);
		expect((await ids(manager.auth)).has(southWorker.employmentId)).toBe(true);
	});

	test("time-off requests from another Location are hidden and cannot be decided", async () => {
		const { d, workplace, northLead, northWorker, southWorker } = await seed();
		const startsAt = new Date(Date.now() + 7 * 86_400_000);
		const endsAt = new Date(startsAt.getTime() + 8 * 3_600_000);
		const [northRequest, southRequest] = await d.db
			.insert(d.timeOffRequests)
			.values([
				{ employmentId: northWorker.employmentId, startsAt, endsAt },
				{ employmentId: southWorker.employmentId, startsAt, endsAt },
			])
			.returning();
		if (!northRequest || !southRequest) throw new Error("Missing requests");

		const list = await get(
			`/v1/workplaces/${workplace.id}/time-off`,
			northLead.auth,
		);
		expect(list.status).toBe(200);
		const listed = JSON.stringify(await list.json());
		expect(listed).toContain(northRequest.id);
		expect(listed).not.toContain(southRequest.id);

		const expedite = await getContext().app.handle(
			new Request(
				`http://localhost/v1/workplaces/${workplace.id}/time-off/${southRequest.id}/expedite`,
				{
					method: "POST",
					headers: {
						authorization: northLead.auth,
						"content-type": "application/json",
					},
					body: JSON.stringify({ reason: "Family emergency" }),
				},
			),
		);
		expect(expedite.status).toBe(403);

		const decide = (requestId: string) =>
			getContext().app.handle(
				new Request(
					`http://localhost/v1/workplaces/${workplace.id}/time-off/${requestId}/decision`,
					{
						method: "POST",
						headers: {
							authorization: northLead.auth,
							"content-type": "application/json",
						},
						body: JSON.stringify({ decision: "declined" }),
					},
				),
			);
		expect((await decide(southRequest.id)).status).toBe(403);
		expect((await decide(northRequest.id)).status).toBe(200);
	});

	test("an API key only reaches its creator's Locations", async () => {
		const { d, workplace, northLead, northWorker, southWorker } = await seed();
		const key = generateApiKey();
		await d.db.insert(d.apiKeys).values({
			workplaceId: workplace.id,
			name: "North lead key",
			keyPrefix: key.prefix,
			keyHash: key.hash,
			scopes: ["workers.read"],
			createdBy: northLead.profileId,
		});
		const response = await get(
			"/v1/integration/workers",
			`Bearer ${key.token}`,
		);
		expect(response.status).toBe(200);
		const listed = JSON.stringify(await response.json());
		expect(listed).toContain(northWorker.employmentId);
		expect(listed).not.toContain(southWorker.employmentId);
	});

	test("an API key stops working once its creator is deactivated", async () => {
		const { d, workplace, manager } = await seed();
		const key = generateApiKey();
		await d.db.insert(d.apiKeys).values({
			workplaceId: workplace.id,
			name: "Manager key",
			keyPrefix: key.prefix,
			keyHash: key.hash,
			scopes: ["workers.read"],
			createdBy: manager.profileId,
		});
		expect(
			(await get("/v1/integration/workers", `Bearer ${key.token}`)).status,
		).toBe(200);
		const { eq } = await import("drizzle-orm");
		await d.db
			.update(d.employments)
			.set({ status: "deactivated" })
			.where(eq(d.employments.id, manager.employmentId));
		expect(
			(await get("/v1/integration/workers", `Bearer ${key.token}`)).status,
		).toBe(401);
	});
}
