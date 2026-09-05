import { beforeEach, describe, expect, test } from "bun:test";

import { leaveChargeMinutes, PAID_DAY_MINUTES } from "./leave";

process.env.TZ = "Pacific/Honolulu";

describe("leaveChargeMinutes", () => {
	beforeEach(() => {
		process.env.TZ = "Pacific/Honolulu";
	});

	test("non-all-day charge matches naive math away from DST", () => {
		expect(
			leaveChargeMinutes({
				startDate: "2026-01-15",
				endDate: "2026-01-15",
				allDay: false,
				startMinute: 9 * 60,
				endMinute: 17 * 60,
			}),
		).toBe(480);
	});

	test("all-day charge counts calendar days regardless of timezone", () => {
		expect(
			leaveChargeMinutes({
				startDate: "2026-01-15",
				endDate: "2026-01-16",
				allDay: true,
				startMinute: 0,
				endMinute: 0,
			}),
		).toBe(2 * PAID_DAY_MINUTES);
	});

	test("spring-forward day computes elapsed hours, not wall hours", () => {
		// US 2026-03-08: 2:00 AM CST jumps to 3:00 AM CDT, so a 9h wall
		// window (0:00 → 9:00) elapses 8 real hours in America/Chicago.
		expect(
			leaveChargeMinutes({
				startDate: "2026-03-08",
				endDate: "2026-03-08",
				allDay: false,
				startMinute: 0,
				endMinute: 9 * 60,
				timeZone: "America/Chicago",
			}),
		).toBe(8 * 60);
		// Without a timezone the naive wall math still reports 9h.
		expect(
			leaveChargeMinutes({
				startDate: "2026-03-08",
				endDate: "2026-03-08",
				allDay: false,
				startMinute: 0,
				endMinute: 9 * 60,
			}),
		).toBe(9 * 60);
	});

	test("fall-back day computes elapsed hours, not wall hours", () => {
		// US 2026-11-01: 2:00 AM CDT falls back to 1:00 AM CST, so a
		// 2h wall window (1:00 → 3:00) elapses 3 real hours.
		expect(
			leaveChargeMinutes({
				startDate: "2026-11-01",
				endDate: "2026-11-01",
				allDay: false,
				startMinute: 60,
				endMinute: 3 * 60,
				timeZone: "America/Chicago",
			}),
		).toBe(3 * 60);
	});

	test("timezone-aware charge matches the server across a multi-day window", () => {
		// 2026-11-01 01:00 CDT (06:00Z) → 2026-11-02 03:00 CST (09:00Z)
		// spans the repeated fall-back hour: 27 elapsed hours.
		expect(
			leaveChargeMinutes({
				startDate: "2026-11-01",
				endDate: "2026-11-02",
				allDay: false,
				startMinute: 60,
				endMinute: 3 * 60,
				timeZone: "America/Chicago",
			}),
		).toBe(27 * 60);
	});

	test("degenerate and inverted windows charge zero", () => {
		expect(
			leaveChargeMinutes({
				startDate: "2026-01-15",
				endDate: "2026-01-15",
				allDay: false,
				startMinute: 600,
				endMinute: 600,
			}),
		).toBe(0);
		expect(
			leaveChargeMinutes({
				startDate: "2026-01-16",
				endDate: "2026-01-15",
				allDay: false,
				startMinute: 0,
				endMinute: 600,
			}),
		).toBe(0);
		expect(
			leaveChargeMinutes({
				startDate: "",
				endDate: "2026-01-15",
				allDay: false,
				startMinute: 0,
				endMinute: 600,
			}),
		).toBe(0);
	});
});
