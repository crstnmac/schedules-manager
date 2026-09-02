import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { TimeBlocksCard } from "@/components/settings-surface-cards";
import { SettingsPage } from "@/components/settings/page";
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
			description="Named windows you can reuse when building the week."
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
