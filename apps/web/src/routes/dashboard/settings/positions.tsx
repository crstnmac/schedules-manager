import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { PositionsCard } from "@/components/settings/core";
import { SettingsPage } from "@/components/settings/page";
import { usePositions } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/positions")({
	component: PositionsSettingsPage,
});

function PositionsSettingsPage() {
	const { workplace } = useWorkplace();
	const positions = usePositions(workplace?.id);
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="Positions"
			description="Roles workers can be scheduled into, like cashier, nurse, or technician."
		>
			<PositionsCard
				positions={positions.data ?? []}
				isLoading={positions.isLoading}
				onChange={() =>
					queryClient.invalidateQueries({
						queryKey: ["workplaces", workplace?.id, "positions"],
					})
				}
			/>
		</SettingsPage>
	);
}
