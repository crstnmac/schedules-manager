import { createFileRoute } from "@tanstack/react-router";
import {
	ApiKeysCard,
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
			description="Issue scoped API keys and send signed webhooks when scheduling data changes."
		>
			<div className="grid gap-6">
				<ApiKeysCard workplaceId={workplace?.id} />
				<WebhookEndpointsCard workplaceId={workplace?.id} />
				<WebhookDeliveriesCard workplaceId={workplace?.id} />
			</div>
		</SettingsPage>
	);
}
