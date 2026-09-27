import { Checkbox, Host, Switch } from "@expo/ui";
import type * as React from "react";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import NativeDateTimeField from "@/components/native-picker-field";
import { radius, spacing, type as typeRamp, useAppTheme } from "@/theme";
import { AppText } from "./text";

export { NativeDateTimeField };

const AUTOFILL: Record<
	string,
	{
		autoComplete: React.ComponentProps<typeof TextInput>["autoComplete"];
		textContentType: React.ComponentProps<typeof TextInput>["textContentType"];
	}
> = {
	email: { autoComplete: "email", textContentType: "emailAddress" },
	password: { autoComplete: "current-password", textContentType: "password" },
	"new-password": {
		autoComplete: "new-password",
		textContentType: "newPassword",
	},
};

function FieldLabel({ children, id }: { children: string; id?: string }) {
	return (
		<AppText
			nativeID={id}
			variant="footnote"
			weight="600"
			tone="secondary"
			style={{ paddingHorizontal: spacing.xxs }}
		>
			{children}
		</AppText>
	);
}

export function NativeField({
	label,
	value,
	onChange,
	placeholder,
	multiline = false,
	secureTextEntry = false,
	keyboardType,
	disabled,
	onSubmit,
	onNext,
	contentType,
	inputRef,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	multiline?: boolean;
	secureTextEntry?: boolean;
	keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
	disabled?: boolean;
	onSubmit?: () => void;
	/** Moves focus to the next field; shows a "next" return key. */
	onNext?: () => void;
	/** Autofill hint: "email", "password", or "new-password". */
	contentType?: string;
	inputRef?: React.RefObject<{ focus: () => unknown } | null>;
}) {
	const { theme } = useAppTheme();
	const [focused, setFocused] = useState(false);
	const id = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
	return (
		<View style={{ gap: spacing.xs + 2 }}>
			<FieldLabel id={id}>{label}</FieldLabel>
			<TextInput
				ref={inputRef as React.Ref<TextInput> | undefined}
				accessibilityLabel={label}
				accessibilityLabelledBy={id}
				value={value}
				onChangeText={onChange}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				onSubmitEditing={onNext ?? onSubmit}
				returnKeyType={onNext ? "next" : onSubmit ? "done" : undefined}
				submitBehavior={onNext ? "submit" : undefined}
				autoCapitalize={
					keyboardType === "email-address" || secureTextEntry
						? "none"
						: undefined
				}
				autoComplete={AUTOFILL[contentType ?? ""]?.autoComplete}
				textContentType={AUTOFILL[contentType ?? ""]?.textContentType}
				editable={!disabled}
				placeholder={placeholder}
				placeholderTextColor={theme.textTertiary}
				multiline={multiline}
				secureTextEntry={secureTextEntry}
				keyboardType={keyboardType}
				selectionColor={theme.primary}
				style={[
					typeRamp.body,
					{
						color: theme.text,
						backgroundColor: theme.surfaceMuted,
						borderColor: focused ? theme.primary : "transparent",
						borderWidth: 1.5,
						borderRadius: radius.md,
						borderCurve: "continuous",
						minHeight: 50,
						paddingHorizontal: spacing.md + 2,
						paddingVertical: spacing.md,
						opacity: disabled ? 0.5 : 1,
					},
					multiline && { minHeight: 104, textAlignVertical: "top" },
				]}
			/>
		</View>
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
	const { theme } = useAppTheme();
	return (
		<View
			accessibilityRole="radiogroup"
			style={{ flexDirection: "row", gap: spacing.xs + 2 }}
		>
			{DAY_NAMES.map((name, index) => {
				const selected = value === index;
				return (
					<Pressable
						key={name}
						accessibilityRole="radio"
						accessibilityLabel={name}
						accessibilityState={{ checked: selected }}
						onPress={() => onChange(index)}
						style={({ pressed }) => ({
							flex: 1,
							aspectRatio: 1,
							maxHeight: 48,
							minHeight: 40,
							borderRadius: radius.full,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: selected ? theme.primary : theme.surfaceMuted,
							opacity: pressed ? 0.7 : 1,
						})}
					>
						<AppText
							variant="callout"
							weight="600"
							color={selected ? theme.onPrimary : theme.text}
						>
							{name[0]}
						</AppText>
					</Pressable>
				);
			})}
		</View>
	);
}

export function NativeDatePickerField(props: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	minimumDate?: Date;
}) {
	return <NativeDateTimeField {...props} mode="date" />;
}

export function NativeTimePickerField(props: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return <NativeDateTimeField {...props} mode="time" />;
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
	const { theme, colorScheme } = useAppTheme();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "space-between",
				gap: spacing.md,
				minHeight: 48,
			}}
		>
			<AppText variant="body" style={{ flex: 1 }}>
				{label}
			</AppText>
			<Host
				matchContents
				colorScheme={colorScheme}
				seedColor={theme.primary}
				style={{ minHeight: 38, justifyContent: "center" }}
			>
				<Switch value={value} onValueChange={onChange} disabled={disabled} />
			</Host>
		</View>
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
	const { theme, colorScheme } = useAppTheme();
	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityLabel={label}
			accessibilityState={{ checked, disabled }}
			disabled={disabled}
			onPress={onChange}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.md,
				minHeight: 48,
			}}
		>
			<Host
				matchContents
				colorScheme={colorScheme}
				seedColor={theme.primary}
				style={{ minHeight: 38, justifyContent: "center" }}
			>
				<Checkbox
					value={checked}
					onValueChange={onChange}
					disabled={disabled}
				/>
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
