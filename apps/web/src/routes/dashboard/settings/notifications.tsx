import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/page";
import { NotificationPreferencesCard } from "@/components/settings/personal";
import { useMe } from "@/lib/queries";

export const Route = createFileRoute("/dashboard/settings/notifications")({
	component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
	const me = useMe();
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="Notifications"
			description="Turn each topic on or off. These apply only to you."
		>
			<NotificationPreferencesCard
				profile={me.data?.profile}
				isLoading={me.isLoading}
				onChange={() => queryClient.invalidateQueries({ queryKey: ["me"] })}
			/>
		</SettingsPage>
	);
}
