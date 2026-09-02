import { createFileRoute } from "@tanstack/react-router";

import { TagsCard } from "@/components/settings-surface-cards";
import { SettingsPage } from "@/components/settings/page";
import { useTags } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/settings/tags")({
	component: TagsSettingsPage,
});

function TagsSettingsPage() {
	const { workplace } = useWorkplace();
	const tags = useTags(workplace?.id);

	return (
		<SettingsPage
			title="Shift tags"
			description="Labels you can apply to shifts on the schedule."
		>
			<TagsCard workplaceId={workplace?.id} tags={tags.data?.tags ?? []} />
		</SettingsPage>
	);
}
