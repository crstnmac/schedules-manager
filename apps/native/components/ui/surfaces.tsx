import type * as React from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

import { type AppTheme, radius, spacing, useAppTheme } from "@/theme";
import { Icon, type IconName } from "./icon";
import { PressableScale } from "./pressable-scale";
import { AppText } from "./text";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

export function toneColors(theme: AppTheme, tone: Tone) {
	switch (tone) {
		case "primary":
			return {
				bg: theme.primarySoft,
				fg: theme.tint,
				border: theme.primarySoft,
			};
		case "success":
			return {
				bg: theme.successSoft,
				fg: theme.success,
				border: theme.successSoft,
			};
		case "warning":
			return {
				bg: theme.warningSoft,
				fg: theme.warning,
				border: theme.warningBorder,
			};
		case "danger":
			return {
				bg: theme.dangerSoft,
				fg: theme.danger,
				border: theme.dangerSoft,
			};
		default:
			return {
				bg: theme.surfaceMuted,
				fg: theme.textSecondary,
				border: theme.border,
			};
	}
}

/**
 * The one framed surface. Pass `onPress` to make the whole card tappable with
 * the shared press spring; pass `padded={false}` for edge-to-edge rows.
 */
export function Card({
	children,
	style,
	onPress,
	padded = true,
	accessibilityLabel,
	accessibilityHint,
}: {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	onPress?: () => void;
	padded?: boolean;
	accessibilityLabel?: string;
	accessibilityHint?: string;
}) {
	const { theme, colorScheme } = useAppTheme();
	const frame: ViewStyle = {
		backgroundColor: theme.surface,
		borderRadius: radius.lg,
		borderCurve: "continuous",
		boxShadow: theme.cardShadow,
		// Dark mode drops the shadow; a hairline keeps the card edge legible.
		borderWidth: colorScheme === "dark" ? StyleSheet.hairlineWidth : 0,
		borderColor: theme.border,
		padding: padded ? spacing.lg : 0,
		gap: spacing.md,
		overflow: padded ? undefined : "hidden",
	};
	if (onPress)
		return (
			<PressableScale
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				accessibilityHint={accessibilityHint}
				onPress={onPress}
				pressedScale={0.98}
				style={[frame, style]}
			>
				{children}
			</PressableScale>
		);
	return <View style={[frame, style]}>{children}</View>;
}

/** Status pill. Colour always pairs with words (DESIGN.md: status has words). */
export function Badge({
	label,
	tone = "neutral",
	icon,
	dot,
	solid,
}: {
	label: string;
	tone?: Tone;
	icon?: IconName;
	dot?: boolean;
	/** Filled with the tone colour, for the highest-emphasis state on a row. */
	solid?: boolean;
}) {
	const { theme } = useAppTheme();
	const c = toneColors(theme, tone);
	const fg = solid ? theme.onPrimary : c.fg;
	return (
		<View
			style={{
				alignSelf: "flex-start",
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.xs,
				backgroundColor: solid
					? tone === "neutral"
						? theme.textSecondary
						: c.fg
					: c.bg,
				borderRadius: radius.full,
				paddingHorizontal: spacing.sm,
				paddingVertical: 3,
			}}
		>
			{dot ? (
				<View
					style={{
						width: 6,
						height: 6,
						borderRadius: 3,
						backgroundColor: fg,
					}}
				/>
			) : null}
			{icon ? <Icon name={icon} size={11} color={fg} /> : null}
			<AppText variant="caption" weight="600" color={fg} numberOfLines={1}>
				{label}
			</AppText>
		</View>
	);
}

/**
 * Inline alert for something the worker should read or act on. Tone carries
 * meaning: warning = a response is owed, danger = conflict or failure.
 */
