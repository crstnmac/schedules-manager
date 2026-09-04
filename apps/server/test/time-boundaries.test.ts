import { expect, test } from "bun:test";
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
