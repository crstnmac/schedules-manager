import { describe, expect, test } from "bun:test";

import { laborCents } from "../src/labor";

describe("labor cost", () => {
	test("weekly overtime uses time-and-a-half after the weekly threshold", () => {
		expect(
			laborCents({
				minutes: 2700,
				hourlyWageCents: 1200,
				overtimeWeeklyMinutes: 2400,
			}),
		).toEqual({
			regularCents: 48000,
			overtimeCents: 9000,
			totalCents: 57000,
		});
	});

	test("daily overtime is disabled when the daily threshold is 0", () => {
		expect(
			laborCents({
				minutes: 600,
				hourlyWageCents: 1000,
				overtimeWeeklyMinutes: 2400,
				overtimeDailyMinutes: 0,
				dailyMinutes: [600],
			}),
		).toEqual({
			regularCents: 10000,
			overtimeCents: 0,
			totalCents: 10000,
		});
	});

	test("daily overtime is taken before weekly overtime", () => {
		const cost = laborCents({
			minutes: 600,
			hourlyWageCents: 1000,
			overtimeWeeklyMinutes: 2400,
			overtimeDailyMinutes: 480,
			dailyMinutes: [600],
		});
		expect(cost).toEqual({
			regularCents: 8000,
			overtimeCents: 3000,
			totalCents: 11000,
		});
	});
});