export function Callout({
	tone = "primary",
	icon,
	title,
	body,
	children,
}: {
	tone?: Tone;
	icon?: IconName;
	title: string;
	body?: string;
	children?: React.ReactNode;
}) {
	const { theme } = useAppTheme();
	const c = toneColors(theme, tone);
	const defaultIcon: IconName =
		tone === "warning" || tone === "danger"
			? "warning"
			: tone === "success"
				? "checkCircle"
				: "info";
	return (
		<View
			accessibilityRole={tone === "danger" ? "alert" : undefined}
			style={{
				backgroundColor: c.bg,
				borderColor: c.border,
				borderWidth: StyleSheet.hairlineWidth,
				borderRadius: radius.lg,
				borderCurve: "continuous",
				padding: spacing.lg,
				gap: spacing.md,
			}}
		>
			<View style={{ flexDirection: "row", gap: spacing.md }}>
				<View style={{ paddingTop: 1 }}>
					<Icon name={icon ?? defaultIcon} size={20} color={c.fg} />
				</View>
				<View style={{ flex: 1, gap: spacing.xxs }}>
					<AppText variant="headline">{title}</AppText>
					{body ? (
						<AppText variant="footnote" tone="secondary">
							{body}
						</AppText>
					) : null}
				</View>
			</View>
			{children}
		</View>
	);
}

/** A titled group of content on a screen. */
export function Section({
	title,
	caption,
	action,
	children,
	style,
}: {
	title?: string;
	caption?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	return (
		<View style={[{ gap: spacing.sm }, style]}>
			{title ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "flex-end",
						justifyContent: "space-between",
						gap: spacing.md,
						paddingHorizontal: spacing.xs,
						minHeight: 24,
					}}
				>
					<View style={{ flex: 1, gap: spacing.xxs }}>
						<AppText variant="title3" accessibilityRole="header">
							{title}
						</AppText>
						{caption ? (
							<AppText variant="footnote" tone="secondary">
								{caption}
							</AppText>
						) : null}
					</View>
					{action}
				</View>
			) : null}
			<View style={{ gap: spacing.md }}>{children}</View>
		</View>
	);
}

export function Divider({ inset = 0 }: { inset?: number }) {
	const { theme } = useAppTheme();
	return (
		<View
			style={{
				height: StyleSheet.hairlineWidth,
				backgroundColor: theme.separator,
				marginLeft: inset,
			}}
		/>
	);
}

/** Rounded-square icon tile, the leading glyph for list rows and stats. */
export function IconTile({
	icon,
	tone = "primary",
	size = 32,
}: {
	icon: IconName;
	tone?: Tone;
	size?: number;
}) {
	const { theme } = useAppTheme();
	const c = toneColors(theme, tone);
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size * 0.3,
				borderCurve: "continuous",
				backgroundColor: c.bg,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Icon name={icon} size={Math.round(size * 0.55)} color={c.fg} />
		</View>
	);
}

/** Inset grouped list, like iOS Settings. Children are `ListRow`s. */
export function ListGroup({ children }: { children: React.ReactNode }) {
	const items = (Array.isArray(children) ? children : [children])
		.flat()
		.filter(Boolean);
	return (
		<Card padded={false} style={{ gap: 0 }}>
			{items.map((child, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static row order
				<View key={index}>
					{index > 0 ? <Divider inset={60} /> : null}
					{child}
				</View>
			))}
		</Card>
	);
}

export function ListRow({
	title,
	subtitle,
	icon,
	iconTone = "primary",
	trailing,
	onPress,
	destructive,
	chevron = Boolean(onPress),
}: {
	title: string;
	subtitle?: string;
	icon?: IconName;
	iconTone?: Tone;
	trailing?: React.ReactNode;
	onPress?: () => void;
	destructive?: boolean;
	chevron?: boolean;
}) {
	const { theme } = useAppTheme();
	const content = (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.md,
				paddingHorizontal: spacing.lg,
				paddingVertical: spacing.md,
				minHeight: 56,
			}}
		>
			{icon ? (
				<IconTile icon={icon} tone={destructive ? "danger" : iconTone} />
			) : null}
			<View style={{ flex: 1, gap: 1 }}>
				<AppText
					variant="body"
					weight="500"
					color={destructive ? theme.danger : undefined}
					numberOfLines={1}
				>
					{title}
				</AppText>
				{subtitle ? (
					<AppText variant="footnote" tone="secondary" numberOfLines={2}>
						{subtitle}
					</AppText>
				) : null}
			</View>
			{trailing}
			{chevron ? (
				<Icon name="chevronRight" size={13} color={theme.textTertiary} />
			) : null}
		</View>
	);
	if (!onPress) return content;
	return (
		<PressableScale
			accessibilityRole="button"
			accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
			onPress={onPress}
			pressedScale={0.985}
			haptic
		>
			{content}
		</PressableScale>
	);
}
