import { Stack, useLocalSearchParams } from "expo-router";

import { ConversationThread } from "@/components/messages/conversation-thread";
import { useAppTheme } from "@/theme";

export default function ConversationRoute() {
	const { theme } = useAppTheme();
	const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
	return (
		<>
			{/* An opaque bar keeps the inverted list and keyboard offset exact. */}
			<Stack.Screen
				options={{
					title: title || "Conversation",
					headerTransparent: false,
					headerBlurEffect: undefined,
					headerStyle: { backgroundColor: theme.surface },
				}}
			/>
			<ConversationThread conversationId={id} />
		</>
	);
}
