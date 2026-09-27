import { CardListSkeleton, ErrorState, Screen } from "@/components/ui";
import { WorkerCalendar } from "@/components/worker/worker-calendar";
import { useCurrentEmployment, useMySchedule } from "@/lib/queries";

export default function MySchedulesScreen() {
	const { workplaceId } = useCurrentEmployment();
	const schedule = useMySchedule(workplaceId);

	return (
		<Screen onRefresh={() => schedule.refetch()}>
			{schedule.isLoading ? <CardListSkeleton count={2} /> : null}
			{schedule.isError ? (
				<ErrorState
					title="We couldn’t load your schedule"
					error={schedule.error}
					onRetry={() => void schedule.refetch()}
				/>
			) : (
				<WorkerCalendar workplaceId={workplaceId} schedule={schedule.data} />
			)}
		</Screen>
	);
}
