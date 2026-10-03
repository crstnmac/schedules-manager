import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { memo, useMemo } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable } from "@/components/data-table";
import { ListToolbar, useListView } from "@/components/list-view";
import { api } from "@/lib/api";
import { useRespondToAcceptance } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useStablePrefs } from "../-shared/use-stable-prefs";
import {
	type AcceptanceRow,
	acceptanceHelper,
	acceptanceRowId,
	dayFilter,
	HISTORY_SORTS,
	type HistoryRow,
	historyHelper,
	historyRowId,
	isPlanned,
	NO_SHIFTS,
	SectionEmpty,
	type ShiftTask,
	searchHistory,
	searchWeekShift,
	shiftHelper,
	shiftRowId,
	taskHelper,
	taskRowId,
	WEEK_SORTS,
	type WorkerShift,
	type WorkerWeek,
} from "./shared";

const NEXT_WEEK_SORT = { id: "date", direction: "asc" } as const;
const HISTORY_SORT = { id: "week", direction: "desc" } as const;

export const NextWeekSection = memo(function NextWeekSection({
	week,
}: {
	week: WorkerWeek | null;
}) {
	const { formatShiftRange } = useStablePrefs();
	const shifts = week?.shifts;
	const filters = useMemo(() => dayFilter(shifts ?? []), [shifts]);
	const list = useListView<WorkerShift>({
		rows: shifts ?? NO_SHIFTS,
		getRowId: shiftRowId,
		search: searchWeekShift,
		filters,
		sorts: WEEK_SORTS,
		defaultSort: NEXT_WEEK_SORT,
		resetKey: week?.weekStart,
	});
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
					(row) =>
						`${row.positionName}${!row.isMine && row.workerName ? ` · ${row.workerName}` : ""}`,
					{ id: "position", header: "Position" },
				),
			]),
		[formatShiftRange],
	);

	if (!week || (week.shifts?.length ?? 0) === 0) {
		return (
			<SectionEmpty
				title="No shifts next week"
				description="Shifts planned or published for next week will appear here."
			/>
		);
	}
	return (
		<Card className="flex min-h-0 flex-1 flex-col">
			<CardHeader className="shrink-0">
				<CardTitle>Next week</CardTitle>
				<CardDescription>Week of {formatDay(week.weekStart)}</CardDescription>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col">
				<ListToolbar embedded list={list} searchPlaceholder="Search shifts" />
				<DataTable
					stacked
					stickyHeader
					columns={columns}
					list={list}
					data={list.pagination.pageRows}
					getRowId={shiftRowId}
					empty={
						<p className="py-6 text-center text-muted-foreground text-sm">
							No shifts match your search or day filter.
						</p>
					}
				/>
				{week.shifts.some((shift) => isPlanned(shift)) ? (
					<p className="mt-2 text-muted-foreground text-xs">
						Planned shifts aren’t published yet and are subject to change.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
});

const historyColumns = historyHelper.columns([
	historyHelper.accessor((row) => formatDay(row.weekStart), {
		id: "week",
		header: "Week",
		cell: ({ getValue, row }) => (
			<span className="font-medium">
				Week of {getValue()} · v{row.original.versionNumber}
			</span>
		),
	}),
	historyHelper.accessor("publishedAt", {
		header: "Published",
		cell: ({ getValue }) => new Date(getValue()).toLocaleString(),
	}),
	historyHelper.display({
		id: "actions",
		header: "Actions",
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex justify-end">
				<Button
					size="sm"
					variant="outline"
					nativeButton={false}
					render={
						<Link
							to="/worker/history/$versionId"
							params={{ versionId: row.original.versionId }}
							preload="intent"
						/>
					}
				>
					View
				</Button>
			</div>
		),
	}),
]);

export const HistorySection = memo(function HistorySection({
	history,
}: {
	history: HistoryRow[];
}) {
	const list = useListView<HistoryRow>({
		rows: history,
		getRowId: historyRowId,
		search: searchHistory,
		sorts: HISTORY_SORTS,
		defaultSort: HISTORY_SORT,
	});
	if (history.length === 0) {
		return (
			<SectionEmpty
				title="No earlier published weeks"
				description="Past published weeks you can still open will appear here."
			/>
		);
	}
	return (
		<Card className="flex min-h-0 flex-1 flex-col">
			<CardHeader className="shrink-0">
				<CardTitle>Earlier published weeks</CardTitle>
				<CardDescription>
					Opening a past week does not mark it as seen.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col">
				<ListToolbar embedded list={list} searchPlaceholder="Search weeks" />
				<DataTable
					stacked
					stickyHeader
					columns={historyColumns}
					list={list}
					data={list.pagination.pageRows}
					getRowId={historyRowId}
					empty={
						<p className="py-6 text-center text-muted-foreground text-sm">
							No published weeks match your search.
						</p>
					}
				/>
			</CardContent>
		</Card>
	);
});

