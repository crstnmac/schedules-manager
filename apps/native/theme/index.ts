import { type TextStyle, useColorScheme } from "react-native";

/**
 * jooling native design tokens. The single source of truth for every colour,
 * size, and motion value in the app — screens import components, components
 * import tokens. Values follow DESIGN.md: zinc neutrals, one brand blue for
 * action/selection/today, and amber/red/green reserved for operational state.
 */

const light = {
	/** Grouped screen canvas that cards sit on. */
	background: "#F4F4F5",
	surface: "#FFFFFF",
	/** Inset wells inside a surface: inputs, segmented tracks, chips. */
	surfaceMuted: "#F4F4F5",
	border: "#E4E4E7",
	separator: "#E4E4E7",
	text: "#18181B",
	textSecondary: "#71717A",
	textTertiary: "#A1A1AA",
	primary: "#006EDC",
	primaryPressed: "#005DBD",
	primarySoft: "#E8F1FC",
	onPrimary: "#FFFFFF",
	/** Brand colour for text and icons on neutral surfaces. */
	tint: "#006EDC",
	success: "#1F8A50",
	successSoft: "#E7F6EC",
	danger: "#DC2626",
	dangerSoft: "#FDECEC",
	warning: "#8A4B00",
	warningSoft: "#FFF4D6",
	warningBorder: "#EBC57D",
	overlay: "rgba(9, 9, 11, 0.4)",
	heroGradient: "linear-gradient(145deg, #1A80EC 0%, #0058C4 100%)",
	heroShadow: "0 12px 28px -10px rgba(0, 94, 200, 0.55)",
	cardShadow: "0 1px 2px rgba(9, 9, 11, 0.05), 0 1px 1px rgba(9, 9, 11, 0.03)",
	raisedShadow: "0 8px 24px -8px rgba(9, 9, 11, 0.18)",
};

const dark: typeof light = {
	background: "#09090B",
	surface: "#18181B",
	surfaceMuted: "#232327",
	border: "#2A2A2F",
	separator: "#2A2A2F",
	text: "#FAFAFA",
	textSecondary: "#A1A1AA",
	textTertiary: "#71717A",
	primary: "#3B8AF2",
	primaryPressed: "#2F78DA",
	primarySoft: "#13233B",
	onPrimary: "#FFFFFF",
	tint: "#5AA0F7",
	success: "#4ADE80",
	successSoft: "#0F2A1A",
	danger: "#F87171",
	dangerSoft: "#3A1414",
	warning: "#F2C86C",
	warningSoft: "#33260C",
	warningBorder: "#6B5316",
	overlay: "rgba(0, 0, 0, 0.6)",
	heroGradient: "linear-gradient(145deg, #1F6FD8 0%, #0B47A3 100%)",
	heroShadow: "0 12px 28px -12px rgba(0, 0, 0, 0.8)",
	cardShadow: "0 0 0 transparent",
	raisedShadow: "0 8px 24px -8px rgba(0, 0, 0, 0.7)",
};

export type Palette = typeof light;
export const palettes = { light, dark } as const;

/**
 * Legacy aliases kept so existing call sites (`theme.card`, `theme.muted`, …)
 * keep compiling while screens migrate to the semantic names above.
 */
function withAliases(p: Palette) {
	return {
		...p,
		card: p.surface,
		muted: p.textSecondary,
		notification: p.danger,
		onNotification: p.onPrimary,
		onSuccess: p.onPrimary,
		onWarning: p.warning,
		shadow: "#000000",
	};
}

export type AppTheme = ReturnType<typeof withAliases>;

const themed = { light: withAliases(light), dark: withAliases(dark) };

export function useAppTheme() {
	const scheme = useColorScheme() === "dark" ? "dark" : "light";
	return { theme: themed[scheme], colorScheme: scheme } as const;
}

/** 4-point grid. Name by size, not by use. */
export const spacing = {
	xxs: 2,
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 24,
	xxxl: 32,
} as const;

/** Screen edge padding. */
export const gutter = spacing.lg;

export const radius = {
	sm: 8,
	md: 12,
	lg: 16,
	xl: 22,
	full: 9999,
} as const;

/** Apple text-style ramp; body is 16 so shift details stay readable at a glance. */
export const type = {
	display: {
		fontSize: 34,
		lineHeight: 40,
		fontWeight: "700",
		letterSpacing: -0.6,
		fontVariant: ["tabular-nums"],
	},
	title1: {
		fontSize: 28,
		lineHeight: 34,
		fontWeight: "700",
		letterSpacing: -0.5,
	},
	title2: {
		fontSize: 22,
		lineHeight: 28,
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	title3: {
		fontSize: 19,
		lineHeight: 24,
		fontWeight: "600",
		letterSpacing: -0.2,
	},
	headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
	body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
	callout: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
	subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
	footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
	caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
	overline: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "600",
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const motion = {
	fast: 150,
	base: 250,
	slow: 400,
	/** Press feedback: quick, no overshoot. */
	pressSpring: { damping: 20, stiffness: 400, mass: 0.6 },
	/** Layout and enter transitions: settles with a hint of life. */
	spring: { damping: 18, stiffness: 180 },
} as const;

/** Minimum touch target (HIG 44pt, Material 48dp — use the larger). */
export const hitTarget = 48;
