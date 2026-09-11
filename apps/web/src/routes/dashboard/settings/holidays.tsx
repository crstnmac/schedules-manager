import { createFileRoute } from "@tanstack/react-router";
import { HolidaysCard } from "@/components/settings/holidays-card";
import { SettingsPage } from "@/components/settings/page";
import { useHolidays, useLocations } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/holidays")({
	component: HolidaysSettingsPage,
});

function HolidaysSettingsPage() {
	const { workplace } = useWorkplace();
	const holidays = useHolidays(workplace?.id);
	const locations = useLocations(workplace?.id);

	return (
		<SettingsPage
			queries={[holidays, locations]}
			title="Holidays"
			description="Non-working days shown as context on the schedule. Recurring holidays repeat every year."
		>
			<HolidaysCard
				workplaceId={workplace?.id}
				holidays={holidays.data?.holidays ?? []}
				locations={locations.data ?? []}
			/>
		</SettingsPage>
	);
}
