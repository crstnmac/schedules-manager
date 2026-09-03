import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsPage } from "@/components/settings/page";
import { TimeBlocksCard } from "@/components/settings-surface-cards";
import { useLocations, useTimeBlocks } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/time-blocks")({
	component: TimeBlocksSettingsPage,
});

function TimeBlocksSettingsPage() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);
	const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
		null,
	);
	const locationId = selectedLocationId ?? locations.data?.[0]?.id;
	const timeBlocks = useTimeBlocks(locationId);

	return (
		<SettingsPage
			title="Time blocks"
			description="Named windows of the day you can reuse while building a week."
		>
			<TimeBlocksCard
				locations={locations.data ?? []}
				locationId={locationId}
				onLocationChange={setSelectedLocationId}
				data={timeBlocks.data}
				isLoading={timeBlocks.isLoading}
			/>
		</SettingsPage>
	);
}
