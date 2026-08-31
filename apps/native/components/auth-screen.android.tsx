import { Button, Card, Column, Host, LoadingIndicator, OutlinedTextField, Spacer, Text, TextButton, useMaterialColors } from "@expo/ui/jetpack-compose";
import { fillMaxSize, fillMaxWidth, height, imePadding, padding, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { supabase } from "@/lib/supabase";
import { useColorScheme } from "@/lib/use-color-scheme";

type Mode = "sign-in" | "sign-up";

export function AuthScreen() {
	const { colorScheme } = useColorScheme();
	const colors = useMaterialColors({ colorScheme });
	const [mode, setMode] = useState<Mode>("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const valid = email.trim().length > 0 && password.length >= 6 && !submitting;

	async function submit() {
		setSubmitting(true);
		setError(null);
		setMessage(null);
		try {
			if (mode === "sign-in") {
				const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
				if (authError) throw authError;
			} else {
				const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
				if (authError) throw authError;
				if (!data.session) setMessage("Check your email to confirm your account, then sign in.");
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
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
		<Host useViewportSizeMeasurement colorScheme={colorScheme} style={styles.host}>
			<Column verticalArrangement="center" modifiers={[fillMaxSize(), imePadding(), padding(20, 32, 20, 24)]}>
				<Column modifiers={[fillMaxWidth(), padding(4, 0, 4, 24)]}>
					<Text color={colors.primary} style={{ typography: "titleMedium", fontWeight: "700" }}>jooling</Text>
					<Spacer modifiers={[height(12)]} />
					<Text color={colors.onBackground} style={{ typography: "headlineLarge", fontWeight: "700", lineBreak: "heading" }}>
						{mode === "sign-in" ? "Welcome back" : "Join your workplace"}
					</Text>
					<Spacer modifiers={[height(8)]} />
					<Text color={colors.onSurfaceVariant} style={{ typography: "bodyLarge", lineHeight: 24 }}>
						{mode === "sign-in" ? "Sign in to view your schedule, team messages, and shift updates." : "Create an account with the email used by your workplace."}
					</Text>
				</Column>

				<Card elevation={1} colors={{ containerColor: colors.surfaceContainerLow, contentColor: colors.onSurface }} modifiers={[fillMaxWidth()]}>
					<Column modifiers={[paddingAll(20)]}>
						<OutlinedTextField singleLine isError={Boolean(error)} keyboardOptions={{ keyboardType: "email", capitalization: "none", imeAction: "next" }} onValueChange={setEmail} modifiers={[fillMaxWidth()]}>
							<OutlinedTextField.Label><Text>Work email</Text></OutlinedTextField.Label>
							<OutlinedTextField.Placeholder><Text>name@company.com</Text></OutlinedTextField.Placeholder>
						</OutlinedTextField>
						<Spacer modifiers={[height(16)]} />
						<OutlinedTextField singleLine isError={Boolean(error)} visualTransformation="password" keyboardOptions={{ keyboardType: "password", capitalization: "none", imeAction: "done" }} keyboardActions={{ onDone: () => { if (valid) void submit(); } }} onValueChange={setPassword} modifiers={[fillMaxWidth()]}>
							<OutlinedTextField.Label><Text>Password</Text></OutlinedTextField.Label>
							{mode === "sign-up" ? <OutlinedTextField.SupportingText><Text>Use at least 6 characters</Text></OutlinedTextField.SupportingText> : null}
						</OutlinedTextField>
						{error ? <><Spacer modifiers={[height(12)]} /><Text color={colors.error} style={{ typography: "bodyMedium" }}>{error}</Text></> : null}
						{message ? <><Spacer modifiers={[height(12)]} /><Text color={colors.onSurface} style={{ typography: "bodyMedium" }}>{message}</Text></> : null}
						<Spacer modifiers={[height(20)]} />
						{submitting ? <LoadingIndicator modifiers={[fillMaxWidth()]} /> : <Button enabled={valid} onClick={() => void submit()} modifiers={[fillMaxWidth()]}><Text>{mode === "sign-in" ? "Sign in" : "Create account"}</Text></Button>}
					</Column>
				</Card>
				<Spacer modifiers={[height(12)]} />
				<TextButton onClick={changeMode} modifiers={[fillMaxWidth()]}><Text>{mode === "sign-in" ? "New to jooling? Create account" : "Already have an account? Sign in"}</Text></TextButton>
				<Text color={colors.onSurfaceVariant} style={{ typography: "bodySmall", textAlign: "center", lineHeight: 18 }} modifiers={[fillMaxWidth(), padding(12, 4, 12, 0)]}>Secure access for managers and team members</Text>
			</Column>
		</Host>
	);
}

const styles = StyleSheet.create({ host: { flex: 1 } });
