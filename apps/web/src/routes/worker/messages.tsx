import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ConversationWorkspace } from "@/components/conversation-thread";
import { api } from "@/lib/api";
import { handleSendSuccess } from "@/lib/messages-cache";
import {
	type ConversationMessageDto,
	useConversations,
	useMessages,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/messages")({
	component: WorkerMessagesPage,
});

export function WorkerMessagesPage() {
	const { workplace, employmentId } = useWorkplace();
	const conversations = useConversations(workplace?.id);
	const [activeId, setActiveId] = useState<string | null>(null);
	const conversationId = activeId ?? conversations.data?.conversations[0]?.id;
	const messages = useMessages(conversationId);
	const queryClient = useQueryClient();

	const send = useMutation({
		mutationFn: ({
			conversationId,
			body,
		}: {
			conversationId: string;
			body: string;
		}) =>
			api<{ message: ConversationMessageDto }>(
				`/v1/conversations/${conversationId}/messages`,
				{
					method: "POST",
					body: { body },
				},
			),
		onSuccess: (result, vars) =>
			handleSendSuccess(queryClient, result, vars, workplace?.id),
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<ConversationWorkspace
			threads={conversations.data?.conversations ?? []}
			threadsLoading={conversations.isLoading}
			activeId={conversationId}
			onSelect={setActiveId}
			messages={messages.messages}
			messagesLoading={messages.isLoading}
			currentEmploymentId={employmentId}
			onSend={(body) => {
				if (!conversationId) return;
				send.mutate({ conversationId, body });
			}}
			sendPending={send.isPending}
			hasMoreMessages={messages.hasMore}
			loadingOlderMessages={messages.isLoadingOlder}
			onLoadOlderMessages={messages.loadOlder}
			railTitle="Messages"
			railDescription="Workplace and direct threads."
		/>
	);
}
