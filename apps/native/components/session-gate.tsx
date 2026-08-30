import { useQueryClient } from "@tanstack/react-query";
import { type PropsWithChildren, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

import { AuthScreen } from "@/components/auth-screen";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { NAV_THEME } from "@/lib/constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	useAcceptInvitation,
	useMe,
	usePendingInvitations,
} from "@/lib/queries";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

export function SessionGate({ children }: PropsWithChildren) {
	const { isLoading: authLoading, user, signOut } = useAuth();
	const { selected, select } = useSelectedWorkplaceId();
	const [setupPath, setSetupPath] = useState<"choose" | "manager" | "worker">("choose");
	const me = useMe(Boolean(user));
	const invitations = usePendingInvitations(Boolean(user));

	if (authLoading || (user && (me.isLoading || invitations.isLoading))) {
		return <Splash />;
	}

	if (!user) return <AuthScreen />;

	if (me.isError) {
		return (
			<Message
				title="Connection problem"
				body={(me.error as Error).message}
				actions={[
					{
						label: "Try again",
						kind: "primary",
						onPress: () => void me.refetch(),
					},
					{
						label: "Sign out",
						kind: "secondary",
						onPress: () => void signOut(),
					},
				]}
			/>
		);
	}

	const employments = me.data?.employments ?? [];
	const pending = invitations.data?.invitations ?? [];

	if (employments.length === 0) {
		if (pending.length > 0) {
			return <InvitationView />;
		}
		if (setupPath === "manager") return <WorkplaceSetup onBack={() => setSetupPath("choose")} />;
		if (setupPath === "worker") return <WorkerJoin onBack={() => setSetupPath("choose")} />;
		return <OnboardingChoice onChoose={setSetupPath} />;
	}

	const activeSelected =
		selected && employments.some((item) => item.workplace.id === selected)
			? selected
			: null;

	if (employments.length > 1 && !activeSelected) {
		return (
			<PickerView
				items={employments.map((item) => ({
					id: item.workplace.id,
					name: item.workplace.name,
				}))}
				onSelect={select}
			/>
		);
	}

	return <>{children}</>;
}

function OnboardingChoice({ onChoose }: { onChoose: (path: "manager" | "worker") => void }) {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();
	const { signOut } = useAuth();

	return (
		<View style={[styles.centered, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
			<View style={styles.messageContent}>
				<Text style={[styles.eyebrow, { color: theme.primary }]}>GET STARTED</Text>
				<Text style={[styles.title, { color: theme.text }]}>How are you joining?</Text>
				<Text style={[styles.body, { color: theme.muted }]}>Choose the option that matches your role. You can belong to more than one workplace later.</Text>
				<Pressable accessibilityRole="button" onPress={() => onChoose("worker")} style={({ pressed }) => [styles.choiceCard, { backgroundColor: theme.card, borderColor: theme.primary, opacity: pressed ? 0.75 : 1 }]}>
					<Text style={[styles.cardTitle, { color: theme.text }]}>I’m a team member</Text>
					<Text style={[styles.cardBody, { color: theme.muted }]}>Join a workplace using the invitation from your manager.</Text>
				</Pressable>
				<Pressable accessibilityRole="button" onPress={() => onChoose("manager")} style={({ pressed }) => [styles.choiceCard, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.75 : 1 }]}>
					<Text style={[styles.cardTitle, { color: theme.text }]}>I manage a workplace</Text>
					<Text style={[styles.cardBody, { color: theme.muted }]}>Create a new workplace and invite your team.</Text>
				</Pressable>
				<Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOutLink}><Text style={[styles.secondaryButtonText, { color: theme.muted }]}>Sign out</Text></Pressable>
			</View>
		</View>
	);
}

