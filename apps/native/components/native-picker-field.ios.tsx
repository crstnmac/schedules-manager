import { Host } from "@expo/ui";
import { DatePicker } from "@expo/ui/swift-ui";
import { StyleSheet, Text, View } from "react-native";
import { NAV_THEME } from "@/lib/constants";
import {
	dateTimeValue,
	hhmmFrom,
	isoDate,
	type PickerMode,
} from "@/lib/datetime";
import { useColorScheme } from "@/lib/use-color-scheme";

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
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const selection = dateTimeValue(value, mode);

	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
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
	fieldLabel: { fontSize: 13, fontWeight: "600" },
	host: { minHeight: 44, justifyContent: "center" },
});
