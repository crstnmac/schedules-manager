import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type * as React from "react";
import { useEffect } from "react";

function ThemeColorSync() {
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute(
				"content",
				resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff",
			);
	}, [resolvedTheme]);

	return null;
}

export function ThemeProvider({
	children,
	...props
}: React.ComponentProps<typeof NextThemesProvider>) {
	return (
		<NextThemesProvider {...props}>
			<ThemeColorSync />
			{children}
		</NextThemesProvider>
	);
}

export { useTheme } from "next-themes";
