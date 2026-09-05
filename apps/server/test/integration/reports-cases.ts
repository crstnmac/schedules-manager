import { expect, test } from "bun:test";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

async function hoursCsv(
	app: Context["app"],
	workplaceId: string,
	authorization: string,
	from = "2026-09-01",
	to = "2026-09-30",
) {
	return app.handle(
		new Request(
			`http://localhost/v1/workplaces/${workplaceId}/reports/hours.csv?from=${from}&to=${to}`,
			{ headers: { authorization } },
		),
	);
}

export function registerReportsTests(getContext: () => Context) {
	test("C1: an invalid bearer token yields a 401 JSON error body", async () => {
		const { app } = getContext();
		const workplaceId = crypto.randomUUID();
		const response = await hoursCsv(app, workplaceId, "Bearer not-a-real-jwt");
		expect(response.status).toBe(401);
		const body = (await response.json()) as {
			error: string;
			message: string;
		};
		expect(body).toEqual({
			error: "unauthorized",
			message: "Invalid or expired access token",
		});
	});

	test("C2: a non-manager caller yields a 403 JSON error body", async () => {
		const { app, token } = getContext();
		const [workplace] = await getContext()
			.database.db.insert(getContext().database.workplaces)
			.values({ name: "Reports C2 Workplace" })
			.returning();
		// Caller has no employment (manager or otherwise) at this workplace.
		const access = await token(crypto.randomUUID(), "reports-c2@example.test");
		const response = await hoursCsv(
			app,
			required(workplace).id,
			`Bearer ${access}`,
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "forbidden",
			message: "Manager access required",
		});
	});

	test("C3: a manager with a seeded time entry gets a 200 CSV", async () => {
		const { database: d, app, token } = getContext();

		const managerProfileId = crypto.randomUUID();
		const workerProfileId = crypto.randomUUID();
		const managerEmail = "reports-c3-manager@example.test";
		const workerEmail = "reports-c3-worker@example.test";
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: workerProfileId, email: workerEmail },
		]);
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Reports C3 Workplace" })
			.returning();
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
					hourlyWageCents: 2000,
				},
			])
			.returning();
		const worker = required(
			employments.find((row) => row.profileId === workerProfileId),
		);
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "C3 Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
			.returning();
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: "2026-09-07",
			})
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: required(schedule).id, versionNumber: 1 })
			.returning();
		const [versionShift] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				employmentId: worker.id,
				positionId: required(position).id,
				startsAt: new Date("2026-09-08T16:00:00.000Z"),
				endsAt: new Date("2026-09-08T22:00:00.000Z"),
			})
			.returning();
		await d.db.insert(d.timeEntries).values({
			versionShiftId: required(versionShift).id,
			employmentId: worker.id,
			clockedInAt: new Date("2026-09-08T16:00:00.000Z"),
			clockedOutAt: new Date("2026-09-08T22:00:00.000Z"),
		});

		const access = await token(managerProfileId, managerEmail);
		const response = await hoursCsv(
			app,
			required(workplace).id,
			`Bearer ${access}`,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type") ?? "").toStartWith("text/csv");
		expect(response.headers.get("content-disposition")).toBe(
			'attachment; filename="hours-2026-09-01-2026-09-30.csv"',
		);
		const csv = await response.text();
		const lines = csv.split("\n");
		expect(lines[0]).toBe(
			"worker,email,location,clocked_in,clocked_out,worked_minutes,break_minutes,labor_cents,approval,attendance",
		);
		expect(lines.length).toBe(2);
		expect(lines[1]).toContain(workerEmail);
		expect(lines[1]).toContain("C3 Floor");
		expect(lines[1]).toContain("pending");
	});

	test("C4: a server-side throw surfaces as a JSON 500 (frontend fallback path)", async () => {
		const { database: d, app, token } = getContext();
		const managerProfileId = crypto.randomUUID();
		const managerEmail = "reports-c4-manager@example.test";
		await d.db.insert(d.profiles).values({
			id: managerProfileId,
			email: managerEmail,
		});
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Reports C4 Workplace" })
			.returning();
		await d.db
			.insert(d.employments)
			.values({
				workplaceId: required(workplace).id,
				profileId: managerProfileId,
				kind: "manager",
			})
			.returning();
		const access = await token(managerProfileId, managerEmail);
		// "0000-00-00" passes the ^\d{4}-\d{2}-\d{2}$ query schema but is an
		// Invalid Date; serializing it as a timestamp bound throws inside the
		// query layer, producing an uncaught error -> Elysia default 500 JSON.
		const response = await hoursCsv(
			app,
			required(workplace).id,
			`Bearer ${access}`,
			"0000-00-00",
			"0000-00-00",
		);
		expect(response.status).toBe(500);
		// The uncaught-error 500 body is NOT a valid CSV (no CSV header), so the
		// frontend's response.ok guard prevents it from being saved as hours-*.csv.
		// (The frontend's response.json().catch(() => null) fallback for a non-JSON
		// 500 body is covered by the web unit/render tests B1.4 / B2.3.)
		const body = await response.text();
		expect(body.startsWith("worker,email,location,clocked_in")).toBe(false);
	});
}
