import { Host } from "@expo/ui";
import {
	DatePickerDialog,
	FilterChip,
	FlowRow,
	Button as MaterialButton,
	Checkbox as MaterialCheckbox,
	Switch as MaterialSwitch,
	Text as MaterialText,
	OutlinedButton,
	OutlinedTextField,
	TextButton,
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
	KeyboardAvoidingView,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
	type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NAV_THEME } from "@/lib/constants";
import { isoDate } from "@/lib/datetime";
import { useDisplayPrefs } from "@/lib/display";
import { useColorScheme } from "@/lib/use-color-scheme";

// Brand seeds (DESIGN.md) — derive the whole Material 3 palette from jooling blue
// so every native control (tabs, switches, buttons) matches the Workplace brand.
// SDK 57 universal Host re-exports Compose Host on Android, including its IME prop.
const NATIVE_KEYBOARD_INSETS = { ignoreSafeAreaKeyboardInsets: true };

export const BRAND_SEED = { light: "#2563EB", dark: "#7CA8FF" } as const;

export function useAppTheme() {
	const { colorScheme } = useColorScheme();
	const material = useMaterialColors({
		colorScheme,
		seedColor: colorScheme === "dark" ? BRAND_SEED.dark : BRAND_SEED.light,
	});
	return {
		theme: {
			background: material.background,
			border: material.outlineVariant,
			card: material.surfaceContainerLow,
			notification: material.error,
			onNotification: material.onError,
			primary: material.primary,
			onPrimary: material.onPrimary,
			muted: material.onSurfaceVariant,
			success: material.tertiary,
			onSuccess: material.onTertiary,
			text: material.onBackground,
		},
		material,
		colorScheme,
	} as const;
}

export type AppTheme = typeof NAV_THEME.light;

