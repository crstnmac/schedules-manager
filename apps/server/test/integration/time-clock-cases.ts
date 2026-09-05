import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { weekStartOfDateKey, zonedDayInfo } from "../../src/time";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

export function registerTimeClockTests(getContext: () => Context) {
	test("clock commands enforce ownership, timing, replay, and duplicate-punch restrictions", async () => {
		const { database: d, app, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = "clock-worker@example.test";
		await d.db.insert(d.profiles).values({ id: profileId, email });
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Clock Tests" })
			.returning();
		const [employment] = await d.db
			.insert(d.employments)
			.values({
				workplaceId: required(workplace).id,
				profileId,
				kind: "worker",
			})
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Clock Location",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Clock Position" })
			.returning();
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: "2026-09-01",
			})
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: required(schedule).id, versionNumber: 1 })
			.returning();
		const now = Date.now();
		const offsets = [
			[-5, 60],
			[30, 90],
			[-120, -60],
			[-10, 90],
		];
		const snapshots = [];
		for (const [start, end] of offsets) {
			const [draft] = await d.db
				.insert(d.shifts)
				.values({
					scheduleId: required(schedule).id,
					employmentId: required(employment).id,
					positionId: required(position).id,
					startsAt: new Date(now + required(start) * 60_000),
					endsAt: new Date(now + required(end) * 60_000),
				})
				.returning();
			const [snapshot] = await d.db
				.insert(d.versionShifts)
				.values({
					versionId: required(version).id,
					shiftId: required(draft).id,
					employmentId: required(employment).id,
					positionId: required(position).id,
					startsAt: required(draft).startsAt,
					endsAt: required(draft).endsAt,
				})
				.returning();
			snapshots.push(required(snapshot));
		}
		const accessToken = await token(profileId, email);
		const outsiderToken = await token(
			crypto.randomUUID(),
			"clock-outsider@example.test",
		);
		const request = (
			id: string,
			action: string,
			key?: string,
			auth = accessToken,
		) =>
			app.handle(
				new Request(`http://localhost/v1/my/shifts/${id}/${action}`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${auth}`,
						...(key ? { "idempotency-key": key } : {}),
					},
				}),
			);
		expect(
			(
				await request(
					required(snapshots[0]).id,
					"clock-in",
					undefined,
					outsiderToken,
				)
			).status,
		).toBe(404);
		expect((await request(required(snapshots[1]).id, "clock-in")).status).toBe(
			400,
		);
		expect((await request(required(snapshots[2]).id, "clock-in")).status).toBe(
			400,
		);
		expect((await request(required(snapshots[3]).id, "clock-out")).status).toBe(
			404,
		);
		const sameKey = await Promise.all([
			request(required(snapshots[0]).id, "clock-in", "clock-replay-key"),
			request(required(snapshots[0]).id, "clock-in", "clock-replay-key"),
		]);
		expect(sameKey.map((r) => r.status)).toEqual([200, 200]);
		expect(await required(sameKey[0]).json()).toEqual(
			await required(sameKey[1]).json(),
		);
		expect((await request(required(snapshots[0]).id, "clock-in")).status).toBe(
			409,
		);
		const outs = await Promise.all([
			request(required(snapshots[0]).id, "clock-out"),
			request(required(snapshots[0]).id, "clock-out"),
		]);
		expect(outs.map((r) => r.status)).toEqual([200, 200]);
		expect(await required(outs[0]).json()).toEqual(
			await required(outs[1]).json(),
		);
		const punches = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.versionShiftId, required(snapshots[0]).id));
		expect(punches).toHaveLength(1);
		const [successor] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: required(schedule).id, versionNumber: 2 })
			.returning();
		const [republishedShift] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(successor).id,
				shiftId: required(snapshots[0]).shiftId,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: required(snapshots[0]).startsAt,
				endsAt: required(snapshots[0]).endsAt,
			})
			.returning();
		expect((await request(required(snapshots[3]).id, "clock-in")).status).toBe(
			409,
		);
		expect(
			(await request(required(republishedShift).id, "clock-in")).status,
		).toBe(409);
	});

	test("a Manager can clock in on an assigned published Shift", async () => {
		const { database: d, app, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = "clock-manager@example.test";
		await d.db.insert(d.profiles).values({ id: profileId, email });
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Manager Clock Tests" })
			.returning();
		const [employment] = await d.db
			.insert(d.employments)
			.values({
				workplaceId: required(workplace).id,
				profileId,
				kind: "manager",
			})
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Manager Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor Manager",
			})
			.returning();
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: "2026-09-01",
			})
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: required(schedule).id, versionNumber: 1 })
			.returning();
		const now = Date.now();
		const [draft] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: new Date(now - 5 * 60_000),
				endsAt: new Date(now + 60 * 60_000),
			})
			.returning();
		const [snapshot] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				shiftId: required(draft).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: required(draft).startsAt,
				endsAt: required(draft).endsAt,
			})
			.returning();
		const accessToken = await token(profileId, email);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/my/shifts/${required(snapshot).id}/clock-in`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${accessToken}` },
				},
			),
		);
		expect(response.status).toBe(200);
		const punches = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.versionShiftId, required(snapshot).id));
		expect(punches).toHaveLength(1);
		expect(punches[0]?.employmentId).toBe(required(employment).id);
	});

	test("an on-clock shift remains nextShift on my/schedule (no regression)", async () => {
		const { database: d, app, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = "clock-onclock@example.test";
		await d.db.insert(d.profiles).values({ id: profileId, email });
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "OnClock NextShift Tests", weekStartDay: 1 })
			.returning();
		const workplaceId = required(workplace).id;
		const [employment] = await d.db
			.insert(d.employments)
			.values({ workplaceId, profileId, kind: "worker" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId,
				name: "OnClock Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId, name: "OnClock Position" })
			.returning();
		const tz = "America/Chicago";
		const now = Date.now();
		const thisWeek = weekStartOfDateKey(
			zonedDayInfo(new Date(now), tz).dateKey,
			1,
		);
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({ locationId: required(location).id, weekStartDate: thisWeek })
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: required(schedule).id, versionNumber: 1 })
			.returning();
		const [draftA] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: new Date(now - 5 * 60_000),
				endsAt: new Date(now + 60 * 60_000),
			})
			.returning();
		const [snapshotA] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				shiftId: required(draftA).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: required(draftA).startsAt,
				endsAt: required(draftA).endsAt,
			})
			.returning();
		const accessToken = await token(profileId, email);
		const clock = (id: string, action: string) =>
			app.handle(
				new Request(`http://localhost/v1/my/shifts/${id}/${action}`, {
					method: "POST",
					headers: { authorization: `Bearer ${accessToken}` },
				}),
			);

		expect((await clock(required(snapshotA).id, "clock-in")).status).toBe(200);

		const scheduleResponse = await app.handle(
			new Request(`http://localhost/v1/workplaces/${workplaceId}/my/schedule`, {
				headers: { authorization: `Bearer ${accessToken}` },
			}),
		);
		expect(scheduleResponse.status).toBe(200);
		const scheduleBody = await scheduleResponse.json();
		expect(scheduleBody.nextShift).not.toBeNull();
		expect(scheduleBody.nextShift.id).toBe(required(snapshotA).id);
		expect(scheduleBody.nextShift.timeEntry).not.toBeNull();
		expect(scheduleBody.nextShift.timeEntry.clockedOutAt).toBe(null);
	});

	test("early clock-out advances nextShift past the closed shift on my/schedule", async () => {
		const { database: d, app, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = "clock-advance@example.test";
		await d.db.insert(d.profiles).values({ id: profileId, email });
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "NextShift Advance Tests", weekStartDay: 1 })
			.returning();
		const workplaceId = required(workplace).id;
		const [employment] = await d.db
			.insert(d.employments)
			.values({ workplaceId, profileId, kind: "worker" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId,
				name: "Advance Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId, name: "Advance Position" })
			.returning();
		const tz = "America/Chicago";
		const now = Date.now();
		const thisWeek = weekStartOfDateKey(
			zonedDayInfo(new Date(now), tz).dateKey,
			1,
		);
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({ locationId: required(location).id, weekStartDate: thisWeek })
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: required(schedule).id, versionNumber: 1 })
			.returning();
		const [draftA] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: new Date(now - 5 * 60_000),
				endsAt: new Date(now + 60 * 60_000),
			})
			.returning();
		const [draftB] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: new Date(now + 120 * 60_000),
				endsAt: new Date(now + 180 * 60_000),
			})
			.returning();
		const [snapshotA] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				shiftId: required(draftA).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: required(draftA).startsAt,
				endsAt: required(draftA).endsAt,
			})
			.returning();
		const [snapshotB] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				shiftId: required(draftB).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: required(draftB).startsAt,
				endsAt: required(draftB).endsAt,
			})
			.returning();
		const accessToken = await token(profileId, email);
		const clock = (id: string, action: string) =>
			app.handle(
				new Request(`http://localhost/v1/my/shifts/${id}/${action}`, {
					method: "POST",
					headers: { authorization: `Bearer ${accessToken}` },
				}),
			);

		expect((await clock(required(snapshotA).id, "clock-in")).status).toBe(200);
		expect((await clock(required(snapshotA).id, "clock-out")).status).toBe(200);

		const scheduleResponse = await app.handle(
			new Request(`http://localhost/v1/workplaces/${workplaceId}/my/schedule`, {
				headers: { authorization: `Bearer ${accessToken}` },
			}),
		);
		expect(scheduleResponse.status).toBe(200);
		const scheduleBody = await scheduleResponse.json();
		expect(scheduleBody.nextShift).not.toBeNull();
		expect(scheduleBody.nextShift.id).toBe(required(snapshotB).id);
		expect(scheduleBody.nextShift.timeEntry).toBe(null);
		const weekShiftA = scheduleBody.currentWeek.shifts.find(
			(s: { id: string }) => s.id === required(snapshotA).id,
		);
		expect(weekShiftA).toBeDefined();
		expect(weekShiftA.timeEntry).not.toBeNull();
		expect(weekShiftA.timeEntry.clockedOutAt).not.toBeNull();
	});

	test("early clock-out with no later shift leaves nextShift null on my/schedule", async () => {
		const { database: d, app, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = "clock-advance-last@example.test";
		await d.db.insert(d.profiles).values({ id: profileId, email });
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "NextShift Last Tests", weekStartDay: 1 })
			.returning();
		const workplaceId = required(workplace).id;
		const [employment] = await d.db
			.insert(d.employments)
			.values({ workplaceId, profileId, kind: "worker" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({ workplaceId, name: "Last Floor", timezone: "America/Chicago" })
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId, name: "Last Position" })
			.returning();
		const tz = "America/Chicago";
		const now = Date.now();
		const thisWeek = weekStartOfDateKey(
			zonedDayInfo(new Date(now), tz).dateKey,
			1,
		);
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({ locationId: required(location).id, weekStartDate: thisWeek })
			.returning();
		const [version] = await d.db
			.insert(d.scheduleVersions)
			.values({ scheduleId: required(schedule).id, versionNumber: 1 })
			.returning();
		const [draftA] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: new Date(now - 5 * 60_000),
				endsAt: new Date(now + 60 * 60_000),
			})
			.returning();
		const [snapshotA] = await d.db
			.insert(d.versionShifts)
			.values({
				versionId: required(version).id,
				shiftId: required(draftA).id,
				employmentId: required(employment).id,
				positionId: required(position).id,
				startsAt: required(draftA).startsAt,
				endsAt: required(draftA).endsAt,
			})
			.returning();
		const accessToken = await token(profileId, email);
		const clock = (id: string, action: string) =>
			app.handle(
				new Request(`http://localhost/v1/my/shifts/${id}/${action}`, {
					method: "POST",
					headers: { authorization: `Bearer ${accessToken}` },
				}),
			);

		expect((await clock(required(snapshotA).id, "clock-in")).status).toBe(200);
		expect((await clock(required(snapshotA).id, "clock-out")).status).toBe(200);

		const scheduleResponse = await app.handle(
			new Request(`http://localhost/v1/workplaces/${workplaceId}/my/schedule`, {
				headers: { authorization: `Bearer ${accessToken}` },
			}),
		);
		expect(scheduleResponse.status).toBe(200);
		const scheduleBody = await scheduleResponse.json();
		expect(scheduleBody.nextShift).toBe(null);
		const weekShiftA = scheduleBody.currentWeek.shifts.find(
			(s: { id: string }) => s.id === required(snapshotA).id,
		);
		expect(weekShiftA).toBeDefined();
		expect(weekShiftA.timeEntry).not.toBeNull();
		expect(weekShiftA.timeEntry.clockedOutAt).not.toBeNull();
	});
}
