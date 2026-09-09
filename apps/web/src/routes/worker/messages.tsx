import { createFileRoute } from "@tanstack/react-router";

import { WorkerMessagesPage } from "@/components/pages/worker-messages-page";

export const Route = createFileRoute("/worker/messages")({
	component: WorkerMessagesPage,
});
