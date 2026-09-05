import type { QueryClient } from "@tanstack/react-query";

import type { ConversationMessageDto, MessagesPage } from "./queries";

export type MessagesInfiniteData = {
	pages: MessagesPage[];
	pageParams: unknown[];
};

export type SendVariables = { conversationId: string; body: string };
export type SendResult = { message: ConversationMessageDto };

export function appendMessageToLastPage(
	existing: MessagesInfiniteData | undefined,
	message: ConversationMessageDto,
): MessagesInfiniteData | undefined {
	return existing
		? {
				pages: existing.pages.map((page, index) =>
					index === existing.pages.length - 1
						? { ...page, messages: [...page.messages, message] }
						: page,
				),
				pageParams: existing.pageParams,
			}
		: existing;
}

export function handleSendSuccess(
	queryClient: QueryClient,
	result: SendResult,
	vars: SendVariables,
	workplaceId: string | undefined,
): void {
	queryClient.setQueryData<MessagesInfiniteData>(
		["messages", vars.conversationId],
		(existing) => appendMessageToLastPage(existing, result.message),
	);
	queryClient.invalidateQueries({ queryKey: ["conversations", workplaceId] });
}
