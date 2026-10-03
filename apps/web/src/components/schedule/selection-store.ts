import { useSyncExternalStore } from "react";

/**
 * Tiny external store that owns the selected shift ids. Each grid tile
 * subscribes to its own id, so toggling a selection re-renders only the tiles
 * whose state actually changed — and neither the page nor the grid rows hold
 * the selection in React state at all.
 */
export interface ShiftSelectionStore {
	subscribe: (listener: () => void) => () => void;
	has: (id: string) => boolean;
	/** Stable snapshot: the same array until the selection changes. */
	getIds: () => string[];
	set: (ids: string[]) => void;
	toggle: (id: string) => void;
	clear: () => void;
}

const EMPTY: string[] = [];

export function createShiftSelectionStore(): ShiftSelectionStore {
	let ids: string[] = EMPTY;
	let selected: ReadonlySet<string> = new Set();
	const listeners = new Set<() => void>();
	const emit = () => {
		for (const listener of listeners) listener();
	};
	const set = (next: string[]) => {
		ids = next.length === 0 ? EMPTY : [...next];
		selected = new Set(ids);
		emit();
	};
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		has: (id) => selected.has(id),
		getIds: () => ids,
		set,
		toggle(id) {
			set(
				selected.has(id)
					? ids.filter((current) => current !== id)
					: [...ids, id],
			);
		},
		clear() {
			if (ids.length > 0) set(EMPTY);
		},
	};
}

export function useShiftSelected(store: ShiftSelectionStore, id: string) {
	return useSyncExternalStore(
		store.subscribe,
		() => store.has(id),
		() => false,
	);
}

/** The selected ids, re-rendering the caller only when the selection changes. */
export function useShiftSelectionIds(store: ShiftSelectionStore) {
	return useSyncExternalStore(
		store.subscribe,
		store.getIds,
		() => EMPTY as string[],
	);
}
