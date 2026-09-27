import { useRouter } from "expo-router";
import { View } from "react-native";

import {
	Appear,
	AppText,
	Avatar,
	Card,
	CardListSkeleton,
	Divider,
	EmptyState,
	ErrorState,
	Icon,
	IconTile,
	PressableScale,
	Screen,
} from "@/components/ui";
import { positionColor } from "@/lib/position-color";
import {
	useConversations,
	useCurrentEmployment,
	type WorkplaceConversation,
} from "@/lib/queries";
import { spacing, useAppTheme } from "@/theme";

/** Conversation list; each row opens its thread. */
export default function MessagesScreen() {
	const router = useRouter();
	const { workplaceId, employment } = useCurrentEmployment();
	const conversations = useConversations(workplaceId);
	const items = conversations.data ?? [];

	return (
		<Screen onRefresh={() => conversations.refetch()}>
			{conversations.isLoading ? <CardListSkeleton count={2} /> : null}
			{conversations.isError ? (
				<ErrorState
					error={conversations.error}
					onRetry={() => void conversations.refetch()}
				/>
			) : null}

			{!conversations.isLoading &&
			!conversations.isError &&
			items.length === 0 ? (
				<EmptyState
					icon="message"
					title="No conversations yet"
					body="Workplace conversations appear here once your Manager starts one."
				/>
			) : null}

			{items.length > 0 ? (
				<Appear>
					<Card padded={false} style={{ gap: 0 }}>
						{items.map((conversation, index) => (
							<View key={conversation.id}>
								{index > 0 ? <Divider inset={72} /> : null}
								<ConversationRow
									conversation={conversation}
									workplaceName={employment?.workplace.name}
									onPress={() =>
										router.push({
											pathname: "/conversation/[id]",
											params: {
												id: conversation.id,
												title: conversation.title,
											},
										})
									}
								/>
							</View>
						))}
					</Card>
				</Appear>
			) : null}
		</Screen>
	);
}

function shortTime(iso: string) {
	const date = new Date(iso);
	const now = new Date();
	if (date.toDateString() === now.toDateString())
		return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	const days = (now.getTime() - date.getTime()) / 86_400_000;
	if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ConversationRow({
	conversation,
	workplaceName,
	onPress,
}: {
	conversation: WorkplaceConversation;
	workplaceName?: string;
	onPress: () => void;
}) {
	const { theme } = useAppTheme();
	const everyone = conversation.kind === "workplace";
	const last = conversation.lastMessage;
	const preview = last
		? `${last.mine ? "You" : everyone ? last.author.split(" ")[0] : ""}${last.mine || everyone ? ": " : ""}${last.body}`
		: everyone
			? `Everyone at ${workplaceName ?? "your workplace"}`
			: (conversation.subtitle ?? "Direct message");
	return (
		<PressableScale
			accessibilityRole="button"
			accessibilityLabel={`${conversation.title}. ${preview}`}
			haptic
			pressedScale={0.985}
			onPress={onPress}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.md,
				paddingHorizontal: spacing.lg,
				paddingVertical: spacing.md,
				minHeight: 76,
			}}
		>
			{everyone ? (
				<IconTile icon="people" size={48} />
			) : (
				<Avatar
					name={conversation.title}
					size={48}
					color={positionColor(conversation.title)}
				/>
			)}
			<View style={{ flex: 1, gap: 3 }}>
				<View
					style={{
						flexDirection: "row",
						alignItems: "baseline",
						gap: spacing.sm,
					}}
				>
					<AppText variant="headline" numberOfLines={1} style={{ flex: 1 }}>
						{conversation.title}
					</AppText>
					{last ? (
						<AppText variant="caption" tone="tertiary" tabular>
							{shortTime(last.createdAt)}
						</AppText>
					) : null}
				</View>
				<AppText variant="footnote" tone="secondary" numberOfLines={2}>
					{preview}
				</AppText>
			</View>
			<Icon name="chevronRight" size={13} color={theme.textTertiary} />
		</PressableScale>
	);
}
