import { afterEach, describe, expect, test } from "bun:test";

import {
	formatClockTime,
	formatDay,
	isSameWorkplaceDay,
	setWorkplaceTimeZone,
	workplaceDateKey,
} from "./time";

// 4:15 PM on Tue Sep 22 in Austin (CDT) is 02:45 on Wed Sep 23 in India.
const clockInOpens = "2026-09-22T21:15:00.000Z";

afterEach(() => setWorkplaceTimeZone(undefined));

describe("workplace time zone formatting", () => {
	test("clock times and days follow the workplace, not the browser", () => {
		setWorkplaceTimeZone("America/Chicago");
		expect(formatClockTime(clockInOpens)).toMatch(/^4:15\s?PM$/);
		expect(formatClockTime(clockInOpens, "24h")).toBe("16:15");
		expect(formatDay(clockInOpens)).toContain("22");
		expect(workplaceDateKey(clockInOpens)).toBe("2026-09-22");
	});

	test("a date key stays the same calendar day in any zone", () => {
		setWorkplaceTimeZone("Pacific/Kiritimati");
		expect(formatDay("2026-09-28")).toContain("28");
		setWorkplaceTimeZone("Pacific/Pago_Pago");
		expect(formatDay("2026-09-28")).toContain("28");
	});

	test("a row's own Location zone overrides the default", () => {
		setWorkplaceTimeZone("America/Chicago");
		expect(formatClockTime(clockInOpens, "24h", "America/New_York")).toBe(
			"17:15",
		);
		expect(formatDay(clockInOpens, "Asia/Kolkata")).toContain("23");
	});

	test("same-day checks use the workplace calendar", () => {
		setWorkplaceTimeZone("America/Chicago");
		// 9:30 PM and 11:30 PM Chicago are one workday, though they straddle
		// midnight in India.
		expect(
			isSameWorkplaceDay(
				"2026-09-28T02:30:00.000Z",
				"2026-09-28T04:30:00.000Z",
			),
		).toBe(true);
	});
});
