import { describe, expect, test } from "bun:test";

import {
	clopeningConflicts,
	consecutiveWorkDayConflicts,
	isLateArrival,
} from "../src/schedule-conflicts";

describe("rest between shifts", () => {
	test("flags shifts closer than the clopening window", () => {
		const first = {
			id: "a",
			employmentId: "emp",
			startsAt: new Date("2026-09-08T02:00:00.000Z"),
			endsAt: new Date("2026-09-08T10:00:00.000Z"),
		};
		const second = {
			id: "b",
			employmentId: "emp",
			startsAt: new Date("2026-09-08T16:00:00.000Z"),
			endsAt: new Date("2026-09-08T22:00:00.000Z"),
		};
		const conflicts = clopeningConflicts(
			[first, second],
			8 * 60,
			new Set(["a", "b"]),
		);
		expect(conflicts.map((row) => row.shiftId).sort()).toEqual(["a", "b"]);
	});

	test("skips the check when clopening minutes is 0", () => {
		expect(
			clopeningConflicts(
				[
					{
						id: "a",
						employmentId: "emp",
						startsAt: new Date("2026-09-08T02:00:00.000Z"),
						endsAt: new Date("2026-09-08T10:00:00.000Z"),
					},
					{
						id: "b",
						employmentId: "emp",
						startsAt: new Date("2026-09-08T11:00:00.000Z"),
						endsAt: new Date("2026-09-08T16:00:00.000Z"),
					},
				],
				0,
				new Set(["a", "b"]),
			),
		).toEqual([]);
	});
});

describe("consecutive workdays", () => {
	function dayShift(idIndex: number, day: number) {
		const dayKey = String(day).padStart(2, "0");
		return {
			id: `s${idIndex}`,
			employmentId: "emp",
			startsAt: new Date(`2026-09-${dayKey}T16:00:00.000Z`),
			endsAt: new Date(`2026-09-${dayKey}T22:00:00.000Z`),
		};
	}

	function consecutiveRows(
		conflicts: ReturnType<typeof consecutiveWorkDayConflicts>,
	) {
		return conflicts.filter((row) => row.type === "consecutive_days");
	}

	test("flags a sixth consecutive calendar day when the cap is 5", () => {
		const shifts = Array.from({ length: 6 }, (_, index) =>
			dayShift(index, 7 + index),
		);
		const conflicts = consecutiveWorkDayConflicts(
			shifts,
			5,
			"UTC",
			new Set(shifts.map((shift) => shift.id)),
		);
		expect(consecutiveRows(conflicts)).toHaveLength(6);
		expect(
			consecutiveRows(conflicts)
				.map((row) => row.shiftId)
				.sort(),
		).toEqual(["s0", "s1", "s2", "s3", "s4", "s5"]);
	});

	test("emits at most one conflict per shift when a streak exceeds cap by more than one day", () => {
		// A 7-day streak over cap 5 runs the over-cap branch twice. Before the fix
		// the per-iteration `flagged` Set was recreated each pass and shifts already
		// flagged on the first pass were re-emitted, producing 13 conflict objects
		// (s0..s5 twice, s6 once) instead of one per violating shift (7).
		const shifts = Array.from({ length: 7 }, (_, index) =>
			dayShift(index, 7 + index),
		);
		const conflicts = consecutiveWorkDayConflicts(
			shifts,
			5,
			"UTC",
			new Set(shifts.map((shift) => shift.id)),
		);
		expect(consecutiveRows(conflicts)).toHaveLength(7);
		expect(
			consecutiveRows(conflicts)
				.map((row) => row.shiftId)
				.sort(),
		).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6"]);
	});

	test("treats each unbroken streak exactly once and resets when the streak breaks", () => {
		// Two 7-day streaks separated by a gap, cap 5. Each streak must emit one
		// conflict per violating shift (7), and the dedupe state must reset between
		// streaks so a second streak's shifts still conflict. Before the fix this
		// produced 26 conflict objects (13 per streak).
		const firstStreak = Array.from({ length: 7 }, (_, index) =>
			dayShift(index, 1 + index),
		);
		const secondStreak = Array.from({ length: 7 }, (_, index) =>
			dayShift(index + 7, 10 + index),
		);
		const shifts = [...firstStreak, ...secondStreak];
		const conflicts = consecutiveWorkDayConflicts(
			shifts,
			5,
			"UTC",
			new Set(shifts.map((shift) => shift.id)),
		);
		expect(consecutiveRows(conflicts)).toHaveLength(14);
		const shiftIds = consecutiveRows(conflicts).map((row) => row.shiftId);
		expect(new Set(shiftIds).size).toBe(shiftIds.length);
		expect(new Set(shiftIds)).toEqual(
			new Set(Array.from({ length: 14 }, (_, i) => `s${i}`)),
		);
	});

	test("does not double-count overnight shifts touching two streak date keys", () => {
		// The overnight shift on day 7 extends into day 8, so `workDateKeys` adds
		// both date keys to the streak. The single-iteration `flagged` dedup must
		// still prevent same-iteration double-emission, and the hoisted `flagged`
		// must ensure it emits exactly once across the whole streak.
		const dayShifts = Array.from({ length: 6 }, (_, index) =>
			dayShift(index, 1 + index),
		);
		const overnight = {
			id: "s6",
			employmentId: "emp",
			startsAt: new Date("2026-09-07T22:00:00.000Z"),
			endsAt: new Date("2026-09-08T06:00:00.000Z"),
		};
		const shifts = [...dayShifts, overnight];
		const conflicts = consecutiveWorkDayConflicts(
			shifts,
			5,
			"UTC",
			new Set(shifts.map((shift) => shift.id)),
		);
		expect(consecutiveRows(conflicts)).toHaveLength(7);
		expect(
			consecutiveRows(conflicts)
				.map((row) => row.shiftId)
				.sort(),
		).toEqual(Array.from({ length: 7 }, (_, i) => `s${i}`));
	});
});

describe("late arrival", () => {
	test("uses the grace window after the published start", () => {
		const start = new Date("2026-09-08T16:00:00.000Z");
		expect(isLateArrival(new Date("2026-09-08T16:04:00.000Z"), start, 5)).toBe(
			false,
		);
		expect(isLateArrival(new Date("2026-09-08T16:06:00.000Z"), start, 5)).toBe(
			true,
		);
	});
});
