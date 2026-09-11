import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, CalendarDaysIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { usePublishedVersion } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";

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
	const data = version.data;
	const [search, setSearch] = useState("");
	const filteredShifts = useMemo(() => {
		const shifts = data?.shifts ?? [];
		const term = search.trim().toLowerCase();
		if (!term) return shifts;
		return shifts.filter((shift) =>
			`${formatDay(shift.date)} ${shift.positionName} ${shift.note ?? ""}`
				.toLowerCase()
				.includes(term),
		);
	}, [data, search]);
	const pagination = useTablePagination(filteredShifts, { resetKey: search });
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
							<span className="text-muted-foreground tabular-nums">
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

	return (
		<AppPage>
			<AppPageHeader
				title="Published version"
				badge={
					data?.version ? (
						<Badge variant="secondary">v{data.version.versionNumber}</Badge>
					) : null
				}
				description={
					data?.version
						? `Week of ${formatDay(data.weekStart)} · published ${new Date(
								data.version.publishedAt,
							).toLocaleString()}`
						: "A past published week."
				}
				actions={
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={<Link to="/worker" />}
					>
						<ArrowLeftIcon data-icon="inline-start" />
						My schedule
					</Button>
				}
			/>
			<AppPageBody scroll={false}>
				{version.isLoading ? (
					<div className="flex flex-col gap-3 p-4 md:p-6">
						<Skeleton className="h-40" />
					</div>
				) : null}

				{version.isError ? (
					<div className="p-4 md:p-6">
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
					</div>
				) : null}

				{data ? (
					<>
						<TableToolbar
							left={
								<TableSearch
									value={search}
									onValueChange={setSearch}
									placeholder="Search shifts"
								/>
							}
							right={<TablePagination {...pagination} />}
						/>
						<div className="min-h-0 flex-1 overflow-auto">
							<DataTable
								stacked
								fill={false}
								columns={historyShiftColumns}
								data={pagination.pageRows}
								getRowId={(row) => row.id}
								empty={
									<div className="p-4 md:p-6">
										<Empty className="border border-dashed">
											<EmptyHeader>
												<EmptyTitle>
													{data.shifts.length === 0
														? "No shifts"
														: "No matching shifts"}
												</EmptyTitle>
												<EmptyDescription>
													{data.shifts.length === 0
														? "You had no shifts on this published version."
														: "No shifts match your search."}
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</div>
								}
							/>
						</div>
					</>
				) : null}
			</AppPageBody>
		</AppPage>
	);
}
