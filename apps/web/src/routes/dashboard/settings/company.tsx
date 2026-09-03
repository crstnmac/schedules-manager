import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { DirectoryCard } from "@/components/settings/directory";
import { SettingsPage } from "@/components/settings/page";
import { CompanyPoliciesCard } from "@/components/settings/policies";
import { useWorkplaceSettings } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/company")({
	component: CompanySettingsPage,
});

function CompanySettingsPage() {
	const { workplace } = useWorkplace();
	const settings = useWorkplaceSettings(workplace?.id);
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="Company"
			description="Workplace tools, team visibility, and shortcuts to your directory."
		>
			<CompanyPoliciesCard
				settings={settings.data}
				isLoading={settings.isLoading}
				onChange={() =>
					queryClient.invalidateQueries({
						queryKey: ["workplace-settings", workplace?.id],
					})
				}
			/>
			<DirectoryCard />
		</SettingsPage>
	);
}
