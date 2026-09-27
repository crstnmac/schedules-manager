import type * as React from "react";
import { useState } from "react";
import {
	RefreshControl,
	ScrollView,
	type StyleProp,
	useWindowDimensions,
	View,
	type ViewStyle,
} from "react-native";
import Animated, {
	FadeIn,
	FadeInDown,
	LinearTransition,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { gutter, motion, spacing, useAppTheme } from "@/theme";

/** Readable column width on tablets; phones use the full width. */
const MAX_CONTENT_WIDTH = 720;

/**
 * Route root. The ScrollView is the first child so native stack large titles
 * collapse on scroll, and `contentInsetAdjustmentBehavior` handles the header
 * and tab bar insets. Use `headerless` only outside a navigation stack (auth,
 * onboarding) to pad for the status bar instead.
 */
export function Screen({
	children,
	contentStyle,
	scroll = true,
	headerless = false,
	onRefresh,
}: {
	children: React.ReactNode;
	contentStyle?: StyleProp<ViewStyle>;
	scroll?: boolean;
	headerless?: boolean;
	/** Enables pull-to-refresh; resolve the promise when data is back. */
	onRefresh?: () => Promise<unknown>;
}) {
	const { theme } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const [refreshing, setRefreshing] = useState(false);
	const side = Math.max(gutter, (width - MAX_CONTENT_WIDTH) / 2);

	const padding: ViewStyle = {
		paddingTop: headerless ? insets.top + spacing.lg : spacing.sm,
		paddingBottom: headerless
			? insets.bottom + spacing.xxl
			: spacing.xxxl + (process.env.EXPO_OS === "android" ? spacing.lg : 0),
		paddingLeft: Math.max(side, insets.left + gutter),
		paddingRight: Math.max(side, insets.right + gutter),
		gap: spacing.xl,
	};

	if (!scroll)
		return (
			<View
				style={[
					{ flex: 1, backgroundColor: theme.background },
					padding,
					contentStyle,
				]}
			>
				{children}
			</View>
		);

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: theme.background }}
			contentContainerStyle={[padding, contentStyle]}
			contentInsetAdjustmentBehavior="automatic"
			automaticallyAdjustKeyboardInsets
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode={
				process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"
			}
			refreshControl={
				onRefresh ? (
					<RefreshControl
						refreshing={refreshing}
						tintColor={theme.textSecondary}
						colors={[theme.primary]}
						progressBackgroundColor={theme.surface}
						onRefresh={() => {
							setRefreshing(true);
							void onRefresh().finally(() => setRefreshing(false));
						}}
					/>
				) : undefined
			}
		>
			{children}
		</ScrollView>
	);
}

/**
 * Enter animation for blocks that arrive with data. Stagger siblings with
 * `index`; Reanimated honours the system Reduce Motion setting.
 */
export function Appear({
	children,
	index = 0,
	style,
}: {
	children: React.ReactNode;
	index?: number;
	style?: StyleProp<ViewStyle>;
}) {
	return (
		<Animated.View
			entering={FadeInDown.duration(motion.base)
				.delay(Math.min(index, 6) * 45)
				.springify()
				.damping(motion.spring.damping)
				.stiffness(motion.spring.stiffness)}
			layout={LinearTransition.springify()
				.damping(motion.spring.damping)
				.stiffness(motion.spring.stiffness)}
			style={style}
		>
			{children}
		</Animated.View>
	);
}

/** Crossfade for content swapped in place (e.g. a segmented view). */
export function FadeSwap({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	return (
		<Animated.View entering={FadeIn.duration(motion.base)} style={style}>
			{children}
		</Animated.View>
	);
}
