import { Moon, Sun } from "lucide-react";
import type React from "react";
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "jooling-theme";
const THEME_CHANGE = "jooling:themechange";
const THEME_COLORS: Record<Theme, string> = {
	dark: "#0b0c0e",
	light: "#f7f7f8",
};

function storedTheme(): Theme | null {
	try {
		const value = window.localStorage.getItem(STORAGE_KEY);
		return value === "light" || value === "dark" ? value : null;
	} catch {
		return null;
	}
}

function systemTheme(): Theme {
	return window.matchMedia("(prefers-color-scheme: light)").matches
		? "light"
		: "dark";
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.dataset.theme = theme;
	root.classList.toggle("dark", theme === "dark");
	document.head
		.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
		?.setAttribute("content", THEME_COLORS[theme]);
	window.dispatchEvent(new Event(THEME_CHANGE));
}

export function getTheme(): Theme {
	return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
	try {
		window.localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// Storage may be unavailable; the choice lasts for this page view.
	}
	applyTheme(theme);
}

function subscribe(onChange: () => void) {
	const media = window.matchMedia("(prefers-color-scheme: light)");
	const onSystemChange = () => {
		if (!storedTheme()) applyTheme(systemTheme());
	};
	window.addEventListener(THEME_CHANGE, onChange);
	media.addEventListener("change", onSystemChange);
	return () => {
		window.removeEventListener(THEME_CHANGE, onChange);
		media.removeEventListener("change", onSystemChange);
	};
}

export function useTheme(): Theme {
	return useSyncExternalStore(subscribe, getTheme, () => "dark");
}

export function ThemeToggle({ className }: { className?: string }) {
	const theme = useTheme();
	const next = theme === "dark" ? "light" : "dark";
	return (
		<button
			type="button"
			className={className}
			aria-label={`Switch to ${next} theme`}
			title={`Switch to ${next} theme`}
			onClick={() => setTheme(next)}
		>
			{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
		</button>
	);
}

/** A product screenshot captured in both app themes (`/<name>-light.png`, `/<name>-dark.png`). */
export function ThemedImage({
	name,
	alt,
	...props
}: Omit<React.ComponentProps<"img">, "src" | "alt"> & {
	name: string;
	alt: string;
}) {
	const theme = useTheme();
	return <img {...props} alt={alt} src={`/${name}-${theme}.png`} />;
}
