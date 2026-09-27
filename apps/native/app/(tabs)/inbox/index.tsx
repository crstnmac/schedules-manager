import { Stack } from "expo-router";
import { View } from "react-native";

import {
	Appear,
	AppText,
	Button,
	Card,
	CardListSkeleton,
	Divider,
	EmptyState,
	ErrorState,
	type IconName,
	IconTile,
	PressableScale,
	Screen,
	Section,
	type Tone,
} from "@/components/ui";
import {
	type InboxNotification,
	useCurrentEmployment,
	useMarkAllNotificationsRead,
	useMarkNotificationRead,
	useNotifications,
} from "@/lib/queries";
import { spacing, useAppTheme } from "@/theme";

export default function InboxScreen() {
	const { workplaceId } = useCurrentEmployment();
	const inbox = useNotifications(workplaceId);
	const markRead = useMarkNotificationRead(workplaceId);
	const markAll = useMarkAllNotificationsRead(workplaceId);
	const items = inbox.data?.notifications ?? [];
	const unread = items.filter((item) => !item.readAt);
	const earlier = items.filter((item) => item.readAt);

	return (
		<>
			<Stack.Screen
				options={{
					headerRight: () =>
						unread.length > 0 ? (
							<Button
								label="Read all"
								variant="ghost"
								size="sm"
								disabled={markAll.isPending}
								onPress={() => markAll.mutate()}
								accessibilityLabel={`Mark all ${unread.length} as read`}
							/>
						) : null,
				}}
			/>
			<Screen onRefresh={() => inbox.refetch()}>
				{inbox.isLoading ? <CardListSkeleton /> : null}
				{inbox.isError ? (
					<ErrorState
						error={inbox.error}
						onRetry={() => void inbox.refetch()}
					/>
				) : null}

				{!inbox.isLoading && !inbox.isError && items.length === 0 ? (
					<EmptyState
						icon="checkCircle"
						tone="success"
						title="All caught up"
						body="When your Manager publishes the Schedule or answers a request, you’ll hear about it here."
					/>
				) : null}

				{unread.length > 0 ? (
					<Appear>
						<Section title="New">
							<NotificationList
								items={unread}
								onPress={(item) => markRead.mutate(item.id)}
							/>
						</Section>
					</Appear>
				) : null}

				{earlier.length > 0 ? (
					<Appear index={1}>
						<Section title={unread.length > 0 ? "Earlier" : undefined}>
							<NotificationList items={earlier} />
						</Section>
					</Appear>
				) : null}
			</Screen>
		</>
	);
}

function NotificationList({
	items,
	onPress,
}: {
	items: InboxNotification[];
	onPress?: (item: InboxNotification) => void;
}) {
	return (
		<Card padded={false} style={{ gap: 0 }}>
			{items.map((item, index) => (
				<View key={item.id}>
					{index > 0 ? <Divider inset={64} /> : null}
					<NotificationRow item={item} onPress={onPress} />
				</View>
			))}
		</Card>
	);
}

function NotificationRow({
	item,
	onPress,
}: {
	item: InboxNotification;
	onPress?: (item: InboxNotification) => void;
}) {
	const { theme } = useAppTheme();
	const unread = !item.readAt;
	const { icon, tone } = iconForKind(item.kind);
	const content = (
		<View
			style={{
				flexDirection: "row",
				gap: spacing.md,
				paddingHorizontal: spacing.lg,
				paddingVertical: spacing.md + 2,
			}}
		>
			<IconTile icon={icon} tone={unread ? tone : "neutral"} size={36} />
			<View style={{ flex: 1, gap: 2 }}>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.sm,
					}}
				>
					<AppText
						variant="callout"
						weight={unread ? "600" : "500"}
						style={{ flex: 1 }}
						numberOfLines={2}
					>
						{item.title}
					</AppText>
					<AppText variant="caption" tone="tertiary" tabular>
						{relativeTime(item.createdAt)}
					</AppText>
				</View>
				<AppText variant="footnote" tone="secondary" selectable>
					{item.body}
				</AppText>
			</View>
			{unread ? (
				<View
					style={{
						width: 8,
						height: 8,
						borderRadius: 4,
						backgroundColor: theme.primary,
						marginTop: 6,
					}}
				/>
			) : null}
		</View>
	);
	if (!onPress) return content;
	return (
		<PressableScale
			accessibilityRole="button"
			accessibilityLabel={`${item.title}. ${item.body}`}
			accessibilityHint="Marks as read"
			pressedScale={0.985}
			onPress={() => onPress(item)}
		>
			{content}
		</PressableScale>
	);
}

function iconForKind(kind: string): { icon: IconName; tone: Tone } {
	if (kind.includes("late_change") || kind.includes("acceptance"))
		return { icon: "warning", tone: "warning" };
	if (kind.includes("open_shift") || kind.startsWith("pickup"))
		return { icon: "handRaised", tone: "warning" };
	if (kind.startsWith("swap")) return { icon: "swap", tone: "primary" };
	if (kind.startsWith("release")) return { icon: "release", tone: "primary" };
	if (kind.startsWith("time_off") || kind.startsWith("unavailability"))
		return { icon: "calendarClock", tone: "primary" };
	if (kind.includes("announcement"))
		return { icon: "megaphone", tone: "primary" };
	if (kind.includes("message")) return { icon: "message", tone: "primary" };
	if (kind.includes("coverage"))
		return { icon: "checkCircle", tone: "success" };
	if (kind.includes("schedule")) return { icon: "calendar", tone: "primary" };
	return { icon: "bellFill", tone: "primary" };
}

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const minutes = Math.round(diff / 60000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d`;
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
