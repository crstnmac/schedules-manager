import { expect, test } from "bun:test";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

async function authJson(
	app: Context["app"],
	path: string,
	access: string,
	init: { method?: string; body?: unknown } = {},
) {
	return app.handle(
		new Request(`http://localhost${path}`, {
			method: init.method ?? "GET",
			headers: {
				authorization: `Bearer ${access}`,
				...(init.body === undefined
					? {}
					: { "content-type": "application/json" }),
			},
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
		}),
	);
}

async function seedNyWorkplace(d: Context["database"], name: string) {
	const managerProfileId = crypto.randomUUID();
	const workerProfileId = crypto.randomUUID();
	const managerEmail = `${name.toLowerCase().replaceAll(" ", "-")}-mgr@example.test`;
	const workerEmail = `${name.toLowerCase().replaceAll(" ", "-")}-wrk@example.test`;
	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({ name })
		.returning();
	const [location] = await d.db
		.insert(d.locations)
		.values({
			workplaceId: required(workplace).id,
			name: `${name} Floor`,
			timezone: "America/New_York",
		})
		.returning();
	const [position] = await d.db
		.insert(d.positions)
		.values({ workplaceId: required(workplace).id, name: "Server" })
		.returning();
	await d.db.insert(d.profiles).values([
		{ id: managerProfileId, email: managerEmail },
		{ id: workerProfileId, email: workerEmail },
	]);
	const employments = await d.db
		.insert(d.employments)
		.values([
			{
				workplaceId: required(workplace).id,
				profileId: managerProfileId,
				kind: "manager",
			},
			{
				workplaceId: required(workplace).id,
				profileId: workerProfileId,
				kind: "worker",
			},
		])
		.returning();
	const worker = required(
		employments.find((row) => row.profileId === workerProfileId),
	);
	return {
		location: required(location),
		position: required(position),
		worker,
		managerProfileId,
		managerEmail,
	};
}

export function registerDstRouteTests(getContext: () => Context) {
	test("route: POST shift in spring-forward gap returns 400 with descriptive message", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedNyWorkplace(d, "Dst Gap Cafe");
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const res = await authJson(
			app,
			`/v1/locations/${seed.location.id}/schedules/2026-03-02/shifts`,
			access,
			{
				method: "POST",
				body: {
					employmentId: seed.worker.id,
					positionId: seed.position.id,
					date: "2026-03-08",
					startMinute: 150,
					endMinute: 240,
				},
			},
		);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe("bad_request");
		expect(body.message).toContain("does not exist in America/New_York");
	});

	test("route: POST shift after gap then GET round-trips startMinute (no silent shift)", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedNyWorkplace(d, "Dst Nongap Cafe");
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const create = await authJson(
			app,
			`/v1/locations/${seed.location.id}/schedules/2026-03-02/shifts`,
			access,
			{
				method: "POST",
				body: {
					employmentId: seed.worker.id,
					positionId: seed.position.id,
					date: "2026-03-08",
					startMinute: 180,
					endMinute: 300,
				},
			},
		);
		expect(create.status).toBe(200);
		const getRes = await authJson(
			app,
			`/v1/locations/${seed.location.id}/schedules/2026-03-02`,
			access,
			{},
		);
		expect(getRes.status).toBe(200);
		const payload = await getRes.json();
		const shift = payload.shifts.find(
			(s: { startMinute: number }) => s.startMinute === 180,
		);
		expect(shift).toBeDefined();
		expect(shift.startMinute).toBe(180);
		expect(shift.endMinute).toBe(300);
	});

	test("route: fall-back ambiguous and unambiguous minutes round-trip via API", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedNyWorkplace(d, "Dst Fallback Cafe");
		const access = await token(seed.managerProfileId, seed.managerEmail);
		// Ambiguous 01:30 (minute 90) -> first occurrence, round-trips to 90.
		const amb = await authJson(
			app,
			`/v1/locations/${seed.location.id}/schedules/2026-10-26/shifts`,
			access,
			{
				method: "POST",
				body: {
					employmentId: seed.worker.id,
					positionId: seed.position.id,
					date: "2026-11-01",
					startMinute: 90,
					endMinute: 180,
				},
			},
		);
		expect(amb.status).toBe(200);
		// Unambiguous 03:00 (minute 180) -> round-trips to 180.
		const unamb = await authJson(
			app,
			`/v1/locations/${seed.location.id}/schedules/2026-10-26/shifts`,
			access,
			{
				method: "POST",
				body: {
					employmentId: seed.worker.id,
					positionId: seed.position.id,
					date: "2026-11-01",
					startMinute: 180,
					endMinute: 240,
				},
			},
		);
		expect(unamb.status).toBe(200);
		const getRes = await authJson(
			app,
			`/v1/locations/${seed.location.id}/schedules/2026-10-26`,
			access,
			{},
		);
		expect(getRes.status).toBe(200);
		const payload = await getRes.json();
		const minutes = payload.shifts
			.map((s: { startMinute: number }) => s.startMinute)
			.sort((a: number, b: number) => a - b);
		expect(minutes).toContain(90);
		expect(minutes).toContain(180);
	});
}