function WorkerJoin({ onBack }: { onBack: () => void }) {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();
	const invitations = usePendingInvitations(true);
	const accept = useAcceptInvitation();
	const [invite, setInvite] = useState("");
	const token = invite.trim().split(/[/?#]/).filter(Boolean).at(-1) ?? "";
	const validToken = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(token);

	return (
		<ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 12) + 24, paddingBottom: Math.max(insets.bottom, 12) + 24 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
			<Text style={[styles.eyebrow, { color: theme.primary }]}>TEAM MEMBER SETUP</Text>
			<Text style={[styles.title, { color: theme.text }]}>Join your workplace</Text>
			<Text style={[styles.body, { color: theme.muted }]}>Ask your manager to invite this account’s email. New invitations will appear automatically.</Text>
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<Text style={[styles.cardTitle, { color: theme.text }]}>Have an invite link or code?</Text>
				<TextInput accessibilityLabel="Invitation link or code" autoCapitalize="none" autoCorrect={false} value={invite} onChangeText={setInvite} placeholder="Paste invitation link or code" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
				<Pressable accessibilityRole="button" disabled={!validToken || accept.isPending} onPress={() => accept.mutate(token)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary, opacity: !validToken || accept.isPending ? 0.45 : pressed ? 0.8 : 1 }]}>
					{accept.isPending ? <ActivityIndicator color={theme.onPrimary} /> : <Text style={[styles.primaryButtonText, { color: theme.onPrimary }]}>Join workplace</Text>}
				</Pressable>
				{accept.isError ? <Text accessibilityRole="alert" style={styles.error}>{(accept.error as Error).message}</Text> : null}
			</View>
			<Pressable accessibilityRole="button" disabled={invitations.isFetching} onPress={() => void invitations.refetch()} style={[styles.secondaryButton, { borderColor: theme.border }]}><Text style={[styles.secondaryButtonText, { color: theme.text }]}>{invitations.isFetching ? "Checking…" : "Check for invitation"}</Text></Pressable>
			<Pressable accessibilityRole="button" onPress={onBack} style={styles.signOutLink}><Text style={[styles.secondaryButtonText, { color: theme.muted }]}>Back</Text></Pressable>
		</ScrollView>
	);
}

function WorkplaceSetup({ onBack }: { onBack: () => void }) {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();
	const client = useQueryClient();
	const [workplace, setWorkplace] = useState("");
	const [location, setLocation] = useState("");
	const [position, setPosition] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const valid = Boolean(
		workplace.trim() && location.trim() && position.trim() && !saving,
	);

	async function create() {
		setSaving(true);
		setError(null);
		try {
			await api("/v1/workplaces", {
				method: "POST",
				body: {
					name: workplace.trim(),
					location: {
						name: location.trim(),
						timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					},
					position: { name: position.trim() },
				},
			});
			await client.invalidateQueries({ queryKey: ["me"] });
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Could not create workplace.",
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<ScrollView
			style={[styles.screen, { backgroundColor: theme.background }]}
			contentContainerStyle={[
				styles.scrollContent,
				{ paddingTop: Math.max(insets.top, 12) + 24, paddingBottom: Math.max(insets.bottom, 12) + 24 },
			]}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode="on-drag"
			automaticallyAdjustKeyboardInsets
		>
			<Text style={[styles.eyebrow, { color: theme.primary }]}>
				MANAGER SETUP
			</Text>
			<Text style={[styles.title, { color: theme.text }]}>
				Create your workplace
			</Text>
			<Text style={[styles.body, { color: theme.muted }]}>
				Set up the basics now. You can invite workers and add more positions
				later.
			</Text>
			<View
				style={[
					styles.card,
					{ backgroundColor: theme.card, borderColor: theme.border },
				]}
			>
				<SetupField
					label="Workplace name"
					placeholder="Juniper Kitchen"
					value={workplace}
					onChange={setWorkplace}
					theme={theme}
				/>
				<SetupField
					label="First location"
					placeholder="Downtown"
					value={location}
					onChange={setLocation}
					theme={theme}
				/>
				<SetupField
					label="First position"
					placeholder="Server"
					value={position}
					onChange={setPosition}
					theme={theme}
				/>
				{error ? (
					<Text accessibilityRole="alert" style={styles.error}>
						{error}
					</Text>
				) : null}
				<Pressable
					accessibilityRole="button"
					disabled={!valid}
					onPress={() => void create()}
					style={({ pressed }) => [
						styles.primaryButton,
						{
							backgroundColor: theme.primary,
							opacity: !valid ? 0.45 : pressed ? 0.8 : 1,
						},
					]}
				>
					{saving ? (
						<ActivityIndicator color={theme.onPrimary} />
					) : (
						<Text
							style={[styles.primaryButtonText, { color: theme.onPrimary }]}
						>
							Create workplace
						</Text>
					)}
				</Pressable>
			</View>
			<Pressable
				accessibilityRole="button"
				onPress={onBack}
				style={styles.signOutLink}
			>
				<Text style={[styles.secondaryButtonText, { color: theme.muted }]}> 
					Back
				</Text>
			</Pressable>
		</ScrollView>
	);
}

function SetupField({
	label,
	placeholder,
	value,
	onChange,
	theme,
}: {
	label: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	theme: typeof NAV_THEME.light;
}) {
	return (
		<View style={styles.field}>
			<Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
			<TextInput
				accessibilityLabel={label}
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={theme.muted}
				style={[styles.input, { color: theme.text, borderColor: theme.border }]}
			/>
		</View>
	);
}

function Splash() {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[
				styles.centered,
				{ backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
			]}
		>
			<ActivityIndicator color={theme.primary} />
		</View>
	);
}

