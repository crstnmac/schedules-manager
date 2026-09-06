import { Icon, ListItem, Text as NativeText } from "@expo/ui";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SettingsGroup } from "@/components/settings-group";

import {
	AppScreen,
	Badge,
	Card,
	PageHeader,
	useAppTheme,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCurrentEmployment } from "@/lib/queries";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

// Platform-native icons: SF Symbols on iOS, Material Symbols on Android.
const ICONS = {
	announcements: Icon.select({
		ios: "megaphone",
		android: import("@expo/material-symbols/campaign.xml"),
	}),
	messages: Icon.select({
		ios: "bubble.left.and.bubble.right",
		android: import("@expo/material-symbols/chat.xml"),
	}),
	timecard: Icon.select({
		ios: "stopwatch",
		android: import("@expo/material-symbols/timer.xml"),
	}),
	team: Icon.select({
		ios: "person.2",
		android: import("@expo/material-symbols/groups.xml"),
	}),
	kiosk: Icon.select({
		ios: "keyboard",
		android: import("@expo/material-symbols/dialpad.xml"),
	}),
	timeOff: Icon.select({
		ios: "calendar.badge.clock",
		android: import("@expo/material-symbols/event_busy.xml"),
	}),
	switchWorkplace: Icon.select({
		ios: "arrow.left.arrow.right",
		android: import("@expo/material-symbols/swap_horiz.xml"),
	}),
	signOut: Icon.select({
		ios: "rectangle.portrait.and.arrow.right",
		android: import("@expo/material-symbols/logout.xml"),
	}),
	workplace: Icon.select({
		ios: "building.2",
		android: import("@expo/material-symbols/location_city.xml"),
	}),
	chevron: Icon.select({
		ios: "chevron.right",
		android: import("@expo/material-symbols/chevron_right.xml"),
	}),
} as const;

