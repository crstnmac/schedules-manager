import { describe, expect, test } from "bun:test";
import { formatDateKey, formatLeaveRange, leavePolicySummary } from "./leave";

// Regression guard for the native worker home screen date-key off-by-one.
// See apps/native/app/(tabs)/index.tsx — date-key call sites route through
// formatDateKey (noon-anchor) so a YYYY-MM-DD key is not re-shifted across
// timezones. Bun honors runtime TZ changes, so each test sets process.env.TZ.
describe("formatDateKey (date-only keys, noon-anchor)", () => {
	test("US negative-offset tz renders the key's calendar day", () => {
		process.env.TZ = "America/New_York";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
		process.env.TZ = "America/Chicago";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
		process.env.TZ = "America/Los_Angeles";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
	});

	test("UTC+0 and east-of-UTC unchanged", () => {
		process.env.TZ = "Europe/London";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
		process.env.TZ = "Asia/Tokyo";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
	});

	test("year boundary & DST transition in US/Eastern", () => {
		process.env.TZ = "America/New_York";
		expect(formatDateKey("2026-12-31")).toBe("Thu, Dec 31");
		expect(formatDateKey("2026-03-08")).toBe("Sun, Mar 8");
	});
});

describe("formatLeaveRange partial-day windows", () => {
	const bounds = {
		startsAt: "2026-09-04T14:00:00.000Z",
		endsAt: "2026-09-04T22:00:00.000Z",
	};

	test("all-day spans dates without times", () => {
		process.env.TZ = "America/New_York";
		expect(
			formatLeaveRange({
				...bounds,
				startDate: "2026-09-04",
				endDate: "2026-09-06",
				allDay: true,
				startMinute: 540,
				endMinute: 1020,
			}),
		).toBe("Fri, Sep 4 – Sun, Sep 6");
		expect(
			formatLeaveRange({
				...bounds,
				startDate: "2026-09-04",
				endDate: "2026-09-04",
				allDay: true,
			}),
		).toBe("Fri, Sep 4");
	});

	test("partial-day same date shows times", () => {
		process.env.TZ = "America/New_York";
		expect(
			formatLeaveRange({
				...bounds,
				startDate: "2026-09-04",
				endDate: "2026-09-04",
				allDay: false,
				startMinute: 540,
				endMinute: 1020,
			}),
		).toBe("Fri, Sep 4 · 9:00 AM–5:00 PM");
	});

	test("partial-day multi-date shows start and end times", () => {
		process.env.TZ = "America/New_York";
		expect(
			formatLeaveRange({
				...bounds,
				startDate: "2026-09-04",
				endDate: "2026-09-06",
				allDay: false,
				startMinute: 540,
				endMinute: 1020,
			}),
		).toBe("Fri, Sep 4 9:00 AM – Sun, Sep 6 5:00 PM");
	});

	test("partial-day honors 24h time format", () => {
		process.env.TZ = "America/New_York";
		expect(
			formatLeaveRange(
				{
					...bounds,
					startDate: "2026-09-04",
					endDate: "2026-09-04",
					allDay: false,
					startMinute: 540,
					endMinute: 1020,
				},
				"24h",
			),
		).toBe("Fri, Sep 4 · 09:00–17:00");
	});

	test("missing minutes falls back to the date span", () => {
		process.env.TZ = "America/New_York";
		expect(
			formatLeaveRange({
				...bounds,
				startDate: "2026-09-04",
				endDate: "2026-09-04",
				allDay: false,
			}),
		).toBe("Fri, Sep 4");
	});
});

describe("leavePolicySummary", () => {
	test("summarizes accrual, cap, carry-over, and encashment", () => {
		expect(
			leavePolicySummary({
				accrualMethod: "monthly",
				accrualMinutes: 2400,
				accrualPerHoursWorked: 0,
				maxBalanceMinutes: 9600,
				carryForwardEnabled: true,
				maxCarryForwardMinutes: 2400,
				encashmentEnabled: true,
			}),
		).toEqual([
			"Accrues 40h monthly",
			"Caps at 160h",
			"Carries up to 40h",
			"Encashable",
		]);
	});

	test("per-hour accrual and no policy extras", () => {
		expect(
			leavePolicySummary({
				accrualMethod: "per_hour_worked",
				accrualMinutes: 6,
				accrualPerHoursWorked: 1,
				maxBalanceMinutes: null,
				carryForwardEnabled: false,
				maxCarryForwardMinutes: null,
				encashmentEnabled: false,
			}),
		).toEqual(["Accrues 6m per 1h worked"]);
	});
});
