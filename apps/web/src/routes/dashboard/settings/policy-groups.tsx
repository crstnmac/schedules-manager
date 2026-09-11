import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/page";
import {
	PolicyGroupsCard,
	useApprovalPolicyGroups,
} from "@/components/settings/policy-groups-card";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/policy-groups")({
	component: PolicyGroupsSettingsPage,
});

function PolicyGroupsSettingsPage() {
	const { workplace } = useWorkplace();
	const groups = useApprovalPolicyGroups(workplace?.id);

	return (
		<SettingsPage
			queries={[groups]}
			title="Approval policies"
			description="Choose which worker requests wait for a Manager decision, and attach a policy to a Schedule week."
		>
			<PolicyGroupsCard
				workplaceId={workplace?.id}
				groups={groups.data?.groups ?? []}
				isLoading={groups.isLoading}
			/>
		</SettingsPage>
	);
}
