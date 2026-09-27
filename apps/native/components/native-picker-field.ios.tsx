import { Host } from "@expo/ui";
import { DatePicker } from "@expo/ui/swift-ui";
import { StyleSheet, Text, View } from "react-native";
import {
	dateTimeValue,
	hhmmFrom,
	isoDate,
	type PickerMode,
} from "@/lib/datetime";
import { useAppTheme } from "@/theme";

/**
 * iOS native date/time field: SwiftUI's compact `DatePicker` — tapping opens
 * the system popover with the familiar wheel, selection commits natively.
 * No custom chrome; the platform owns the interaction.
 */
export default function NativeDateTimeField({
	label,
	value,
	mode,
	onChange,
	minimumDate,
}: {
	label: string;
	value: string;
	mode: PickerMode;
	onChange: (value: string) => void;
	minimumDate?: Date;
}) {
	const { theme, colorScheme } = useAppTheme();
	const selection = dateTimeValue(value, mode);

	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
				{label}
			</Text>
			<View
				accessible
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityValue={{ text: value || undefined }}
			>
				<Host
					matchContents
					colorScheme={colorScheme}
					seedColor={theme.primary}
					style={styles.host}
				>
					<DatePicker
						selection={selection}
						displayedComponents={mode === "date" ? ["date"] : ["hourAndMinute"]}
						range={minimumDate ? { start: minimumDate } : undefined}
						onDateChange={(date) => {
							onChange(mode === "date" ? isoDate(date) : hhmmFrom(date));
						}}
					/>
				</Host>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	fieldLabel: {
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "600",
		paddingHorizontal: 2,
	},
	host: { minHeight: 44, justifyContent: "center" },
});
