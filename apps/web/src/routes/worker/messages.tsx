import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ConversationWorkspace } from "@/components/conversation-thread";
import { api } from "@/lib/api";
import { useConversations, useMessages } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/messages")({
	component: WorkerMessagesPage,
});

function WorkerMessagesPage() {
	const { workplace, employmentId } = useWorkplace();
	const conversations = useConversations(workplace?.id);
	const [activeId, setActiveId] = useState<string | null>(null);
	const conversationId =
		activeId ?? conversations.data?.conversations[0]?.id;
	const messages = useMessages(conversationId);
	const queryClient = useQueryClient();

	const send = useMutation({
		mutationFn: (body: string) =>
			api(`/v1/conversations/${conversationId}/messages`, {
				method: "POST",
				body: { body },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["messages", conversationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["conversations", workplace?.id],
			});
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<ConversationWorkspace
			threads={conversations.data?.conversations ?? []}
			threadsLoading={conversations.isLoading}
			activeId={conversationId}
			onSelect={setActiveId}
			messages={messages.data?.messages ?? []}
			messagesLoading={messages.isLoading}
			currentEmploymentId={employmentId}
			onSend={(body) => send.mutate(body)}
			sendPending={send.isPending}
			railTitle="Messages"
			railDescription="Workplace and direct threads."
		/>
	);
}
