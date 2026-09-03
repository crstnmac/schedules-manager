import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { LocationsCard } from "@/components/settings/core";
import { SettingsPage } from "@/components/settings/page";
import { useLocations } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/locations")({
	component: LocationsSettingsPage,
});

function LocationsSettingsPage() {
	const { workplace } = useWorkplace();
	const locations = useLocations(workplace?.id);
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="Locations"
			description="Sites where people can be scheduled, including time zone, address, and kiosk."
		>
			<LocationsCard
				locations={locations.data ?? []}
				isLoading={locations.isLoading}
				onChange={() =>
					queryClient.invalidateQueries({
						queryKey: ["workplaces", workplace?.id, "locations"],
					})
				}
			/>
		</SettingsPage>
	);
}
