import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen, Badge, Card, PageHeader, SecondaryButton, useAppTheme } from "@/components/ui";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useMe, useNotifications } from "@/lib/queries";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

export default function InboxScreen() {
	const { theme } = useAppTheme();
	const me = useMe();
	const { selected } = useSelectedWorkplaceId();
	const workplaceId = me.data?.employments.find((e) => e.workplace.id === selected)?.workplace.id ?? me.data?.employments[0]?.workplace.id;
	const inbox = useNotifications(workplaceId);
	const markRead = useMarkNotificationRead(workplaceId);
	const markAll = useMarkAllNotificationsRead(workplaceId);
	const items = inbox.data?.notifications ?? [];
	const unread = inbox.data?.unreadCount ?? 0;

	return (
		<AppScreen>
			<PageHeader
				title="Inbox"
				description="Published Schedules, Material Schedule Changes, coverage, and Time-off decisions land here."
				action={unread > 0 ? <SecondaryButton label={`Mark all read (${unread})`} disabled={markAll.isPending} onPress={() => markAll.mutate()} /> : undefined}
			/>

			{inbox.isLoading ? <ActivityIndicator color={theme.primary} /> : null}

			{!inbox.isLoading && items.length === 0 ? (
				<Card>
					<Text style={[s.title, { color: theme.text }]}>No notifications yet</Text>
					<Text style={[s.body, { color: theme.muted }]}>When a Manager publishes a Schedule Version or decides your Time-off Request, you’ll see it here with Delivery Status.</Text>
				</Card>
			) : null}

			{items.map((it) => (
				<Card key={it.id}>
					<View style={s.rowBetween}>
						<Text style={[s.itemTitle, { color: theme.text }]}>{it.title}</Text>
						{it.readAt ? <Badge label="Read" variant="outline" /> : <Badge label="New" variant="default" />}
					</View>
					<Text style={[s.body, { color: theme.muted }]}>{it.body}</Text>
					<Text style={[s.meta, { color: theme.muted, fontVariant: ["tabular-nums"] as never }]}>
						{new Date(it.createdAt).toLocaleString()}
					</Text>
					{it.readAt ? null : (
						<Pressable accessibilityRole="button" disabled={markRead.isPending} onPress={() => markRead.mutate(it.id)} style={{ alignSelf: "flex-start", minHeight: 34, justifyContent: "center" }}>
							<Text style={[s.action, { color: theme.primary }]}>Mark read</Text>
						</Pressable>
					)}
				</Card>
			))}
		</AppScreen>
	);
}

const s = StyleSheet.create({
	title: { fontSize: 17, fontWeight: "700" },
	body: { fontSize: 14, lineHeight: 21 },
	itemTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
	meta: { fontSize: 12, lineHeight: 16 },
	action: { fontSize: 13, fontWeight: "700" },
	rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
