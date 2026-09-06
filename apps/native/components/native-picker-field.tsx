import DateTimePicker, {
	type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useState } from "react";
import {
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { NAV_THEME } from "@/lib/constants";
import {
	dateTimeValue,
	formatPickerValue,
	hhmmFrom,
	isoDate,
	type PickerMode,
} from "@/lib/datetime";
import { useColorScheme } from "@/lib/use-color-scheme";

/**
 * Web fallback for the native picker fields: tappable field that opens a
 * bottom-sheet modal with the community spinner picker (Android uses its own
 * system dialogs via components/ui.android.tsx).
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
	const [open, setOpen] = useState(false);
	// staged while open: scroll buffers into pending, Done commits, Cancel discards
	const [pending, setPending] = useState<Date | null>(null);

	const tmp = dateTimeValue(value, mode);
	const displayText = formatPickerValue(value, mode, tmp);

	function commit() {
		if (pending)
			onChange(mode === "date" ? isoDate(pending) : hhmmFrom(pending));
		setPending(null);
		setOpen(false);
	}

	function discard() {
		setPending(null);
		setOpen(false);
	}

	const picker = (
		<DateTimePicker
			value={pending ?? tmp}
			mode={mode}
			is24Hour={true}
			minimumDate={minimumDate}
			display={Platform.OS === "ios" ? "spinner" : "default"}
			onChange={(event: DateTimePickerEvent) => {
				if (Platform.OS === "android") {
					if (event.type === "set") {
						const next = new Date(event.nativeEvent.timestamp);
						onChange(mode === "date" ? isoDate(next) : hhmmFrom(next));
					}
					setOpen(false);
					return;
				}
				setPending(
					event.type === "set" ? new Date(event.nativeEvent.timestamp) : null,
				);
			}}
		/>
	);

	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityValue={{ text: displayText }}
				onPress={() => setOpen(true)}
				style={styles.nativeField}
			>
				<Text
					style={{
						fontSize: 16,
						fontVariant:
							mode === "date" ? undefined : (["tabular-nums"] as never),
						color: value ? theme.text : theme.muted,
					}}
				>
					{displayText}
				</Text>
			</Pressable>
			{open && Platform.OS === "android" ? picker : null}
			<Modal
				visible={open && Platform.OS === "ios"}
				transparent
				animationType="slide"
			>
				<Pressable
					style={styles.pickerScrim}
					onPress={discard}
					accessible={false}
				/>
				<View
					style={[styles.pickerSheetIOS, { backgroundColor: theme.card }]}
					accessibilityViewIsModal
				>
					<Text
						accessibilityRole="header"
						style={[styles.pickerTitle, { color: theme.muted }]}
					>
						{label}
					</Text>
					{picker}
					<View style={styles.pickerSheetActions}>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Cancel changes"
							onPress={discard}
							style={styles.pickerCancel}
						>
							<Text style={[styles.pickerCancelText, { color: theme.text }]}>
								Cancel
							</Text>
						</Pressable>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Save ${displayText}`}
							onPress={commit}
							style={styles.pickerCancel}
						>
							<Text
								style={{
									color: theme.primary,
									fontWeight: "700",
									fontSize: 15,
								}}
							>
								Done
							</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	fieldLabel: { fontSize: 13, fontWeight: "600" },
	nativeField: {
		minHeight: 52,
		borderWidth: 1,
		borderRadius: 12,
		borderCurve: "continuous",
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 16,
		justifyContent: "center",
		borderColor: "#CBD5E1",
	},
	pickerScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
	pickerSheetIOS: {
		paddingBottom: 24,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
	},
	pickerSheetActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingTop: 8,
	},
	pickerTitle: {
		fontSize: 13,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.6,
		paddingHorizontal: 20,
		paddingTop: 14,
	},
	pickerCancel: { minHeight: 44, justifyContent: "center" },
	pickerCancelText: { fontSize: 14, fontWeight: "600" },
});
