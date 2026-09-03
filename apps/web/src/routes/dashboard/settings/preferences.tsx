import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings/page";
import { DisplayPreferencesCard } from "@/components/settings/personal";
import { useMe } from "@/lib/queries";

export const Route = createFileRoute("/dashboard/settings/preferences")({
	component: PreferencesSettingsPage,
});

function PreferencesSettingsPage() {
	const me = useMe();
	const queryClient = useQueryClient();

	return (
		<SettingsPage
			title="Preferences"
			description="Choose a time and name format, then check the live preview."
		>
			<DisplayPreferencesCard
				profile={me.data?.profile}
				isLoading={me.isLoading}
				onChange={() => queryClient.invalidateQueries({ queryKey: ["me"] })}
			/>
		</SettingsPage>
	);
}
