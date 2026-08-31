import { useState } from "react";
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
} from "react-native";

import { NAV_THEME } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Mode = "sign-in" | "sign-up";

export function AuthScreen() {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();
	const [mode, setMode] = useState<Mode>("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	async function submit() {
		setError(null);
		setMessage(null);
		setIsSubmitting(true);
		try {
			if (mode === "sign-in") {
				const { error: authError } = await supabase.auth.signInWithPassword({
					email: email.trim(),
					password,
				});
				if (authError) throw authError;
			} else {
				const { data, error: authError } = await supabase.auth.signUp({
					email: email.trim(),
					password,
				});
				if (authError) throw authError;
				if (!data.session)
					setMessage("Check your email to confirm your account, then sign in.");
			}
		} catch (caughtError) {
			setError(
				caughtError instanceof Error
					? caughtError.message
					: "Something went wrong. Please try again.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	const canSubmit =
		email.trim().length > 0 && password.length >= 6 && !isSubmitting;

	return (
		<KeyboardAvoidingView
			style={[styles.screen, { backgroundColor: theme.background }]}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				contentContainerStyle={[
					styles.scrollContent,
					{ paddingTop: Math.max(insets.top, 12) + 16, paddingBottom: Math.max(insets.bottom, 16) + 16 },
				]}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
				automaticallyAdjustKeyboardInsets
			>
				<View
					style={[
						styles.card,
						{ backgroundColor: theme.card, borderColor: theme.border },
					]}
				>
					<Text style={[styles.brand, { color: theme.primary }]}>
						jooling
					</Text>
					<Text style={[styles.title, { color: theme.text }]}>
						{mode === "sign-in" ? "Welcome back" : "Create your account"}
					</Text>
					<Text style={[styles.description, { color: theme.muted }]}>
						{mode === "sign-in"
							? "Sign in to see your Published Schedule — the source of truth for your Shifts."
							: "Use the email connected to your Workplace."}
					</Text>

					<Text style={[styles.label, { color: theme.text }]}>Email</Text>
					<TextInput
						style={[
							styles.input,
							{ borderColor: theme.border, color: theme.text },
						]}
						value={email}
						onChangeText={setEmail}
						autoCapitalize="none"
						autoComplete="email"
						keyboardType="email-address"
						textContentType="emailAddress"
						placeholder="you@example.com"
						placeholderTextColor={`${theme.text}80`}
						returnKeyType="next"
					/>

					<Text style={[styles.label, { color: theme.text }]}>Password</Text>
					<TextInput
						style={[
							styles.input,
							{ borderColor: theme.border, color: theme.text },
						]}
						value={password}
						onChangeText={setPassword}
						autoCapitalize="none"
						autoComplete={
							mode === "sign-in" ? "current-password" : "new-password"
						}
						textContentType={mode === "sign-in" ? "password" : "newPassword"}
						secureTextEntry
						returnKeyType="done"
						onSubmitEditing={() => {
							if (canSubmit) void submit();
						}}
					/>

					{error ? (
						<Text
							accessibilityRole="alert"
							style={[styles.error, { color: theme.notification }]}
						>
							{error}
						</Text>
					) : null}
					{message ? (
						<Text style={[styles.message, { color: theme.text }]}>
							{message}
						</Text>
					) : null}

					<Pressable
						accessibilityRole="button"
						disabled={!canSubmit}
						onPress={submit}
						style={({ pressed }) => [
							styles.primaryButton,
							{
								backgroundColor: theme.primary,
								opacity: !canSubmit ? 0.45 : pressed ? 0.8 : 1,
							},
						]}
					>
						{isSubmitting ? (
							<ActivityIndicator color={theme.onPrimary} />
						) : (
							<Text
								style={[styles.primaryButtonText, { color: theme.onPrimary }]}
							>
								{mode === "sign-in" ? "Sign in" : "Create account"}
							</Text>
						)}
					</Pressable>

					<Pressable
						accessibilityRole="button"
						onPress={() => {
							setMode(mode === "sign-in" ? "sign-up" : "sign-in");
							setError(null);
							setMessage(null);
						}}
						style={({ pressed }) => [
							styles.secondaryButton,
							{ opacity: pressed ? 0.6 : 1 },
						]}
					>
						<Text style={[styles.secondaryText, { color: theme.text }]}>
							{mode === "sign-in"
								? "New here? Create an account"
								: "Already have an account? Sign in"}
						</Text>
					</Pressable>
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1 },
	scrollContent: { flexGrow: 1, justifyContent: "center", padding: 20 },
	card: {
		width: "100%",
		maxWidth: 440,
		alignSelf: "center",
		borderWidth: 1,
		borderRadius: 14,
		padding: 20,
		gap: 2,
	},
	brand: { fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
	title: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.6, marginTop: 8 },
	description: {
		fontSize: 14,
		lineHeight: 20,
		marginTop: 6,
		marginBottom: 20,
	},
	label: { fontSize: 13, fontWeight: "700", marginBottom: 6, marginTop: 10 },
	input: {
		minHeight: 46,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 14,
		fontSize: 16,
	},
	error: { fontSize: 13, lineHeight: 19, marginTop: 12 },
	message: { fontSize: 13, lineHeight: 19, marginTop: 12 },
	primaryButton: {
		minHeight: 46,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
		marginTop: 18,
	},
	primaryButtonText: { fontSize: 15, fontWeight: "700" },
	secondaryButton: {
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 8,
		paddingHorizontal: 8,
	},
	secondaryText: { fontSize: 14, fontWeight: "600", textAlign: "center" },
});
