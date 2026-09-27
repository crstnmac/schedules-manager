import { type Href, router } from "expo-router";
import { Alert, Linking, View } from "react-native";

import {
	Appear,
	AppText,
	Avatar,
	Badge,
	Card,
	type IconName,
	ListGroup,
	ListRow,
	Screen,
	Section,
	type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { LEGAL_LINKS } from "@/lib/legal";
import { useCurrentEmployment } from "@/lib/queries";
import { getAppUrl } from "@/lib/server-url";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";
import { spacing } from "@/theme";

type Tool = {
	label: string;
	detail: string;
	icon: IconName;
	tone: Tone;
	path: Href;
};

export default function MoreScreen() {
	const { employment, canManage, me } = useCurrentEmployment();
	const { select } = useSelectedWorkplaceId();
	const { signOut } = useAuth();
	const profile = me.data?.profile;
	const employments = me.data?.employments ?? [];
	const displayName =
		profile?.fullName?.trim() || profile?.email || "Your account";
	const role =
		employment?.kind === "viewer"
			? "Viewer"
			: canManage
				? "Manager"
				: "Team member";

	const tools: Tool[] = [
		...(canManage || employment?.kind === "viewer"
			? []
			: [
					{
						label: "Time off",
						detail: "Requests, blocked times, and preferences",
						icon: "calendarClock",
						tone: "primary",
						path: "/worker-availability",
					} satisfies Tool,
				]),
		{
			label: "Timecard",
			detail: "Your punches and worked hours",
			icon: "stopwatch",
			tone: "success",
			path: "/timecard",
		},
		{
			label: "Announcements",
			detail: "Updates shared across the Workplace",
			icon: "megaphone",
			tone: "warning",
			path: "/announcements",
		},
		{
			label: "Messages",
			detail: "Workplace conversations",
			icon: "message",
			tone: "primary",
			path: "/messages",
		},
		...(canManage
			? ([
					{
						label: "Team",
						detail: "People, roles, and invitations",
						icon: "people",
						tone: "primary",
						path: "/team",
					},
					{
						label: "Kiosk",
						detail: "Clock Workers in with Location PINs",
						icon: "keypad",
						tone: "neutral",
						path: "/kiosk",
					},
				] satisfies Tool[])
			: []),
	];

	function confirmSignOut() {
		Alert.alert(
			"Sign out?",
			"You’ll need to sign in again to see your schedule.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Sign out",
					style: "destructive",
					onPress: () => void signOut(),
				},
			],
		);
	}

	return (
		<Screen>
			<Appear>
				<Card>
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: spacing.md,
						}}
					>
						<Avatar
							name={profile?.fullName || profile?.email || "?"}
							size={56}
						/>
						<View style={{ flex: 1, gap: 2 }}>
							<AppText variant="title3" numberOfLines={1}>
								{displayName}
							</AppText>
							{profile?.fullName ? (
								<AppText
									variant="footnote"
									tone="secondary"
									numberOfLines={1}
									selectable
								>
									{profile.email}
								</AppText>
							) : null}
							<View style={{ marginTop: spacing.xs }}>
								<Badge label={role} tone="primary" />
							</View>
						</View>
					</View>
				</Card>
			</Appear>

			<Appear index={1}>
				<Section title="Workplace">
					<ListGroup>
						<ListRow
							icon="building"
							title={employment?.workplace.name ?? "No workplace selected"}
							subtitle={
								employments.length > 1
									? `${employments.length} workplaces · tap to switch`
									: "Current workplace"
							}
							onPress={employments.length > 1 ? () => select(null) : undefined}
							trailing={
								employments.length > 1 ? (
									<AppText variant="footnote" tone="tint" weight="600">
										Switch
									</AppText>
								) : undefined
							}
							chevron={false}
						/>
					</ListGroup>
				</Section>
			</Appear>

			<Appear index={2}>
				<Section title="Tools">
					<ListGroup>
						{tools.map((tool) => (
							<ListRow
								key={tool.label}
								icon={tool.icon}
								iconTone={tool.tone}
								title={tool.label}
								subtitle={tool.detail}
								onPress={() => router.push(tool.path)}
							/>
						))}
					</ListGroup>
				</Section>
			</Appear>

			<Appear index={3}>
				<Section title="Account">
					<ListGroup>
						{canManage ? (
							<ListRow
								icon="creditCard"
								iconTone="neutral"
								title="Subscription & billing"
								subtitle="Plan, invoices, and cancellation"
								onPress={() =>
									void Linking.openURL(
										`${getAppUrl()}/dashboard/settings/subscription`,
									)
								}
							/>
						) : null}
						{LEGAL_LINKS.map((link) => (
							<ListRow
								key={link.label}
								icon="doc"
								iconTone="neutral"
								title={link.label}
								onPress={() => void Linking.openURL(link.url)}
							/>
						))}
						<ListRow
							icon="signOut"
							title="Sign out"
							destructive
							chevron={false}
							onPress={confirmSignOut}
						/>
					</ListGroup>
				</Section>
			</Appear>

			<AppText variant="caption" tone="tertiary" align="center">
				jooling · Scheduling for hourly teams
			</AppText>
		</Screen>
	);
}
