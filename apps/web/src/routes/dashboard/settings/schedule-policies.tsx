import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/page";
import { SchedulePoliciesCard } from "@/components/settings/policies";
import { useWorkplaceSettings } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/schedule-policies")({
	component: SchedulePoliciesSettingsPage,
});

function SchedulePoliciesSettingsPage() {
	const { workplace } = useWorkplace();
	const settings = useWorkplaceSettings(workplace?.id);
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="Schedule policies"
			description="Visibility, exchanges, rest rules, and restrictions for published weeks."
		>
			<SchedulePoliciesCard
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
