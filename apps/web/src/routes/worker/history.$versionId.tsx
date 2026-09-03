import { createFileRoute, Link } from "@tanstack/react-router";
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
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { ArrowLeftIcon, CalendarDaysIcon } from "lucide-react";

import { usePublishedVersion } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { AppDocument } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { useMemo } from "react";

export const Route = createFileRoute("/worker/history/$versionId")({
	component: WorkerHistory,
});

type HistoryShift = NonNullable<
	NonNullable<ReturnType<typeof usePublishedVersion>["data"]>["shifts"]
>[number];

const historyShiftHelper = createDataColumnHelper<HistoryShift>();

function WorkerHistory() {
	const { versionId } = Route.useParams();
	const { formatShiftRange } = useDisplayPrefs();
	const version = usePublishedVersion(versionId);
	const historyShiftColumns = useMemo(
		() =>
			historyShiftHelper.columns([
				historyShiftHelper.accessor((row) => formatDay(row.date), {
					id: "date",
					header: "Date",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				historyShiftHelper.accessor(
					(row) =>
						formatShiftRange(row.startMinute, row.endMinute, row.overnight),
					{
						id: "window",
						header: "Shift",
						cell: ({ getValue }) => (
							<span className="tabular-nums text-muted-foreground">
								{getValue()}
							</span>
						),
					},
				),
				historyShiftHelper.accessor("positionName", { header: "Position" }),
				historyShiftHelper.accessor("note", {
					header: "Note",
					cell: ({ getValue }) => getValue() ?? "—",
				}),
			]),
		[formatShiftRange],
	);
	const data = version.data;

	return (
		<AppDocument>
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				nativeButton={false}
				render={<Link to="/worker" />}
			>
				<ArrowLeftIcon data-icon="inline-start" />
				Back to my schedule
			</Button>

			{version.isLoading ? <Skeleton className="h-40" /> : null}

			{version.isError ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CalendarDaysIcon />
						</EmptyMedia>
						<EmptyTitle>This published week is not available</EmptyTitle>
						<EmptyDescription>
							You can only open versions that belong to your workplace.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			{data ? (
				<Card>
					<CardHeader>
						<CardTitle>Week of {formatDay(data.weekStart)}</CardTitle>
						<CardDescription>
							Published version {data.version.versionNumber} on{" "}
							{new Date(data.version.publishedAt).toLocaleString()}. Opening a
							past week does not mark it as seen.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<DataTable
							fill={false}
							columns={historyShiftColumns}
							data={data.shifts}
							getRowId={(row) => row.id}
							empty={
								<p className="text-muted-foreground text-sm">
									You had no shifts on this published version.
								</p>
							}
						/>
					</CardContent>
				</Card>
			) : null}
		</AppDocument>
	);
}
