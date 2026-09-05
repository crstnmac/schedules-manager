import { describe, expect, test } from "bun:test";

import { grossWorkedMs } from "../src/time-totals";

const HOUR = 60 * 60 * 1000;
const period = {
	startsAt: new Date("2026-08-01T00:00:00.000Z"),
	endsAt: new Date("2026-09-01T00:00:00.000Z"),
};
const now = new Date("2026-08-26T12:00:00.000Z");

describe("grossWorkedMs", () => {
	test("sums gross time for in-period punches and counts open punches up to now", () => {
		const entries = [
			{
				clockedInAt: new Date("2026-08-01T00:00:00Z"),
				clockedOutAt: new Date("2026-08-01T04:00:00Z"),
			},
			{
				clockedInAt: new Date("2026-08-02T08:00:00Z"),
				clockedOutAt: new Date("2026-08-02T12:00:00Z"),
			},
			{ clockedInAt: new Date("2026-08-03T08:00:00Z"), clockedOutAt: null },
		];
		const openDuration =
			now.getTime() - new Date("2026-08-03T08:00:00Z").getTime();
		expect(grossWorkedMs(entries, period, now)).toBe(8 * HOUR + openDuration);
	});

	test("uses a half-open window [start, end) matching the worker timecard", () => {
		const entries = [
			{
				clockedInAt: new Date("2026-07-31T23:00:00Z"),
				clockedOutAt: new Date("2026-08-01T01:00:00Z"),
			},
			{
				clockedInAt: new Date("2026-09-01T00:00:00Z"),
				clockedOutAt: new Date("2026-09-01T04:00:00Z"),
			},
			{
				clockedInAt: new Date("2026-08-01T00:00:00Z"),
				clockedOutAt: new Date("2026-08-01T02:00:00Z"),
			},
		];
		expect(grossWorkedMs(entries, period, now)).toBe(2 * HOUR);
	});

	test("does not subtract breaks, preserving worker-facing gross semantics", () => {
		const entries = [
			{
				clockedInAt: new Date("2026-08-10T08:00:00Z"),
				clockedOutAt: new Date("2026-08-10T17:00:00Z"),
			},
		];
		expect(grossWorkedMs(entries, period, now)).toBe(9 * HOUR);
	});

	test("treats a clock-out at or before clock-in as zero duration", () => {
		const entries = [
			{
				clockedInAt: new Date("2026-08-10T08:00:00Z"),
				clockedOutAt: new Date("2026-08-10T08:00:00Z"),
			},
			{
				clockedInAt: new Date("2026-08-11T08:00:00Z"),
				clockedOutAt: new Date("2026-08-11T07:00:00Z"),
			},
		];
		expect(grossWorkedMs(entries, period, now)).toBe(0);
	});

	test("sums every in-period punch even when the count exceeds 50", () => {
		const shift = 4 * HOUR;
		const base = Date.UTC(2026, 7, 1, 0, 0, 0);
		const entries = Array.from({ length: 60 }, (_, index) => {
			const clockedInAt = new Date(base + index * 10 * 60_000);
			return {
				clockedInAt,
				clockedOutAt: new Date(clockedInAt.getTime() + shift),
			};
		});
		expect(grossWorkedMs(entries, period, now)).toBe(60 * shift);
	});

	test("returns zero for an empty set", () => {
		expect(grossWorkedMs([], period, now)).toBe(0);
	});
});