export const PendingSection = memo(function PendingSection({
	acceptances,
	changes,
}: {
	acceptances: AcceptanceRow[];
	changes: string[];
}) {
	const { formatMinute } = useStablePrefs();
	const respond = useRespondToAcceptance();
	const respondMutate = respond.mutate;
	const respondPending = respond.isPending;
	const list = useListView<AcceptanceRow>({
		rows: acceptances,
		getRowId: acceptanceRowId,
	});
	const columns = useMemo(
		() =>
			acceptanceHelper.columns([
				acceptanceHelper.accessor(
					(row) => `${formatDay(row.date)} · ${formatMinute(row.startMinute)}`,
					{
						id: "when",
						header: "When",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				acceptanceHelper.accessor("positionName", { header: "Position" }),
				acceptanceHelper.accessor("changeSummary", { header: "Change" }),
				acceptanceHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								size="sm"
								disabled={respondPending}
								onClick={() =>
									respondMutate(
										{ acceptanceId: row.original.id, decision: "accept" },
										{
											onSuccess: () => toast.success("Shift accepted."),
											onError: (error) => toast.error((error as Error).message),
										},
									)
								}
							>
								{respondPending ? <Spinner data-icon="inline-start" /> : null}
								Accept shift
							</Button>
							<ConfirmAction
								trigger="Decline"
								disabled={respondPending}
								title="Decline this shift change?"
								description="Declining tells your manager you can’t work the changed shift."
								confirmLabel="Decline shift"
								destructive
								onConfirm={() =>
									respondMutate(
										{ acceptanceId: row.original.id, decision: "decline" },
										{
											onError: (error) => toast.error((error as Error).message),
										},
									)
								}
							/>
						</div>
					),
				}),
			]),
		[formatMinute, respondMutate, respondPending],
	);

	if (acceptances.length === 0 && changes.length === 0) {
		return (
			<SectionEmpty
				title="Nothing pending"
				description="Late schedule changes that need your acceptance appear here."
			/>
		);
	}
	return (
		<>
			{changes.length > 0 ? (
				<Alert role="status">
					<AlertTitle>What changed this week</AlertTitle>
					<AlertDescription>
						<ul className="flex flex-col gap-1">
							{changes.map((change) => (
								<li key={change}>{change}</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			) : null}
			{acceptances.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Your shift changed</CardTitle>
						<CardDescription>
							Your manager changed this shift after the schedule was sent.
							Accept if you can work it — if not, we’ll tell your manager.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col">
						<ListToolbar embedded list={list} />
						<DataTable
							stacked
							fill={false}
							columns={columns}
							list={list}
							data={list.pagination.pageRows}
							getRowId={acceptanceRowId}
						/>
					</CardContent>
				</Card>
			) : null}
		</>
	);
});

export const TasksSection = memo(function TasksSection({
	shiftId,
	tasks,
}: {
	shiftId: string | undefined;
	tasks: ShiftTask[];
}) {
	const queryClient = useQueryClient();
	const completeTask = useMutation({
		mutationFn: (taskId: string) =>
			api(`/v1/my/version-shifts/${shiftId}/tasks/${taskId}/complete`, {
				method: "POST",
			}),
		// Tick the task immediately; roll back if the server rejects it.
		onMutate: async (taskId) => {
			const key = ["shift-tasks", shiftId];
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<{ tasks: ShiftTask[] }>(key);
			if (previous) {
				queryClient.setQueryData(key, {
					...previous,
					tasks: previous.tasks.map((task) =>
						task.id === taskId ? { ...task, completed: true } : task,
					),
				});
			}
			return { previous };
		},
		onSuccess: () => {
			toast.success("Shift Task completed.");
		},
		onError: (error, _taskId, context) => {
			if (context?.previous) {
				queryClient.setQueryData(["shift-tasks", shiftId], context.previous);
			}
			toast.error((error as Error).message);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["shift-tasks", shiftId] });
		},
	});
	const completeMutate = completeTask.mutate;
	const completePending = completeTask.isPending;
	const columns = useMemo(
		() =>
			taskHelper.columns([
				taskHelper.accessor("title", {
					header: "Task",
					cell: ({ row }) => (
						<span
							className={
								row.original.completed
									? "text-primary-foreground/70 text-sm line-through"
									: "text-sm"
							}
						>
							{row.original.title}
						</span>
					),
				}),
				taskHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex justify-end">
							<Button
								size="sm"
								variant="outline"
								className="border-primary-foreground/60 bg-transparent text-primary-foreground [@media(hover:hover)]:hover:bg-primary-foreground/10 [@media(hover:hover)]:hover:text-primary-foreground"
								disabled={row.original.completed || completePending}
								onClick={() => completeMutate(row.original.id)}
							>
								{row.original.completed ? "Completed" : "Complete"}
							</Button>
						</div>
					),
				}),
			]),
		[completeMutate, completePending],
	);

	if (tasks.length === 0) {
		return (
			<SectionEmpty
				title="No shift tasks"
				description="Tasks for your next shift will appear here."
			/>
		);
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Shift tasks</CardTitle>
				<CardDescription>
					Checklist for your next shift. Completing a task does not affect your
					hours.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col">
				<DataTable
					stacked
					fill={false}
					columns={columns}
					data={tasks}
					getRowId={taskRowId}
				/>
			</CardContent>
		</Card>
	);
});