function InvitationView() {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();
	const me = useMe(true);
	const invitations = usePendingInvitations(true);
	const accept = useAcceptInvitation();
	const profile = me.data?.profile;

	return (
		<ScrollView
			style={[styles.screen, { backgroundColor: theme.background }]}
			contentContainerStyle={[
				styles.scrollContent,
				{ paddingTop: Math.max(insets.top, 12) + 24, paddingBottom: Math.max(insets.bottom, 12) + 24 },
			]}
		>
			<Text style={[styles.title, { color: theme.text }]}>
				You've been invited
			</Text>
			<Text style={[styles.body, { color: theme.text }]}>
				Accept an invitation below to join your workplace and see your schedule.
			</Text>
			{profile ? (
				<View
					style={[
						styles.card,
						{ backgroundColor: theme.card, borderColor: theme.border },
					]}
				>
					<Text style={[styles.cardTitle, { color: theme.text }]}>
						{profile.fullName ?? profile.email}
					</Text>
					{profile.fullName ? (
						<Text style={[styles.cardBody, { color: theme.text }]}>
							{profile.email}
						</Text>
					) : (
						<Text style={[styles.cardBody, { color: theme.text }]}>
							Signed in
						</Text>
					)}
				</View>
			) : null}
			{(invitations.data?.invitations ?? []).map((invitation) => (
				<View
					key={invitation.id}
					style={[
						styles.card,
						{ backgroundColor: theme.card, borderColor: theme.border },
					]}
				>
					<Text style={[styles.cardTitle, { color: theme.text }]}>
						{invitation.workplaceName}
					</Text>
					<Text style={[styles.cardBody, { color: theme.text }]}>
						Invited as {invitation.kind} · expires{" "}
						{new Date(invitation.expiresAt).toLocaleDateString()}
					</Text>
					<Pressable
						accessibilityRole="button"
						disabled={accept.isPending}
						onPress={() => accept.mutate(invitation.token)}
						style={({ pressed }) => [
							styles.primaryButton,
							{
								backgroundColor: theme.primary,
								opacity: accept.isPending ? 0.5 : pressed ? 0.85 : 1,
							},
						]}
					>
						{accept.isPending ? (
							<ActivityIndicator color={theme.onPrimary} />
						) : (
							<Text
								style={[styles.primaryButtonText, { color: theme.onPrimary }]}
							>
								Accept invitation
							</Text>
						)}
					</Pressable>
					{accept.isError ? (
						<Text style={styles.error}>{(accept.error as Error).message}</Text>
					) : null}
				</View>
			))}
		</ScrollView>
	);
}

