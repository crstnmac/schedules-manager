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
	test("flags a sixth consecutive calendar day when the cap is 5", () => {
		const shifts = Array.from({ length: 6 }, (_, index) => {
			const day = String(7 + index).padStart(2, "0");
			return {
				id: `s${index}`,
				employmentId: "emp",
				startsAt: new Date(`2026-09-${day}T16:00:00.000Z`),
				endsAt: new Date(`2026-09-${day}T22:00:00.000Z`),
			};
		});
		const conflicts = consecutiveWorkDayConflicts(
			shifts,
			5,
			"UTC",
			new Set(shifts.map((shift) => shift.id)),
		);
		expect(conflicts.some((row) => row.type === "consecutive_days")).toBe(true);
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
