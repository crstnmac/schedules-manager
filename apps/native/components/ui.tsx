import type * as React from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NAV_THEME } from "@/lib/constants";
import { useColorScheme } from "@/lib/use-color-scheme";

// ── Theme ────────────────────────────────────────────────────────────────
export function useAppTheme() {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	return { theme, colorScheme } as const;
}

export type AppTheme = typeof NAV_THEME.light;

// ── Layout: Page ─────────────────────────────────────────────────────────
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
	const topPad = insets.top + 16;
	// Floating pill bottom nav is absolute: 64px bar + 12px outer + gap + safe area
	const bottomPad = insets.bottom + 88;

	if (!scroll) {
		return (
			<View
				style={[
					{
						flex: 1,
						backgroundColor: theme.background,
						paddingTop: topPad,
						paddingBottom: bottomPad,
					},
					contentStyle,
				]}
			>
				{children}
			</View>
		);
	}
	return (
		<KeyboardAvoidingView
			style={{ flex: 1, backgroundColor: theme.background }}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={[
					styles.pageContent,
					{ paddingTop: topPad, paddingBottom: bottomPad },
					contentStyle,
				]}
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
	eyebrow?: string;
	action?: React.ReactNode;
}) {
	const { theme } = useAppTheme();
	return (
		<View style={styles.header}>
			{eyebrow ? (
				<Text style={[styles.eyebrow, { color: theme.primary }]}>
					{eyebrow}
				</Text>
			) : null}
			<Text style={[styles.headline, { color: theme.text }]}>{title}</Text>
			{description ? (
				<Text style={[styles.description, { color: theme.muted }]}>
					{description}
				</Text>
			) : null}
			{action ? <View style={{ marginTop: 4 }}>{action}</View> : null}
		</View>
	);
}

// ── Cards ────────────────────────────────────────────────────────────────
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
				styles.card,
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
			style={[styles.featureCard, { backgroundColor: theme.primary }, style]}
		>
			{children}
		</View>
	);
}

// inline notice row (I saw this) – keeps border but tighter
export function NoticeRow({ children }: { children: React.ReactNode }) {
	const { theme } = useAppTheme();
	return (
		<View
			style={[
				styles.notice,
				{ backgroundColor: theme.card, borderColor: theme.border },
			]}
		>
			{children}
		</View>
	);
}

// ── Typography helpers ─────────────────────────────────────────────────
export function CardTitle({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: ViewStyle;
}) {
	const { theme } = useAppTheme();
	return (
		<Text
			style={[
				styles.cardTitle,
				{ color: theme.text },
				style as unknown as object,
			]}
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
	const { theme } = useAppTheme();
	return <Text style={[styles.hint, { color: theme.muted }]}>{children}</Text>;
}

// ── Badge ────────────────────────────────────────────────────────────────
export function Badge({
	label,
	variant = "outline",
}: {
	label: string;
	variant?: "default" | "outline" | "success" | "danger" | "amber";
}) {
	const { theme } = useAppTheme();
	const map: Record<string, { bg: string; fg: string; border: string }> = {
		default: { bg: theme.primary, fg: theme.onPrimary, border: theme.primary },
		outline: { bg: "transparent", fg: theme.text, border: theme.border },
		success: { bg: theme.success, fg: theme.onSuccess, border: theme.success },
		danger: {
			bg: theme.notification,
			fg: theme.onNotification,
			border: theme.notification,
		},
		amber: {
			bg: theme.warning,
			fg: theme.onWarning,
			border: theme.warningBorder,
		},
	};
	const c = map[variant] ?? map.outline;
	return (
		<View
			style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}
		>
			<Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
		</View>
	);
}

// ── Buttons ────────────────────────────────────────────────────────────
export function PrimaryButton({
	label,
	onPress,
	disabled,
	loading,
	style,
	textStyle,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	loading?: boolean;
	style?: ViewStyle;
	textStyle?: object;
}) {
	const { theme } = useAppTheme();
	return (
		<Pressable
			accessibilityRole="button"
			disabled={disabled || loading}
			onPress={onPress}
			style={({ pressed }) => [
				styles.primaryButton,
				{
					backgroundColor: theme.primary,
					opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
				},
				style,
			]}
		>
			{loading ? (
				<ActivityIndicator color={theme.onPrimary} />
			) : (
				<Text
					style={[
						styles.primaryButtonText,
						{ color: theme.onPrimary },
						textStyle,
					]}
				>
					{label}
				</Text>
			)}
		</Pressable>
	);
}

