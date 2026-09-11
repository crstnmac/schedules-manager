import type React from "react";
import { useEffect, useState } from "react";

const ROUTE_CHANGE = "jooling:routechange";

export function navigate(to: string) {
	const current = window.location.pathname + window.location.search;
	if (current === to) {
		window.scrollTo({ top: 0, left: 0 });
		return;
	}
	window.history.pushState(null, "", to);
	window.dispatchEvent(new Event(ROUTE_CHANGE));
	window.scrollTo({ top: 0, left: 0 });
}

export function usePathname() {
	const [pathname, setPathname] = useState(() => window.location.pathname);

	useEffect(() => {
		const update = () => setPathname(window.location.pathname);
		window.addEventListener("popstate", update);
		window.addEventListener(ROUTE_CHANGE, update);
		return () => {
			window.removeEventListener("popstate", update);
			window.removeEventListener(ROUTE_CHANGE, update);
		};
	}, []);

	return pathname;
}

type LinkProps = React.ComponentProps<"a"> & { to?: string };

export function Link({ to, href, onClick, ...props }: LinkProps) {
	const target = to ?? href ?? "#";
	const isInternal = target.startsWith("/") && !target.startsWith("//");

	return (
		<a
			{...props}
			href={target}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented || !isInternal) return;
				if (
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey ||
					event.button !== 0
				) {
					return;
				}
				event.preventDefault();
				navigate(target);
			}}
		/>
	);
}
