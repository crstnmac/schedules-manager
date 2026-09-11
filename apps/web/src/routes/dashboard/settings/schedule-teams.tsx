import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/page";
import { ScheduleTeamsCard } from "@/components/settings/schedule-teams-card";
import { useLocations } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/schedule-teams")({
	component: ScheduleTeamsSettingsPage,
});

function ScheduleTeamsSettingsPage() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);

	return (
		<SettingsPage
			queries={[locations]}
			title="Schedule teams"
			description="Run several parallel schedules at one location, such as Front of House and Back of House."
		>
			<ScheduleTeamsCard locations={locations.data ?? []} />
		</SettingsPage>
	);
}
