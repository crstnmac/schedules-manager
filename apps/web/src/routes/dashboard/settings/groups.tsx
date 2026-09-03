import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/page";
import { GroupsCard } from "@/components/settings-surface-cards";
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
			description="Group people so you can filter the schedule and staff a week faster."
		>
			<GroupsCard
				workplaceId={workplace?.id}
				groups={groups.data?.groups ?? []}
				workers={workers.data?.workers ?? []}
			/>
		</SettingsPage>
	);
}
