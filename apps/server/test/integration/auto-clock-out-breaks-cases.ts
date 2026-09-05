import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

const BUCKET_MS = 15 * 60_000;

function roundDownBoundary(instant: Date, minutes: number): Date {
	const ms = minutes * 60_000;
	return new Date(Math.floor(instant.getTime() / ms) * ms);
}

type Fixture = {
	workplace: { id: string };
	location: { id: string };
	position: { id: string };
	schedule: { id: string };
	employment: { id: string };
	profileId: string;
	email: string;
};

async function seedFixture(
	d: Context["database"],
	name: string,
	override: {
		clockRoundMinutes?: number;
		autoClockOutGraceMinutes?: number;
	} = {},
): Promise<Fixture> {
	const profileId = crypto.randomUUID();
	const email = `${name.toLowerCase().replaceAll(" ", "-")}-manager@example.test`;
	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({
			name,
			clockRoundMinutes: override.clockRoundMinutes ?? 0,
			autoClockOutGraceMinutes: override.autoClockOutGraceMinutes ?? 30,
		})
		.returning();
	const [location] = await d.db
		.insert(d.locations)
		.values({
			workplaceId: required(workplace).id,
			name: `${name} Floor`,
			timezone: "UTC",
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
			weekStartDate: "2026-01-15",
		})
		.returning();
	await d.db.insert(d.profiles).values({ id: profileId, email });
	const [employment] = await d.db
		.insert(d.employments)
		.values({
			workplaceId: required(workplace).id,
			profileId,
			kind: "manager",
			hourlyWageCents: 2000,
		})
		.returning();
	return {
		workplace: required(workplace),
		location: required(location),
		position: required(position),
		schedule: required(schedule),
		employment: required(employment),
		profileId,
		email,
	};
}

async function publishVersionShift(
	d: Context["database"],
	fx: Fixture,
	startsAt: Date,
	endsAt: Date,
) {
	const [version] = await d.db
		.insert(d.scheduleVersions)
		.values({ scheduleId: fx.schedule.id, versionNumber: 1 })
		.returning();
	const [snapshot] = await d.db
		.insert(d.versionShifts)
		.values({
			versionId: required(version).id,
			employmentId: fx.employment.id,
			positionId: fx.position.id,
			startsAt,
			endsAt,
		})
		.returning();
	return required(snapshot);
}

type CsvRow = {
	workingName: string;
	email: string;
	location: string;
	clockedIn: string;
	clockedOut: string;
	workedMinutes: number;
	breakMinutes: number;
	laborCents: number;
	approval: string;
	attendance: string;
};

async function fetchHoursCsv(
	app: Context["app"],
	token: string,
	workplaceId: string,
	from: string,
	to: string,
): Promise<CsvRow[]> {
	const response = await app.handle(
		new Request(
			`http://localhost/v1/workplaces/${workplaceId}/reports/hours.csv?from=${from}&to=${to}`,
			{ headers: { authorization: `Bearer ${token}` } },
		),
	);
	expect(response.status).toBe(200);
	const text = await response.text();
	const lines = text.split("\n");
	expect(lines[0]).toBe(
		"worker,email,location,clocked_in,clocked_out,worked_minutes,break_minutes,labor_cents,approval,attendance",
	);
	const rows: CsvRow[] = [];
	for (const line of lines.slice(1)) {
		if (line === "") continue;
		const [
			workingName,
			email,
			location,
			clockedIn,
			clockedOut,
			workedMinutes,
			breakMinutes,
			laborCents,
			approval,
			attendance,
		] = line.split(",");
		rows.push({
			workingName,
			email,
			location,
			clockedIn,
			clockedOut,
			workedMinutes: Number(workedMinutes),
			breakMinutes: Number(breakMinutes),
			laborCents: Number(laborCents),
			approval,
			attendance,
		});
	}
	return rows;
}

