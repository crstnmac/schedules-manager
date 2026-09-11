import { createFileRoute } from "@tanstack/react-router";

import {
	LeaveApprovalChainsCard,
	LeavePoliciesCard,
} from "@/components/settings/leave-policies-card";
import { SettingsPage } from "@/components/settings/page";
import { useApprovalChains, useLeaveTypes } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/leave-policies")({
	component: LeavePoliciesSettingsPage,
});

function LeavePoliciesSettingsPage() {
	const { workplace } = useWorkplace();
	const leaveTypes = useLeaveTypes(workplace?.id);
	const chains = useApprovalChains(workplace?.id);

	return (
		<SettingsPage
			queries={[leaveTypes, chains]}
			title="Leave policies"
			description="Accrual, balance, and approval rules behind each leave type."
		>
			<div className="flex flex-col gap-6">
				<LeavePoliciesCard workplaceId={workplace?.id} />
				<LeaveApprovalChainsCard workplaceId={workplace?.id} />
			</div>
		</SettingsPage>
	);
}
