import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

import {
	AppScreen,
	Card,
	NativeField,
	PageHeader,
	PrimaryButton,
	useAppTheme,
} from "@/components/ui";
import {
	useConversationMessages,
	useConversations,
	useCurrentEmployment,
	useSendConversationMessage,
} from "@/lib/queries";

export default function MessagesScreen() {
	const { theme } = useAppTheme();
	const router = useRouter();
	const { workplaceId } = useCurrentEmployment();
	const conversations = useConversations(workplaceId);
	const [conversationId, setConversationId] = useState<string>();
	const [body, setBody] = useState("");
	const messages = useConversationMessages(conversationId);
	const send = useSendConversationMessage(conversationId);

	useEffect(() => {
		if (!conversationId && conversations.data?.[0]) {
			setConversationId(conversations.data[0].id);
		}
	}, [conversationId, conversations.data]);

	const selected = conversations.data?.find(
		(conversation) => conversation.id === conversationId,
	);

	return (
		<AppScreen>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Go back"
				onPress={() => router.back()}
				style={styles.backRow}
			>
				<Ionicons name="chevron-back" size={20} color={theme.primary} />
				<Text style={[styles.backText, { color: theme.primary }]}>More</Text>
			</Pressable>
			<PageHeader
				eyebrow="WORKPLACE"
				title="Messages"
				description="Keep conversations with your Workplace in one place."
			/>

			{conversations.isLoading ? (
				<ActivityIndicator color={theme.primary} />
			) : null}
			{conversations.data && conversations.data.length > 1 ? (
				<View style={styles.conversationRow}>
					{conversations.data.map((conversation) => {
						const active = conversation.id === conversationId;
						return (
							<Pressable
								key={conversation.id}
								accessibilityRole="button"
								accessibilityState={{ selected: active }}
								onPress={() => setConversationId(conversation.id)}
								style={[
									styles.conversationChip,
									{
										borderColor: active ? theme.primary : theme.border,
										backgroundColor: active ? theme.primary : "transparent",
									},
								]}
							>
								<Text
									style={{
										color: active ? theme.onPrimary : theme.text,
										fontWeight: "700",
									}}
								>
									{conversation.title}
								</Text>
							</Pressable>
						);
					})}
				</View>
			) : null}

			{selected ? (
				<Text style={[styles.sectionTitle, { color: theme.muted }]}>
					{selected.title.toUpperCase()}
				</Text>
			) : null}
			{messages.isLoading ? <ActivityIndicator color={theme.primary} /> : null}
			{messages.data?.map((message) => (
				<Card key={message.id}>
					<View style={styles.messageMeta}>
						<Text style={[styles.author, { color: theme.text }]}>
							{message.author}
						</Text>
						<Text style={[styles.date, { color: theme.muted }]}>
							{new Date(message.createdAt).toLocaleString(undefined, {
								month: "short",
								day: "numeric",
								hour: "numeric",
								minute: "2-digit",
							})}
						</Text>
					</View>
					<Text style={[styles.messageBody, { color: theme.text }]}>
						{message.body}
					</Text>
				</Card>
			))}
			{conversationId && messages.data?.length === 0 ? (
				<Card>
					<Text style={[styles.messageBody, { color: theme.muted }]}>
						No messages yet. Start the conversation below.
					</Text>
				</Card>
			) : null}
			{conversations.isError || messages.isError || send.isError ? (
				<Text style={[styles.error, { color: theme.notification }]}>
					{
						((conversations.error ?? messages.error ?? send.error) as Error)
							.message
					}
				</Text>
			) : null}

			{conversationId ? (
				<Card>
					<NativeField
						label="Message"
						value={body}
						onChange={setBody}
						placeholder="Write a Workplace Message"
						multiline
					/>
					<PrimaryButton
						label={send.isPending ? "Sending…" : "Send Message"}
						loading={send.isPending}
						disabled={!body.trim()}
						onPress={() =>
							send.mutate(body.trim(), {
								onSuccess: () => setBody(""),
							})
						}
					/>
				</Card>
			) : null}
		</AppScreen>
	);
}

const styles = StyleSheet.create({
	backRow: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	backText: { fontSize: 15, fontWeight: "600" },
	conversationRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	conversationChip: {
		minHeight: 40,
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
	messageMeta: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 12,
	},
	author: { flex: 1, fontSize: 14, fontWeight: "700" },
	date: { fontSize: 11 },
	messageBody: { fontSize: 14, lineHeight: 21 },
	error: { fontSize: 14, lineHeight: 20 },
});
