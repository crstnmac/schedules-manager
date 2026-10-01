import type * as React from "react";
import {
	type GestureResponderEvent,
	Pressable,
	type PressableProps,
	type StyleProp,
	type ViewStyle,
} from "react-native";

import { tapLight } from "@/lib/haptics";

/**
 * Touch surface used by every tappable card, row, and button. Press feedback
 * is a static opacity dip; there is no motion.
 */
export function PressableScale({
	children,
	style,
	// Kept for call-site compatibility; scaling is no longer animated.
	pressedScale: _pressedScale,
	haptic = false,
	onPress,
	...rest
}: Omit<PressableProps, "style" | "children"> & {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	pressedScale?: number;
	/** Light haptic tick on press (iOS). */
	haptic?: boolean;
}) {
	return (
		<Pressable
			{...rest}
			onPress={(event: GestureResponderEvent) => {
				if (haptic) tapLight();
				onPress?.(event);
			}}
			style={({ pressed }) => [style, pressed ? { opacity: 0.7 } : null]}
		>
			{children}
		</Pressable>
	);
}
