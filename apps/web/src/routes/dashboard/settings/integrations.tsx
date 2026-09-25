import { createFileRoute } from "@tanstack/react-router";
import {
	ApiKeysCard,
	McpConnectionsCard,
	WebhookDeliveriesCard,
	WebhookEndpointsCard,
} from "@/components/settings/integrations-card";
import { SettingsPage } from "@/components/settings/page";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/integrations")({
	component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
	const { workplace } = useWorkplace();

	return (
		<SettingsPage
			title="Integrations"
			description="Connect assistant services, issue scoped API keys, and send signed webhooks."
		>
			<div className="grid gap-6">
				<McpConnectionsCard workplaceId={workplace?.id} />
				<ApiKeysCard workplaceId={workplace?.id} />
				<WebhookEndpointsCard workplaceId={workplace?.id} />
				<WebhookDeliveriesCard workplaceId={workplace?.id} />
			</div>
		</SettingsPage>
	);
}