export function SecondaryButton({
	label,
	onPress,
	disabled,
	style,
	textStyle,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	style?: ViewStyle;
	textStyle?: object;
}) {
	const { theme } = useAppTheme();
	return (
		<Pressable
			accessibilityRole="button"
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.secondaryButton,
				{
					borderColor: theme.border,
					opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
				},
				style,
			]}
		>
			<Text style={[styles.secondaryText, { color: theme.text }, textStyle]}>
				{label}
			</Text>
		</Pressable>
	);
}

export function GhostButton({
	label,
	onPress,
	disabled,
	color,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	color?: string;
}) {
	const { theme } = useAppTheme();
	return (
		<Pressable
			accessibilityRole="button"
			disabled={disabled}
			onPress={onPress}
			hitSlop={8}
			style={({ pressed }) => [
				{
					opacity: pressed ? 0.55 : 1,
					minHeight: 44,
					justifyContent: "center",
				},
			]}
		>
			<Text style={[styles.ghostText, { color: color ?? theme.primary }]}>
				{label}
			</Text>
		</Pressable>
	);
}

// ── Dividers / Empty ───────────────────────────────────────────────────
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
	label,
	value,
	onChange,
	placeholder,
	multiline = false,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	multiline?: boolean;
}) {
	const { theme } = useAppTheme();
	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={theme.muted}
				multiline={multiline}
				style={[
					styles.nativeField,
					multiline && { minHeight: 96, textAlignVertical: "top" },
					{ color: theme.text, borderColor: theme.border },
				]}
			/>
		</View>
	);
}

export function NativeWeekdayPicker({
	value,
	onChange,
}: {
	value: number;
	onChange: (value: number) => void;
}) {
	const { theme } = useAppTheme();
	return (
		<View style={styles.weekRow}>
			{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
				<Pressable
					key={`${day}-${index}`}
					accessibilityRole="radio"
					accessibilityState={{ checked: value === index }}
					onPress={() => onChange(index)}
					style={[
						styles.dayButton,
						{
							borderColor: value === index ? theme.primary : theme.border,
							backgroundColor: value === index ? theme.primary : "transparent",
						},
					]}
				>
					<Text
						style={{
							color: value === index ? theme.onPrimary : theme.text,
							fontWeight: "700",
						}}
					>
						{day}
					</Text>
				</Pressable>
			))}
		</View>
	);
}

export function NativeDatePickerField(props: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return <NativeField {...props} placeholder="YYYY-MM-DD" />;
}

export function NativeTimePickerField(props: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return <NativeField {...props} placeholder="HH:mm" />;
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
	const { theme } = useAppTheme();
	return (
		<Card>
			<Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
			<Text style={[styles.body, { color: theme.muted }]}>{body}</Text>
			{action ? <View style={{ marginTop: 4 }}>{action}</View> : null}
		</Card>
	);
}

// shared styles – values from DESIGN.md
const styles = StyleSheet.create({
	pageContent: { padding: 20, paddingBottom: 40, gap: 16 },
	header: { gap: 6, marginBottom: 2 },
	eyebrow: {
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 1.1,
		textTransform: "uppercase",
	},
	headline: {
		fontSize: 30,
		lineHeight: 36,
		fontWeight: "800",
		letterSpacing: -0.6,
	},
	description: { fontSize: 14, lineHeight: 20 },
	card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
	featureCard: { borderRadius: 18, padding: 22, gap: 4 },
	notice: {
		borderWidth: 1,
		borderRadius: 14,
		padding: 14,
		gap: 12,
		flexDirection: "row",
		alignItems: "center",
	},
	cardTitle: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
	body: { fontSize: 14, lineHeight: 21 },
	meta: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "600",
		textTransform: "uppercase",
	},
	hint: { fontSize: 13, lineHeight: 19 },
	badge: {
		alignSelf: "flex-start",
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
	},
	badgeText: {
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 0.3,
		textTransform: "uppercase",
	},
	primaryButton: {
		minHeight: 46,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	primaryButtonText: { fontSize: 15, fontWeight: "700" },
	secondaryButton: {
		minHeight: 46,
		borderWidth: 1,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
		backgroundColor: "transparent",
	},
	secondaryText: { fontSize: 15, fontWeight: "600" },
	ghostText: { fontSize: 13, fontWeight: "700" },
	fieldLabel: { fontSize: 13, fontWeight: "600" },
	nativeField: {
		minHeight: 52,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 16,
	},
	weekRow: { flexDirection: "row", gap: 6 },
	dayButton: {
		flex: 1,
		minHeight: 44,
		borderWidth: 1,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
});
