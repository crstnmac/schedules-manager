import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/page";
import { LeaveTypesCard } from "@/components/settings-surface-cards";
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
			description="Categories people pick when they request time off. Paid types deduct remaining hours when a request is approved."
		>
			<LeaveTypesCard
				workplaceId={workplace?.id}
				leaveTypes={leaveTypes.data?.leaveTypes ?? []}
			/>
		</SettingsPage>
	);
}
