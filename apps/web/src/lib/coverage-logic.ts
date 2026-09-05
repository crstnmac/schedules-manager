// Pure, render-free predicate backing the "No coverage requests" empty-state
// guard on the coverage dashboard. Extracted so the guard can be unit-tested
// without mounting the route component (the web app has no React component
// test harness; all existing web tests are pure `bun:test` functions).

export interface CoverageSummary {
	releases?: unknown[];
	pickups?: unknown[];
}

export interface SwapsQueryState {
	data?: unknown[];
	isLoading: boolean;
}

/**
 * Returns true when there is at least one actionable item on the coverage
 * dashboard (release, pickup, or pending shift-swap), OR when the swaps query
 * is still loading its first result (so the "No coverage requests" banner does
 * not flash while swap data has not yet arrived).
 */
export function hasCoverageItems(
	coverage: CoverageSummary | undefined,
	swaps: SwapsQueryState,
): boolean {
	return (
		(coverage?.releases?.length ?? 0) > 0 ||
		(coverage?.pickups?.length ?? 0) > 0 ||
		(swaps.data?.length ?? 0) > 0 ||
		swaps.isLoading
	);
}
