import {
	Host,
	Badge as MaterialBadge,
	Button as MaterialButton,
	Card as MaterialCard,
	DatePickerDialog,
	Text as MaterialText,
	OutlinedButton,
	OutlinedTextField,
	RNHostView,
	SegmentedButton,
	SingleChoiceSegmentedButtonRow,
	TextButton,
	TimePickerDialog,
	useNativeState,
	useMaterialColors,
} from "@expo/ui/jetpack-compose";
import type * as React from "react";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NAV_THEME } from "@/lib/constants";
import { useColorScheme } from "@/lib/use-color-scheme";

export function useAppTheme() {
	const { colorScheme } = useColorScheme();
	const material = useMaterialColors({ colorScheme });
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
}: {
	children: React.ReactNode;
	contentStyle?: ViewStyle;
	scroll?: boolean;
}) {
	const { theme } = useAppTheme();
	const insets = useSafeAreaInsets();
	const padding = {
		paddingTop: insets.top + 16,
		paddingBottom: insets.bottom + 80,
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
		<KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={[styles.content, padding, contentStyle]}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
				automaticallyAdjustKeyboardInsets
			>
				{children}
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

export function PageHeader({
	title,
	description,
	action,
	eyebrow,
}: {
	title: string;
	description?: string;
	action?: React.ReactNode;
	eyebrow?: string;
}) {
	const { theme } = useAppTheme();
	return (
		<View style={styles.header}>
			{eyebrow ? (
				<Text style={[styles.eyebrow, { color: theme.primary }]}>
					{eyebrow}
				</Text>
			) : null}
			<Text
				accessibilityRole="header"
				style={[styles.headline, { color: theme.text }]}
			>
				{title}
			</Text>
			{description ? (
				<Text style={[styles.description, { color: theme.muted }]}>
					{description}
				</Text>
			) : null}
			{action}
		</View>
	);
}

function NativeSurface({
	children,
	color,
}: {
	children: React.ReactNode;
	color?: string;
}) {
	const { colorScheme } = useAppTheme();
	return (
		<Host matchContents colorScheme={colorScheme} style={styles.nativeHost}>
			<MaterialCard
				colors={
					color ? { containerColor: color, contentColor: "#FFFFFF" } : undefined
				}
				elevation={0}
			>
				<RNHostView matchContents>
					<View style={styles.cardContent}>{children}</View>
				</RNHostView>
			</MaterialCard>
		</Host>
	);
}

export function Card({
	children,
}: {
	children: React.ReactNode;
	style?: ViewStyle;
}) {
	return <NativeSurface>{children}</NativeSurface>;
}
export function FeatureCard({
	children,
}: {
	children: React.ReactNode;
	style?: ViewStyle;
}) {
	const { material } = useAppTheme();
	return <NativeSurface color={material.primary}>{children}</NativeSurface>;
}
export function NoticeRow({ children }: { children: React.ReactNode }) {
	return <NativeSurface>{children}</NativeSurface>;
}

export function CardTitle({
	children,
}: {
	children: React.ReactNode;
	style?: ViewStyle;
}) {
	const { theme } = useAppTheme();
	return (
		<Text style={[styles.cardTitle, { color: theme.text }]}>{children}</Text>
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
	const { colorScheme, material } = useAppTheme();
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
		<Host matchContents colorScheme={colorScheme}>
			<MaterialBadge containerColor={colors[0]} contentColor={colors[1]}>
				<MaterialText>{label}</MaterialText>
			</MaterialBadge>
		</Host>
	);
}

function NativeButton({
	label,
	onPress,
	disabled,
	outlined,
	text,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	outlined?: boolean;
	text?: boolean;
}) {
	const { colorScheme } = useAppTheme();
	const Component = text
		? TextButton
		: outlined
			? OutlinedButton
			: MaterialButton;
	return (
		<Host
			matchContents={{ vertical: true, horizontal: false }}
			colorScheme={colorScheme}
			style={styles.nativeHost}
		>
			<Component enabled={!disabled} onClick={onPress}>
				<MaterialText>{label}</MaterialText>
			</Component>
		</Host>
	);
}

export function PrimaryButton({
	label,
	onPress,
	disabled,
	loading,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	loading?: boolean;
	style?: ViewStyle;
	textStyle?: object;
}) {
	return loading ? (
		<ActivityIndicator />
	) : (
		<NativeButton label={label} onPress={onPress} disabled={disabled} />
	);
}
export function SecondaryButton({
	label,
	onPress,
	disabled,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	style?: ViewStyle;
}) {
	return (
		<NativeButton
			label={label}
			onPress={onPress}
			disabled={disabled}
			outlined
		/>
	);
}
export function GhostButton({
	label,
	onPress,
	disabled,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	color?: string;
}) {
	return (
		<NativeButton label={label} onPress={onPress} disabled={disabled} text />
	);
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

export function NativeField({
	label, value, onChange, placeholder, multiline = false,
}: {
	label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean;
}) {
	const { colorScheme } = useAppTheme();
	const nativeValue = useNativeState(value);
	useEffect(() => {
		nativeValue.value = value;
	}, [nativeValue, value]);
	return (
		<Host matchContents={{ vertical: true, horizontal: false }} colorScheme={colorScheme} style={styles.nativeHost}>
			<OutlinedTextField value={nativeValue} singleLine={!multiline} minLines={multiline ? 3 : 1} maxLines={multiline ? 5 : 1} keyboardOptions={{ capitalization: multiline ? "sentences" : "none", imeAction: multiline ? "default" : "next" }} onValueChange={onChange} modifiers={[fillMaxWidth()]}> 
				<OutlinedTextField.Label><MaterialText>{label}</MaterialText></OutlinedTextField.Label>
				{placeholder ? <OutlinedTextField.Placeholder><MaterialText>{placeholder}</MaterialText></OutlinedTextField.Placeholder> : null}
			</OutlinedTextField>
		</Host>
	);
}

export function NativeWeekdayPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
	const { colorScheme } = useAppTheme();
	const days = ["S", "M", "T", "W", "T", "F", "S"];
	return (
		<Host matchContents={{ vertical: true, horizontal: false }} colorScheme={colorScheme} style={styles.nativeHost}>
			<SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
				{days.map((day, index) => (
					<SegmentedButton key={`${day}-${index}`} selected={value === index} onClick={() => onChange(index)}>
						<SegmentedButton.Label><MaterialText>{day}</MaterialText></SegmentedButton.Label>
					</SegmentedButton>
				))}
			</SingleChoiceSegmentedButtonRow>
		</Host>
	);
}

export function NativeDatePickerField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	const { colorScheme, material } = useAppTheme();
	const [open, setOpen] = useState(false);
	const display = value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Choose date";
	return (
		<Host colorScheme={colorScheme} style={styles.pickerHost}>
			<OutlinedButton onClick={() => setOpen(true)} modifiers={[fillMaxWidth()]}><MaterialText>{`${label}: ${display}`}</MaterialText></OutlinedButton>
			{open ? <DatePickerDialog initialDate={value ? new Date(`${value}T12:00:00`).toISOString() : new Date().toISOString()} color={material.primary} confirmButtonLabel="Select" dismissButtonLabel="Cancel" onDateSelected={(date) => { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); onChange(`${year}-${month}-${day}`); setOpen(false); }} onDismissRequest={() => setOpen(false)} /> : null}
		</Host>
	);
}

