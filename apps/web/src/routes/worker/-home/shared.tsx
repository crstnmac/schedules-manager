import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { memo } from "react";
import { createDataColumnHelper } from "@/components/data-table";
import type { ListFilter, ListSort } from "@/components/list-view";
import type { SwapDetailDto, useMySchedule } from "@/lib/queries";
import { formatDay } from "@/lib/time";

type ScheduleData = NonNullable<ReturnType<typeof useMySchedule>["data"]>;

export type WorkerShift = NonNullable<
	ScheduleData["currentWeek"]
>["shifts"][number];
/**
 * `planned` and a nullable week version are returned for unpublished drafts but
 * may not be present in the shared query type yet.
 */
export type PlannedAwareShift = WorkerShift & { planned?: boolean };
export type WorkerWeek = Omit<
	NonNullable<ScheduleData["currentWeek"]>,
	"version" | "shifts"
> & {
	version: { id: string } | null;
	shifts: PlannedAwareShift[];
};
export type AcceptanceRow = NonNullable<
	ScheduleData["pendingAcceptances"]
>[number];
export type HistoryRow = NonNullable<ScheduleData["history"]>[number];
export type SwapRow = {
	direction: "outgoing" | "incoming";
	swap: SwapDetailDto;
};
export type ShiftTask = { id: string; title: string; completed: boolean };

export function isPlanned(shift: WorkerShift | PlannedAwareShift): boolean {
	return Boolean((shift as PlannedAwareShift).planned);
}

/** Day-filter options (All days + each date present in the week). */
export function dayFilter(shifts: WorkerShift[]): ListFilter<WorkerShift>[] {
	const dates = Array.from(new Set(shifts.map((shift) => shift.date))).sort();
	return dates.length > 1
		? [
				{
					id: "date",
					label: "Day",
					options: dates.map((date) => ({
						label: formatDay(date),
						value: date,
					})),
					value: (shift) => shift.date,
				},
			]
		: [];
}

export const WEEK_SORTS: ListSort<WorkerShift>[] = [
	{
		id: "date",
		label: "Date",
		compare: (a, b) =>
			a.date.localeCompare(b.date) || a.startMinute - b.startMinute,
	},
	{
		id: "position",
		label: "Position",
		compare: (a, b) => a.positionName.localeCompare(b.positionName),
	},
];

export const searchWeekShift = (shift: WorkerShift) => [
	shift.workerName,
	shift.positionName,
	shift.note,
];
export const shiftRowId = (shift: WorkerShift) => shift.id;

export const searchHistory = (row: HistoryRow) => [
	formatDay(row.weekStart),
	`v${row.versionNumber}`,
];
export const HISTORY_SORTS: ListSort<HistoryRow>[] = [
	{
		id: "week",
		label: "Week",
		compare: (a, b) => a.weekStart.localeCompare(b.weekStart),
	},
	{
		id: "publishedAt",
		label: "Published",
		compare: (a, b) => a.publishedAt.localeCompare(b.publishedAt),
	},
];
export const historyRowId = (row: HistoryRow) => row.versionId;
export const acceptanceRowId = (row: AcceptanceRow) => row.id;
export const swapRowId = (row: SwapRow) => row.swap.id;
export const taskRowId = (row: ShiftTask) => row.id;
export const SWAP_FILTERS: ListFilter<SwapRow>[] = [
	{
		id: "status",
		label: "Status",
		options: [
			{ label: "Waiting on coworker", value: "pending_counterpart" },
			{ label: "Waiting on manager", value: "pending_manager" },
		],
		value: (row) => row.swap.status,
	},
];

export const acceptanceHelper = createDataColumnHelper<AcceptanceRow>();
export const shiftHelper = createDataColumnHelper<WorkerShift>();
export const historyHelper = createDataColumnHelper<HistoryRow>();
export const swapHelper = createDataColumnHelper<SwapRow>();
export const taskHelper = createDataColumnHelper<ShiftTask>();

/** Stable empty arrays so memoised hooks don't see a new `[]` every render. */
export const NO_SHIFTS: PlannedAwareShift[] = [];
export const NO_HISTORY: HistoryRow[] = [];
export const NO_ACCEPTANCES: AcceptanceRow[] = [];

export const SectionEmpty = memo(function SectionEmpty({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<Empty className="border border-dashed">
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
});
