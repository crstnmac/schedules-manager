import {
	ActivityIndicator,
	type StyleProp,
	View,
	type ViewStyle,
} from "react-native";

import { type AppTheme, radius, spacing, useAppTheme } from "@/theme";
import { Icon, type IconName } from "./icon";
import { PressableScale } from "./pressable-scale";
import { AppText } from "./text";

export type ButtonVariant =
	| "primary"
	| "secondary"
	| "tinted"
	| "outline"
	| "ghost"
	| "destructive"
	/** White fill for use on the brand-blue hero. */
	| "inverse"
	/** Frosted outline for secondary actions on the brand-blue hero. */
	| "inverseSubtle";

type ButtonSize = "sm" | "md" | "lg";

function variantColors(theme: AppTheme, variant: ButtonVariant) {
	switch (variant) {
		case "primary":
			return { bg: theme.primary, fg: theme.onPrimary, border: undefined };
		case "secondary":
			return { bg: theme.surfaceMuted, fg: theme.text, border: undefined };
		case "tinted":
			return { bg: theme.primarySoft, fg: theme.tint, border: undefined };
		case "outline":
			return { bg: "transparent", fg: theme.text, border: theme.border };
		case "ghost":
			return { bg: "transparent", fg: theme.tint, border: undefined };
		case "destructive":
			return { bg: theme.dangerSoft, fg: theme.danger, border: undefined };
		case "inverse":
			return { bg: "#FFFFFF", fg: "#0058C4", border: undefined };
		case "inverseSubtle":
			return {
				bg: "rgba(255, 255, 255, 0.16)",
				fg: "#FFFFFF",
				border: "rgba(255, 255, 255, 0.28)",
			};
	}
}

const SIZES: Record<
	ButtonSize,
	{
		height: number;
		px: number;
		icon: number;
		text: "footnote" | "callout" | "headline";
	}
> = {
	sm: { height: 36, px: spacing.md, icon: 15, text: "footnote" },
	md: { height: 48, px: spacing.lg, icon: 18, text: "callout" },
	lg: { height: 56, px: spacing.xl, icon: 20, text: "headline" },
};

export function Button({
	label,
	onPress,
	variant = "primary",
	size = "md",
	icon,
	loading,
	disabled,
	haptic = true,
	accessibilityLabel,
	style,
}: {
	label: string;
	onPress: () => void;
	variant?: ButtonVariant;
	size?: ButtonSize;
	icon?: IconName;
	loading?: boolean;
	disabled?: boolean;
	haptic?: boolean;
	accessibilityLabel?: string;
	style?: StyleProp<ViewStyle>;
}) {
	const { theme } = useAppTheme();
	const c = variantColors(theme, variant);
	const s = SIZES[size];
	const inactive = disabled || loading;

	return (
		<PressableScale
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityState={{ disabled: inactive, busy: loading }}
			disabled={inactive}
			haptic={haptic}
			onPress={onPress}
			hitSlop={size === "sm" ? 6 : 0}
			style={[
				{
					minHeight: s.height,
					paddingHorizontal: variant === "ghost" ? spacing.xs : s.px,
					borderRadius: size === "sm" ? radius.sm + 2 : radius.md,
					borderCurve: "continuous",
					backgroundColor: c.bg,
					borderWidth: c.border ? 1 : 0,
					borderColor: c.border,
					alignItems: "center",
					justifyContent: "center",
					opacity: disabled && !loading ? 0.45 : 1,
				},
				style,
			]}
		>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "center",
					gap: spacing.sm,
				}}
			>
				{loading ? (
					<ActivityIndicator size="small" color={c.fg} />
				) : icon ? (
					<Icon name={icon} size={s.icon} color={c.fg} />
				) : null}
				<AppText variant={s.text} weight="600" color={c.fg} numberOfLines={1}>
					{label}
				</AppText>
			</View>
		</PressableScale>
	);
}

/** Compact icon-only control, e.g. month arrows and header actions. */
export function IconButton({
	icon,
	onPress,
	accessibilityLabel,
	variant = "secondary",
	size = 40,
	shape = "circle",
	disabled,
}: {
	icon: IconName;
	onPress: () => void;
	accessibilityLabel: string;
	variant?: "secondary" | "ghost" | "tinted";
	size?: number;
	/** "square" matches the corner radius of neighbouring Buttons. */
	shape?: "circle" | "square";
	disabled?: boolean;
}) {
	const { theme } = useAppTheme();
	const bg =
		variant === "secondary"
			? theme.surfaceMuted
			: variant === "tinted"
				? theme.primarySoft
				: "transparent";
	return (
		<PressableScale
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			disabled={disabled}
			haptic
			onPress={onPress}
			hitSlop={Math.max(0, (48 - size) / 2)}
			pressedScale={0.9}
			style={{
				width: size,
				height: size,
				borderRadius: shape === "square" ? radius.md : size / 2,
				borderCurve: "continuous",
				backgroundColor: bg,
				alignItems: "center",
				justifyContent: "center",
				opacity: disabled ? 0.4 : 1,
			}}
		>
			<Icon
				name={icon}
				size={Math.round(size * 0.45)}
				color={variant === "secondary" ? theme.text : theme.tint}
			/>
		</PressableScale>
	);
}