export function registerAutoClockOutBreaksTests(getContext: () => Context) {
	test("auto clock-out clamps a break started after the rounded-down out time so it never ends before it starts", async () => {
		const { database: d, app, token } = getContext();
		const { processAutoClockOutBatch } = await import(
			"../../src/auto-clock-out"
		);
		const fx = await seedFixture(d, "Negative Break Cafe", {
			clockRoundMinutes: 15,
			autoClockOutGraceMinutes: 30,
		});

		const now = Date.now();
		// clockedOutAt is the 15-minute boundary two hours before now.
		const clockedOutAt = roundDownBoundary(new Date(now - 2 * 60 * 60_000), 15);
		// target = endsAt + grace lands 5 minutes past the boundary, which roundToMinutes
		// (Math.round) rounds DOWN to the boundary. So endsAt = boundary - 25 minutes.
		const target = new Date(clockedOutAt.getTime() + 5 * 60_000);
		const endsAt = new Date(target.getTime() - 30 * 60_000);
		const startsAt = new Date(clockedOutAt.getTime() - 8 * 60 * 60_000);
		const snapshot = await publishVersionShift(d, fx, startsAt, endsAt);
		const [entry] = await d.db
			.insert(d.timeEntries)
			.values({
				versionShiftId: snapshot.id,
				employmentId: fx.employment.id,
				clockedInAt: startsAt,
				clockedOutAt: null,
			})
			.returning();
		// A worker still clocked in past shift end starts a break 4 minutes after the
		// rounded down clockOut time — i.e. after the persisted out time, inside grace.
		const breakStartedAt = new Date(clockedOutAt.getTime() + 4 * 60_000);
		await d.db.insert(d.timeEntryBreaks).values({
			timeEntryId: required(entry).id,
			startedAt: breakStartedAt,
			endedAt: null,
		});

		expect(target.getTime() - clockedOutAt.getTime()).toBe(5 * 60_000);
		// Sanity: a naive (endedAt - startedAt) using the buggy out time would be negative.
		expect(clockedOutAt.getTime() - breakStartedAt.getTime()).toBe(-4 * 60_000);

		const closed = await processAutoClockOutBatch();
		expect(closed).toBeGreaterThanOrEqual(1);

		const [updated] = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.id, required(entry).id));
		expect(updated?.clockedOutAt?.toISOString()).toBe(
			clockedOutAt.toISOString(),
		);
		expect(updated?.autoClosedAt).not.toBeNull();
		expect(updated?.approvalStatus).toBe("pending");

		const [breakRow] = await d.db
			.select()
			.from(d.timeEntryBreaks)
			.where(eq(d.timeEntryBreaks.timeEntryId, required(entry).id));
		// The core guarantee: a break never ends before it starts.
		expect(breakRow?.endedAt).not.toBeNull();
		expect(
			(required(breakRow?.endedAt).getTime() - breakRow.startedAt.getTime()) /
				60_000,
		).toBeGreaterThanOrEqual(0);
		// Clamped exactly to startedAt (GREATEST(clockedOutAt, startedAt) = startedAt).
		expect(breakRow?.endedAt?.toISOString()).toBe(breakStartedAt.toISOString());

		const accessToken = await token(fx.profileId, fx.email);
		const day = startsAt.toISOString().slice(0, 10);
		const rows = await fetchHoursCsv(
			app,
			accessToken,
			fx.workplace.id,
			day,
			day,
		);
		const ours = rows.find((row) => row.email === fx.email);
		expect(ours).toBeDefined();
		// The CSV must never report a negative break or inflate worked/labor.
		expect(ours?.breakMinutes).toBe(0);
		expect(ours?.breakMinutes).toBeGreaterThanOrEqual(0);
		const rawMinutes = Math.round(
			(clockedOutAt.getTime() - startsAt.getTime()) / 60_000,
		);
		expect(ours?.workedMinutes).toBe(rawMinutes - 0);
		expect(ours?.workedMinutes).toBe(480);
		expect(ours?.approval).toBe("pending");
		expect(ours?.laborCents).toBe(Math.round((480 / 60) * 2000));
		expect(ours?.laborCents).toBe(16000);
	});

	test("auto clock-out leaves a break started before the rounded out time at the out time", async () => {
		const { database: d, app, token } = getContext();
		const { processAutoClockOutBatch } = await import(
			"../../src/auto-clock-out"
		);
		const fx = await seedFixture(d, "Round Up Break Cafe", {
			clockRoundMinutes: 15,
			autoClockOutGraceMinutes: 30,
		});

		const now = Date.now();
		// target lands 5 minutes before a 15-min boundary → roundToMinutes rounds UP.
		const upBoundary = new Date(
			Math.ceil((now - 1 * 60 * 60_000) / BUCKET_MS) * BUCKET_MS,
		);
		const clockedOutAt = upBoundary;
		const target = new Date(upBoundary.getTime() - 5 * 60_000);
		const endsAt = new Date(target.getTime() - 30 * 60_000);
		const startsAt = new Date(clockedOutAt.getTime() - 8 * 60 * 60_000);
		const snapshot = await publishVersionShift(d, fx, startsAt, endsAt);
		const [entry] = await d.db
			.insert(d.timeEntries)
			.values({
				versionShiftId: snapshot.id,
				employmentId: fx.employment.id,
				clockedInAt: startsAt,
				clockedOutAt: null,
			})
			.returning();
		// A normal break started 10 minutes before the out time.
		const breakStartedAt = new Date(clockedOutAt.getTime() - 10 * 60_000);
		await d.db.insert(d.timeEntryBreaks).values({
			timeEntryId: required(entry).id,
			startedAt: breakStartedAt,
			endedAt: null,
		});

		expect(target.getTime() - clockedOutAt.getTime()).toBe(-5 * 60_000);
		expect(clockedOutAt.getTime() - breakStartedAt.getTime()).toBe(10 * 60_000);

		const closed = await processAutoClockOutBatch();
		expect(closed).toBeGreaterThanOrEqual(1);

		const [updated] = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.id, required(entry).id));
		expect(updated?.clockedOutAt?.toISOString()).toBe(
			clockedOutAt.toISOString(),
		);

		const [breakRow] = await d.db
			.select()
			.from(d.timeEntryBreaks)
			.where(eq(d.timeEntryBreaks.timeEntryId, required(entry).id));
		// No clamp: break ends at the out time, duration preserved at 10 minutes.
		expect(breakRow?.endedAt?.toISOString()).toBe(clockedOutAt.toISOString());
		expect(
			(required(breakRow?.endedAt).getTime() - breakRow.startedAt.getTime()) /
				60_000,
		).toBe(10);

		const accessToken = await token(fx.profileId, fx.email);
		const day = startsAt.toISOString().slice(0, 10);
		const rows = await fetchHoursCsv(
			app,
			accessToken,
			fx.workplace.id,
			day,
			day,
		);
		const ours = rows.find((row) => row.email === fx.email);
		expect(ours).toBeDefined();
		expect(ours?.breakMinutes).toBe(10);
		expect(ours?.breakMinutes).toBeGreaterThanOrEqual(0);
		expect(ours?.workedMinutes).toBe(480 - 10);
		expect(ours?.workedMinutes).toBe(470);
		expect(ours?.laborCents).toBe(Math.round((470 / 60) * 2000));
	});

	test("hours CSV never reports a negative break or inflates labor for a pre-existing corrupted break row", async () => {
		const { database: d, app, token } = getContext();
		const fx = await seedFixture(d, "Corrupted Break Cafe", {
			clockRoundMinutes: 0,
			autoClockOutGraceMinutes: 30,
		});

		const startsAt = new Date("2026-01-15T09:00:00.000Z");
		const endsAt = new Date("2026-01-15T17:00:00.000Z");
		const clockedOutAt = new Date("2026-01-15T17:00:00.000Z");
		const snapshot = await publishVersionShift(d, fx, startsAt, endsAt);
		const [entry] = await d.db
			.insert(d.timeEntries)
			.values({
				versionShiftId: snapshot.id,
				employmentId: fx.employment.id,
				clockedInAt: startsAt,
				clockedOutAt,
			})
			.returning();
		// Simulate a corrupted break persisted before the source fix: it ends before it starts.
		const breakStartedAt = new Date("2026-01-15T16:55:00.000Z");
		const breakEndedAt = new Date("2026-01-15T16:50:00.000Z");
		await d.db.insert(d.timeEntryBreaks).values({
			timeEntryId: required(entry).id,
			startedAt: breakStartedAt,
			endedAt: breakEndedAt,
		});

		const accessToken = await token(fx.profileId, fx.email);
		const rows = await fetchHoursCsv(
			app,
			accessToken,
			fx.workplace.id,
			"2026-01-15",
			"2026-01-15",
		);
		const ours = rows.find((row) => row.email === fx.email);
		expect(ours).toBeDefined();
		// Defense-in-depth: a corrupted (endedAt < startedAt) break contributes 0 minutes,
		// never negative, so worked_minutes and labor_cents are not inflated.
		expect(ours?.breakMinutes).toBe(0);
		expect(ours?.breakMinutes).toBeGreaterThanOrEqual(0);
		const rawMinutes = Math.round(
			(clockedOutAt.getTime() - startsAt.getTime()) / 60_000,
		);
		expect(rawMinutes).toBe(480);
		expect(ours?.workedMinutes).toBe(480);
		expect(ours?.laborCents).toBe(Math.round((480 / 60) * 2000));
		expect(ours?.laborCents).toBe(16000);
	});
}
