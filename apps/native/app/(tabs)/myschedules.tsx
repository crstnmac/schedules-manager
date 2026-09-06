import { AppScreen, EmptyState, PageHeader } from "@/components/ui";

export default function MySchedulesScreen() {
	return (
		<AppScreen>
			<PageHeader title="My schedules" />
			<EmptyState
				title="Nothing here yet"
				body="When your Manager publishes a Schedule, it will show up on this page."
			/>
		</AppScreen>
	);
}
