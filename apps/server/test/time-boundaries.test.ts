import { describe, expect, test } from "bun:test";
import { BadRequestError } from "../src/errors";
import { isWithinNoticeWindow } from "../src/notice-window";
import { minutesByZonedDate, wallToInstant, zonedDayInfo } from "../src/time";

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

describe("minutesByZonedDate DST-at-midnight", () => {
	function sum(split: Map<string, number>): number {
		let total = 0;
		for (const value of split.values()) total += value;
		return total;
	}

	test("splits an overnight shift crossing an Egypt spring-forward-at-midnight without throwing", () => {
		// Egypt springs forward at midnight on 2024-04-26: local 00:00–00:59
		// does not exist. 22:00 EET on 04-25 -> 06:00 EEST on 04-26.
		const start = new Date("2024-04-25T20:00:00.000Z");
		const end = new Date("2024-04-26T03:00:00.000Z");
		const split = minutesByZonedDate(start, end, "Egypt");
		expect([...split.entries()]).toEqual([
			["2024-04-25", 120],
			["2024-04-26", 300],
		]);
		// The split sums to actual elapsed minutes (the skipped spring-forward
		// hour is NOT counted), matching how the caller derives `worked`.
		expect(sum(split)).toBe((end.getTime() - start.getTime()) / 60_000);
	});

	test("does not change the split for a 02:00 spring-forward zone (America/New_York regression)", () => {
		// New York springs forward at 02:00, so local 00:00 always exists and the
		// midnight conversion never threw; this path must keep its prior behavior.
		// 17:00 EST 03-07 -> 08:00 EDT 03-08.
		const start = new Date("2026-03-07T22:00:00Z");
		const end = new Date("2026-03-08T12:00:00Z");
		expect([
			...minutesByZonedDate(start, end, "America/New_York").entries(),
		]).toEqual([
			["2026-03-07", 420],
			["2026-03-08", 420],
		]);
	});
});
