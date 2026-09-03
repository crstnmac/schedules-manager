import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TimerIcon } from "lucide-react";
import { useMemo } from "react";

import { AppDocument, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { TimeClockCard } from "@/components/time-clock-card";
import {
	type TimecardEntry,
	useMySchedule,
	useMyTimeEntries,
} from "@/lib/queries";
import { formatDay, formatDurationMs } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/clock")({
	component: ManagerClockPage,
});

type AssignedShift = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["currentWeek"]
>["shifts"][number];

const shiftHelper = createDataColumnHelper<AssignedShift>();
const punchHelper = createDataColumnHelper<TimecardEntry>();

function ManagerClockPage() {
	const { workplace } = useWorkplace();
	const { formatClockTime, formatShiftRange } = useDisplayPrefs();
	const schedule = useMySchedule(workplace?.id);
	const timecard = useMyTimeEntries(workplace?.id);
	const nextShift = schedule.data?.nextShift ?? null;
	const currentWeek = schedule.data?.currentWeek ?? null;
	const assignedShifts = currentWeek?.shifts ?? [];
	const entries = timecard.data?.timeEntries ?? [];
	const onClock =
		nextShift?.timeEntry != null && nextShift.timeEntry.clockedOutAt === null;

	const shiftColumns = useMemo(
		() =>
			shiftHelper.columns([
				shiftHelper.accessor((row) => formatDay(row.date), {
					id: "date",
					header: "Date",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				shiftHelper.accessor(
					(row) =>
						formatShiftRange(row.startMinute, row.endMinute, row.overnight),
					{
						id: "window",
						header: "Shift",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground tabular-nums">
								{getValue()}
							</span>
						),
					},
				),
				shiftHelper.accessor("positionName", { header: "Position" }),
			]),
		[formatShiftRange],
	);

	const punchColumns = useMemo(
		() =>
			punchHelper.columns([
				punchHelper.accessor((row) => formatDay(row.clockedInAt), {
					id: "day",
					header: "Day",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				punchHelper.accessor("positionName", { header: "Position" }),
				punchHelper.accessor(
					(row) =>
						`${formatClockTime(row.clockedInAt)} – ${
							row.clockedOutAt
								? formatClockTime(row.clockedOutAt)
								: "on the clock"
						}`,
					{
						id: "window",
						header: "Clock window",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground tabular-nums">
								{getValue()}
							</span>
						),
					},
				),
				punchHelper.accessor(
					(row) =>
						row.clockedOutAt == null
							? Date.now() - new Date(row.clockedInAt).getTime()
							: new Date(row.clockedOutAt).getTime() -
								new Date(row.clockedInAt).getTime(),
					{
						id: "duration",
						header: "Duration",
						cell: ({ getValue }) => (
							<span className="tabular-nums">
								{formatDurationMs(getValue())}
							</span>
						),
					},
				),
			]),
		[formatClockTime],
	);

	return (
		<AppDocument widthClassName="max-w-5xl" className="gap-5">
			<AppPageHeader
				title="Your clock"
				description={
					onClock
						? "You’re on the clock. Punch out when this shift ends."
						: "Clock in for your assigned published Shift, then review punches below."
				}
				className="border-0 px-0 py-0"
			/>

			{schedule.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-40 rounded-2xl" />
					<div className="grid gap-4 lg:grid-cols-2">
						<Skeleton className="h-40" />
						<Skeleton className="h-40" />
					</div>
				</div>
			) : null}

			{schedule.isError ? (
				<Alert variant="destructive">
					<AlertTitle>We couldn’t load your shifts</AlertTitle>
					<AlertDescription className="flex flex-col items-start gap-3">
						<span>{(schedule.error as Error).message}</span>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void schedule.refetch()}
						>
							Try again
						</Button>
					</AlertDescription>
				</Alert>
			) : null}

			{nextShift ? <TimeClockCard shift={nextShift} /> : null}

			{!schedule.isLoading && !schedule.isError && !nextShift ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<TimerIcon />
						</EmptyMedia>
						<EmptyTitle>No shift to clock</EmptyTitle>
						<EmptyDescription>
							Assign yourself a published Shift on the Schedule, then return
							here to punch in.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button
							nativeButton={false}
							render={<Link to="/dashboard/schedule" />}
						>
							Open Schedule
						</Button>
					</EmptyContent>
				</Empty>
			) : null}

			{!schedule.isLoading && !schedule.isError ? (
				<div className="grid items-start gap-4 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>This week</CardTitle>
							<CardDescription>
								Published Shifts assigned to you.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{assignedShifts.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No assigned shifts this week.
								</p>
							) : (
								<DataTable
									fill={false}
									columns={shiftColumns}
									data={assignedShifts}
									getRowId={(row) => row.id}
								/>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Your punches</CardTitle>
							<CardDescription>Recent Time Entries.</CardDescription>
						</CardHeader>
						<CardContent>
							{timecard.isLoading ? <Skeleton className="h-32" /> : null}
							{timecard.isError ? (
								<p className="text-muted-foreground text-sm">
									{(timecard.error as Error).message}
								</p>
							) : null}
							{!timecard.isLoading &&
							!timecard.isError &&
							entries.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No punches yet. They’ll show up after you clock in.
								</p>
							) : null}
							{entries.length > 0 ? (
								<DataTable
									fill={false}
									columns={punchColumns}
									data={entries}
									getRowId={(row) => row.id}
								/>
							) : null}
						</CardContent>
					</Card>
				</div>
			) : null}
		</AppDocument>
	);
}
