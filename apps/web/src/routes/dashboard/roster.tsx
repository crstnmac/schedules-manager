import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import {
	AppPage,
	AppPageBody,
	AppPageHeader,
} from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { useLocations, useSchedule } from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/roster")({
	component: RosterPage,
});

function todayKey() {
	return new Date().toLocaleDateString("sv-SE");
}

function weekStartOfToday() {
	const date = new Date();
	const day = date.getDay();
	date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
	return date.toLocaleDateString("sv-SE");
}

type RosterRow = {
	id: string;
	worker: string;
	position: string;
	window: string;
	status: string;
};

const columnHelper = createDataColumnHelper<RosterRow>();

const columns = columnHelper.columns([
	columnHelper.accessor("worker", {
		header: "Worker",
		cell: ({ getValue }) => (
			<span className="font-medium">{getValue()}</span>
		),
	}),
	columnHelper.accessor("position", { header: "Position" }),
	columnHelper.accessor("window", {
		header: "Shift",
		cell: ({ getValue }) => (
			<span className="tabular-nums text-muted-foreground">{getValue()}</span>
		),
	}),
	columnHelper.accessor("status", {
		header: "Status",
		cell: ({ getValue }) => {
			const status = getValue();
			return (
				<Badge variant={status === "no_show" ? "destructive" : "secondary"}>
					{status}
				</Badge>
			);
		},
	}),
]);

function RosterPage() {
	const { workplace } = useWorkplace();
	const { formatMinute } = useDisplayPrefs();
	const locations = useLocations(workplace?.id);
	const locationId = locations.data?.[0]?.id;
	const schedule = useSchedule(locationId, weekStartOfToday());
	const date = todayKey();
	const rows = useMemo(() => {
		const shifts = (schedule.data?.shifts ?? []).filter(
			(shift) => shift.date === date,
		);
		const clock = new Map(
			(schedule.data?.timeclock ?? []).map((row) => [row.shiftId, row]),
		);
		return shifts.map((shift) => {
			const punch = clock.get(shift.id);
			const status = punch?.attendance
				? punch.attendance
				: punch?.status === "open"
					? "clocked-in"
					: punch?.status === "closed"
						? "done"
						: "scheduled";
			return {
				id: shift.id,
				worker: shift.workerName ?? "Open shift",
				position: shift.positionName,
				window: `${formatMinute(shift.startMinute)}–${formatMinute(shift.endMinute)}`,
				status,
			};
		});
	}, [date, formatMinute, schedule.data]);

	function printRoster() {
		window.print();
	}

	return (
		<AppPage>
			<AppPageHeader
				title="Daily roster"
				description={`${date} · live punch and attendance marks`}
				actions={
					<Button size="sm" variant="outline" onClick={printRoster}>
						Print
					</Button>
				}
			/>
			<AppPageBody scroll={false}>
				<DataTable
					columns={columns}
					data={rows}
					getRowId={(row) => row.id}
					empty={
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No published shifts today</EmptyTitle>
								<EmptyDescription>
									When today has published shifts, they will appear here with
									live punch status.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					}
				/>
			</AppPageBody>
		</AppPage>
	);
}
