import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { shiftDays, weekStartOfDateKey, zonedDayInfo } from "../../src/time";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
	publishScheduleNow: typeof import("../../src/routes/publication").publishScheduleNow;
};

export function registerMyScheduleTests(getContext: () => Context) {
	test("my/schedule nextShift never surfaces a shift reassigned away in a later published version", async () => {
		const { database: d, app, token, publishScheduleNow } = getContext();
		const managerProfileId = crypto.randomUUID();
		const workerProfileId = crypto.randomUUID();
		const otherWorkerProfileId = crypto.randomUUID();
		const managerEmail = "my-schedule-manager@example.test";
		const workerEmail = "my-schedule-worker@example.test";
		const otherWorkerEmail = "my-schedule-other@example.test";

		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: workerProfileId, email: workerEmail },
			{ id: otherWorkerProfileId, email: otherWorkerEmail },
		]);
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "My Schedule Restaurant" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
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
				},
				{
					workplaceId: required(workplace).id,
					profileId: otherWorkerProfileId,
					kind: "worker",
				},
			])
			.returning();
		const worker = required(
			employments.find((row) => row.profileId === workerProfileId),
		);
		const otherWorker = required(
			employments.find((row) => row.profileId === otherWorkerProfileId),
		);

		const tz = "America/Chicago";
		const now = new Date();
		const shiftStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
		const shiftEnd = new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000);
		const weekStart = weekStartOfDateKey(
			zonedDayInfo(shiftStart, tz).dateKey,
			1,
		);

		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: weekStart,
			})
			.returning();
		const [draftShift] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: worker.id,
				positionId: required(position).id,
				startsAt: shiftStart,
				endsAt: shiftEnd,
			})
			.returning();

		const firstPublication = await publishScheduleNow(
			required(schedule).id,
			managerProfileId,
		);
		const [firstSnapshot] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, firstPublication.version.id));
		expect(firstSnapshot?.employmentId).toBe(worker.id);

		await d.db
			.update(d.shifts)
			.set({ employmentId: otherWorker.id, updatedAt: new Date() })
			.where(eq(d.shifts.id, required(draftShift).id));
		const secondPublication = await publishScheduleNow(
			required(schedule).id,
			managerProfileId,
		);
		expect(secondPublication.version.versionNumber).toBe(2);

		const workerToken = await token(workerProfileId, workerEmail);
		const mySchedule = async () =>
			app.handle(
				new Request(
					`http://localhost/v1/workplaces/${required(workplace).id}/my/schedule`,
					{ headers: { authorization: `Bearer ${workerToken}` } },
				),
			);

		const reassigned = await mySchedule();
		expect(reassigned.status).toBe(200);
		const reassignedBody = await reassigned.json();
		const reassignedShifts = [
			...(reassignedBody.currentWeek?.shifts ?? []),
			...(reassignedBody.nextWeek?.shifts ?? []),
		];
		expect(reassignedShifts).toHaveLength(0);
		expect(reassignedBody.nextShift).toBeNull();

		const otherWorkerToken = await token(
			otherWorkerProfileId,
			otherWorkerEmail,
		);
		const otherSchedule = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${required(workplace).id}/my/schedule`,
				{ headers: { authorization: `Bearer ${otherWorkerToken}` } },
			),
		);
		expect(otherSchedule.status).toBe(200);
		const otherBody = await otherSchedule.json();
		const otherShifts = [
			...(otherBody.currentWeek?.shifts ?? []),
			...(otherBody.nextWeek?.shifts ?? []),
		];
		expect(otherShifts).toHaveLength(1);
		expect(otherBody.nextShift).not.toBeNull();
		const otherShift = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, secondPublication.version.id));
		expect(otherBody.nextShift?.id).toBe(required(otherShift[0]).id);

		await d.db
			.update(d.shifts)
			.set({ employmentId: worker.id, updatedAt: new Date() })
			.where(eq(d.shifts.id, required(draftShift).id));
		const thirdPublication = await publishScheduleNow(
			required(schedule).id,
			managerProfileId,
		);
		const [restoredSnapshot] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, thirdPublication.version.id));

		const restored = await mySchedule();
		expect(restored.status).toBe(200);
		const restoredBody = await restored.json();
		expect(restoredBody.nextShift).not.toBeNull();
		expect(restoredBody.nextShift?.id).toBe(required(restoredSnapshot).id);
		const restoredShifts = [
			...(restoredBody.currentWeek?.shifts ?? []),
			...(restoredBody.nextWeek?.shifts ?? []),
		];
		expect(restoredShifts.map((shift: { id: string }) => shift.id)).toContain(
			required(restoredSnapshot).id,
		);
		expect(restoredBody.nextShift?.id).toBe(restoredShifts[0]?.id);

		const staleClockIn = await app.handle(
			new Request(
				`http://localhost/v1/my/shifts/${required(firstSnapshot).id}/clock-in`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${workerToken}` },
				},
			),
		);
		expect(staleClockIn.status).toBe(409);
	});

	test("my/schedule nextShift dedupes to the latest version per schedule across thisWeek and nextWeek", async () => {
		const { database: d, app, token, publishScheduleNow } = getContext();
		const managerProfileId = crypto.randomUUID();
		const wProfileId = crypto.randomUUID();
		const w2ProfileId = crypto.randomUUID();
		const managerEmail = "dedupe-manager@example.test";
		const wEmail = "dedupe-worker@example.test";
		const w2Email = "dedupe-other@example.test";
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: wProfileId, email: wEmail },
			{ id: w2ProfileId, email: w2Email },
		]);
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Dedupe Restaurant" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
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
					profileId: wProfileId,
					kind: "worker",
				},
				{
					workplaceId: required(workplace).id,
					profileId: w2ProfileId,
					kind: "worker",
				},
			])
			.returning();
		const W = required(employments.find((row) => row.profileId === wProfileId));
		const W2 = required(
			employments.find((row) => row.profileId === w2ProfileId),
		);

		const tz = "America/Chicago";
		const now = new Date();
		const thisWeekStart = weekStartOfDateKey(zonedDayInfo(now, tz).dateKey, 1);
		const nextWeekStart = shiftDays(thisWeekStart, 7);
		const day = 24 * 60 * 60 * 1000;

		const [scheduleA] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: thisWeekStart,
			})
			.returning();
		const [scheduleB] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: nextWeekStart,
			})
			.returning();

		const [draftX] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(scheduleA).id,
				employmentId: W.id,
				positionId: required(position).id,
				startsAt: new Date(now.getTime() + 5 * day),
				endsAt: new Date(now.getTime() + 5 * day + 8 * 60 * 60 * 1000),
			})
			.returning();
		await publishScheduleNow(required(scheduleA).id, managerProfileId);
		await d.db
			.update(d.shifts)
			.set({ employmentId: W2.id, updatedAt: new Date() })
			.where(eq(d.shifts.id, required(draftX).id));
		await publishScheduleNow(required(scheduleA).id, managerProfileId);

		const [draftY] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(scheduleB).id,
				employmentId: W.id,
				positionId: required(position).id,
				startsAt: new Date(now.getTime() + 3 * day),
				endsAt: new Date(now.getTime() + 3 * day + 8 * 60 * 60 * 1000),
			})
			.returning();
		await publishScheduleNow(required(scheduleB).id, managerProfileId);
		await d.db
			.update(d.shifts)
			.set({ employmentId: W2.id, updatedAt: new Date() })
			.where(eq(d.shifts.id, required(draftY).id));
		await publishScheduleNow(required(scheduleB).id, managerProfileId);

		const wToken = await token(wProfileId, wEmail);
		const getSchedule = () =>
			app.handle(
				new Request(
					`http://localhost/v1/workplaces/${required(workplace).id}/my/schedule`,
					{ headers: { authorization: `Bearer ${wToken}` } },
				),
			);

		const body1 = await (await getSchedule()).json();
		expect(body1.nextShift).toBeNull();
		const weekShifts1 = [
			...(body1.currentWeek?.shifts ?? []),
			...(body1.nextWeek?.shifts ?? []),
		];
		expect(weekShifts1).toHaveLength(0);

		await d.db
			.update(d.shifts)
			.set({ employmentId: W.id, updatedAt: new Date() })
			.where(eq(d.shifts.id, required(draftX).id));
		const pubA3 = await publishScheduleNow(
			required(scheduleA).id,
			managerProfileId,
		);
		const [xA3] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, pubA3.version.id));

		const body2 = await (await getSchedule()).json();
		expect(body2.nextShift).not.toBeNull();
		expect(body2.nextShift?.id).toBe(required(xA3).id);
		const cwShifts = (body2.currentWeek?.shifts ?? []).map(
			(shift: { id: string }) => shift.id,
		);
		const nwShifts = (body2.nextWeek?.shifts ?? []).map(
			(shift: { id: string }) => shift.id,
		);
		expect(cwShifts).toContain(required(xA3).id);
		expect(nwShifts).toHaveLength(0);
		expect(body2.nextShift?.id).not.toBe(required(draftX).id);
	});

	test("my/schedule nextShift picks the earlier-starting latest-version shift regardless of which week's schedule owns it", async () => {
		const { database: d, app, token, publishScheduleNow } = getContext();
		const managerProfileId = crypto.randomUUID();
		const wProfileId = crypto.randomUUID();
		const managerEmail = "ordering-manager@example.test";
		const wEmail = "ordering-worker@example.test";
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: wProfileId, email: wEmail },
		]);
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Ordering Restaurant" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
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
					profileId: wProfileId,
					kind: "worker",
				},
			])
			.returning();
		const W = required(employments.find((row) => row.profileId === wProfileId));

		const tz = "America/Chicago";
		const now = new Date();
		const thisWeekStart = weekStartOfDateKey(zonedDayInfo(now, tz).dateKey, 1);
		const nextWeekStart = shiftDays(thisWeekStart, 7);
		const day = 24 * 60 * 60 * 1000;

		const [scheduleA] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: thisWeekStart,
			})
			.returning();
		const [scheduleB] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: nextWeekStart,
			})
			.returning();

		await d.db.insert(d.shifts).values({
			scheduleId: required(scheduleA).id,
			employmentId: W.id,
			positionId: required(position).id,
			startsAt: new Date(now.getTime() + 10 * day),
			endsAt: new Date(now.getTime() + 10 * day + 8 * 60 * 60 * 1000),
		});
		const pubA = await publishScheduleNow(
			required(scheduleA).id,
			managerProfileId,
		);
		const [xA] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, pubA.version.id));

		await d.db.insert(d.shifts).values({
			scheduleId: required(scheduleB).id,
			employmentId: W.id,
			positionId: required(position).id,
			startsAt: new Date(now.getTime() + 3 * day),
			endsAt: new Date(now.getTime() + 3 * day + 8 * 60 * 60 * 1000),
		});
		const pubB = await publishScheduleNow(
			required(scheduleB).id,
			managerProfileId,
		);
		const [yB] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, pubB.version.id));

		const wToken = await token(wProfileId, wEmail);
		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${required(workplace).id}/my/schedule`,
				{ headers: { authorization: `Bearer ${wToken}` } },
			),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		const nwShifts = (body.nextWeek?.shifts ?? []).map(
			(shift: { id: string }) => shift.id,
		);
		expect(body.nextShift?.id).toBe(required(yB).id);
		expect(nwShifts).toContain(required(yB).id);
		expect(body.nextShift?.id).not.toBe(required(xA).id);
		expect(new Date(body.nextShift.startsAt).getTime()).toBeLessThan(
			new Date(body.currentWeek.shifts[0].startsAt).getTime(),
		);
	});

	test("my/schedule nextShift.timeEntry is keyed to the latest-version snapshot, not a stale one", async () => {
		const { database: d, app, token, publishScheduleNow } = getContext();
		const managerProfileId = crypto.randomUUID();
		const wProfileId = crypto.randomUUID();
		const w2ProfileId = crypto.randomUUID();
		const managerEmail = "timeentry-manager@example.test";
		const wEmail = "timeentry-worker@example.test";
		const w2Email = "timeentry-other@example.test";
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: wProfileId, email: wEmail },
			{ id: w2ProfileId, email: w2Email },
		]);
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "TimeEntry Schedule Restaurant" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
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
					profileId: wProfileId,
					kind: "worker",
				},
				{
					workplaceId: required(workplace).id,
					profileId: w2ProfileId,
					kind: "worker",
				},
			])
			.returning();
		const W = required(employments.find((row) => row.profileId === wProfileId));
		const W2 = required(
			employments.find((row) => row.profileId === w2ProfileId),
		);

		const tz = "America/Chicago";
		const now = new Date();
		const thisWeekStart = weekStartOfDateKey(zonedDayInfo(now, tz).dateKey, 1);
		const startsAt = new Date(now.getTime() - 5 * 60 * 1000);
		const endsAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: thisWeekStart,
			})
			.returning();
		const [draftShift] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: W.id,
				positionId: required(position).id,
				startsAt,
				endsAt,
			})
			.returning();
		const firstPublication = await publishScheduleNow(
			required(schedule).id,
			managerProfileId,
		);
		const [xA1] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, firstPublication.version.id));

		await d.db
			.update(d.shifts)
			.set({ employmentId: W2.id, updatedAt: new Date() })
			.where(eq(d.shifts.id, required(draftShift).id));
		await publishScheduleNow(required(schedule).id, managerProfileId);

		await d.db
			.update(d.shifts)
			.set({ employmentId: W.id, updatedAt: new Date() })
			.where(eq(d.shifts.id, required(draftShift).id));
		const thirdPublication = await publishScheduleNow(
			required(schedule).id,
			managerProfileId,
		);
		const [xA3] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, thirdPublication.version.id));

		const wToken = await token(wProfileId, wEmail);
		const clockIn = await app.handle(
			new Request(
				`http://localhost/v1/my/shifts/${required(xA3).id}/clock-in`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${wToken}` },
				},
			),
		);
		expect(clockIn.status).toBe(200);
		const clockInBody = await clockIn.json();
		expect(clockInBody.timeEntry.versionShiftId).toBe(required(xA3).id);

		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${required(workplace).id}/my/schedule`,
				{ headers: { authorization: `Bearer ${wToken}` } },
			),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.nextShift).not.toBeNull();
		expect(body.nextShift?.id).toBe(required(xA3).id);
		expect(body.nextShift?.id).not.toBe(required(xA1).id);
		expect(body.nextShift?.timeEntry).not.toBeNull();
		expect(body.nextShift?.timeEntry?.clockedInAt).toBe(
			clockInBody.timeEntry.clockedInAt,
		);

		const staleEntries = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.versionShiftId, required(xA1).id));
		expect(staleEntries).toHaveLength(0);
		const latestEntries = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.versionShiftId, required(xA3).id));
		expect(latestEntries).toHaveLength(1);
	});
}
