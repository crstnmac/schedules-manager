import { Host } from "@expo/ui";
import {
	DatePickerDialog,
	FilterChip,
	FlowRow,
	Checkbox as MaterialCheckbox,
	Switch as MaterialSwitch,
	Text as MaterialText,
	OutlinedButton,
	OutlinedTextField,
	type TextFieldRef,
	TimePickerDialog,
	useMaterialColors,
	useNativeState,
} from "@expo/ui/jetpack-compose";
import {
	defaultMinSize,
	fillMaxWidth,
	semantics,
} from "@expo/ui/jetpack-compose/modifiers";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
	Pressable,
	type TextInput as RNTextInput,
	StyleSheet,
	View,
} from "react-native";

import NativeDateTimeField from "@/components/native-picker-field";
import { isoDate } from "@/lib/datetime";
import { useDisplayPrefs } from "@/lib/display";
import { spacing, useAppTheme } from "@/theme";
import { AppText } from "./text";

export { NativeDateTimeField };

// SDK 57 universal Host re-exports Compose Host on Android, including its IME prop.
const NATIVE_KEYBOARD_INSETS = { ignoreSafeAreaKeyboardInsets: true };

/** Compose controls seeded from the brand blue so Material colours match. */
function useNativeHostProps() {
	const { theme, colorScheme } = useAppTheme();
	const material = useMaterialColors({ colorScheme, seedColor: theme.primary });
	return {
		material,
		theme,
		host: {
			colorScheme,
			seedColor: theme.primary,
			...NATIVE_KEYBOARD_INSETS,
		},
	};
}

const NATIVE_KEYBOARD_TYPES: Partial<
	Record<
		NonNullable<React.ComponentProps<typeof RNTextInput>["keyboardType"]>,
		"text" | "number" | "email" | "phone" | "decimal" | "password"
	>
> = {
	default: "text",
	"number-pad": "number",
	"decimal-pad": "decimal",
	"email-address": "email",
	"phone-pad": "phone",
	"visible-password": "password",
};

export function NativeField({
	label,
	value,
	onChange,
	placeholder,
	multiline = false,
	keyboardType,
	secureTextEntry = false,
	contentType,
	inputRef,
	onSubmit,
	onNext,
	disabled,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	multiline?: boolean;
	keyboardType?: React.ComponentProps<typeof RNTextInput>["keyboardType"];
	secureTextEntry?: boolean;
	contentType?: string;
	inputRef?: React.Ref<TextFieldRef>;
	onSubmit?: () => void;
	onNext?: () => void;
	disabled?: boolean;
}) {
	const { host } = useNativeHostProps();
	const nativeValue = useNativeState(value);
	const lastEmitted = useRef(value);
	useEffect(() => {
		// Typing already updated the native buffer. Echoing each JS event into it can
		// overwrite newer keystrokes; only write when the parent changes the value.
		if (value !== lastEmitted.current) {
			nativeValue.value = value;
			lastEmitted.current = value;
		}
	}, [nativeValue, value]);
	const nativeKeyboardType = NATIVE_KEYBOARD_TYPES[keyboardType ?? "default"];
	return (
		<Host
			matchContents={{ vertical: true, horizontal: false }}
			{...host}
			style={styles.nativeHost}
		>
			<OutlinedTextField
				ref={inputRef}
				enabled={!disabled}
				visualTransformation={secureTextEntry ? "password" : "none"}
				keyboardActions={{ onDone: onSubmit, onNext }}
				value={nativeValue}
				singleLine={!multiline}
				minLines={multiline ? 3 : 1}
				maxLines={multiline ? 5 : 1}
				keyboardOptions={{
					capitalization: multiline ? "sentences" : "none",
					imeAction: onSubmit ? "done" : multiline ? "default" : "next",
					keyboardType: secureTextEntry ? "password" : nativeKeyboardType,
					autoCorrectEnabled:
						!secureTextEntry && keyboardType !== "email-address",
				}}
				onValueChange={(next) => {
					lastEmitted.current = next;
					onChange(next);
				}}
				modifiers={[
					fillMaxWidth(),
					...(contentType ? [semantics({ contentType })] : []),
				]}
			>
				<OutlinedTextField.Label>
					<MaterialText>{label}</MaterialText>
				</OutlinedTextField.Label>
				{placeholder ? (
					<OutlinedTextField.Placeholder>
						<MaterialText>{placeholder}</MaterialText>
					</OutlinedTextField.Placeholder>
				) : null}
			</OutlinedTextField>
		</Host>
	);
}

const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

export function NativeWeekdayPicker({
	value,
	onChange,
}: {
	value: number;
	onChange: (value: number) => void;
}) {
	const { host, material } = useNativeHostProps();
	return (
		<Host
			matchContents={{ vertical: true }}
			{...host}
			style={styles.nativeHost}
		>
			<FlowRow
				horizontalArrangement={{ spacedBy: 8 }}
				verticalArrangement={{ spacedBy: 8 }}
				modifiers={[fillMaxWidth()]}
			>
				{DAY_NAMES.map((day, index) => (
					<FilterChip
						key={day}
						selected={value === index}
						onClick={() => onChange(index)}
						modifiers={[defaultMinSize({ minHeight: 48 })]}
					>
						<FilterChip.Label>
							<MaterialText
								color={
									value === index
										? material.onSecondaryContainer
										: material.onSurface
								}
							>
								{value === index ? `✓ ${day}` : day}
							</MaterialText>
						</FilterChip.Label>
					</FilterChip>
				))}
			</FlowRow>
		</Host>
	);
}