export function AppScreen({
	children,
	contentStyle,
	scroll = true,
	safeTop = true,
}: {
	children: React.ReactNode;
	contentStyle?: ViewStyle;
	scroll?: boolean;
	/** Set false when the route renders a native stack header above this screen. */
	safeTop?: boolean;
}) {
	const { theme } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const gutter = Math.max(16, (width - 720) / 2);
	const padding = {
		paddingTop: safeTop ? insets.top + 8 : 4,
		// Native tab bar lays content above it (no overlay): plain breathing room.
		paddingBottom: Math.max(24, insets.bottom + 16),
		paddingLeft: Math.max(gutter, insets.left + 16),
		paddingRight: Math.max(gutter, insets.right + 16),
	};
	if (!scroll)
		return (
			<View
				style={[
					styles.screen,
					{ backgroundColor: theme.background },
					padding,
					contentStyle,
				]}
			>
				{children}
			</View>
		);
	return (
		<KeyboardAvoidingView
			style={[styles.screen, { backgroundColor: theme.background }]}
			behavior="height"
			keyboardVerticalOffset={0}
		>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={[styles.content, padding, contentStyle]}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
			>
				{children}
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

export function PageHeader({
	title,
	subtitle,
	action,
}: {
	title: string;
	subtitle?: string;
	action?: React.ReactNode;
}) {
	const { theme } = useAppTheme();
	return (
		<View style={styles.header}>
			<View style={styles.headerRow}>
				<Text
					accessibilityRole="header"
					style={[styles.headline, { color: theme.text }]}
				>
					{title}
				</Text>
			</View>
			{subtitle ? (
				<Text style={[styles.description, { color: theme.muted }]}>
					{subtitle}
				</Text>
			) : null}
			{action ? (
				<View style={{ alignSelf: "stretch", marginTop: 8 }}>{action}</View>
			) : null}
		</View>
	);
}

// Keep RN screen content in the same Yoga layout tree. A Compose Card wrapping
// RNHostView with matchContents measures text without the screen's width constraint.
export function Card({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: ViewStyle;
}) {
	const { theme } = useAppTheme();
	return (
		<View
			style={[
				styles.cardContent,
				{ backgroundColor: theme.card, borderColor: theme.border },
				style,
			]}
		>
			{children}
		</View>
	);
}
export function FeatureCard({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: ViewStyle;
}) {
	const { theme } = useAppTheme();
	return (
		<View
			style={[
				styles.cardContent,
				{
					backgroundColor: theme.primary,
					borderColor: theme.primary,
					padding: 20,
					borderRadius: 20,
				},
				style,
			]}
		>
			{children}
		</View>
	);
}
export function NoticeRow({ children }: { children: React.ReactNode }) {
	return <Card style={{ padding: 16 }}>{children}</Card>;
}

export function CardTitle({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: import("react-native").TextStyle;
}) {
	const { theme } = useAppTheme();
	return (
		<Text
			accessibilityRole="header"
			style={[styles.cardTitle, { color: theme.text }, style]}
		>
			{children}
		</Text>
	);
}
export function Body({
	children,
	muted,
}: {
	children: React.ReactNode;
	muted?: boolean;
}) {
	const { theme } = useAppTheme();
	return (
		<Text style={[styles.body, { color: muted ? theme.muted : theme.text }]}>
			{children}
		</Text>
	);
}
export function Meta({
	children,
	color,
}: {
	children: React.ReactNode;
	color?: string;
}) {
	const { theme } = useAppTheme();
	return (
		<Text style={[styles.meta, { color: color ?? theme.muted }]}>
			{children}
		</Text>
	);
}
export function Hint({ children }: { children: React.ReactNode }) {
	return <Body muted>{children}</Body>;
}

export function Badge({
	label,
	variant = "outline",
}: {
	label: string;
	variant?: "default" | "outline" | "success" | "danger" | "amber";
}) {
	const { material } = useAppTheme();
	const colors =
		variant === "success"
			? [material.tertiaryContainer, material.onTertiaryContainer]
			: variant === "danger"
				? [material.errorContainer, material.onErrorContainer]
				: variant === "amber"
					? [material.secondaryContainer, material.onSecondaryContainer]
					: variant === "default"
						? [material.primaryContainer, material.onPrimaryContainer]
						: [material.surfaceContainerHigh, material.onSurface];
	return (
		<View style={[styles.badge, { backgroundColor: colors[0] }]}>
			<Text style={[styles.badgeText, { color: colors[1] }]}>{label}</Text>
		</View>
	);
}

function NativeButton({
	label,
	onPress,
	disabled,
	loading,
	outlined,
	text,
	style,
	textStyle,
	color,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	loading?: boolean;
	outlined?: boolean;
	text?: boolean;
	style?: ViewStyle;
	textStyle?: object;
	color?: string;
}) {
	const { colorScheme, theme } = useAppTheme();
	const Component = text
		? TextButton
		: outlined
			? OutlinedButton
			: MaterialButton;
	const viewStyle = StyleSheet.flatten(style) ?? {};
	const labelStyle = StyleSheet.flatten(textStyle) as
		| { color?: string; fontSize?: number; fontWeight?: "600" }
		| undefined;

	const labelColor =
		disabled || loading
			? theme.muted
			: (color ??
				labelStyle?.color ??
				(text || outlined ? theme.primary : theme.onPrimary));
	return (
		<View
			style={[text ? styles.inlineButton : styles.button, style]}
			accessibilityState={{ disabled: disabled || loading, busy: loading }}
		>
			<Host
				matchContents={{ vertical: true }}
				colorScheme={colorScheme}
				seedColor={BRAND_SEED[colorScheme]}
				{...NATIVE_KEYBOARD_INSETS}
				style={styles.nativeHost}
			>
				<Component
					enabled={!disabled && !loading}
					onClick={onPress}
					colors={{
						containerColor: viewStyle.backgroundColor,
						contentColor: color ?? labelStyle?.color,
					}}
					modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 })]}
				>
					<MaterialText
						color={labelColor}
						style={{
							textAlign: "center",
							fontSize: labelStyle?.fontSize,
							fontWeight: labelStyle?.fontWeight,
						}}
					>
						{loading ? `${label}…` : label}
					</MaterialText>
				</Component>
			</Host>
		</View>
	);
}
export function PrimaryButton(props: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	loading?: boolean;
	style?: ViewStyle;
	textStyle?: object;
}) {
	return <NativeButton {...props} />;
}
export function SecondaryButton(props: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	style?: ViewStyle;
}) {
	return <NativeButton {...props} outlined />;
}
export function GhostButton(props: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	color?: string;
}) {
	return <NativeButton {...props} text />;
}
export function Divider() {
	const { theme } = useAppTheme();
	return (
		<View
			style={{
				height: StyleSheet.hairlineWidth,
				backgroundColor: theme.border,
			}}
		/>
	);
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
	secureTextEntry,
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
	keyboardType?: "email" | "text" | "number";
	secureTextEntry?: boolean;
	contentType?: string;
	inputRef?: React.Ref<import("@expo/ui/jetpack-compose").TextFieldRef>;
	onSubmit?: () => void;
	onNext?: () => void;
	disabled?: boolean;
}) {
	const { colorScheme } = useAppTheme();
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
			colorScheme={colorScheme}
			seedColor={BRAND_SEED[colorScheme]}
			{...NATIVE_KEYBOARD_INSETS}
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
				visualTransformation={secureTextEntry ? "password" : "none"}
				keyboardOptions={{
					capitalization: multiline ? "sentences" : "none",
					imeAction: onSubmit ? "done" : multiline ? "default" : "next",
					keyboardType: secureTextEntry ? "password" : keyboardType,
					autoCorrectEnabled: !secureTextEntry && keyboardType !== "email",
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

export function NativeWeekdayPicker({
	value,
	onChange,
}: {
	value: number;
	onChange: (value: number) => void;
}) {
	const { colorScheme, material } = useAppTheme();
	const days = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	return (
		<Host
			matchContents={{ vertical: true }}
			colorScheme={colorScheme}
			seedColor={BRAND_SEED[colorScheme]}
			style={styles.nativeHost}
		>
			<FlowRow
				horizontalArrangement={{ spacedBy: 8 }}
				verticalArrangement={{ spacedBy: 8 }}
				modifiers={[fillMaxWidth()]}
			>
				{days.map((day, index) => (
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
	const { colorScheme, material } = useAppTheme();
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
			<Text style={[styles.rowLabel, { color: material.onBackground }]}>
				{label}
			</Text>
			<Host
				accessible={false}
				importantForAccessibility="no-hide-descendants"
				pointerEvents="none"
				matchContents
				colorScheme={colorScheme}
				seedColor={BRAND_SEED[colorScheme]}
				{...NATIVE_KEYBOARD_INSETS}
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
	const { colorScheme, material } = useAppTheme();
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
				colorScheme={colorScheme}
				seedColor={BRAND_SEED[colorScheme]}
				{...NATIVE_KEYBOARD_INSETS}
				style={styles.checkboxHost}
			>
				<MaterialCheckbox value={checked} enabled={!disabled} />
			</Host>
			<Text
				style={[
					styles.checkboxLabel,
					{
						color: checked ? material.onSurfaceVariant : material.onBackground,
						textDecorationLine: strikethrough ? "line-through" : "none",
					},
				]}
			>
				{label}
			</Text>
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
	const { colorScheme, material } = useAppTheme();
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
		<Host
			colorScheme={colorScheme}
			seedColor={BRAND_SEED[colorScheme]}
			{...NATIVE_KEYBOARD_INSETS}
			matchContents={{ vertical: true }}
			style={styles.nativeHost}
		>
			<OutlinedButton
				onClick={() => setOpen(true)}
				modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 })]}
			>
				<MaterialText
					color={material.primary}
				>{`${label}: ${display}`}</MaterialText>
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
	const { colorScheme, material } = useAppTheme();
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
	return (
		<Host
			colorScheme={colorScheme}
			seedColor={BRAND_SEED[colorScheme]}
			{...NATIVE_KEYBOARD_INSETS}
			matchContents={{ vertical: true }}
			style={styles.nativeHost}
		>
			<OutlinedButton
				onClick={() => setOpen(true)}
				modifiers={[fillMaxWidth(), defaultMinSize({ minHeight: 48 })]}
			>
				<MaterialText
					color={material.primary}
				>{`${label}: ${value ? initial.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: timeFormat !== "24h" }) : "Choose time"}`}</MaterialText>
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
	);
}
export function EmptyState({
	title,
	body,
	action,
}: {
	title: string;
	body: string;
	action?: React.ReactNode;
}) {
	return (
		<Card>
			<CardTitle>{title}</CardTitle>
			<Body muted>{body}</Body>
			{action}
		</Card>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1 },
	content: { flexGrow: 1, gap: 16 },
	header: { gap: 4, paddingVertical: 8 },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 32,
	},
	headline: {
		flex: 1,
		fontSize: 22,
		lineHeight: 28,
		fontWeight: "700",
	},
	description: { fontSize: 14, lineHeight: 20 },
	nativeHost: { alignSelf: "stretch", width: "100%", minWidth: 0 },
	button: { minWidth: 0, flexShrink: 1 },
	inlineButton: { alignSelf: "stretch", flexShrink: 1 },
	toggleHost: { width: 56, height: 48 },
	checkboxHost: { width: 48, height: 48 },
	badge: {
		alignSelf: "flex-start",
		flexShrink: 1,
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	badgeText: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
	cardContent: {
		padding: 16,
		gap: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		minWidth: 0,
	},
	cardTitle: { fontSize: 17, lineHeight: 24, fontWeight: "700" },
	body: { fontSize: 15, lineHeight: 22 },
	meta: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "600",
		textTransform: "uppercase",
	},
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 48,
	},
	rowLabel: {
		flex: 1,
		paddingRight: 12,
		fontSize: 15,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
	checkboxRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 48,
	},
	checkboxLabel: { fontSize: 15, fontWeight: "600", flex: 1 },
});
