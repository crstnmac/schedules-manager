import { useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { LogoMark } from "@/components/logo-mark";
import {
	Appear,
	AppText,
	Button,
	Callout,
	Card,
	NativeCheckboxRow,
	NativeField,
	Screen,
} from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { LEGAL_LINKS, recordLegalAcceptance } from "@/lib/legal";
import { radius, spacing, useAppTheme } from "@/theme";

type Mode = "sign-in" | "sign-up";

export function AuthScreen() {
	const { theme } = useAppTheme();
	const passwordRef = useRef<{ focus: () => unknown }>(null);
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
		<Screen headerless contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
			<View
				style={{
					width: "100%",
					maxWidth: 440,
					alignSelf: "center",
					gap: spacing.xxl,
				}}
			>
				<Appear style={{ gap: spacing.md }}>
					<View
						style={{
							width: 64,
							height: 64,
							borderRadius: radius.lg + 2,
							borderCurve: "continuous",
							backgroundColor: theme.surface,
							alignItems: "center",
							justifyContent: "center",
							boxShadow: theme.raisedShadow,
						}}
					>
						<LogoMark size={44} />
					</View>
					<View style={{ gap: spacing.xs }}>
						<AppText variant="overline" tone="tint">
							jooling
						</AppText>
						<AppText variant="title1" accessibilityRole="header">
							{mode === "sign-in" ? "Welcome back" : "Join your workplace"}
						</AppText>
						<AppText variant="body" tone="secondary">
							{mode === "sign-in"
								? "Sign in to see your shifts, clock in, and get schedule updates."
								: "Create an account with the email your workplace uses."}
						</AppText>
					</View>
				</Appear>

				<Appear index={1}>
					<Card style={{ gap: spacing.lg, padding: spacing.xl }}>
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
							<View style={{ gap: spacing.xs }}>
								<AppText variant="footnote" tone="secondary">
									Use at least 6 characters.
								</AppText>
								<NativeCheckboxRow
									label="I agree to the Terms & Conditions and Privacy Policy."
									checked={agreedToTerms}
									onChange={() => setAgreedToTerms(!agreedToTerms)}
									disabled={submitting}
								/>
							</View>
						) : null}
						{error ? (
							<Callout
								tone="danger"
								title="Couldn’t sign you in"
								body={error}
							/>
						) : null}
						{message ? <Callout tone="success" title={message} /> : null}
						<Button
							label={mode === "sign-in" ? "Sign in" : "Create account"}
							size="lg"
							disabled={!valid}
							loading={submitting}
							onPress={() => void submit()}
						/>
					</Card>
				</Appear>

				<View style={{ alignItems: "center", gap: spacing.md }}>
					<Button
						variant="ghost"
						label={
							mode === "sign-in"
								? "New to jooling? Create an account"
								: "Already have an account? Sign in"
						}
						disabled={submitting}
						onPress={changeMode}
					/>
					<View
						style={{
							flexDirection: "row",
							flexWrap: "wrap",
							justifyContent: "center",
							columnGap: spacing.lg,
							rowGap: spacing.xs,
						}}
					>
						{LEGAL_LINKS.map((link) => (
							<Pressable
								key={link.label}
								accessibilityRole="link"
								accessibilityLabel={link.label}
								hitSlop={8}
								onPress={() => void Linking.openURL(link.url)}
								style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
							>
								<AppText variant="caption" tone="tertiary">
									{link.label}
								</AppText>
							</Pressable>
						))}
					</View>
				</View>
			</View>
		</Screen>
	);
}