export function NativeSwitchField({
	label,
	value,
	onChange,
	disabled,
}: {
	label: string;
	value: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	const { host, material } = useNativeHostProps();
	return (
		<Pressable
			accessibilityRole="switch"
			accessibilityLabel={label}
			accessibilityState={{ checked: value, disabled }}
			disabled={disabled}
			onPress={() => onChange(!value)}
			android_ripple={{ color: material.surfaceContainerHigh }}
			style={styles.toggleRow}
		>
			<AppText variant="body" style={{ flex: 1, paddingRight: spacing.md }}>
				{label}
			</AppText>
			<Host
				accessible={false}
				importantForAccessibility="no-hide-descendants"
				pointerEvents="none"
				matchContents
				{...host}
				style={styles.toggleHost}
			>
				<MaterialSwitch value={value} enabled={!disabled} />
			</Host>
		</Pressable>
	);
}

export function NativeCheckboxRow({
	label,
	checked,
	onChange,
	disabled,
	strikethrough = false,
}: {
	label: string;
	checked: boolean;
	onChange: () => void;
	disabled?: boolean;
	strikethrough?: boolean;
}) {
	const { host, material } = useNativeHostProps();
	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityLabel={label}
			accessibilityState={{ checked, disabled }}
			disabled={disabled}
			onPress={onChange}
			android_ripple={{ color: material.surfaceContainerHigh }}
			style={styles.checkboxRow}
		>
			<Host
				accessible={false}
				importantForAccessibility="no-hide-descendants"
				pointerEvents="none"
				matchContents
				{...host}
				style={styles.checkboxHost}
			>
				<MaterialCheckbox value={checked} enabled={!disabled} />
			</Host>
			<AppText
				variant="body"
				tone={checked ? "secondary" : "default"}
				style={{
					flex: 1,
					textDecorationLine:
						strikethrough && checked ? "line-through" : "none",
				}}
			>
				{label}
			</AppText>
		</Pressable>
	);
}

export function NativeDatePickerField({
	label,
	value,
	onChange,
	minimumDate,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	minimumDate?: Date;
}) {
	const { host, material } = useNativeHostProps();
	const [open, setOpen] = useState(false);
	const display = value
		? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
				weekday: "short",
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: "Choose date";
	return (
		<View style={{ gap: spacing.xs + 2 }}>
			<AppText variant="footnote" weight="600" tone="secondary">
				{label}
			</AppText>
			<Host
				{...host}
				matchContents={{ vertical: true }}
				style={styles.nativeHost}
			>
				<OutlinedButton
					onClick={() => setOpen(true)}
					modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 })]}
				>
					<MaterialText color={material.primary}>{display}</MaterialText>
				</OutlinedButton>
				{open ? (
					<DatePickerDialog
						initialDate={
							value
								? `${value}T00:00:00.000Z`
								: `${isoDate(new Date())}T00:00:00.000Z`
						}
						selectableDates={
							minimumDate
								? { start: new Date(`${isoDate(minimumDate)}T00:00:00.000Z`) }
								: undefined
						}
						color={material.primary}
						confirmButtonLabel="Select"
						dismissButtonLabel="Cancel"
						onDateSelected={(date) => {
							onChange(date.toISOString().slice(0, 10));
							setOpen(false);
						}}
						onDismissRequest={() => setOpen(false)}
					/>
				) : null}
			</Host>
		</View>
	);
}

export function NativeTimePickerField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const { host, material } = useNativeHostProps();
	const { timeFormat } = useDisplayPrefs();
	const [open, setOpen] = useState(false);
	const initial = new Date();
	const [hours, minutes] = value.split(":").map(Number);
	initial.setHours(
		Number.isFinite(hours) ? hours : 9,
		Number.isFinite(minutes) ? minutes : 0,
		0,
		0,
	);
	const display = value
		? initial.toLocaleTimeString([], {
				hour: "numeric",
				minute: "2-digit",
				hour12: timeFormat !== "24h",
			})
		: "Choose time";
	return (
		<View style={{ gap: spacing.xs + 2 }}>
			<AppText variant="footnote" weight="600" tone="secondary">
				{label}
			</AppText>
			<Host
				{...host}
				matchContents={{ vertical: true }}
				style={styles.nativeHost}
			>
				<OutlinedButton
					onClick={() => setOpen(true)}
					modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 })]}
				>
					<MaterialText color={material.primary}>{display}</MaterialText>
				</OutlinedButton>
				{open ? (
					<TimePickerDialog
						initialDate={initial.toISOString()}
						elementColors={{
							timeSelectorSelectedContainerColor: material.primaryContainer,
							timeSelectorSelectedContentColor: material.onPrimaryContainer,
							clockDialSelectedContentColor: material.onPrimary,
						}}
						is24Hour={timeFormat === "24h"}
						confirmButtonLabel="Select"
						dismissButtonLabel="Cancel"
						onDateSelected={(date) => {
							onChange(
								`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
							);
							setOpen(false);
						}}
						onDismissRequest={() => setOpen(false)}
					/>
				) : null}
			</Host>
		</View>
	);
}

const styles = StyleSheet.create({
	nativeHost: { alignSelf: "stretch", width: "100%", minWidth: 0 },
	toggleHost: { width: 56, height: 48 },
	checkboxHost: { width: 48, height: 48 },
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 48,
	},
	checkboxRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		minHeight: 48,
	},
});
