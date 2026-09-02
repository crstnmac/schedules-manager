import { createFileRoute } from "@tanstack/react-router";

import { GroupsCard } from "@/components/settings-surface-cards";
import { SettingsPage } from "@/components/settings/page";
import { useGroups, useWorkers } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/groups")({
	component: GroupsSettingsPage,
});

function GroupsSettingsPage() {
	const { workplace } = useWorkplace();
	const workers = useWorkers(workplace?.id);
	const groups = useGroups(workplace?.id);

	return (
		<SettingsPage
			title="Groups"
			description="Group employments for faster scheduling and filtering."
		>
			<GroupsCard
				workplaceId={workplace?.id}
				groups={groups.data?.groups ?? []}
				workers={workers.data?.workers ?? []}
			/>
		</SettingsPage>
	);
}
