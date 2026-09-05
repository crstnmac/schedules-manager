import { describe, expect, test } from "bun:test";

import {
	type CoverageSummary,
	hasCoverageItems,
	type SwapsQueryState,
} from "./coverage-logic";

describe("hasCoverageItems (coverage dashboard empty-state guard)", () => {
	test("returns false and lets the banner show when all queues are empty and swaps are not loading", () => {
		const coverage: CoverageSummary = { releases: [], pickups: [] };
		const swaps: SwapsQueryState = { data: [], isLoading: false };
		expect(hasCoverageItems(coverage, swaps)).toBe(false);
	});

	test("returns false when coverage data is entirely absent and swaps are empty", () => {
		const swaps: SwapsQueryState = { data: [], isLoading: false };
		expect(hasCoverageItems(undefined, swaps)).toBe(false);
	});

	// Core bug guarantee: the banner must NOT render while a swap is pending.
	test("returns true (suppresses banner) when only swaps are pending and releases/pickups are empty", () => {
		const coverage: CoverageSummary = { releases: [], pickups: [] };
		const swaps: SwapsQueryState = {
			data: [{ id: "swap-1", status: "pending_manager" }],
			isLoading: false,
		};
		expect(hasCoverageItems(coverage, swaps)).toBe(true);
	});

	test("returns true when swaps data has at least one item even if coverage is undefined", () => {
		const swaps: SwapsQueryState = { data: [{}], isLoading: false };
		expect(hasCoverageItems(undefined, swaps)).toBe(true);
	});

	// Loading-flash guarantee: no banner flash while the swaps query has no
	// cached data yet.
	test("returns true while the swaps query is loading and data is undefined", () => {
		const coverage: CoverageSummary = { releases: [], pickups: [] };
		const swaps: SwapsQueryState = { data: undefined, isLoading: true };
		expect(hasCoverageItems(coverage, swaps)).toBe(true);
	});

	test("returns true while the swaps query is loading even when coverage is undefined", () => {
		const swaps: SwapsQueryState = { data: undefined, isLoading: true };
		expect(hasCoverageItems(undefined, swaps)).toBe(true);
	});

	test("returns true when releases are present (banner suppressed)", () => {
		const coverage: CoverageSummary = {
			releases: [{ id: "rel-1" }],
			pickups: [],
		};
		const swaps: SwapsQueryState = { data: [], isLoading: false };
		expect(hasCoverageItems(coverage, swaps)).toBe(true);
	});

	test("returns true when pickups are present (banner suppressed)", () => {
		const coverage: CoverageSummary = {
			releases: [],
			pickups: [{ id: "pck-1" }],
		};
		const swaps: SwapsQueryState = { data: [], isLoading: false };
		expect(hasCoverageItems(coverage, swaps)).toBe(true);
	});

	test("returns true when a release of ANY status exists (coverage endpoint returns all statuses)", () => {
		const coverage: CoverageSummary = {
			releases: [{ id: "rel-1", status: "approved" }],
			pickups: [],
		};
		const swaps: SwapsQueryState = { data: [], isLoading: false };
		expect(hasCoverageItems(coverage, swaps)).toBe(true);
	});

	test("returns true when releases/pickups and swaps all have items", () => {
		const coverage: CoverageSummary = {
			releases: [{ id: "rel-1" }],
			pickups: [{ id: "pck-1" }],
		};
		const swaps: SwapsQueryState = {
			data: [{ id: "swap-1" }],
			isLoading: false,
		};
		expect(hasCoverageItems(coverage, swaps)).toBe(true);
	});

	// Regression guard for the pre-fix behavior: a non-empty release/pickup
	// suppresses the banner permanently, regardless of swap state.
	test("returns true when releases present and swaps empty/loading", () => {
		const coverage: CoverageSummary = {
			releases: [{ id: "rel-1" }],
			pickups: [],
		};
		expect(hasCoverageItems(coverage, { data: [], isLoading: false })).toBe(
			true,
		);
		expect(
			hasCoverageItems(coverage, { data: undefined, isLoading: true }),
		).toBe(true);
	});

	// Transition guarantee: after the last swap is decided and the swaps query
	// refetches to [], the guard flips back to false so the banner can show.
	test("flips to false once swaps refetch to empty (banner reappears, queue self-hides)", () => {
		const coverage: CoverageSummary = { releases: [], pickups: [] };
		const before: SwapsQueryState = {
			data: [{ id: "swap-1" }],
			isLoading: false,
		};
		const after: SwapsQueryState = { data: [], isLoading: false };
		expect(hasCoverageItems(coverage, before)).toBe(true);
		expect(hasCoverageItems(coverage, after)).toBe(false);
	});
});
