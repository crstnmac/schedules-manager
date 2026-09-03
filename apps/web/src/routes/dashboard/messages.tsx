import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConversationWorkspace } from "@/components/conversation-thread";
import { api } from "@/lib/api";
import {
	useConversations,
	useMessages,
	useWorkers,
} from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/messages")({
	component: MessagesPage,
});

function MessagesPage() {
	const { workplace, employmentId } = useWorkplace();
	const { formatPerson } = useDisplayPrefs();
	const threads = useConversations(workplace?.id);
	const workers = useWorkers(workplace?.id);
	const [active, setActive] = useState<string | null>(null);
	const conversationId = active ?? threads.data?.conversations[0]?.id;
	const messages = useMessages(conversationId);
	const queryClient = useQueryClient();
	const composePeople = useMemo(
		() =>
			(workers.data?.workers ?? [])
				.filter((row) => row.status === "active")
				.map((row) => ({
					employmentId: row.employmentId,
					name: formatPerson(row.profile.fullName, row.profile.email),
					email: row.profile.email,
				}))
				.sort((left, right) => left.name.localeCompare(right.name)),
		[formatPerson, workers.data?.workers],
	);

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

	const startDirect = useMutation({
		mutationFn: (counterpartEmploymentId: string) =>
			api(`/v1/workplaces/${workplace?.id}/conversations`, {
				method: "POST",
				body: { counterpartEmploymentId },
			}),
		onSuccess: async (result) => {
			await queryClient.invalidateQueries({
				queryKey: ["conversations", workplace?.id],
			});
			const id = (result as { conversation: { id: string } }).conversation.id;
			setActive(id);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<ConversationWorkspace
			threads={threads.data?.conversations ?? []}
			threadsLoading={threads.isLoading}
			activeId={conversationId}
			onSelect={setActive}
			messages={messages.data?.messages ?? []}
			messagesLoading={messages.isLoading}
			currentEmploymentId={employmentId}
			onSend={(body) => send.mutate(body)}
			sendPending={send.isPending}
			railTitle="Threads"
			railDescription="Workplace chat and direct messages."
			composePeople={composePeople}
			composeLoading={workers.isLoading}
			onStartDirect={async (counterpartEmploymentId) => {
				await startDirect.mutateAsync(counterpartEmploymentId);
			}}
			startDirectPending={startDirect.isPending}
		/>
	);
}