function Message({
	title,
	body,
	profile,
	actions,
}: {
	title: string;
	body: string;
	profile?: { email: string; fullName: string | null };
	actions?: {
		label: string;
		kind: "primary" | "secondary";
		onPress: () => void;
	}[];
}) {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();

	return (
		<View
			style={[
				styles.centered,
				{ backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
			]}
		>
			<View style={styles.messageContent}>
				<Text style={[styles.title, { color: theme.text }]}>{title}</Text>
				<Text style={[styles.body, { color: theme.text }]}>{body}</Text>
				{profile ? (
					<Text style={[styles.body, { color: theme.text }]}>
						Signed in as {profile.fullName ?? profile.email}
					</Text>
				) : null}
				{actions?.map((item) => (
					<Pressable
						key={item.label}
						accessibilityRole="button"
						onPress={item.onPress}
						style={({ pressed }) =>
							item.kind === "primary"
								? [
										styles.primaryButton,
										{
											backgroundColor: theme.primary,
											opacity: pressed ? 0.8 : 1,
										},
									]
								: [
										styles.secondaryButton,
										{ borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
									]
						}
					>
						<Text
							style={
								item.kind === "primary"
									? [styles.primaryButtonText, { color: theme.onPrimary }]
									: [styles.secondaryButtonText, { color: theme.text }]
							}
						>
							{item.label}
						</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
}

function PickerView({
	items,
	onSelect,
}: {
	items: { id: string; name: string }[];
	onSelect: (id: string) => void;
}) {
	const { colorScheme } = useColorScheme();
	const theme = colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;
	const insets = useSafeAreaInsets();

	return (
		<ScrollView
			style={[styles.screen, { backgroundColor: theme.background }]}
			contentContainerStyle={[
				styles.scrollContent,
				{ paddingTop: Math.max(insets.top, 12) + 24, paddingBottom: Math.max(insets.bottom, 12) + 24 },
			]}
		>
			<Text style={[styles.title, { color: theme.text }]}>
				Choose a workplace
			</Text>
			<Text style={[styles.body, { color: theme.text }]}>
				You work at more than one workplace. Pick one to continue.
			</Text>
			{items.map((item) => (
				<Pressable
					key={item.id}
					accessibilityRole="button"
					onPress={() => onSelect(item.id)}
					style={({ pressed }) => [
						styles.card,
						{
							backgroundColor: theme.card,
							borderColor: theme.border,
							opacity: pressed ? 0.7 : 1,
						},
					]}
				>
					<Text style={[styles.cardTitle, { color: theme.text }]}>
						{item.name}
					</Text>
				</Pressable>
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	centered: { flex: 1, alignItems: "center", justifyContent: "center" },
	screen: { flex: 1 },
	scrollContent: { padding: 20, paddingTop: 20, gap: 16 },
	messageContent: {
		width: "100%",
		maxWidth: 420,
		alignSelf: "center",
		padding: 24,
		gap: 12,
	},
	title: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.6 },
	body: { fontSize: 14, lineHeight: 21 },
	card: {
		borderWidth: 1,
		borderRadius: 14,
		padding: 16,
		gap: 10,
	},
	choiceCard: { borderWidth: 1.5, borderRadius: 16, padding: 18, gap: 4, minHeight: 88, justifyContent: "center" },
	cardTitle: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
	cardBody: { fontSize: 14, lineHeight: 21 },
	primaryButton: {
		minHeight: 46,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
		marginTop: 8,
	},
	primaryButtonText: { fontSize: 15, fontWeight: "700" },
	secondaryButton: {
		minHeight: 46,
		borderWidth: 1,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
		marginTop: 8,
	},
	secondaryButtonText: { fontSize: 15, fontWeight: "600" },
	error: { color: "oklch(0.58 0.22 27)", fontSize: 13, lineHeight: 19 },
	eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
	field: { gap: 6 },
	fieldLabel: { fontSize: 13, fontWeight: "700" },
	input: {
		minHeight: 46,
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 14,
		fontSize: 16,
	},
	signOutLink: {
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
	},
});
