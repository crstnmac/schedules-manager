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

type ReportSeed =
	ReturnType<typeof seedReportWorkplace> extends Promise<infer T> ? T : never;

async function seedReportWorkplace(
	d: Context["database"],
	name: string,
	overrides: {
		overtimeWeeklyMinutes?: number;
		overtimeDailyMinutes?: number;
		weekStartDay?: number;
		timezone?: string;
	} = {},
) {
	const managerProfileId = crypto.randomUUID();
	const workerProfileId = crypto.randomUUID();
	const slug = name.toLowerCase().replaceAll(" ", "-");
	const managerEmail = `${slug}-manager@example.test`;
	const workerEmail = `${slug}-worker@example.test`;
	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({
			name,
			overtimeWeeklyMinutes: overrides.overtimeWeeklyMinutes,
			overtimeDailyMinutes: overrides.overtimeDailyMinutes,
			weekStartDay: overrides.weekStartDay,
		})
		.returning();
	const [location] = await d.db
		.insert(d.locations)
		.values({
			workplaceId: required(workplace).id,
			name: `${name} Floor`,
			timezone: overrides.timezone ?? "UTC",
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
				hourlyWageCents: 2000,
			},
		])
		.returning();
	const worker = required(
		employments.find((row) => row.profileId === workerProfileId),
	);
	const [schedule] = await d.db
		.insert(d.schedules)
		.values({ locationId: required(location).id, weekStartDate: "2026-09-07" })
		.returning();
	const [version] = await d.db
		.insert(d.scheduleVersions)
		.values({ scheduleId: required(schedule).id, versionNumber: 1 })
		.returning();
	return {
		workplace: required(workplace),
		location: required(location),
		position: required(position),
		schedule: required(schedule),
		version: required(version),
		worker,
		managerProfileId,
		workerProfileId,
		managerEmail,
		workerEmail,
	};
}

/** Insert a published shift + matching time entry for `workedMinutes`. */
async function addTimeEntry(
	d: Context["database"],
	seed: Awaited<ReportSeed>,
	clockedInAt: Date,
	workedMinutes: number,
) {
	const clockedOutAt = new Date(clockedInAt.getTime() + workedMinutes * 60_000);
	const [snapshot] = await d.db
		.insert(d.versionShifts)
		.values({
			versionId: seed.version.id,
			employmentId: seed.worker.id,
			positionId: seed.position.id,
			startsAt: clockedInAt,
			endsAt: clockedOutAt,
		})
		.returning();
	const [entry] = await d.db
		.insert(d.timeEntries)
		.values({
			versionShiftId: required(snapshot).id,
			employmentId: seed.worker.id,
			clockedInAt,
			clockedOutAt,
		})
		.returning();
	return required(entry);
}

function parseCsv(body: string): { header: string; rows: string[][] } {
	const lines = body.split("\n");
	return {
		header: lines[0] ?? "",
		rows: lines
			.slice(1)
			.filter((line) => line.length > 0)
			.map((line) => line.split(",")),
	};
}

