import { useQueryClient } from "@tanstack/react-query";
import { type PropsWithChildren, type ReactNode, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { AuthScreen } from "@/components/auth-screen";
import { LogoMark } from "@/components/logo-mark";
import {
	Appear,
	AppText,
	Avatar,
	Button,
	Callout,
	Card,
	type IconName,
	IconTile,
	ListGroup,
	ListRow,
	NativeField,
	PressableScale,
	Screen,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDisplayPrefs } from "@/lib/display";
import {
	useAcceptInvitation,
	useMe,
	usePendingInvitations,
} from "@/lib/queries";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";
import { spacing, useAppTheme } from "@/theme";

export function SessionGate({ children }: PropsWithChildren) {
	const { isLoading: authLoading, user, signOut } = useAuth();
	const { selected, select } = useSelectedWorkplaceId();
	const [setupPath, setSetupPath] = useState<"choose" | "manager" | "worker">(
		"choose",
	);
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
		if (setupPath === "manager")
			return <WorkplaceSetup onBack={() => setSetupPath("choose")} />;
		if (setupPath === "worker")
			return <WorkerJoin onBack={() => setSetupPath("choose")} />;
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

/** Shared frame for every pre-app step: centred column, brand eyebrow, title. */
function GateFrame({
	eyebrow,
	title,
	body,
	children,
}: {
	eyebrow?: string;
	title: string;
	body?: string;
	children: ReactNode;
}) {
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
				<Appear style={{ gap: spacing.sm }}>
					<LogoMark size={40} />
					{eyebrow ? (
						<AppText
							variant="overline"
							tone="tint"
							style={{ marginTop: spacing.sm }}
						>
							{eyebrow}
						</AppText>
					) : null}
					<AppText variant="title1" accessibilityRole="header">
						{title}
					</AppText>
					{body ? (
						<AppText variant="body" tone="secondary">
							{body}
						</AppText>
					) : null}
				</Appear>
				<Appear index={1} style={{ gap: spacing.lg }}>
					{children}
				</Appear>
			</View>
		</Screen>
	);
}

function OnboardingChoice({
	onChoose,
}: {
	onChoose: (path: "manager" | "worker") => void;
}) {
	const { signOut } = useAuth();
	return (
		<GateFrame
			eyebrow="Get started"
			title="How are you joining?"
			body="Pick the option that matches your role. You can belong to more than one workplace later."
		>
			<ChoiceCard
				icon="person"
				title="I’m a team member"
				body="Join with the invitation from your manager."
				onPress={() => onChoose("worker")}
				emphasis
			/>
			<ChoiceCard
				icon="building"
				title="I manage a workplace"
				body="Create a workplace and invite your team."
				onPress={() => onChoose("manager")}
			/>
			<Button
				label="Sign out"
				variant="ghost"
				onPress={() => void signOut()}
				style={{ alignSelf: "center" }}
			/>
		</GateFrame>
	);
}

function ChoiceCard({
	icon,
	title,
	body,
	onPress,
	emphasis,
}: {
	icon: IconName;
	title: string;
	body: string;
	onPress: () => void;
	emphasis?: boolean;
}) {
	const { theme } = useAppTheme();
	return (
		<PressableScale
			accessibilityRole="button"
			accessibilityLabel={`${title}. ${body}`}
			haptic
			onPress={onPress}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.lg,
				padding: spacing.xl,
				borderRadius: 16,
				borderCurve: "continuous",
				backgroundColor: theme.surface,
				borderWidth: 1.5,
				borderColor: emphasis ? theme.primary : theme.border,
				boxShadow: theme.cardShadow,
			}}
		>
			<IconTile icon={icon} tone={emphasis ? "primary" : "neutral"} size={44} />
			<View style={{ flex: 1, gap: 2 }}>
				<AppText variant="headline">{title}</AppText>
				<AppText variant="footnote" tone="secondary">
					{body}
				</AppText>
			</View>
		</PressableScale>
	);
}

