import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

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
		icon: React.ComponentProps<typeof Ionicons>["name"];
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
			icon: "megaphone-outline",
			path: "/announcements",
		},
		{
			label: "Messages",
			detail: "Workplace conversations",
			icon: "chatbubbles-outline",
			path: "/messages",
		},
		{
			label: "Timecard",
			detail: "Punches and worked hours",
			icon: "stopwatch-outline",
			path: "/timecard",
		},
		...(isManager
			? [
					{
						label: "Team",
						detail: "People, roles, and invitations",
						icon: "people-outline" as const,
						path: "/team" as const,
					},
					{
						label: "Kiosk",
						detail: "Clock Workers with Location PINs",
						icon: "keypad-outline" as const,
						path: "/kiosk" as const,
					},
				]
			: [
					{
						label: "Time off",
						detail: "Requests, blocked times, and preferences",
						icon: "time-outline" as const,
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
			<PageHeader
				eyebrow="ACCOUNT"
				title="More"
				description="Your workplace settings and tools"
			/>

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
					<Ionicons name="business-outline" size={20} color={theme.primary} />
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
			<Card>
				{tools.map((item) => (
					<MenuRow
						key={item.label}
						{...item}
						onPress={() => router.push(item.path)}
						last={employments.length <= 1 && item === tools.at(-1)}
					/>
				))}
				{employments.length > 1 ? (
					<MenuRow
						label="Switch workplace"
						detail={`${employments.length} workplaces available`}
						icon="swap-horizontal-outline"
						onPress={() => select(null)}
						last
					/>
				) : null}
			</Card>

			<SectionLabel>ACCOUNT</SectionLabel>
			<Card>
				<Pressable
					accessibilityRole="button"
					onPress={confirmSignOut}
					style={({ pressed }) => [
						styles.menuRow,
						styles.lastRow,
						{ opacity: pressed ? 0.6 : 1 },
					]}
				>
					<View style={[styles.iconBox, { backgroundColor: theme.background }]}>
						<Ionicons
							name="log-out-outline"
							size={21}
							color={theme.notification}
						/>
					</View>
					<View style={styles.menuCopy}>
						<Text style={[styles.menuLabel, { color: theme.notification }]}>
							Sign out
						</Text>
						<Text style={[styles.menuDetail, { color: theme.muted }]}>
							Sign out of this device
						</Text>
					</View>
				</Pressable>
			</Card>

			<Text style={[styles.footer, { color: theme.muted }]}>
				jooling · Mobile workforce access
			</Text>
		</AppScreen>
	);
}

function MenuRow({
	label,
	detail,
	icon,
	onPress,
	last = false,
}: {
	label: string;
	detail: string;
	icon: React.ComponentProps<typeof Ionicons>["name"];
	onPress: () => void;
	last?: boolean;
}) {
	const { theme } = useAppTheme();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [
				styles.menuRow,
				!last && {
					borderBottomColor: theme.border,
					borderBottomWidth: StyleSheet.hairlineWidth,
				},
				{ opacity: pressed ? 0.65 : 1 },
			]}
		>
			<View style={[styles.iconBox, { backgroundColor: theme.background }]}>
				<Ionicons name={icon} size={21} color={theme.primary} />
			</View>
			<View style={styles.menuCopy}>
				<Text style={[styles.menuLabel, { color: theme.text }]}>{label}</Text>
				<Text style={[styles.menuDetail, { color: theme.muted }]}>
					{detail}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={19} color={theme.muted} />
		</Pressable>
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
	menuRow: {
		minHeight: 72,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	lastRow: { borderBottomWidth: 0 },
	iconBox: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	menuCopy: { flex: 1, gap: 2 },
	menuLabel: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
	menuDetail: { fontSize: 13, lineHeight: 18 },
	footer: {
		textAlign: "center",
		fontSize: 12,
		lineHeight: 18,
		paddingVertical: 8,
	},
});
