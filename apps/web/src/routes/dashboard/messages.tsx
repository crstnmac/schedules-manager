import { createFileRoute } from "@tanstack/react-router";

import { MessagesPage } from "@/components/pages/dashboard-messages-page";

export const Route = createFileRoute("/dashboard/messages")({
	component: MessagesPage,
});
