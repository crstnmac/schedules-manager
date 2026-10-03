import { useCallback, useLayoutEffect, useRef } from "react";

/** Stable identity callback that always invokes the latest closure. */
export function useStableCallback<Args extends unknown[], R>(
	fn: (...args: Args) => R,
): (...args: Args) => R {
	const ref = useRef(fn);
	useLayoutEffect(() => {
		ref.current = fn;
	});
	return useCallback((...args: Args) => ref.current(...args), []);
}
