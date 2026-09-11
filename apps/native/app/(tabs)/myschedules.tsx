import { ActivityIndicator, Text } from "react-native";

import {
	AppScreen,
	Card,
	PageHeader,
	SecondaryButton,
	useAppTheme,
} from "@/components/ui";
import { WorkerCalendar } from "@/components/worker-calendar";
import { friendlyMessage } from "@/lib/friendly-message";
import { useCurrentEmployment, useMySchedule } from "@/lib/queries";

export default function MySchedulesScreen() {
	const { theme } = useAppTheme();
	const { employment, workplaceId } = useCurrentEmployment();
	const schedule = useMySchedule(workplaceId);

	return (
		<AppScreen>
			<PageHeader
				title="Calendar"
				subtitle={
					employment?.workplace.name
						? `${employment.workplace.name} · published Shifts`
						: "Published Shifts"
				}
			/>

			{schedule.isLoading ? <ActivityIndicator color={theme.primary} /> : null}

			{schedule.isError ? (
				<Card>
					<Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
						We couldn’t load your schedule
					</Text>
					{schedule.error ? (
						<Text style={{ color: theme.muted, fontSize: 13 }}>
							{friendlyMessage(schedule.error)}
						</Text>
					) : null}
					<SecondaryButton
						label="Try again"
						onPress={() => void schedule.refetch()}
					/>
				</Card>
			) : null}

			{!schedule.isError ? (
				<WorkerCalendar workplaceId={workplaceId} schedule={schedule.data} />
			) : null}
		</AppScreen>
	);
}
