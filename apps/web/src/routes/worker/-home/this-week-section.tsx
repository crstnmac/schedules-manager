import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { ArrowLeftRightIcon } from "lucide-react";
import {
	lazy,
	memo,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable } from "@/components/data-table";
import { ListToolbar, useListView } from "@/components/list-view";
import { useDayRoster, useProposeSwap, useRequestRelease } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useStablePrefs } from "../-shared/use-stable-prefs";
import {
	dayFilter,
	isPlanned,
	NO_SHIFTS,
	SectionEmpty,
	searchWeekShift,
	shiftHelper,
	shiftRowId,
	WEEK_SORTS,
	type WorkerShift,
	type WorkerWeek,
} from "./shared";

const loadSwapSheet = () => import("./swap-sheet");
const SwapSheet = lazy(loadSwapSheet);

const DEFAULT_SORT = { id: "date", direction: "asc" } as const;

export const ThisWeekSection = memo(function ThisWeekSection({
	week,
	workplaceId,
	mineCount,
	hours,
}: {
	week: WorkerWeek | null;
	workplaceId: string | undefined;
	mineCount: number;
	hours: number;
}) {
	const { formatShiftRange } = useStablePrefs();
	const release = useRequestRelease();
	const releaseMutate = release.mutate;
	const releasePending = release.isPending;
	const [swapShift, setSwapShift] = useState<WorkerShift | null>(null);
	const roster = useDayRoster(workplaceId, swapShift?.date);
	const proposeSwap = useProposeSwap();

	// Warm the swap dialog's chunk once the page is idle so opening it is instant.
	useEffect(() => {
		const id = window.setTimeout(() => void loadSwapSheet(), 1200);
		return () => window.clearTimeout(id);
	}, []);

	const shifts = week?.shifts;
	const filters = useMemo(() => dayFilter(shifts ?? []), [shifts]);
	const list = useListView<WorkerShift>({
		rows: shifts ?? NO_SHIFTS,
		getRowId: shiftRowId,
		search: searchWeekShift,
		filters,
		sorts: WEEK_SORTS,
		defaultSort: DEFAULT_SORT,
		resetKey: week?.weekStart,
	});

	// Re-evaluated when the schedule data changes, not on every render.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `week` is the refresh trigger.
	const nowMs = useMemo(() => Date.now(), [week]);

	const columns = useMemo(
		() =>
			shiftHelper.columns([
				shiftHelper.accessor((row) => formatDay(row.date), {
					id: "date",
					header: "Date",
					cell: ({ getValue, row }) => (
						<span className="flex items-center gap-2 font-medium">
							{getValue()}
							{isPlanned(row.original) ? (
								<Badge variant="outline" className="uppercase">
									Planned
								</Badge>
							) : null}
						</span>
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
				shiftHelper.accessor(
					(row) => `${row.positionName}${row.note ? ` · ${row.note}` : ""}`,
					{ id: "position", header: "Position" },
				),
				shiftHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const shift = row.original;
						if (isPlanned(shift)) {
							return (
								<span className="text-muted-foreground text-xs">
									Planned — not yet published
								</span>
							);
						}
						if (!shift.isMine) {
							return (
								<span className="text-muted-foreground text-xs">
									{shift.workerName ?? "Coworker"}
								</span>
							);
						}
						if (new Date(shift.startsAt).getTime() <= nowMs)
							return (
								<span className="text-muted-foreground text-xs">
									{new Date(shift.endsAt).getTime() <= nowMs
										? "Past shift"
										: "Shift started"}
								</span>
							);
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={new Date(shift.startsAt).getTime() <= nowMs}
									onClick={() => setSwapShift(shift)}
									onPointerEnter={() => void loadSwapSheet()}
									onFocus={() => void loadSwapSheet()}
								>
									<ArrowLeftRightIcon data-icon="inline-start" />
									Propose swap
								</Button>
								<ConfirmAction
									trigger={
										shift.releaseStatus === "pending"
											? "Release pending"
											: "Request release"
									}
									disabled={releasePending || shift.releaseStatus === "pending"}
									title="Release this shift?"
									description="Your manager must approve the release. You remain responsible for the shift until then."
									confirmLabel="Request release"
									onConfirm={() =>
										releaseMutate(shift.id, {
											onSuccess: () =>
												toast.success(
													"Release requested. You remain responsible until a manager approves.",
												),
											onError: (error) => toast.error((error as Error).message),
										})
									}
								/>
							</div>
						);
					},
				}),
			]),
		[formatShiftRange, nowMs, releaseMutate, releasePending],
	);

	const closeSwap = useCallback((open: boolean) => {
		if (!open) setSwapShift(null);
	}, []);

	return (
		<>
			{week && week.shifts.length > 0 ? (
				<Card className="flex min-h-0 flex-1 flex-col">
					<CardHeader className="shrink-0">
						<div className="flex items-start justify-between gap-3">
							<div>
								<CardTitle>This week</CardTitle>
								<CardDescription>
									Week of {formatDay(week.weekStart)}
								</CardDescription>
							</div>
							<p className="font-medium text-muted-foreground text-sm tabular-nums">
								{mineCount} shift
								{mineCount === 1 ? "" : "s"} · {hours.toFixed(1)}h
							</p>
						</div>
					</CardHeader>
					<CardContent className="flex min-h-0 flex-1 flex-col">
						<ListToolbar
							embedded
							list={list}
							searchPlaceholder="Search shifts"
						/>
						<DataTable
							stacked
							stickyHeader
							columns={columns}
							list={list}
							data={list.pagination.pageRows}
							getRowId={shiftRowId}
							className="[&_tbody_tr:last-child]:border-b-0"
							empty={
								<p className="py-6 text-center text-muted-foreground text-sm">
									No shifts match your search or day filter.
								</p>
							}
						/>
					</CardContent>
					<CardFooter className="flex flex-col items-start gap-1">
						{week.shifts.some((shift) => isPlanned(shift)) ? (
							<p className="text-muted-foreground text-xs">
								Planned shifts aren’t published yet and are subject to change.
								You can’t swap or release one until it is published.
							</p>
						) : null}
						<p className="text-muted-foreground text-xs">
							You remain responsible for a released shift until your manager
							approves the hand-off.
						</p>
					</CardFooter>
				</Card>
			) : (
				<SectionEmpty
					title="No shifts this week"
					description="Shifts assigned to you this week will appear here."
				/>
			)}
			{swapShift ? (
				<Suspense fallback={null}>
					<SwapSheet
						key={swapShift.id}
						shift={swapShift}
						open
						onOpenChange={closeSwap}
						roster={roster}
						proposeSwap={proposeSwap}
					/>
				</Suspense>
			) : null}
		</>
	);
});
