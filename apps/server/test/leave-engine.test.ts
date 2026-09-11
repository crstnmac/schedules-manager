import type { LeavePolicy } from "@SchedulesManager/db";
import { describe, expect, test } from "bun:test";

import {
	addMonthsToDateKey,
	chargeLeaveMinutes,
	holidayDatesInRange,
	leaveYearForDate,
	leaveYearRange,
	leaveYearStartDate,
	workingDaysInWindow,
} from "../src/leave";
import { dueAccrualPeriods } from "../src/leave-accrual";
import { expandRecurrence } from "../src/leave-requests";

function policy(overrides: Partial<LeavePolicy> = {}): LeavePolicy {
	return {
		leaveTypeId: "type-1",
		workplaceId: "workplace-1",
		accrualMethod: "none",
		accrualMinutes: 0,
		accrualDay: 1,
		accrualWeekday: 0,
		annualAccrualMonthDay: null,
		accrualPerHoursWorked: 40,
		prorateOnJoin: true,
		maxBalanceMinutes: null,
		carryForwardEnabled: false,
		maxCarryForwardMinutes: null,
		carryForwardExpiryMonths: null,
		allowNegative: false,
		maxNegativeMinutes: 0,
		chargeWorkingDaysOnly: true,
		minServiceDays: 0,
		noticeDays: 0,
		maxConsecutiveDays: null,
		documentRequiredAfterDays: null,
		encashmentEnabled: false,
		maxEncashmentMinutesPerYear: null,
		allowPartialDays: true,
		leaveYearStartMonthDay: "01-01",
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function employment(joinedAt: string | null = null) {
	return {
		id: "employment-1",
		workplaceId: "workplace-1",
		joinedAt,
		createdAt: new Date("2026-01-05T12:00:00Z"),
	};
}

describe("leave charging with weekends and holidays", () => {
	test("full-day leave charges only working days", () => {
		const minutes = chargeLeaveMinutes(
			{
				allDay: true,
				startDate: "2026-09-04",
				endDate: "2026-09-07",
				startsAt: new Date("2026-09-04T05:00:00Z"),
				endsAt: new Date("2026-09-08T05:00:00Z"),
			},
			{
				workingDaysOnly: true,
				weekendDays: [0, 6],
				holidayDates: new Set(["2026-09-07"]),
			},
		);
		// Friday only; Saturday, Sunday and the Monday holiday do not charge.
		expect(minutes).toBe(480);
	});

	test("holidays and weekends still charge when the policy says so", () => {
		const minutes = chargeLeaveMinutes(
			{
				allDay: true,
				startDate: "2026-09-04",
				endDate: "2026-09-07",
				startsAt: new Date("2026-09-04T05:00:00Z"),
				endsAt: new Date("2026-09-08T05:00:00Z"),
			},
			{
				workingDaysOnly: false,
				weekendDays: [0, 6],
				holidayDates: new Set(["2026-09-07"]),
			},
		);
		expect(minutes).toBe(4 * 480);
	});

	test("counts working days and expands recurring holidays", () => {
		expect(
			workingDaysInWindow("2026-12-24", "2026-12-28", [0, 6], new Set()),
		).toBe(3);
		const dates = holidayDatesInRange(
			[{ date: "2020-12-25", recurring: true }],
			"2026-12-24",
			"2026-12-26",
		);
		expect([...dates]).toEqual(["2026-12-25"]);
	});
});

describe("leave year maths", () => {
	test("finds the containing leave year for a custom start", () => {
		expect(leaveYearStartDate("2026-03-15", "04-01")).toBe("2025-04-01");
		expect(leaveYearStartDate("2026-04-02", "04-01")).toBe("2026-04-01");
		expect(leaveYearForDate("2026-03-15", "04-01")).toBe(2025);
		expect(leaveYearRange(2026, "04-01")).toEqual({
			startDate: "2026-04-01",
			endDate: "2027-03-31",
		});
	});

	test("clamps month additions", () => {
		expect(addMonthsToDateKey("2026-01-31", 1)).toBe("2026-02-28");
		expect(addMonthsToDateKey("2026-03-15", 12)).toBe("2027-03-15");
	});
});

describe("recurring leave windows", () => {
	test("expands weekly and monthly series", () => {
		const weekly = expandRecurrence(
			[{ startDate: "2026-09-07", endDate: "2026-09-07" }],
			{ frequency: "weekly", count: 3 },
		);
		expect(weekly.map((window) => window.startDate)).toEqual([
			"2026-09-07",
			"2026-09-14",
			"2026-09-21",
		]);
		const monthly = expandRecurrence(
			[{ startDate: "2026-01-31", endDate: "2026-02-01" }],
			{ frequency: "monthly", count: 2 },
		);
		expect(monthly.map((window) => window.startDate)).toEqual([
			"2026-01-31",
			"2026-02-28",
		]);
	});
});

describe("accrual periods", () => {
	test("monthly accrual is idempotent per period and prorated on join", () => {
		const targets = dueAccrualPeriods({
			policy: policy({
				accrualMethod: "monthly",
				accrualMinutes: 960,
				accrualDay: 1,
			}),
			leaveTypeName: "Vacation",
			employment: employment("2026-02-16"),
			asOfDate: "2026-03-01",
			workedMinutesByMonth: new Map(),
		});
		expect(targets.map((target) => target.periodKey)).toEqual(["M:2026-03-01"]);
		// Feb 16 - Mar 1 is 14 of the 28 days in the accrual period.
		expect(targets[0]?.amountMinutes).toBe(480);
	});

	test("annual accrual grants once per leave year", () => {
		const targets = dueAccrualPeriods({
			policy: policy({
				accrualMethod: "annual",
				accrualMinutes: 4800,
				annualAccrualMonthDay: "01-01",
				leaveYearStartMonthDay: "01-01",
			}),
			leaveTypeName: "Vacation",
			employment: employment("2024-06-01"),
			asOfDate: "2026-06-01",
			workedMinutesByMonth: new Map(),
		});
		expect(targets.map((target) => target.periodKey)).toEqual([
			"A:2025-01-01",
			"A:2026-01-01",
		]);
	});

	test("per-hour accrual uses worked minutes", () => {
		const targets = dueAccrualPeriods({
			policy: policy({
				accrualMethod: "per_hour_worked",
				accrualMinutes: 480,
				accrualPerHoursWorked: 40,
			}),
			leaveTypeName: "PTO",
			employment: employment("2025-01-01"),
			asOfDate: "2026-02-01",
			workedMinutesByMonth: new Map([["2026-01", 4800]]),
		});
		expect(targets).toHaveLength(1);
		expect(targets[0]?.amountMinutes).toBe(960);
	});

	test("weekly accrual anchors on the configured weekday", () => {
		const targets = dueAccrualPeriods({
			policy: policy({
				accrualMethod: "weekly",
				accrualMinutes: 120,
				accrualWeekday: 1,
			}),
			leaveTypeName: "PTO",
			employment: employment("2026-01-05"),
			asOfDate: "2026-01-20",
			workedMinutesByMonth: new Map(),
		});
		expect(targets.map((target) => target.periodEnd)).toEqual([
			"2026-01-05",
			"2026-01-12",
			"2026-01-19",
		]);
		// The first week is prorated to the join day itself; later weeks are full.
		expect(targets[0]?.amountMinutes).toBe(Math.round((120 * 1) / 7));
		expect(
			targets.slice(1).every((target) => target.amountMinutes === 120),
		).toBe(true);
	});
});
