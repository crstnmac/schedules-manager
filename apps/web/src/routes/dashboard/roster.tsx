import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	CalendarDaysIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	PrinterIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { useDayRoster } from "@/lib/queries";
import { formatDay, shiftDays } from "@/lib/time";
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
	mine: boolean;
};

const columnHelper = createDataColumnHelper<RosterRow>();

const columns = columnHelper.columns([
	columnHelper.accessor("worker", {
		header: "Worker",
		cell: ({ row }) => (
			<span className="flex items-center gap-2">
				<span className="font-medium">{row.original.worker}</span>
				{row.original.mine ? <Badge variant="secondary">You</Badge> : null}
			</span>
		),
	}),
	columnHelper.accessor("position", {
		header: "Position",
		cell: ({ getValue }) => (
			<Badge variant="outline">{getValue() || "Unassigned"}</Badge>
		),
	}),
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
	const today = todayKey();
	const [date, setDate] = useState(today);
	const [search, setSearch] = useState("");
	const [positionFilter, setPositionFilter] = useState("all");
	const schedule = useDayRoster(workplace?.id, date);

	const rows = useMemo(
		() =>
			(schedule.data?.roster ?? []).map((shift) => ({
				id: shift.versionShiftId,
				worker: shift.workerName,
				position: shift.positionName,
				window: `${formatClockTime(shift.startsAt)}–${formatClockTime(shift.endsAt)}`,
				mine: shift.mine,
			})),
		[formatClockTime, schedule.data],
	);

	const positionItems = useMemo(() => {
		const names = Array.from(new Set(rows.map((row) => row.position))).sort();
		return [
			{ label: "All positions", value: "all" },
			...names.map((name) => ({ label: name || "Unassigned", value: name })),
		];
	}, [rows]);

	const filteredRows = useMemo(() => {
		const term = search.trim().toLowerCase();
		return rows.filter((row) => {
			if (positionFilter !== "all" && row.position !== positionFilter) {
				return false;
			}
			if (!term) return true;
			return `${row.worker} ${row.position}`.toLowerCase().includes(term);
		});
	}, [positionFilter, rows, search]);

	const pagination = useTablePagination(filteredRows, {
		resetKey: `${search}|${positionFilter}|${date}`,
	});

	return (
		<AppPage>
			<AppPageHeader
				title="Daily roster"
				badge={
					<Badge variant="secondary">
						{rows.length} {rows.length === 1 ? "shift" : "shifts"}
					</Badge>
				}
				description={`${formatDay(date)} · published shifts across your locations`}
				actions={
					<Button
						size="sm"
						variant="outline"
						disabled={
							schedule.isLoading || schedule.isError || rows.length === 0
						}
						onClick={() => window.print()}
					>
						<PrinterIcon data-icon="inline-start" />
						Print
					</Button>
				}
			/>
			<AppPageBody scroll={false}>
				<TableToolbar
					left={
						<>
							<div className="flex items-center gap-1">
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									onClick={() => setDate((current) => shiftDays(current, -1))}
									aria-label="Previous day"
								>
									<ChevronLeftIcon />
								</Button>
								<DatePicker
									value={date}
									onValueChange={setDate}
									buttonClassName="h-7 w-[150px] text-xs"
								/>
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									onClick={() => setDate((current) => shiftDays(current, 1))}
									aria-label="Next day"
								>
									<ChevronRightIcon />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={date === today}
									onClick={() => setDate(today)}
								>
									Today
								</Button>
							</div>
							<TableSearch
								value={search}
								onValueChange={setSearch}
								placeholder="Search worker or position"
							/>
							{positionItems.length > 1 ? (
								<TableFilter
									value={positionFilter}
									onValueChange={setPositionFilter}
									items={positionItems}
									ariaLabel="Filter by position"
								/>
							) : null}
						</>
					}
					right={<TablePagination {...pagination} />}
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					<DataTable
						fill={false}
						stacked
						query={schedule}
						columns={columns}
						data={pagination.pageRows}
						getRowId={(row) => row.id}
						empty={
							<div className="p-4">
								<Empty className="border border-dashed">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<CalendarDaysIcon />
										</EmptyMedia>
										<EmptyTitle>No published shifts</EmptyTitle>
										<EmptyDescription>
											{rows.length === 0
												? "Published shifts for this day appear here. Open the schedule to review staffing."
												: "No shifts match your search or position filter."}
										</EmptyDescription>
									</EmptyHeader>
									{rows.length === 0 ? (
										<Button
											variant="outline"
											nativeButton={false}
											render={<Link to="/dashboard/schedule" />}
										>
											Open schedule
										</Button>
									) : null}
								</Empty>
							</div>
						}
					/>
				</div>
			</AppPageBody>
		</AppPage>
	);
}
