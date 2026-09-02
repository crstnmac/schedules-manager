import { createFileRoute } from "@tanstack/react-router";

import { LeaveTypesCard } from "@/components/settings-surface-cards";
import { SettingsPage } from "@/components/settings/page";
import { useLeaveTypes } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/leave")({
	component: LeaveSettingsPage,
});

function LeaveSettingsPage() {
	const { workplace } = useWorkplace();
	const leaveTypes = useLeaveTypes(workplace?.id);

	return (
		<SettingsPage
			title="Leave types"
			description="Reasons workers can request time off."
		>
			<LeaveTypesCard
				workplaceId={workplace?.id}
				leaveTypes={leaveTypes.data?.leaveTypes ?? []}
			/>
		</SettingsPage>
	);
}
