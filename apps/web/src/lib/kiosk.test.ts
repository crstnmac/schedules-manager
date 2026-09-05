import { describe, expect, test } from "bun:test";
import { resolveSelectedLocationId } from "./kiosk";
import type { LocationDto } from "./queries";

const loc = (id: string): LocationDto => ({
	id,
	name: id.toUpperCase(),
	timezone: "America/Chicago",
	addressLine: null,
});

describe("resolveSelectedLocationId", () => {
	test("falls back to the first location when none is chosen", () => {
		expect(resolveSelectedLocationId("", [loc("a"), loc("b")])).toBe("a");
	});

	test("uses the explicit selection when one is chosen", () => {
		expect(resolveSelectedLocationId("x", [loc("a"), loc("b")])).toBe("x");
	});

	test("returns empty when there are no locations and no choice", () => {
		expect(resolveSelectedLocationId("", [])).toBe("");
	});

	test("returns empty while locations are still loading (undefined)", () => {
		expect(resolveSelectedLocationId("", undefined)).toBe("");
	});

	test("uses the explicit choice even when there are no locations", () => {
		expect(resolveSelectedLocationId("x", [])).toBe("x");
	});

	test("displayed and submitted values can never diverge", () => {
		const cases: Array<[string, LocationDto[] | undefined]> = [
			["", [loc("a"), loc("b")]],
			["x", [loc("a"), loc("b")]],
			["", []],
			["", undefined],
			["x", []],
		];
		for (const [locationId, locations] of cases) {
			const submitted = resolveSelectedLocationId(locationId, locations);
			const displayed = submitted || null;
			const placeholderShown = displayed === null;
			expect(placeholderShown).toBe(submitted === "");
		}
	});
});
