import { expect, test } from "bun:test";
import { BadRequestError } from "../src/errors";
import { isWithinNoticeWindow } from "../src/notice-window";
import { wallToInstant, zonedDayInfo } from "../src/time";

test("Notice Window excludes the exact boundary and includes one millisecond inside", () => {
	const now = Date.parse("2026-03-07T15:00:00Z");
	const boundary = now + 48 * 3_600_000;
	expect(isWithinNoticeWindow(new Date(boundary), now, 48)).toBe(false);
	expect(isWithinNoticeWindow(new Date(boundary - 1), now, 48)).toBe(true);
	expect(isWithinNoticeWindow(new Date(boundary + 1), now, 48)).toBe(false);
	expect(isWithinNoticeWindow(new Date(now), now, 0)).toBe(false);
});

test("Notice Window is false for shifts that already started or ended", () => {
	const now = Date.parse("2026-03-07T15:00:00Z");
	expect(isWithinNoticeWindow(new Date(now - 1), now, 48)).toBe(false);
	expect(isWithinNoticeWindow(new Date(now - 48 * 3_600_000), now, 48)).toBe(
		false,
	);
	expect(isWithinNoticeWindow(new Date(now + 1), now, 48)).toBe(true);
});

test("overnight shift minutes resolve onto the next local date", () => {
	const start = wallToInstant("2026-09-01", 22 * 60, "Asia/Kolkata");
	const end = wallToInstant("2026-09-01", 26 * 60, "Asia/Kolkata");
	expect(end.getTime() - start.getTime()).toBe(4 * 3_600_000);
	expect(zonedDayInfo(end, "Asia/Kolkata")).toMatchObject({
		dateKey: "2026-09-02",
		minuteOfDay: 120,
	});
});
test("spring DST overnight duration uses elapsed time, not wall hours", () => {
	const start = wallToInstant("2026-03-07", 22 * 60, "America/New_York");
	const end = wallToInstant("2026-03-07", 30 * 60, "America/New_York");
	expect(end.getTime() - start.getTime()).toBe(7 * 3_600_000);
});
test("fall DST overnight duration includes the repeated hour", () => {
	const start = wallToInstant("2026-10-31", 22 * 60, "America/New_York");
	const end = wallToInstant("2026-10-31", 30 * 60, "America/New_York");
	expect(end.getTime() - start.getTime()).toBe(9 * 3_600_000);
});

test("wallToInstant round-trips through zonedDayInfo for non-DST minutes", () => {
	const tz = "America/New_York";
	for (const m of [0, 60, 480, 1440]) {
		const inst = wallToInstant("2026-03-15", m, tz);
		expect(zonedDayInfo(inst, tz).minuteOfDay).toBe(m % 1440);
	}
});

test("spring-forward gap minutes reject instead of shifting an hour earlier", () => {
	const tz = "America/New_York";
	for (const m of [120, 130, 150, 179]) {
		expect(() => wallToInstant("2026-03-08", m, tz)).toThrow(BadRequestError);
	}
});

test("spring-forward gap rejection message names the wall time, date, and zone", () => {
	expect(() => wallToInstant("2026-03-08", 150, "America/New_York")).toThrow(
		"Local time 2:30 on 2026-03-08 does not exist in America/New_York",
	);
});

test("spring-forward non-gap minutes still round-trip to themselves", () => {
	const tz = "America/New_York";
	expect(
		zonedDayInfo(wallToInstant("2026-03-08", 60, tz), tz).minuteOfDay,
	).toBe(60);
	expect(
		zonedDayInfo(wallToInstant("2026-03-08", 180, tz), tz).minuteOfDay,
	).toBe(180);
	expect(
		zonedDayInfo(wallToInstant("2026-03-08", 240, tz), tz).minuteOfDay,
	).toBe(240);
});

test("fall-back ambiguous hour keeps the first occurrence and round-trips", () => {
	const tz = "America/New_York";
	for (const m of [60, 90, 119]) {
		const inst = wallToInstant("2026-11-01", m, tz);
		expect(inst.toISOString()).toBe(
			`2026-11-01T05:${String(m - 60).padStart(2, "0")}:00.000Z`,
		);
		expect(zonedDayInfo(inst, tz).minuteOfDay).toBe(m);
	}
});

test("fall-back unambiguous post-transition minutes round-trip to themselves", () => {
	const tz = "America/New_York";
	for (const m of [120, 180, 240]) {
		expect(
			zonedDayInfo(wallToInstant("2026-11-01", m, tz), tz).minuteOfDay,
		).toBe(m);
	}
});
