import type * as React from "react";
import {
	type ColorValue,
	Text as RNText,
	type TextProps,
	type TextStyle,
} from "react-native";

import { type TypeVariant, type as typeRamp, useAppTheme } from "@/theme";

type Tone =
	| "default"
	| "secondary"
	| "tertiary"
	| "tint"
	| "danger"
	| "success";

/**
 * The only way screens set type. Pick a ramp step and a tone; never a raw
 * fontSize. `tabular` lines up times, counts, and money.
 */
export function AppText({
	variant = "body",
	tone = "default",
	color,
	weight,
	tabular,
	align,
	style,
	...props
}: TextProps & {
	variant?: TypeVariant;
	tone?: Tone;
	color?: ColorValue;
	weight?: TextStyle["fontWeight"];
	tabular?: boolean;
	align?: TextStyle["textAlign"];
}) {
	const { theme } = useAppTheme();
	const toneColor: Record<Tone, string> = {
		default: theme.text,
		secondary: theme.textSecondary,
		tertiary: theme.textTertiary,
		tint: theme.tint,
		danger: theme.danger,
		success: theme.success,
	};
	return (
		<RNText
			{...props}
			style={[
				typeRamp[variant],
				{ color: color ?? toneColor[tone] },
				weight ? { fontWeight: weight } : null,
				tabular ? { fontVariant: ["tabular-nums"] } : null,
				align ? { textAlign: align } : null,
				style,
			]}
		/>
	);
}

export function CardTitle({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: TextStyle;
}) {
	return (
		<AppText variant="headline" accessibilityRole="header" style={style}>
			{children}
		</AppText>
	);
}

export function Body({
	children,
	muted,
}: {
	children: React.ReactNode;
	muted?: boolean;
}) {
	return (
		<AppText variant="subhead" tone={muted ? "secondary" : "default"}>
			{children}
		</AppText>
	);
}

export function Meta({
	children,
	color,
}: {
	children: React.ReactNode;
	color?: string;
}) {
	return (
		<AppText variant="overline" tone="secondary" color={color}>
			{children}
		</AppText>
	);
}

export function Hint({ children }: { children: React.ReactNode }) {
	return (
		<AppText variant="footnote" tone="secondary">
			{children}
		</AppText>
	);
}
