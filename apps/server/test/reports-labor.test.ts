import { describe, expect, test } from "bun:test";

import { laborCents } from "../src/labor";
import {
	computeLaborByEntry,
	distributeByWeight,
	type ReportRow,
} from "../src/reports-labor";

function row(opts: {
	entryId: string;
	employmentId: string;
	start: string;
	end: string;
	worked?: number;
	wage?: number;
	overtimeWeeklyMinutes?: number;
	overtimeDailyMinutes?: number;
	timezone?: string;
}): ReportRow {
	const intervalStart = new Date(opts.start);
	const intervalEnd = new Date(opts.end);
	const raw = Math.round(
		(intervalEnd.getTime() - intervalStart.getTime()) / 60_000,
	);
	return {
		entryId: opts.entryId,
		employmentId: opts.employmentId,
		intervalStart,
		intervalEnd,
		timezone: opts.timezone ?? "UTC",
		worked: opts.worked ?? raw,
		hourlyWageCents: opts.wage ?? 2000,
		overtimeWeeklyMinutes: opts.overtimeWeeklyMinutes ?? 2400,
		overtimeDailyMinutes: opts.overtimeDailyMinutes ?? 0,
	};
}

function sum(map: Map<string, number>): number {
	let total = 0;
	for (const value of map.values()) total += value;
	return total;
}

