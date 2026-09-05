import { describe, expect, test } from "bun:test";

import { shiftOverlapsTimeOff, timeOffCoversDay } from "./schedule-timeoff";

process.env.TZ = "Pacific/Honolulu";

const tokyoPartialDay = {
	startsAt: "2026-01-10T00:00:00Z",
	endsAt: "2026-01-10T08:00:00Z",
};
const nycAllDay = {
	startsAt: "2026-01-10T05:00:00Z",
	endsAt: "2026-01-11T05:00:00Z",
};
const tokyoAllDay = {
	startsAt: "2026-01-09T15:00:00Z",
	endsAt: "2026-01-10T15:00:00Z",
};
const chicagoAllDay = {
	startsAt: "2026-01-10T06:00:00Z",
	endsAt: "2026-01-11T06:00:00Z",
};
const chicagoPartialDay = {
	startsAt: "2026-01-10T15:00:00Z",
	endsAt: "2026-01-10T23:00:00Z",
};

describe("timeOffCoversDay", () => {
	test("Tokyo partial-day lands the badge on the correct scheduled-location day", () => {
		expect(timeOffCoversDay(tokyoPartialDay, "2026-01-10", "Asia/Tokyo")).toBe(
			true,
		);
		expect(timeOffCoversDay(tokyoPartialDay, "2026-01-09", "Asia/Tokyo")).toBe(
			false,
		);
		expect(timeOffCoversDay(tokyoPartialDay, "2026-01-11", "Asia/Tokyo")).toBe(
			false,
		);
	});

	test("NYC all-day covers only the requested scheduled-location day", () => {
		expect(timeOffCoversDay(nycAllDay, "2026-01-10", "America/New_York")).toBe(
			true,
		);
		expect(timeOffCoversDay(nycAllDay, "2026-01-09", "America/New_York")).toBe(
			false,
		);
		expect(timeOffCoversDay(nycAllDay, "2026-01-11", "America/New_York")).toBe(
			false,
		);
	});

	test("all-day exclusive end does not bleed onto the next day", () => {
		expect(timeOffCoversDay(tokyoAllDay, "2026-01-10", "Asia/Tokyo")).toBe(
			true,
		);
		expect(timeOffCoversDay(tokyoAllDay, "2026-01-09", "Asia/Tokyo")).toBe(
			false,
		);
		expect(timeOffCoversDay(tokyoAllDay, "2026-01-11", "Asia/Tokyo")).toBe(
			false,
		);
	});

	test("multi-day all-day spans the inclusive range of scheduled-location days", () => {
		const multiDay = {
			startsAt: "2026-01-09T15:00:00Z",
			endsAt: "2026-01-12T15:00:00Z",
		};
		expect(timeOffCoversDay(multiDay, "2026-01-10", "Asia/Tokyo")).toBe(true);
		expect(timeOffCoversDay(multiDay, "2026-01-11", "Asia/Tokyo")).toBe(true);
		expect(timeOffCoversDay(multiDay, "2026-01-12", "Asia/Tokyo")).toBe(true);
		expect(timeOffCoversDay(multiDay, "2026-01-09", "Asia/Tokyo")).toBe(false);
		expect(timeOffCoversDay(multiDay, "2026-01-13", "Asia/Tokyo")).toBe(false);
	});

	test("divergent employment tz: instant projects to the correct scheduled-location cell", () => {
		const divergent = {
			startsAt: "2026-01-10T23:00:00Z",
			endsAt: "2026-01-11T04:00:00Z",
		};
		expect(timeOffCoversDay(divergent, "2026-01-11", "Asia/Tokyo")).toBe(true);
		expect(timeOffCoversDay(divergent, "2026-01-10", "Asia/Tokyo")).toBe(false);
	});

	test("single-zone all-day still matches the grid day", () => {
		expect(
			timeOffCoversDay(chicagoAllDay, "2026-01-10", "America/Chicago"),
		).toBe(true);
		expect(
			timeOffCoversDay(chicagoAllDay, "2026-01-09", "America/Chicago"),
		).toBe(false);
		expect(
			timeOffCoversDay(chicagoAllDay, "2026-01-11", "America/Chicago"),
		).toBe(false);
	});
});

describe("shiftOverlapsTimeOff", () => {
	test("exact overlap against approved time off fires", () => {
		expect(
			shiftOverlapsTimeOff(
				tokyoPartialDay,
				"2026-01-10",
				540,
				1020,
				"Asia/Tokyo",
			),
		).toBe(true);
	});

	test("a shift inside the time-off window fires", () => {
		expect(
			shiftOverlapsTimeOff(
				tokyoPartialDay,
				"2026-01-10",
				660,
				840,
				"Asia/Tokyo",
			),
		).toBe(true);
	});

	test("a shift on an adjacent free day does not fire", () => {
		expect(
			shiftOverlapsTimeOff(
				tokyoPartialDay,
				"2026-01-09",
				540,
				1020,
				"Asia/Tokyo",
			),
		).toBe(false);
	});

	test("a shift after the time-off window does not fire", () => {
		expect(
			shiftOverlapsTimeOff(
				tokyoPartialDay,
				"2026-01-10",
				1320,
				1380,
				"Asia/Tokyo",
			),
		).toBe(false);
	});

	test("half-open: a shift starting when off ends does not fire", () => {
		expect(
			shiftOverlapsTimeOff(
				tokyoPartialDay,
				"2026-01-10",
				1020,
				1080,
				"Asia/Tokyo",
			),
		).toBe(false);
	});

	test("half-open: a shift ending when off starts does not fire", () => {
		expect(
			shiftOverlapsTimeOff(
				tokyoPartialDay,
				"2026-01-10",
				480,
				540,
				"Asia/Tokyo",
			),
		).toBe(false);
	});

	test("overnight shift overlapping an all-day off fires", () => {
		expect(
			shiftOverlapsTimeOff(tokyoAllDay, "2026-01-10", 1320, 120, "Asia/Tokyo"),
		).toBe(true);
	});

	test("overnight shift on a later day does not fire", () => {
		expect(
			shiftOverlapsTimeOff(tokyoAllDay, "2026-01-11", 1320, 120, "Asia/Tokyo"),
		).toBe(false);
	});

	test("overnight shift ending at midnight (endMinute 0) overlaps an all-day off", () => {
		expect(
			shiftOverlapsTimeOff(tokyoAllDay, "2026-01-10", 1320, 0, "Asia/Tokyo"),
		).toBe(true);
	});

	test("single-zone exact overlap fires", () => {
		expect(
			shiftOverlapsTimeOff(
				chicagoPartialDay,
				"2026-01-10",
				540,
				1020,
				"America/Chicago",
			),
		).toBe(true);
	});
});
