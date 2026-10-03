import type * as React from "react";
import { useEffect } from "react";
import { type DimensionValue, View } from "react-native";
import Animated, {
	cancelAnimation,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

import { friendlyMessage } from "@/lib/friendly-message";
import { radius, spacing, useAppTheme } from "@/theme";
import { Button } from "./button";
import type { IconName } from "./icon";
import { Card, IconTile, type Tone } from "./surfaces";
import { AppText } from "./text";

export function EmptyState({
	title,
	body,
	icon = "sparkles",
	tone = "neutral",
	action,
}: {
	title: string;
	body: string;
	icon?: IconName;
	tone?: Tone;
	action?: React.ReactNode;
}) {
	return (
		<View
			style={{
				alignItems: "center",
				gap: spacing.sm,
				paddingVertical: spacing.xxxl,
				paddingHorizontal: spacing.xl,
			}}
		>
			<IconTile icon={icon} tone={tone} size={52} />
			<AppText
				variant="headline"
				align="center"
				style={{ marginTop: spacing.xs }}
			>
				{title}
			</AppText>
			<AppText
				variant="subhead"
				tone="secondary"
				align="center"
				style={{ maxWidth: 320 }}
			>
				{body}
			</AppText>
			{action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
		</View>
	);
}

/** Load failure with a retry, worded for people, not engineers. */
export function ErrorState({
	title = "Couldn’t load this",
	error,
	onRetry,
}: {
	title?: string;
	error: unknown;
	onRetry?: () => void;
}) {
	return (
		<Card>
			<View style={{ flexDirection: "row", gap: spacing.md }}>
				<IconTile icon="warning" tone="danger" />
				<View style={{ flex: 1, gap: spacing.xxs }}>
					<AppText variant="headline">{title}</AppText>
					<AppText variant="footnote" tone="secondary" selectable>
						{friendlyMessage(error)}
					</AppText>
				</View>
			</View>
			{onRetry ? (
				<Button
					label="Try again"
					variant="secondary"
					icon="switch"
					onPress={onRetry}
				/>
			) : null}
		</Card>
	);
}

/** Pulsing placeholder block shaped like the content that is loading. */
export function Skeleton({
	width = "100%",
	height = 16,
	rounded = radius.sm,
}: {
	width?: DimensionValue;
	height?: number;
	rounded?: number;
}) {
	const { theme } = useAppTheme();
	const reduceMotion = useReducedMotion();
	const pulse = useSharedValue(1);

	useEffect(() => {
		if (reduceMotion) return;
		pulse.value = withRepeat(withTiming(0.55, { duration: 800 }), -1, true);
		return () => cancelAnimation(pulse);
	}, [reduceMotion, pulse]);

	const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

	return (
		<Animated.View
			style={[
				{
					width,
					height,
					borderRadius: rounded,
					borderCurve: "continuous",
					backgroundColor: theme.surfaceMuted,
				},
				animatedStyle,
			]}
		/>
	);
}

/** Skeleton for a stack of list cards; matches ShiftCard proportions. */
export function CardListSkeleton({ count = 3 }: { count?: number }) {
	return (
		<View style={{ gap: spacing.md }} accessibilityLabel="Loading">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<Card key={i}>
					<View style={{ flexDirection: "row", gap: spacing.md }}>
						<Skeleton width={52} height={44} rounded={radius.md} />
						<View
							style={{ flex: 1, gap: spacing.sm, justifyContent: "center" }}
						>
							<Skeleton width="55%" height={16} />
							<Skeleton width="80%" height={12} />
						</View>
					</View>
				</Card>
			))}
		</View>
	);
}

export function Avatar({
	name,
	size = 40,
	color,
}: {
	name: string;
	size?: number;
	color?: string;
}) {
	const { theme } = useAppTheme();
	const initials =
		name
			.trim()
			.split(/[\s@.]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join("") || "?";
	return (
		<View
			accessible={false}
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: color ?? theme.primarySoft,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<AppText
				variant={size >= 48 ? "title3" : "callout"}
				weight="700"
				color={color ? "#FFFFFF" : theme.tint}
			>
				{initials}
			</AppText>
		</View>
	);
}