export function registerReportTests(getContext: () => Context) {
	test("hours.csv aggregates weekly overtime per employment-week", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedReportWorkplace(d, "Weekly OT CSV Cafe");
		const starts = [
			"2026-09-08T10:00:00.000Z",
			"2026-09-09T10:00:00.000Z",
			"2026-09-10T10:00:00.000Z",
			"2026-09-11T10:00:00.000Z",
			"2026-09-12T10:00:00.000Z",
		];
		// Five 9h (540 min) shifts = 2700 min (45h); weekly OT = 300 min.
		for (const start of starts) {
			await addTimeEntry(d, seed, new Date(start), 540);
		}
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/reports/hours.csv?from=2026-09-01&to=2026-09-30`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/csv; charset=utf-8",
		);
		expect(response.headers.get("content-disposition")).toBe(
			'attachment; filename="hours-2026-09-01-2026-09-30.csv"',
		);
		const csv = parseCsv(await response.text());
		expect(csv.header).toBe(
			"worker,email,location,clocked_in,clocked_out,worked_minutes,break_minutes,labor_cents,approval,attendance",
		);
		expect(csv.rows).toHaveLength(5);
		const laborCentsColumn = csv.rows.map((columns) => Number(columns[7]));
		// 80000 regular + 15000 OT = 95000, prorated equally across five rows.
		expect(laborCentsColumn.reduce((sum, value) => sum + value, 0)).toBe(95000);
		expect(laborCentsColumn.every((value) => value === 19000)).toBe(true);
		for (const columns of csv.rows) {
			expect(columns[5]).toBe("540");
			expect(columns[6]).toBe("0");
		}
	});

	test("hours.csv honors configured daily overtime", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedReportWorkplace(d, "Daily OT CSV Cafe", {
			overtimeDailyMinutes: 480,
		});
		// One 10h shift on a single day: 120 daily OT min -> 22000 cents.
		await addTimeEntry(d, seed, new Date("2026-09-08T10:00:00.000Z"), 600);
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/reports/hours.csv?from=2026-09-01&to=2026-09-30`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(response.status).toBe(200);
		const csv = parseCsv(await response.text());
		expect(csv.rows).toHaveLength(1);
		expect(Number(csv.rows[0]?.[7])).toBe(22000);
	});

	test("hours.csv buckets overtime per week across a multi-week range", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedReportWorkplace(d, "Multi Week CSV Cafe");
		const weekOne = [
			"2026-09-08T10:00:00.000Z",
			"2026-09-09T10:00:00.000Z",
			"2026-09-10T10:00:00.000Z",
			"2026-09-11T10:00:00.000Z",
			"2026-09-12T10:00:00.000Z",
		];
		const weekTwo = [
			"2026-09-15T10:00:00.000Z",
			"2026-09-16T10:00:00.000Z",
			"2026-09-17T10:00:00.000Z",
			"2026-09-18T10:00:00.000Z",
			"2026-09-19T10:00:00.000Z",
		];
		for (const start of [...weekOne, ...weekTwo]) {
			await addTimeEntry(d, seed, new Date(start), 540);
		}
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/reports/hours.csv?from=2026-09-01&to=2026-09-30`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(response.status).toBe(200);
		const csv = parseCsv(await response.text());
		expect(csv.rows).toHaveLength(10);
		// Two independent 45h weeks -> 95000 each = 190000 total.
		const total = csv.rows.reduce((sum, row) => sum + Number(row[7]), 0);
		expect(total).toBe(190000);
	});

	test("hours.csv respects weekStartDay when bucketing weeks", async () => {
		const { database: d, app, token } = getContext();
		// Sunday-start weeks: Sat 9/12 is its own week; Sun 9/13 + Mon 9/14
		// share the week of 9/13. Each shift is 9h (540 min).
		const seed = await seedReportWorkplace(d, "Week Boundary CSV Cafe", {
			weekStartDay: 0,
		});
		await addTimeEntry(d, seed, new Date("2026-09-12T10:00:00.000Z"), 540);
		await addTimeEntry(d, seed, new Date("2026-09-13T10:00:00.000Z"), 540);
		await addTimeEntry(d, seed, new Date("2026-09-14T10:00:00.000Z"), 540);
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/reports/hours.csv?from=2026-09-01&to=2026-09-30`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(response.status).toBe(200);
		const csv = parseCsv(await response.text());
		// Sat alone (540) + Sun+Mon (1080) — all under the 2400-min threshold, so
		// no weekly OT. Total = 1620 min regular = 27h * $20 = 54000.
		const total = csv.rows.reduce((sum, row) => sum + Number(row[7]), 0);
		expect(total).toBe(54000);
	});

	test("hours.csv reports zero overtime for an under-threshold worker", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedReportWorkplace(d, "Under Threshold CSV Cafe");
		await addTimeEntry(d, seed, new Date("2026-09-08T10:00:00.000Z"), 480);
		await addTimeEntry(d, seed, new Date("2026-09-09T10:00:00.000Z"), 480);
		const access = await token(seed.managerProfileId, seed.managerEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/reports/hours.csv?from=2026-09-01&to=2026-09-30`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(response.status).toBe(200);
		const csv = parseCsv(await response.text());
		// 960 min, no OT. Each row = 8h * $20 = 16000; total = 32000.
		expect(csv.rows.map((row) => Number(row[7]))).toEqual([16000, 16000]);
	});

	test("hours.csv labor totals match the schedule /labor endpoint for the same workforce-week", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedReportWorkplace(d, "Parity CSV Cafe");
		const access = await token(seed.managerProfileId, seed.managerEmail);
		// Five 9h shifts (540 min) on Mon-Fri of the 2026-09-07 week = 2700 min
		// (45h), crossing the 2400-min weekly threshold → 300 weekly OT min.
		const starts = [
			"2026-09-08T10:00:00.000Z",
			"2026-09-09T10:00:00.000Z",
			"2026-09-10T10:00:00.000Z",
			"2026-09-11T10:00:00.000Z",
			"2026-09-12T10:00:00.000Z",
		];
		for (const start of starts) {
			const startsAt = new Date(start);
			const endsAt = new Date(startsAt.getTime() + 540 * 60_000);
			// Draft shift drives the /labor endpoint (which aggregates `shifts`).
			await d.db.insert(d.shifts).values({
				scheduleId: seed.schedule.id,
				employmentId: seed.worker.id,
				positionId: seed.position.id,
				startsAt,
				endsAt,
			});
			// Published snapshot + time entry (matching instants) drive the CSV.
			await addTimeEntry(d, seed, startsAt, 540);
		}

		const laborResponse = await app.handle(
			new Request(
				`http://localhost/v1/locations/${seed.location.id}/schedules/2026-09-07/labor`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(laborResponse.status).toBe(200);
		const laborBody = (await laborResponse.json()) as {
			labor: { scheduledCents: number; overtimeCents: number };
		};
		// The only employment with shifts is the worker, so scheduledCents is
		// entirely theirs: laborCents(2700, 2000, 2400) = 80000 + 15000 = 95000.
		expect(laborBody.labor.scheduledCents).toBe(95000);
		expect(laborBody.labor.overtimeCents).toBe(15000);

		const csvResponse = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${seed.workplace.id}/reports/hours.csv?from=2026-09-01&to=2026-09-30`,
				{ headers: { authorization: `Bearer ${access}` } },
			),
		);
		expect(csvResponse.status).toBe(200);
		const csv = parseCsv(await csvResponse.text());
		const csvTotal = csv.rows.reduce((sum, row) => sum + Number(row[7]), 0);
		// Parity: the CSV's summed labor_cents equals the schedule /labor
		// scheduledCents (both use the shared laborCents + minutesByZonedDate).
		expect(csvTotal).toBe(laborBody.labor.scheduledCents);
		expect(csvTotal).toBe(95000);
	});
}
