import { describe, expect, test } from "bun:test";

import {
	monthKeys,
	monthStartForView,
	monthStartOf,
	shiftDisplayStatus,
} from "./schedule-calendar";

describe("schedule calendar months", () => {
	test("a week starting in August still opens September when Thursday is in September", () => {
		expect(monthStartForView("2026-08-31")).toBe("2026-09-01");
	});

	test("September 2026 with Monday week start includes the trailing August and leading October days", () => {
		const days = monthKeys("2026-09-01", 1);
		expect(days).toHaveLength(42);
		expect(days[0]).toBe("2026-08-31");
		expect(days[1]).toBe("2026-09-01");
		expect(days[41]).toBe("2026-10-11");
		expect(monthStartOf("2026-09-16")).toBe("2026-09-01");
	});
});

describe("shift attendance display", () => {
	const endedShift = {
		hasConflicts: false,
		attendance: null,
		clockStatus: null,
		scheduledMinutes: 480,
		shiftEndedAt: "2000-01-01T17:00:00Z",
	} as const;
	test("an unassigned past shift does not imply a worker missed clock-in", () => {
		expect(shiftDisplayStatus({ ...endedShift, isOpen: true })).toBeNull();
		expect(shiftDisplayStatus({ ...endedShift, isOpen: false })?.kind).toBe(
			"missed",
		);
	});
	test("conflicts on open shifts remain visible", () => {
		expect(
			shiftDisplayStatus({ ...endedShift, isOpen: true, hasConflicts: true })
				?.kind,
		).toBe("conflict");
	});
	test("assigned attendance and active punches retain their status", () => {
		expect(
			shiftDisplayStatus({ ...endedShift, attendance: "no_show" })?.label,
		).toBe("No-show");
		expect(
			shiftDisplayStatus({ ...endedShift, clockStatus: "open" })?.label,
		).toBe("On clock");
	});
});
