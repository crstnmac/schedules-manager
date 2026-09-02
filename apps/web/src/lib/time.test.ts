import { describe, expect, test } from "bun:test";

import { datetimeLocalToIso, isoToDatetimeLocal } from "./time";

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