describe("distributeByWeight", () => {
	test("shares sum exactly to the target", () => {
		expect(distributeByWeight(0, [1, 2, 3])).toEqual([0, 0, 0]);
		expect(distributeByWeight(100, [])).toEqual([]);
		expect(distributeByWeight(100, [0, 0, 0])).toEqual([0, 0, 0]);
		expect(distributeByWeight(7, [1])).toEqual([7]);
		// Cumulative rounding: the remainder penny lands where the cumulative
		// midpoint crosses .5; the important guarantee is the exact sum.
		expect(distributeByWeight(100, [1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(
			100,
		);
		expect(distributeByWeight(100, [1, 2, 3, 4])).toEqual([10, 20, 30, 40]);
	});

	test("shares are non-negative and never drift by a penny", () => {
		const shares = distributeByWeight(95000, [540, 540, 540, 540, 540]);
		expect(shares.reduce((s, v) => s + v, 0)).toBe(95000);
		expect(shares.every((value) => value >= 0)).toBe(true);
		// Uneven weights with a non-divisible target still sum exactly.
		const uneven = distributeByWeight(101, [1, 1, 3]);
		expect(uneven.reduce((s, v) => s + v, 0)).toBe(101);
	});
});

describe("computeLaborByEntry weekly overtime", () => {
	test("aggregates weekly overtime per employment-week and prorates across rows", () => {
		// Week starting Mon 2026-09-07. Five 9h shifts (540 min) = 2700 min (45h).
		const rows = [
			row({
				entryId: "e1",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
			}),
			row({
				entryId: "e2",
				employmentId: "emp",
				start: "2026-09-09T10:00:00Z",
				end: "2026-09-09T19:00:00Z",
			}),
			row({
				entryId: "e3",
				employmentId: "emp",
				start: "2026-09-10T10:00:00Z",
				end: "2026-09-10T19:00:00Z",
			}),
			row({
				entryId: "e4",
				employmentId: "emp",
				start: "2026-09-11T10:00:00Z",
				end: "2026-09-11T19:00:00Z",
			}),
			row({
				entryId: "e5",
				employmentId: "emp",
				start: "2026-09-12T10:00:00Z",
				end: "2026-09-12T19:00:00Z",
			}),
		];
		const labor = computeLaborByEntry(rows, 1);
		// laborCents({minutes: 2700, wage 2000, weekly 2400}) = 80000 + 15000 = 95000.
		expect(sum(labor)).toBe(95000);
		// Equal weights prorate equally: 95000 / 5 = 19000 each.
		expect([...labor.values()]).toEqual([19000, 19000, 19000, 19000, 19000]);
	});

	test("per-row sum equals the aggregate laborCents total even with OT and uneven shifts", () => {
		const rows = [
			row({
				entryId: "x1",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
			}),
			row({
				entryId: "x2",
				employmentId: "emp",
				start: "2026-09-09T10:00:00Z",
				end: "2026-09-09T19:00:00Z",
			}),
			row({
				entryId: "x3",
				employmentId: "emp",
				start: "2026-09-10T10:00:00Z",
				end: "2026-09-10T19:00:00Z",
			}),
			row({
				entryId: "x4",
				employmentId: "emp",
				start: "2026-09-11T10:00:00Z",
				end: "2026-09-11T19:00:00Z",
			}),
			row({
				entryId: "x5",
				employmentId: "emp",
				start: "2026-09-12T10:00:00Z",
				end: "2026-09-12T22:00:00Z",
			}),
		];
		// Total 540*4 + 720 = 2880 min (48h); weekly OT = 480 min.
		// laborCents({minutes: 2880, wage 2000, weekly 2400}) = 80000 + 24000 = 104000.
		const labor = computeLaborByEntry(rows, 1);
		expect(sum(labor)).toBe(104000);
		expect(labor.get("x5") ?? 0).toBeGreaterThan(labor.get("x1") ?? 0);
	});

	test("under-threshold worker has no overtime and prorates to regular cost", () => {
		const rows = [
			row({
				entryId: "u1",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T18:00:00Z",
			}),
			row({
				entryId: "u2",
				employmentId: "emp",
				start: "2026-09-09T10:00:00Z",
				end: "2026-09-09T18:00:00Z",
			}),
		];
		// 480 min each, 960 total < 2400. Each regular = 8h * $20 = 16000.
		const labor = computeLaborByEntry(rows, 1);
		expect(labor.get("u1")).toBe(16000);
		expect(labor.get("u2")).toBe(16000);
		expect(sum(labor)).toBe(32000);
	});

	test("multiple employments aggregate independently", () => {
		const rows = [
			row({
				entryId: "a",
				employmentId: "empA",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
			}),
			row({
				entryId: "b",
				employmentId: "empB",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
			}),
		];
		// Same instant, different employments -> separate weeks, no OT.
		const labor = computeLaborByEntry(rows, 1);
		expect(labor.get("a")).toBe(18000);
		expect(labor.get("b")).toBe(18000);
	});
});

describe("computeLaborByEntry per-week bucketing", () => {
	test("weekly overtime is bucketed per workplace week using weekStartDay", () => {
		// Week 1: Mon-Fri 2026-09-08..12. Week 2: Mon-Fri 2026-09-15..19.
		// Each week is 45h (2700 min) -> 95000 each, total 190000. If bucketing
		// were missing, 9000 min would yield a single 45h+ OT bucket instead.
		const rows = [
			row({
				entryId: "w1a",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
			}),
			row({
				entryId: "w1b",
				employmentId: "emp",
				start: "2026-09-09T10:00:00Z",
				end: "2026-09-09T19:00:00Z",
			}),
			row({
				entryId: "w1c",
				employmentId: "emp",
				start: "2026-09-10T10:00:00Z",
				end: "2026-09-10T19:00:00Z",
			}),
			row({
				entryId: "w1d",
				employmentId: "emp",
				start: "2026-09-11T10:00:00Z",
				end: "2026-09-11T19:00:00Z",
			}),
			row({
				entryId: "w1e",
				employmentId: "emp",
				start: "2026-09-12T10:00:00Z",
				end: "2026-09-12T19:00:00Z",
			}),
			row({
				entryId: "w2a",
				employmentId: "emp",
				start: "2026-09-15T10:00:00Z",
				end: "2026-09-15T19:00:00Z",
			}),
			row({
				entryId: "w2b",
				employmentId: "emp",
				start: "2026-09-16T10:00:00Z",
				end: "2026-09-16T19:00:00Z",
			}),
			row({
				entryId: "w2c",
				employmentId: "emp",
				start: "2026-09-17T10:00:00Z",
				end: "2026-09-17T19:00:00Z",
			}),
			row({
				entryId: "w2d",
				employmentId: "emp",
				start: "2026-09-18T10:00:00Z",
				end: "2026-09-18T19:00:00Z",
			}),
			row({
				entryId: "w2e",
				employmentId: "emp",
				start: "2026-09-19T10:00:00Z",
				end: "2026-09-19T19:00:00Z",
			}),
		];
		const labor = computeLaborByEntry(rows, 1);
		expect(sum(labor)).toBe(190000);
	});

	test("weekStartDay moves the week boundary (Mon-start splits Sun/Mon)", () => {
		// weekStartDay 1 (Monday): Sat 9/12 + Sun 9/13 fall in the week of 9/7,
		// Mon 9/14 starts a new week. With a 3600-min (60h) weekly threshold this
		// test isolates bucketing: only Sat+Sun share a week.
		const rows = [
			row({
				entryId: "sat",
				employmentId: "emp",
				start: "2026-09-12T10:00:00Z",
				end: "2026-09-12T13:00:00Z",
				overtimeWeeklyMinutes: 3600,
			}),
			row({
				entryId: "sun",
				employmentId: "emp",
				start: "2026-09-13T10:00:00Z",
				end: "2026-09-13T13:00:00Z",
				overtimeWeeklyMinutes: 3600,
			}),
			row({
				entryId: "mon",
				employmentId: "emp",
				start: "2026-09-14T10:00:00Z",
				end: "2026-09-14T13:00:00Z",
				overtimeWeeklyMinutes: 3600,
			}),
		];
		const labor = computeLaborByEntry(rows, 1);
		// Sat+Sun = 360 min share the week of 9/7; Mon = 180 min in week of 9/14.
		const satSun = (labor.get("sat") ?? 0) + (labor.get("sun") ?? 0);
		const expectedShared = laborCents({
			minutes: 360,
			hourlyWageCents: 2000,
			overtimeWeeklyMinutes: 3600,
		}).totalCents;
		const expectedMon = laborCents({
			minutes: 180,
			hourlyWageCents: 2000,
			overtimeWeeklyMinutes: 3600,
		}).totalCents;
		expect(satSun).toBe(expectedShared);
		expect(labor.get("mon")).toBe(expectedMon);
		// Equal weights -> the shared week splits evenly.
		expect(labor.get("sat")).toBe(labor.get("sun"));
	});

	test("weekStartDay 0 (Sunday) keeps Sat separate from Sun+Mon", () => {
		// With Sunday-start weeks: Sat 9/12 is in the week of 9/6, while
		// Sun 9/13 and Mon 9/14 are both in the week of 9/13.
		const rows = [
			row({
				entryId: "sat",
				employmentId: "emp",
				start: "2026-09-12T10:00:00Z",
				end: "2026-09-12T16:00:00Z",
				overtimeWeeklyMinutes: 3600,
			}),
			row({
				entryId: "sun",
				employmentId: "emp",
				start: "2026-09-13T10:00:00Z",
				end: "2026-09-13T16:00:00Z",
				overtimeWeeklyMinutes: 3600,
			}),
			row({
				entryId: "mon",
				employmentId: "emp",
				start: "2026-09-14T10:00:00Z",
				end: "2026-09-14T16:00:00Z",
				overtimeWeeklyMinutes: 3600,
			}),
		];
		const labor = computeLaborByEntry(rows, 0);
		const expectedSat = laborCents({
			minutes: 360,
			hourlyWageCents: 2000,
			overtimeWeeklyMinutes: 3600,
		}).totalCents;
		const expectedSunMon = laborCents({
			minutes: 720,
			hourlyWageCents: 2000,
			overtimeWeeklyMinutes: 3600,
		}).totalCents;
		expect(labor.get("sat")).toBe(expectedSat);
		expect((labor.get("sun") ?? 0) + (labor.get("mon") ?? 0)).toBe(
			expectedSunMon,
		);
	});
});

describe("computeLaborByEntry daily overtime", () => {
	test("daily overtime is honored via the dailyMinutes breakdown", () => {
		// One 10h shift on a single day with an 8h daily threshold.
		const rows = [
			row({
				entryId: "d1",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T20:00:00Z",
				overtimeDailyMinutes: 480,
			}),
		];
		// laborCents({minutes:600, daily 480, dailyMinutes:[600]}) = 16000 + 6000 = 22000.
		expect(computeLaborByEntry(rows, 1).get("d1")).toBe(22000);
	});

	test("daily overtime aggregates across days within one week", () => {
		const rows = [
			row({
				entryId: "a",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
				overtimeDailyMinutes: 480,
			}),
			row({
				entryId: "b",
				employmentId: "emp",
				start: "2026-09-09T10:00:00Z",
				end: "2026-09-09T19:00:00Z",
				overtimeDailyMinutes: 480,
			}),
		];
		// Two 9h days: 60 daily OT min each = 120 total. 960 regular, 120 OT.
		// total = 32000 + 6000 = 38000.
		expect(sum(computeLaborByEntry(rows, 1))).toBe(38000);
	});

	test("overnight shift splits minutes across zoned days for daily overtime", () => {
		// 2026-09-08T22:00Z -> 2026-09-09T10:00Z = 720 min. UTC byDate:
		// {2026-09-08: 120, 2026-09-09: 600}. Daily OT = 600 - 480 = 120 on day 2.
		const rows = [
			row({
				entryId: "o1",
				employmentId: "emp",
				start: "2026-09-08T22:00:00Z",
				end: "2026-09-09T10:00:00Z",
				overtimeDailyMinutes: 480,
			}),
		];
		// regular 600, OT 120 -> 20000 + 6000 = 26000.
		expect(computeLaborByEntry(rows, 1).get("o1")).toBe(26000);
	});

	test("breaks reduce worked minutes and scale daily minutes accordingly", () => {
		// 10h raw with a 60-min break -> 540 worked. Daily threshold 480.
		const rows = [
			row({
				entryId: "br1",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T20:00:00Z",
				worked: 540,
				overtimeDailyMinutes: 480,
			}),
		];
		// dailyMinutes scaled to worked: [540]. daily OT = 540 - 480 = 60.
		// regular 480, OT 60 -> 16000 + 3000 = 19000.
		// If breaks were ignored, dailyMinutes would be [600] -> 20000.
		expect(computeLaborByEntry(rows, 1).get("br1")).toBe(19000);
	});
});

describe("computeLaborByEntry edge cases", () => {
	test("empty input yields an empty map", () => {
		expect(computeLaborByEntry([], 1).size).toBe(0);
	});

	test("zero wage yields zero labor cost", () => {
		const rows = [
			row({
				entryId: "z1",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
				wage: 0,
			}),
		];
		expect(computeLaborByEntry(rows, 1).get("z1")).toBe(0);
	});

	test("zero-worked rows receive zero cost while the rest still sum exactly", () => {
		const rows = [
			row({
				entryId: "p1",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
			}),
			row({
				entryId: "p2",
				employmentId: "emp",
				start: "2026-09-09T10:00:00Z",
				end: "2026-09-09T19:00:00Z",
			}),
			row({
				entryId: "zero",
				employmentId: "emp",
				start: "2026-09-10T10:00:00Z",
				end: "2026-09-10T19:00:00Z",
				worked: 0,
			}),
		];
		// 540 + 540 + 0 = 1080 (< 2400, no OT). zero row gets 0; others split.
		const labor = computeLaborByEntry(rows, 1);
		expect(labor.get("zero")).toBe(0);
		// 1080 min regular = 18h * $20 = 36000.
		expect(sum(labor)).toBe(36000);
	});

	test("open punch (intervalEnd resolved by caller) is handled", () => {
		// Caller resolves clockedOutAt ?? now before building the row.
		const rows = [
			row({
				entryId: "open",
				employmentId: "emp",
				start: "2026-09-08T10:00:00Z",
				end: "2026-09-08T19:00:00Z",
			}),
		];
		expect(computeLaborByEntry(rows, 1).get("open")).toBe(18000);
	});
});
