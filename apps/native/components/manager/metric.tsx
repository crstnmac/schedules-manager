import { View } from "react-native";

import {
	AppText,
	Card,
	type IconName,
	IconTile,
	type Tone,
} from "@/components/ui";
import { spacing } from "@/theme";

/** Overview stat card (DESIGN.md): icon chip, large value, short label. */
export function Metric({
	icon,
	value,
	label,
	tone = "primary",
}: {
	icon: IconName;
	value: number;
	label: string;
	tone?: Tone;
}) {
	return (
		<Card style={{ flex: 1, gap: spacing.sm, padding: spacing.md }}>
			<View
				accessible
				accessibilityLabel={`${label}: ${value}`}
				style={{ gap: spacing.sm }}
			>
				<IconTile icon={icon} tone={tone} size={30} />
				<AppText variant="title1" tabular>
					{value}
				</AppText>
				<AppText variant="caption" tone="secondary" numberOfLines={2}>
					{label}
				</AppText>
			</View>
		</Card>
	);
}
