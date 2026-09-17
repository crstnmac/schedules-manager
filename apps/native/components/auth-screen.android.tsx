import type { TextFieldRef } from "@expo/ui/jetpack-compose";
import { useRef, useState } from "react";
import {
	Image,
	Linking,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	AppScreen,
	Card,
	GhostButton,
	NativeCheckboxRow,
	NativeField,
	PrimaryButton,
	useAppTheme,
} from "@/components/ui.android";
import { authClient } from "@/lib/auth-client";
import { LEGAL_LINKS, recordLegalAcceptance } from "@/lib/legal";

type Mode = "sign-in" | "sign-up";

export function AuthScreen() {
	const { theme } = useAppTheme();
	const passwordRef = useRef<TextFieldRef>(null);
	const [mode, setMode] = useState<Mode>("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [agreedToTerms, setAgreedToTerms] = useState(false);
	const valid =
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
		password.length >= (mode === "sign-up" ? 6 : 1) &&
		!submitting &&
		(mode === "sign-in" || agreedToTerms);

	async function submit() {
		if (!valid) return;
		setSubmitting(true);
		setError(null);
		setMessage(null);
		try {
			const normalizedEmail = email.trim().toLowerCase();
			if (mode === "sign-in") {
				const { error: authError } = await authClient.signIn.email({
					email: normalizedEmail,
					password,
				});
				if (authError) throw authError;
			} else {
				const { error: authError } = await authClient.signUp.email({
					name: normalizedEmail.split("@")[0] || "jooling user",
					email: normalizedEmail,
					password,
				});
				if (authError) throw authError;
				// Proof of consent for the Terms accepted above.
				await recordLegalAcceptance("terms", "mobile-sign-up");
				setMessage("Your account is ready.");
			}
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Something went wrong. Please try again.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	function changeMode() {
		setMode(mode === "sign-in" ? "sign-up" : "sign-in");
		setError(null);
		setMessage(null);
	}

	return (
		<AppScreen
			contentStyle={{
				justifyContent: "center",
				paddingTop: 64,
				paddingBottom: 32,
			}}
		>
			<View style={styles.content}>
				<View style={{ gap: 12 }}>
					<Image
						source={require("@/assets/images/logo-mark.png")}
						style={styles.logo}
						accessibilityLabel="jooling"
					/>
					<Text style={[styles.brand, { color: theme.primary }]}>jooling</Text>
					<Text
						accessibilityRole="header"
						style={[styles.title, { color: theme.text }]}
					>
						{mode === "sign-in" ? "Welcome back" : "Join your workplace"}
					</Text>
					<Text style={[styles.body, { color: theme.muted }]}>
						{mode === "sign-in"
							? "Sign in to view your schedule, team messages, and shift updates."
							: "Create an account with the email used by your workplace."}
					</Text>
				</View>
				<Card style={{ gap: 16 }}>
					<NativeField
						label="Work email"
						value={email}
						onChange={setEmail}
						placeholder="name@company.com"
						keyboardType="email-address"
						contentType="email"
						onNext={() => void passwordRef.current?.focus()}
						disabled={submitting}
					/>
					<NativeField
						label="Password"
						value={password}
						onChange={setPassword}
						secureTextEntry
						contentType={mode === "sign-up" ? "new-password" : "password"}
						inputRef={passwordRef}
						onSubmit={() => void submit()}
						disabled={submitting}
					/>
					{mode === "sign-up" ? (
						<>
							<Text style={[styles.helper, { color: theme.muted }]}>
								Use at least 6 characters.
							</Text>
							<NativeCheckboxRow
								label="I agree to the Terms & Conditions and Privacy Policy."
								checked={agreedToTerms}
								onChange={() => setAgreedToTerms(!agreedToTerms)}
								disabled={submitting}
							/>
						</>
					) : null}
					{error ? (
						<Text
							selectable
							accessibilityRole="alert"
							accessibilityLiveRegion="assertive"
							style={[styles.helper, { color: theme.notification }]}
						>
							{error}
						</Text>
					) : null}
					{message ? (
						<Text
							selectable
							accessibilityLiveRegion="polite"
							style={[styles.helper, { color: theme.text }]}
						>
							{message}
						</Text>
					) : null}
					<PrimaryButton
						label={mode === "sign-in" ? "Sign in" : "Create account"}
						disabled={!valid}
						loading={submitting}
						onPress={() => void submit()}
					/>
				</Card>
				<GhostButton
					label={
						mode === "sign-in"
							? "New to jooling? Create account"
							: "Already have an account? Sign in"
					}
					disabled={submitting}
					onPress={changeMode}
				/>
				<View style={styles.legalLinks}>
					{LEGAL_LINKS.map((link) => (
						<Pressable
							key={link.label}
							accessibilityRole="link"
							accessibilityLabel={link.label}
							onPress={() => void Linking.openURL(link.url)}
							style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
						>
							<Text style={[styles.legalLinkText, { color: theme.muted }]}>
								{link.label}
							</Text>
						</Pressable>
					))}
				</View>
				<Text
					style={[styles.helper, { color: theme.muted, textAlign: "center" }]}
				>
					Secure access for managers and team members
				</Text>
			</View>
		</AppScreen>
	);
}
const styles = StyleSheet.create({
	content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: 24 },
	logo: { width: 56, height: 56 },
	brand: { fontSize: 18, fontWeight: "700" },
	title: { fontSize: 30, lineHeight: 38, fontWeight: "700" },
	body: { fontSize: 16, lineHeight: 24 },
	helper: { fontSize: 14, lineHeight: 20 },
	legalLinks: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 14,
	},
	legalLinkText: { fontSize: 13, textDecorationLine: "underline" },
});
