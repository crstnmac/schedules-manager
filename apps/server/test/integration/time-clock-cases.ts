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
}