export default function MoreScreen() {
	const { theme } = useAppTheme();
	const { employment, isManager, me } = useCurrentEmployment();
	const { select } = useSelectedWorkplaceId();
	const { signOut } = useAuth();
	const profile = me.data?.profile;
	const employments = me.data?.employments ?? [];
	const displayName =
		profile?.fullName?.trim() || profile?.email || "Your account";
	const initials = getInitials(profile?.fullName, profile?.email);
	const tools: {
		label: string;
		detail: string;
		icon: (typeof ICONS)[keyof typeof ICONS];
		path:
			| "/team"
			| "/timecard"
			| "/worker-availability"
			| "/announcements"
			| "/messages"
			| "/kiosk";
	}[] = [
		{
			label: "Announcements",
			detail: "Updates shared across the Workplace",
			icon: ICONS.announcements,
			path: "/announcements",
		},
		{
			label: "Messages",
			detail: "Workplace conversations",
			icon: ICONS.messages,
			path: "/messages",
		},
		{
			label: "Timecard",
			detail: "Your Time Entries and worked hours",
			icon: ICONS.timecard,
			path: "/timecard",
		},
		...(isManager
			? [
					{
						label: "Team",
						detail: "People, roles, and invitations",
						icon: ICONS.team,
						path: "/team" as const,
					},
					{
						label: "Kiosk",
						detail: "Clock Workers with Location PINs",
						icon: ICONS.kiosk,
						path: "/kiosk" as const,
					},
				]
			: [
					{
						label: "Time off",
						detail: "Requests, blocked times, and preferences",
						icon: ICONS.timeOff,
						path: "/worker-availability" as const,
					},
				]),
	];

	function confirmSignOut() {
		Alert.alert(
			"Sign out?",
			"You’ll need to enter your credentials to access your schedule again.",
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
		<AppScreen>
			<PageHeader title="More" />

			<Card>
				<View style={styles.profileRow}>
					<View
						style={[styles.avatar, { backgroundColor: theme.primary }]}
						accessible
						accessibilityLabel={`${displayName} profile`}
					>
						<Text style={[styles.avatarText, { color: theme.onPrimary }]}>
							{initials}
						</Text>
					</View>
					<View style={styles.profileCopy}>
						<Text
							style={[styles.profileName, { color: theme.text }]}
							numberOfLines={1}
						>
							{displayName}
						</Text>
						{profile?.fullName ? (
							<Text
								style={[styles.email, { color: theme.muted }]}
								numberOfLines={1}
							>
								{profile.email}
							</Text>
						) : null}
					</View>
					<Badge
						label={isManager ? "Manager" : "Team member"}
						variant="default"
					/>
				</View>
				<View
					style={[
						styles.workplaceBand,
						{ backgroundColor: theme.background, borderColor: theme.border },
					]}
				>
					<MaterialIcons
						name="business"
						size={20}
						color={theme.primary}
						accessible={false}
					/>
					<View style={styles.profileCopy}>
						<Text style={[styles.meta, { color: theme.muted }]}>
							CURRENT WORKPLACE
						</Text>
						<Text style={[styles.workplaceName, { color: theme.text }]}>
							{employment?.workplace.name ?? "No workplace selected"}
						</Text>
					</View>
				</View>
			</Card>

			<SectionLabel>WORKPLACE TOOLS</SectionLabel>
			<SettingsGroup>
				{tools.map((item) => (
					<ListItem
						key={item.label}
						onPress={() => router.push(item.path)}
						supportingText={item.detail}
						leading={<Icon name={item.icon} size={21} color={theme.primary} />}
						trailing={
							<Icon name={ICONS.chevron} size={14} color={theme.muted} />
						}
					>
						{item.label}
					</ListItem>
				))}
				{employments.length > 1 ? (
					<ListItem
						onPress={() => select(null)}
						supportingText={`${employments.length} workplaces available`}
						leading={
							<Icon
								name={ICONS.switchWorkplace}
								size={21}
								color={theme.primary}
							/>
						}
						trailing={
							<Icon name={ICONS.chevron} size={14} color={theme.muted} />
						}
					>
						Switch workplace
					</ListItem>
				) : null}
			</SettingsGroup>

			<SectionLabel>ACCOUNT</SectionLabel>
			<SettingsGroup>
				<ListItem
					onPress={confirmSignOut}
					supportingText="Sign out of this device"
					leading={
						<Icon name={ICONS.signOut} size={21} color={theme.notification} />
					}
				>
					<NativeText
						textStyle={{ color: theme.notification, fontWeight: "600" }}
					>
						Sign out
					</NativeText>
				</ListItem>
			</SettingsGroup>

			<Text style={[styles.footer, { color: theme.muted }]}>
				jooling · Mobile workforce access
			</Text>
		</AppScreen>
	);
}

function SectionLabel({ children }: { children: string }) {
	const { theme } = useAppTheme();
	return (
		<Text style={[styles.sectionLabel, { color: theme.muted }]}>
			{children}
		</Text>
	);
}

function getInitials(name?: string | null, email?: string) {
	if (name?.trim())
		return name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join("");
	return email?.[0]?.toUpperCase() ?? "U";
}

const styles = StyleSheet.create({
	profileRow: {
		minHeight: 64,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	avatar: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarText: { fontSize: 17, fontWeight: "800" },
	profileCopy: { flex: 1, gap: 2 },
	profileName: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
	email: { fontSize: 13, lineHeight: 18 },
	workplaceBand: {
		minHeight: 60,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		borderCurve: "continuous",
		paddingHorizontal: 14,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	meta: { fontSize: 10, lineHeight: 14, fontWeight: "700", letterSpacing: 0.7 },
	workplaceName: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
	sectionLabel: {
		marginTop: 6,
		marginLeft: 4,
		fontSize: 11,
		lineHeight: 16,
		fontWeight: "700",
		letterSpacing: 0.8,
	},
	menuHost: { alignSelf: "stretch", minHeight: 56, flexGrow: 0, flexShrink: 1 },
	footer: {
		textAlign: "center",
		fontSize: 12,
		lineHeight: 18,
		paddingVertical: 8,
	},
});
