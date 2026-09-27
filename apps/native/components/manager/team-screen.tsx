import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, View } from "react-native";

import { Metric } from "@/components/manager/metric";
import {
	Appear,
	AppText,
	Avatar,
	Badge,
	Card,
	CardListSkeleton,
	Divider,
	EmptyState,
	ErrorState,
	Icon,
	PressableScale,
	Screen,
	Section,
} from "@/components/ui";
import { showActionSheet } from "@/lib/action-sheet";
import { useDisplayPrefs } from "@/lib/display";
import { positionColor } from "@/lib/position-color";
import {
	type ManagerWorkersResponse,
	useCurrentEmployment,
	useManagerWorkers,
} from "@/lib/queries";
import { spacing, useAppTheme } from "@/theme";

type Member = ManagerWorkersResponse["workers"][number] & { name: string };
type Invitation = ManagerWorkersResponse["invitations"][number];

/**
 * People directory: native header search, grouped by role, pending invites
 * with their expiry. Tapping a person offers the actions a Manager takes most
 * from here — email them or record their time off.
 */
export function TeamScreen() {
	const router = useRouter();
	const { formatPerson } = useDisplayPrefs();
	const { workplaceId, canManage } = useCurrentEmployment();
	const workers = useManagerWorkers(workplaceId);
	const [query, setQuery] = useState("");

	const members: Member[] = useMemo(
		() =>
			(workers.data?.workers ?? [])
				.map((worker) => ({
					...worker,
					name: formatPerson(worker.profile.fullName, worker.profile.email),
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[workers.data, formatPerson],
	);
	const invites = (workers.data?.invitations ?? []).filter(
		(invite) => invite.status === "pending",
	);

	const q = query.trim().toLowerCase();
	const matches = (member: Member) =>
		!q ||
		member.name.toLowerCase().includes(q) ||
		member.profile.email.toLowerCase().includes(q);
	const active = members.filter((m) => m.status === "active" && matches(m));
	const managers = active.filter((m) => m.kind !== "worker");
	const team = active.filter((m) => m.kind === "worker");
	const inactive = members.filter((m) => m.status !== "active" && matches(m));
	const visibleInvites = invites.filter(
		(invite) => !q || invite.email.toLowerCase().includes(q),
	);

	function openMember(member: Member) {
		showActionSheet({
			title: member.name,
			message: member.profile.email,
			actions: [
				{
					label: "Email",
					onPress: () => void Linking.openURL(`mailto:${member.profile.email}`),
				},
				...(canManage && member.status === "active"
					? [
							{
								label: "Record time off",
								onPress: () =>
									router.push({
										pathname: "/time-off-sheet",
										params: { employmentId: member.employmentId },
									}),
							},
						]
					: []),
			],
		});
	}

	return (
		<>
			<Stack.Screen
				options={{
					headerSearchBarOptions: {
						placeholder: "Search team",
						hideWhenScrolling: false,
						onChangeText: (event) => setQuery(event.nativeEvent.text),
						onCancelButtonPress: () => setQuery(""),
					},
				}}
			/>
			<Screen onRefresh={() => workers.refetch()}>
				{workers.isLoading ? <CardListSkeleton count={3} /> : null}
				{workers.isError ? (
					<ErrorState
						error={workers.error}
						onRetry={() => void workers.refetch()}
					/>
				) : null}

				{workers.data && !q ? (
					<Appear>
						<View style={{ flexDirection: "row", gap: spacing.md }}>
							<Metric
								icon="people"
								value={
									members.filter(
										(m) => m.status === "active" && m.kind === "worker",
									).length
								}
								label="Team members"
							/>
							<Metric
								icon="building"
								value={
									members.filter(
										(m) => m.status === "active" && m.kind !== "worker",
									).length
								}
								label="Managers"
							/>
							<Metric
								icon="envelope"
								value={invites.length}
								label="Invited"
								tone={invites.length > 0 ? "warning" : "primary"}
							/>
						</View>
					</Appear>
				) : null}

				{managers.length > 0 ? (
					<Appear index={1}>
						<Section title="Managers">
							<PeopleList people={managers} onPress={openMember} />
						</Section>
					</Appear>
				) : null}

				{team.length > 0 ? (
					<Appear index={2}>
						<Section title="Team members" caption={`${team.length} active`}>
							<PeopleList people={team} onPress={openMember} />
						</Section>
					</Appear>
				) : null}

				{visibleInvites.length > 0 ? (
					<Appear index={3}>
						<Section
							title="Invited"
							caption="Waiting for them to accept. Resend or revoke from the web Team page."
						>
							<InviteList invites={visibleInvites} />
						</Section>
					</Appear>
				) : null}

				{inactive.length > 0 ? (
					<Appear index={4}>
						<Section title="Inactive">
							<PeopleList people={inactive} onPress={openMember} muted />
						</Section>
					</Appear>
				) : null}

				{workers.data &&
				q &&
				active.length + inactive.length + visibleInvites.length === 0 ? (
					<EmptyState
						icon="person"
						title="No matches"
						body={`No one on the team matches “${query.trim()}”.`}
					/>
				) : null}

				{workers.data && members.length === 0 && invites.length === 0 ? (
					<EmptyState
						icon="people"
						title="No one here yet"
						body="Invite workers and managers from the web Team page."
					/>
				) : null}
			</Screen>
		</>
	);
}

function PeopleList({
	people,
	onPress,
	muted,
}: {
	people: Member[];
	onPress: (member: Member) => void;
	muted?: boolean;
}) {
	const { theme } = useAppTheme();
	return (
		<Card padded={false} style={{ gap: 0, opacity: muted ? 0.7 : 1 }}>
			{people.map((member, index) => (
				<View key={member.employmentId}>
					{index > 0 ? <Divider inset={68} /> : null}
					<PressableScale
						accessibilityRole="button"
						accessibilityLabel={`${member.name}, ${member.kind}${member.status === "active" ? "" : ", inactive"}`}
						accessibilityHint="Shows actions"
						pressedScale={0.985}
						haptic
						onPress={() => onPress(member)}
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: spacing.md,
							paddingHorizontal: spacing.lg,
							paddingVertical: spacing.md,
						}}
					>
						<Avatar
							name={member.name}
							size={40}
							color={muted ? theme.textTertiary : positionColor(member.name)}
						/>
						<View style={{ flex: 1, gap: 1 }}>
							<AppText variant="callout" weight="600" numberOfLines={1}>
								{member.name}
							</AppText>
							<AppText
								variant="footnote"
								tone="secondary"
								numberOfLines={1}
								selectable
							>
								{member.profile.email}
							</AppText>
						</View>
						{member.kind === "viewer" ? <Badge label="Viewer" /> : null}
						{member.status !== "active" ? <Badge label="Inactive" /> : null}
						<Icon name="ellipsis" size={16} color={theme.textTertiary} />
					</PressableScale>
				</View>
			))}
		</Card>
	);
}

function InviteList({ invites }: { invites: Invitation[] }) {
	const { theme } = useAppTheme();
	return (
		<Card padded={false} style={{ gap: 0 }}>
			{invites.map((invite, index) => {
				const expires = new Date(invite.expiresAt);
				const days = Math.ceil((expires.getTime() - Date.now()) / 86_400_000);
				return (
					<View key={invite.id}>
						{index > 0 ? <Divider inset={68} /> : null}
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: spacing.md,
								paddingHorizontal: spacing.lg,
								paddingVertical: spacing.md,
							}}
						>
							<View
								style={{
									width: 40,
									height: 40,
									borderRadius: 20,
									borderWidth: 1.5,
									borderStyle: "dashed",
									borderColor: theme.border,
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<Icon name="envelope" size={16} color={theme.textSecondary} />
							</View>
							<View style={{ flex: 1, gap: 1 }}>
								<AppText
									variant="callout"
									weight="600"
									numberOfLines={1}
									selectable
								>
									{invite.email}
								</AppText>
								<AppText variant="footnote" tone="secondary">
									Invited as{" "}
									{invite.kind === "worker" ? "team member" : invite.kind}
								</AppText>
							</View>
							<Badge
								label={
									days <= 0
										? "Expired"
										: days === 1
											? "1 day left"
											: `${days} days left`
								}
								tone={days <= 2 ? "warning" : "neutral"}
							/>
						</View>
					</View>
				);
			})}
		</Card>
	);
}
