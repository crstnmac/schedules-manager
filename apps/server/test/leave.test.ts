import { describe, expect, test } from "bun:test";

import {
	describeLeaveWindow,
	inclusiveDayCount,
	nextLeaveCapReset,
	PAID_DAY_MINUTES,
	resolveLeaveWindow,
} from "../src/leave";

describe("leave windows", () => {
	test("counts inclusive calendar days", () => {
		expect(inclusiveDayCount("2026-09-10", "2026-09-10")).toBe(1);
		expect(inclusiveDayCount("2026-09-10", "2026-09-12")).toBe(3);
	});

	test("all-day leave uses paid-day hours, not wall-clock", () => {
		const window = resolveLeaveWindow({
			startDate: "2026-09-10",
			endDate: "2026-09-11",
			allDay: true,
			timeZone: "America/Chicago",
		});
		expect(window.chargeMinutes).toBe(2 * PAID_DAY_MINUTES);
		expect(window.allDay).toBe(true);
		expect(
			describeLeaveWindow(window.startsAt, window.endsAt, "America/Chicago"),
		).toMatchObject({
			startDate: "2026-09-10",
			endDate: "2026-09-11",
			allDay: true,
			chargeMinutes: 960,
		});
	});

	test("leave cap reset names the next calendar date and does not run a job", () => {
		expect(
			nextLeaveCapReset({
				leaveCapReset: "none",
				leaveCapResetMonthDay: null,
				hiredAt: new Date("2024-03-15T12:00:00.000Z"),
				now: new Date("2026-09-03T12:00:00.000Z"),
				timeZone: "UTC",
			}),
		).toBeNull();
		expect(
			nextLeaveCapReset({
				leaveCapReset: "calendar_year",
				leaveCapResetMonthDay: null,
				hiredAt: new Date("2024-03-15T12:00:00.000Z"),
				now: new Date("2026-09-03T12:00:00.000Z"),
				timeZone: "UTC",
			}),
		).toBe("2027-01-01");
		expect(
			nextLeaveCapReset({
				leaveCapReset: "hire_date",
				leaveCapResetMonthDay: null,
				hiredAt: new Date("2024-03-15T12:00:00.000Z"),
				now: new Date("2026-03-15T12:00:00.000Z"),
				timeZone: "UTC",
			}),
		).toBe("2026-03-15");
		expect(
			nextLeaveCapReset({
				leaveCapReset: "custom_date",
				leaveCapResetMonthDay: "01-15",
				hiredAt: new Date("2024-03-15T12:00:00.000Z"),
				now: new Date("2026-09-03T12:00:00.000Z"),
				timeZone: "UTC",
			}),
		).toBe("2027-01-15");
	});

	test("partial-day leave charges the actual window", () => {
		const window = resolveLeaveWindow({
			startDate: "2026-09-10",
			endDate: "2026-09-10",
			allDay: false,
			startMinute: 14 * 60,
			endMinute: 18 * 60,
			timeZone: "America/Chicago",
		});
		expect(window.chargeMinutes).toBe(240);
		expect(window.allDay).toBe(false);
	});
});