export function NativeTimePickerField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
	const { colorScheme, material } = useAppTheme();
	const [open, setOpen] = useState(false);
	const initial = new Date();
	const [hours, minutes] = value.split(":").map(Number);
	initial.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
	return (
		<Host colorScheme={colorScheme} style={styles.pickerHost}>
			<OutlinedButton onClick={() => setOpen(true)} modifiers={[fillMaxWidth()]}><MaterialText>{`${label}: ${value}`}</MaterialText></OutlinedButton>
			{open ? <TimePickerDialog initialDate={initial.toISOString()} color={material.primary} is24Hour={false} confirmButtonLabel="Select" dismissButtonLabel="Cancel" onDateSelected={(date) => { onChange(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`); setOpen(false); }} onDismissRequest={() => setOpen(false)} /> : null}
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
	content: { paddingHorizontal: 20, gap: 16 },
	header: { gap: 6, marginBottom: 2 },
	eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
	headline: { fontSize: 30, lineHeight: 36, fontWeight: "800" },
	description: { fontSize: 14, lineHeight: 20 },
	nativeHost: { alignSelf: "stretch" },
	pickerHost: { alignSelf: "stretch", height: 52 },
	cardContent: { padding: 16, gap: 12, minWidth: "100%" },
	cardTitle: { fontSize: 17, lineHeight: 24, fontWeight: "700" },
	body: { fontSize: 14, lineHeight: 21 },
	meta: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "600",
		textTransform: "uppercase",
	},
});
