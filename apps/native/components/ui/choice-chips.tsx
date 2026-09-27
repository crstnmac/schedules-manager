import { View } from "react-native";

import { tapLight } from "@/lib/haptics";
import { radius, spacing, useAppTheme } from "@/theme";
import { PressableScale } from "./pressable-scale";
import { AppText } from "./text";

/** Single-choice pill group for short option sets that may wrap. */
export function ChoiceChips<T extends string>({
	options,
	value,
	onChange,
	accessibilityLabel,
}: {
	options: { value: T; label: string }[];
	value: T | "";
	onChange: (value: T) => void;
	accessibilityLabel?: string;
}) {
	const { theme } = useAppTheme();
	return (
		<View
			accessibilityRole="radiogroup"
			accessibilityLabel={accessibilityLabel}
			style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
		>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<PressableScale
						key={option.value}
						accessibilityRole="radio"
						accessibilityLabel={option.label}
						accessibilityState={{ checked: selected }}
						onPress={() => {
							tapLight();
							onChange(option.value);
						}}
						pressedScale={0.95}
						style={{
							minHeight: 40,
							paddingHorizontal: spacing.lg,
							borderRadius: radius.full,
							justifyContent: "center",
							backgroundColor: selected ? theme.primary : theme.surfaceMuted,
						}}
					>
						<AppText
							variant="footnote"
							weight="600"
							color={selected ? theme.onPrimary : theme.text}
						>
							{option.label}
						</AppText>
					</PressableScale>
				);
			})}
		</View>
	);
}
