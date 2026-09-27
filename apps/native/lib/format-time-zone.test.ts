import { describe, expect, test } from "bun:test";

import { formatClockTime, formatDayShort } from "./format-day";

// 4:15 PM in Austin (CDT) on Sep 22 is 02:45 on Sep 23 in India. A device in
// India must still show the Location's wall clock and day.
const clockInOpens = "2026-09-22T21:15:00.000Z";

describe("Location time zone formatting", () => {
	test("clock time uses the Location zone, not the device zone", () => {
		expect(formatClockTime(clockInOpens, "12h", "America/Chicago")).toMatch(
			/^4:15\s?PM$/,
		);
		expect(formatClockTime(clockInOpens, "24h", "America/Chicago")).toBe(
			"16:15",
		);
	});

	test("day label uses the Location zone", () => {
		expect(formatDayShort(clockInOpens, "America/Chicago")).toContain("22");
		expect(formatDayShort(clockInOpens, "Asia/Kolkata")).toContain("23");
	});
});
