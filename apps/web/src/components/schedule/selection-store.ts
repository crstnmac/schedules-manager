import { useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Tiny external store for the selected shift ids. Each grid tile subscribes to
 * its own id, so toggling a selection re-renders only the tiles whose state
 * actually changed instead of every row/cell in the schedule grid.
 */
export interface ShiftSelectionStore {
	subscribe: (listener: () => void) => () => void;
	has: (id: string) => boolean;
	set: (ids: readonly string[]) => void;
}

export function createShiftSelectionStore(): ShiftSelectionStore {
	let selected: ReadonlySet<string> = new Set();
	const listeners = new Set<() => void>();
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		has: (id) => selected.has(id),
		set(ids) {
			selected = new Set(ids);
			for (const listener of listeners) listener();
		},
	};
}

/** Mirrors the page's selected ids into the store after each change. */
export function useShiftSelectionSync(
	store: ShiftSelectionStore,
	ids: readonly string[],
) {
	useLayoutEffect(() => {
		store.set(ids);
	}, [store, ids]);
}

export function useShiftSelected(store: ShiftSelectionStore, id: string) {
	return useSyncExternalStore(
		store.subscribe,
		() => store.has(id),
		() => false,
	);
}
