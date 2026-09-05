import { describe, expect, test } from "bun:test";

import { roundToMinutes } from "../src/geo";

const MIN = 60_000;

describe("roundToMinutes", () => {
	test("returns the instant unchanged when minutes is 0", () => {
		const instant = new Date("2026-01-15T17:22:00.000Z");
		expect(roundToMinutes(instant, 0)).toBe(instant);
	});

	test("returns the instant unchanged when minutes is negative", () => {
		const instant = new Date("2026-01-15T17:22:00.000Z");
		expect(roundToMinutes(instant, -15)).toBe(instant);
	});

	test("rounds up to the nearest 15-minute boundary", () => {
		// 17:25 is 5 min past 17:15 and 10 min before 17:30, so it rounds up to 17:30.
		const instant = new Date("2026-01-15T17:25:00.000Z");
		expect(roundToMinutes(instant, 15)).toEqual(
			new Date("2026-01-15T17:30:00.000Z"),
		);
	});

	test("rounds down to the nearest 15-minute boundary when just past it", () => {
		// 17:22 is 7 min past 17:15 and 8 min before 17:30, so it rounds DOWN to 17:15.
		// This is the round-down that lets clockedOutAt fall below a later break.startedAt.
		const instant = new Date("2026-01-15T17:22:00.000Z");
		expect(roundToMinutes(instant, 15)).toEqual(
			new Date("2026-01-15T17:15:00.000Z"),
		);
	});

	test("leaves a value sitting exactly on a 15-minute boundary unchanged", () => {
		const instant = new Date("2026-01-15T17:15:00.000Z");
		expect(roundToMinutes(instant, 15)).toEqual(instant);
	});

	test("can round down by up to half the bucket", () => {
		// 7.5 min past a boundary is the tie; Math.round goes to the nearer even,
		// but anything strictly less rounds down. 7 min rounds down by 7.
		const boundary = new Date("2026-01-15T17:15:00.000Z");
		const instant = new Date(boundary.getTime() + 7 * MIN);
		expect(roundToMinutes(instant, 15)).toEqual(boundary);
	});
});
