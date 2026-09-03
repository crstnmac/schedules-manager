import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/page";
import { TimeOffPoliciesCard } from "@/components/settings/policies";
import { useWorkplaceSettings } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/time-off-policies")({
	component: TimeOffPoliciesSettingsPage,
});

function TimeOffPoliciesSettingsPage() {
	const { workplace } = useWorkplace();
	const settings = useWorkplaceSettings(workplace?.id);
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="Time-off policies"
			description="Who can request time off, and when remaining minutes reset. Leave types stay on their own page."
		>
			<TimeOffPoliciesCard
				settings={settings.data}
				isLoading={settings.isLoading}
				onChange={() =>
					queryClient.invalidateQueries({
						queryKey: ["workplace-settings", workplace?.id],
					})
				}
			/>
		</SettingsPage>
	);
}