function WorkerJoin({ onBack }: { onBack: () => void }) {
	const invitations = usePendingInvitations(true);
	const accept = useAcceptInvitation();
	const [invite, setInvite] = useState("");
	const token = invite.trim().split(/[/?#]/).filter(Boolean).at(-1) ?? "";
	const validToken = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(token);

	return (
		<GateFrame
			eyebrow="Team member setup"
			title="Join your workplace"
			body="Ask your manager to invite this account’s email. New invitations appear automatically."
		>
			<Card style={{ gap: spacing.lg }}>
				<NativeField
					label="Invite link or code"
					value={invite}
					onChange={setInvite}
					placeholder="Paste your invitation link"
					onSubmit={() => validToken && accept.mutate(token)}
				/>
				<Button
					label="Join workplace"
					size="lg"
					disabled={!validToken}
					loading={accept.isPending}
					onPress={() => accept.mutate(token)}
				/>
				{accept.isError ? (
					<Callout
						tone="danger"
						title="Couldn’t join"
						body={(accept.error as Error).message}
					/>
				) : null}
			</Card>
			<Button
				label={invitations.isFetching ? "Checking…" : "Check for invitations"}
				icon="switch"
				variant="secondary"
				disabled={invitations.isFetching}
				onPress={() => void invitations.refetch()}
			/>
			<Button
				label="Back"
				variant="ghost"
				onPress={onBack}
				style={{ alignSelf: "center" }}
			/>
		</GateFrame>
	);
}

function WorkplaceSetup({ onBack }: { onBack: () => void }) {
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
		<GateFrame
			eyebrow="Manager setup"
			title="Create your workplace"
			body="Set up the basics now. You can invite workers and add more positions later."
		>
			<Card style={{ gap: spacing.lg }}>
				<NativeField
					label="Workplace name"
					placeholder="Northside Operations"
					value={workplace}
					onChange={setWorkplace}
				/>
				<NativeField
					label="First location"
					placeholder="Downtown"
					value={location}
					onChange={setLocation}
				/>
				<NativeField
					label="First position"
					placeholder="Associate"
					value={position}
					onChange={setPosition}
				/>
				{error ? (
					<Callout
						tone="danger"
						title="Couldn’t create workplace"
						body={error}
					/>
				) : null}
				<Button
					label="Create workplace"
					size="lg"
					disabled={!valid}
					loading={saving}
					onPress={() => void create()}
				/>
			</Card>
			<Button
				label="Back"
				variant="ghost"
				onPress={onBack}
				style={{ alignSelf: "center" }}
			/>
		</GateFrame>
	);
}

function Splash() {
	const { theme } = useAppTheme();
	return (
		<View
			style={{
				flex: 1,
				alignItems: "center",
				justifyContent: "center",
				gap: spacing.xl,
				backgroundColor: theme.background,
			}}
		>
			<LogoMark size={64} />
			<ActivityIndicator color={theme.textSecondary} />
		</View>
	);
}

function InvitationView() {
	const { formatPerson } = useDisplayPrefs();
	const me = useMe(true);
	const invitations = usePendingInvitations(true);
	const accept = useAcceptInvitation();
	const profile = me.data?.profile;

	return (
		<GateFrame
			eyebrow="Invitation"
			title="You’ve been invited"
			body="Accept an invitation to join your workplace and see your schedule."
		>
			{profile ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.md,
					}}
				>
					<Avatar name={profile.fullName || profile.email} />
					<View style={{ flex: 1 }}>
						<AppText variant="callout" weight="600">
							{formatPerson(profile.fullName, profile.email)}
						</AppText>
						<AppText variant="footnote" tone="secondary">
							{profile.fullName ? profile.email : "Signed in"}
						</AppText>
					</View>
				</View>
			) : null}
			{(invitations.data?.invitations ?? []).map((invitation) => (
				<Card key={invitation.id}>
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: spacing.md,
						}}
					>
						<IconTile icon="building" size={40} />
						<View style={{ flex: 1, gap: 2 }}>
							<AppText variant="headline">{invitation.workplaceName}</AppText>
							<AppText variant="footnote" tone="secondary">
								Invited as {invitation.kind} · expires{" "}
								{new Date(invitation.expiresAt).toLocaleDateString()}
							</AppText>
						</View>
					</View>
					<Button
						label="Accept invitation"
						icon="check"
						loading={accept.isPending}
						onPress={() => accept.mutate(invitation.token)}
					/>
				</Card>
			))}
			{accept.isError ? (
				<Callout
					tone="danger"
					title="Couldn’t accept"
					body={(accept.error as Error).message}
				/>
			) : null}
		</GateFrame>
	);
}

function Message({
	title,
	body,
	actions,
}: {
	title: string;
	body: string;
	actions?: {
		label: string;
		kind: "primary" | "secondary";
		onPress: () => void;
	}[];
}) {
	return (
		<GateFrame title={title}>
			<Callout tone="danger" title="We couldn’t reach jooling" body={body} />
			{actions?.map((item) => (
				<Button
					key={item.label}
					label={item.label}
					variant={item.kind === "primary" ? "primary" : "secondary"}
					onPress={item.onPress}
				/>
			))}
		</GateFrame>
	);
}

function PickerView({
	items,
	onSelect,
}: {
	items: { id: string; name: string }[];
	onSelect: (id: string) => void;
}) {
	return (
		<GateFrame
			title="Choose a workplace"
			body="You work at more than one workplace. Pick one to continue — you can switch any time from More."
		>
			<ListGroup>
				{items.map((item) => (
					<ListRow
						key={item.id}
						icon="building"
						title={item.name}
						onPress={() => onSelect(item.id)}
					/>
				))}
			</ListGroup>
		</GateFrame>
	);
}
