import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SettingsPage } from "@/components/settings/page";
import { TemplatesCard } from "@/components/settings-surface-cards";
import { useLocations, usePositions, useTimeBlocks } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/templates")({
	component: TemplatesSettingsPage,
});

function TemplatesSettingsPage() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
		null,
	);
	const locationId = selectedLocationId ?? locations.data?.[0]?.id;
	const timeBlocks = useTimeBlocks(locationId);

	return (
		<SettingsPage
			title="Templates"
			description="Reusable shift shapes for a position and time window."
		>
			<TemplatesCard
				locations={locations.data ?? []}
				locationId={locationId}
				onLocationChange={setSelectedLocationId}
				positions={positions.data ?? []}
				data={timeBlocks.data}
				isLoading={timeBlocks.isLoading}
			/>
		</SettingsPage>
	);
}
