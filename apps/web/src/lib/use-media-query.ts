import { useEffect, useState } from "react";

/** Subscribes to a CSS media query and re-renders when it changes. */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() =>
		typeof window === "undefined" ? false : window.matchMedia(query).matches,
	);

	useEffect(() => {
		const mediaQueryList = window.matchMedia(query);
		const onChange = () => setMatches(mediaQueryList.matches);
		onChange();
		mediaQueryList.addEventListener("change", onChange);
		return () => mediaQueryList.removeEventListener("change", onChange);
	}, [query]);

	return matches;
}
