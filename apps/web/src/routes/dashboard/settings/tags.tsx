import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/page";
import { TagsCard } from "@/components/settings-surface-cards";
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
			title="Tags"
			description="Short labels you can attach to a shift, such as Training or Event."
		>
			<TagsCard workplaceId={workplace?.id} tags={tags.data?.tags ?? []} />
		</SettingsPage>
	);
}
