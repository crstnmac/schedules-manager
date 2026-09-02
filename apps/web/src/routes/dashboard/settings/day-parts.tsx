import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DayPartsCard } from "@/components/settings-surface-cards";
import { SettingsPage } from "@/components/settings/page";
import { useLocations, useTimeBlocks } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/day-parts")({
	component: DayPartsSettingsPage,
});

function DayPartsSettingsPage() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);
	const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
		null,
	);
	const locationId = selectedLocationId ?? locations.data?.[0]?.id;
	const timeBlocks = useTimeBlocks(locationId);

	return (
		<SettingsPage
			title="Day parts"
			description="Breakfast, lunch, dinner, and other parts of service."
		>
			<DayPartsCard
				locations={locations.data ?? []}
				locationId={locationId}
				onLocationChange={setSelectedLocationId}
				data={timeBlocks.data}
				isLoading={timeBlocks.isLoading}
			/>
		</SettingsPage>
	);
}
