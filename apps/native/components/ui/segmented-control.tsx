import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { tapLight } from "@/lib/haptics";
import { motion, radius, spacing, useAppTheme } from "@/theme";
import { AppText } from "./text";

/**
 * Segmented switch with a thumb that springs between options on the UI
 * thread. Drawn in RN so it matches the brand on both platforms.
 */
export function SegmentedControl<T extends string>({
	options,
	value,
	onChange,
}: {
	options: { value: T; label: string; count?: number }[];
	value: T;
	onChange: (value: T) => void;
}) {
	const { theme, colorScheme } = useAppTheme();
	const [trackWidth, setTrackWidth] = useState(0);
	const index = Math.max(
		0,
		options.findIndex((option) => option.value === value),
	);
	const segment = trackWidth > 0 ? (trackWidth - 4) / options.length : 0;
	const offset = useSharedValue(index * segment);

	useEffect(() => {
		offset.value = withSpring(index * segment, motion.spring);
	}, [index, segment, offset]);

	const thumbStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: offset.value }],
	}));

	return (
		<View
			accessibilityRole="tablist"
			onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
			style={{
				flexDirection: "row",
				backgroundColor:
					colorScheme === "dark" ? theme.surfaceMuted : "#E9E9EC",
				borderRadius: radius.md,
				borderCurve: "continuous",
				padding: 2,
			}}
		>
			{segment > 0 ? (
				<Animated.View
					style={[
						{
							position: "absolute",
							top: 2,
							bottom: 2,
							left: 2,
							width: segment,
							borderRadius: radius.md - 2,
							borderCurve: "continuous",
							backgroundColor:
								colorScheme === "dark" ? "#3A3A40" : theme.surface,
							boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
						},
						thumbStyle,
					]}
				/>
			) : null}
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						accessibilityLabel={
							option.count !== undefined
								? `${option.label}, ${option.count}`
								: option.label
						}
						onPress={() => {
							if (selected) return;
							tapLight();
							onChange(option.value);
						}}
						style={{
							flex: 1,
							minHeight: 36,
							alignItems: "center",
							justifyContent: "center",
							flexDirection: "row",
							gap: spacing.xs,
						}}
					>
						<AppText
							variant="footnote"
							weight={selected ? "600" : "500"}
							tone={selected ? "default" : "secondary"}
							numberOfLines={1}
						>
							{option.label}
						</AppText>
						{option.count ? (
							<AppText
								variant="caption"
								tone={selected ? "tint" : "tertiary"}
								tabular
							>
								{option.count}
							</AppText>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}
