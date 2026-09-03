import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { WorkplaceCard } from "@/components/settings/core";
import { DirectoryCard } from "@/components/settings/directory";
import { SettingsPage } from "@/components/settings/page";
import { useWorkplaceSettings } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/workplace")({
	component: WorkplaceSettingsPage,
});

function WorkplaceSettingsPage() {
	const { workplace } = useWorkplace();
	const settings = useWorkplaceSettings(workplace?.id);
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="General"
			description="Name, week, pay period, and labor defaults for this workplace."
		>
			<WorkplaceCard
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
