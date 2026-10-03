import type * as React from "react";
import {
	type GestureResponderEvent,
	Pressable,
	type PressableProps,
	type StyleProp,
	type ViewStyle,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { tapLight } from "@/lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 } as const;

/**
 * Touch surface used by every tappable card, row, and button. Press feedback
 * is a spring scale + opacity dip driven on the UI thread; with reduce-motion
 * enabled it falls back to the opacity dip alone.
 */
export function PressableScale({
	children,
	style,
	pressedScale = 0.97,
	haptic = false,
	onPress,
	onPressIn,
	onPressOut,
	...rest
}: Omit<PressableProps, "style" | "children"> & {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	/** Scale while pressed (1 disables scaling). */
	pressedScale?: number;
	/** Light haptic tick on press (iOS). */
	haptic?: boolean;
}) {
	const reduceMotion = useReducedMotion();
	const progress = useSharedValue(0);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: 1 - progress.value * 0.3,
		transform: reduceMotion
			? []
			: [{ scale: 1 - progress.value * (1 - pressedScale) }],
	}));

	return (
		<AnimatedPressable
			{...rest}
			onPressIn={(event: GestureResponderEvent) => {
				progress.value = withSpring(1, PRESS_SPRING);
				onPressIn?.(event);
			}}
			onPressOut={(event: GestureResponderEvent) => {
				progress.value = withSpring(0, PRESS_SPRING);
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
