import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/page";
import { PatternsCard } from "@/components/settings/patterns-card";
import { useLocations, usePositions, useWorkers } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/patterns")({
	component: PatternsSettingsPage,
});

function PatternsSettingsPage() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const workers = useWorkers(workplace?.id);

	return (
		<SettingsPage
			queries={[locations, positions, workers]}
			title="Shift patterns"
			description="Reusable multi-week rotations you can project onto future drafts."
		>
			<PatternsCard
				workplaceId={workplace?.id}
				locations={locations.data ?? []}
				positions={positions.data ?? []}
				workers={workers.data?.workers ?? []}
			/>
		</SettingsPage>
	);
}
