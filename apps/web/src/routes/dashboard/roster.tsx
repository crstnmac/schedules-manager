import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { useDayRoster } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/roster")({
	component: RosterPage,
});

function todayKey() {
	return new Date().toLocaleDateString("sv-SE");
}

type RosterRow = {
	id: string;
	worker: string;
	position: string;
	window: string;
};

const columnHelper = createDataColumnHelper<RosterRow>();

const columns = columnHelper.columns([
	columnHelper.accessor("worker", {
		header: "Worker",
		cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
	}),
	columnHelper.accessor("position", { header: "Position" }),
	columnHelper.accessor("window", {
		header: "Shift",
		cell: ({ getValue }) => (
			<span className="text-muted-foreground tabular-nums">{getValue()}</span>
		),
	}),
]);

function RosterPage() {
	const { workplace } = useWorkplace();
	const { formatClockTime } = useDisplayPrefs();
	const date = todayKey();
	const schedule = useDayRoster(workplace?.id, date);
	const rows = useMemo(
		() =>
			(schedule.data?.roster ?? []).map((shift) => ({
				id: shift.versionShiftId,
				worker: shift.workerName,
				position: shift.positionName,
				window: `${formatClockTime(shift.startsAt)}–${formatClockTime(shift.endsAt)}`,
			})),
		[formatClockTime, schedule.data],
	);

	function printRoster() {
		window.print();
	}

	return (
		<AppPage>
			<AppPageHeader
				title="Daily roster"
				description={`${formatDay(date)} · published shifts across your locations`}
				actions={
					<Button
						size="sm"
						variant="outline"
						disabled={
							schedule.isLoading || schedule.isError || rows.length === 0
						}
						onClick={printRoster}
					>
						Print
					</Button>
				}
			/>
			<AppPageBody scroll={false}>
				<DataTable
					query={schedule}
					columns={columns}
					data={rows}
					getRowId={(row) => row.id}
					empty={
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No published shifts today</EmptyTitle>
								<EmptyDescription>
									Published shifts for today appear here. Open the schedule to
									review your staffing.
								</EmptyDescription>
							</EmptyHeader>
							<Button
								variant="outline"
								nativeButton={false}
								render={<Link to="/dashboard/schedule" />}
							>
								Open schedule
							</Button>
						</Empty>
					}
				/>
			</AppPageBody>
		</AppPage>
	);
}
