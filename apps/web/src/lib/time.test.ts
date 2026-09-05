import { describe, expect, test } from "bun:test";

import { datetimeLocalToIso, formatMinute, isoToDatetimeLocal } from "./time";

describe("datetime local conversion", () => {
	test("round-trips a Chicago wall time", () => {
		const iso = datetimeLocalToIso("2026-09-08T11:00", "America/Chicago");
		expect(iso).toBe("2026-09-08T16:00:00.000Z");
		expect(isoToDatetimeLocal(iso ?? "", "America/Chicago")).toBe(
			"2026-09-08T11:00",
		);
	});

	test("rejects an inverted clock-out shape", () => {
		expect(
			datetimeLocalToIso("2026-09-08 11:00", "America/Chicago"),
		).toBeNull();
		expect(
			datetimeLocalToIso("2026-09-08T24:00", "America/Chicago"),
		).toBeNull();
	});
});

describe("formatMinute", () => {
	test("defaults to 12h when no format is given", () => {
		expect(formatMinute(0)).toBe("12:00 AM");
		expect(formatMinute(720)).toBe("12:00 PM");
		expect(formatMinute(1440)).toBe("12:00 AM");
	});

	test("renders the schema-permitted 1440 end-of-day value as midnight, never noon", () => {
		// 1440 is permitted by minuteSchema (minimum: 0, maximum: 1440) and
		// returned verbatim by the unavailability DTOs. The bug rendered it as
		// "12:00 PM", colliding with actual noon (720) and misreading a
		// full-day 0..1440 block as ending at noon.
		expect(formatMinute(1440, "12h")).toBe("12:00 AM");
		expect(formatMinute(1440, "24h")).toBe("00:00");
		expect(formatMinute(1440, "12h")).not.toBe("12:00 PM");
		expect(formatMinute(1440, "24h")).not.toBe("12:00");
	});

	test("does not collide end-of-day (1440) with actual noon (720)", () => {
		expect(formatMinute(720, "12h")).toBe("12:00 PM");
		expect(formatMinute(1440, "12h")).not.toBe(formatMinute(720, "12h"));
	});

	test("treats 1440 and 0 as the same wall-clock instant (midnight)", () => {
		expect(formatMinute(1440, "12h")).toBe(formatMinute(0, "12h"));
		expect(formatMinute(1440, "24h")).toBe(formatMinute(0, "24h"));
	});

	test("renders the documented minute-of-day mapping for 12h and 24h", () => {
		const cases: Array<[number, string, string]> = [
			[0, "12:00 AM", "00:00"],
			[1, "12:01 AM", "00:01"],
			[5, "12:05 AM", "00:05"],
			[9, "12:09 AM", "00:09"],
			[600, "10:00 AM", "10:00"],
			[780, "1:00 PM", "13:00"],
			[720, "12:00 PM", "12:00"],
			[1439, "11:59 PM", "23:59"],
			[1440, "12:00 AM", "00:00"],
		];
		for (const [minute, h12, h24] of cases) {
			expect(formatMinute(minute, "12h")).toBe(h12);
			expect(formatMinute(minute, "24h")).toBe(h24);
		}
	});

	test("zero-pads both hours and minutes in 24h output", () => {
		expect(formatMinute(0, "24h")).toBe("00:00");
		expect(formatMinute(5, "24h")).toBe("00:05");
		expect(formatMinute(90, "24h")).toBe("01:30");
	});

	test("leaves every in-day value (0..1439) unchanged by the normalization", () => {
		// Regression guard: the modulo normalization is a no-op for the
		// documented 0..1439 minute-of-day range and only affects the 1440
		// end-of-day boundary. The reference below re-derives the pre-fix
		// 12h arithmetic independently from the source under test.
		for (let minute = 0; minute < 1440; minute += 7) {
			expect(formatMinute(minute, "12h")).toBe(reference12h(minute));
			expect(formatMinute(minute, "24h")).toBe(reference24h(minute));
		}
	});

	test("normalizes values beyond 1440 the same way (defensive)", () => {
		// 2880 = two days; same wall-clock instant as 0/1440 (midnight).
		expect(formatMinute(2880, "12h")).toBe("12:00 AM");
		expect(formatMinute(2880, "24h")).toBe("00:00");
	});

	test("renders a full-day unavailability window without the noon misreading", () => {
		const range = `${formatMinute(0, "12h")}–${formatMinute(1440, "12h")}`;
		expect(range).toBe("12:00 AM–12:00 AM");
		expect(range).not.toContain("12:00 PM");
	});
});

// Independent re-derivation of the pre-fix formatMinute mapping for the
// 0..1439 range, used only as a regression oracle. It must not be edited
// alongside formatMinute; it exists to catch any drift in the in-day mapping.
function reference12h(minute: number): string {
	const hours = Math.floor(minute / 60);
	const mins = minute % 60;
	const suffix = hours >= 12 ? "PM" : "AM";
	const display = hours % 12 === 0 ? 12 : hours % 12;
	return `${display}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function reference24h(minute: number): string {
	const hours = Math.floor(minute / 60);
	const mins = minute % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
