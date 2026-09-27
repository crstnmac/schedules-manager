import type * as React from "react";
import {
	type GestureResponderEvent,
	Pressable,
	type PressableProps,
	type StyleProp,
	StyleSheet,
	type ViewStyle,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { tapLight } from "@/lib/haptics";
import { motion } from "@/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Touch surface with a UI-thread spring on press. Every tappable card, row,
 * and button in the app goes through this so press feedback feels the same
 * everywhere. Falls back to an opacity dip when Reduce Motion is on.
 */
export function PressableScale({
	children,
	style,
	pressedScale = 0.97,
	haptic = false,
	onPressIn,
	onPressOut,
	onPress,
	disabled,
	...rest
}: Omit<PressableProps, "style" | "children"> & {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	pressedScale?: number;
	/** Light haptic tick on press (iOS). */
	haptic?: boolean;
}) {
	const reduceMotion = useReducedMotion();
	const pressed = useSharedValue(0);
	// The animated style merges last, so fold the caller's opacity (e.g. a
	// disabled dim) into it instead of overwriting it.
	const baseOpacity = Number(StyleSheet.flatten(style)?.opacity ?? 1);

	const animatedStyle = useAnimatedStyle(() => {
		if (reduceMotion)
			return { opacity: baseOpacity * (1 - pressed.value * 0.3) };
		return {
			transform: [{ scale: 1 - pressed.value * (1 - pressedScale) }],
			opacity: baseOpacity * (1 - pressed.value * 0.08),
		};
	});

	return (
		<AnimatedPressable
			{...rest}
			disabled={disabled}
			onPressIn={(event: GestureResponderEvent) => {
				pressed.value = withSpring(1, motion.pressSpring);
				onPressIn?.(event);
			}}
			onPressOut={(event: GestureResponderEvent) => {
				pressed.value = withSpring(0, motion.pressSpring);
				onPressOut?.(event);
			}}
			onPress={(event: GestureResponderEvent) => {
				if (haptic) tapLight();
				onPress?.(event);
			}}
			style={[style, animatedStyle]}
		>
			{children}
		</AnimatedPressable>
	);
}
