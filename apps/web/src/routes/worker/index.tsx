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
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeftRightIcon,
	CalendarClockIcon,
	CalendarDaysIcon,
	CheckIcon,
	CircleAlertIcon,
	ClipboardListIcon,
	EyeIcon,
	HistoryIcon,
	ListChecksIcon,
	type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { WorkerScheduleCalendar } from "@/components/worker-schedule-calendar";
import { api } from "@/lib/api";
import {
	type DayRosterEntry,
	type SwapDetailDto,
	useAcknowledge,
	useCancelSwap,
	useDayRoster,
	useMyPickups,
	useMyReleases,
	useMySchedule,
	useMySwaps,
	useProposeSwap,
	useRequestRelease,
	useRespondToAcceptance,
	useRespondToSwap,
	useShiftTasks,
	useWithdrawRelease,
} from "@/lib/queries";
import { formatSwapExchange } from "@/lib/swaps";
import { formatDay } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/")({
	component: WorkerHome,
});

type WorkerShift = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["currentWeek"]
>["shifts"][number];
/**
 * `planned` and a nullable week version are returned for unpublished drafts but
 * may not be present in the shared query type yet.
 */
type PlannedAwareShift = WorkerShift & { planned?: boolean };
type WorkerWeek = Omit<
	NonNullable<
		NonNullable<ReturnType<typeof useMySchedule>["data"]>["currentWeek"]
	>,
	"version" | "shifts"
> & {
	version: { id: string } | null;
	shifts: PlannedAwareShift[];
};

function isPlanned(shift: WorkerShift | PlannedAwareShift): boolean {
	return Boolean((shift as PlannedAwareShift).planned);
}

/** Day-filter options (All days + each date present in the week). */
function dayFilterItems(shifts: { date: string }[]) {
	const dates = Array.from(new Set(shifts.map((shift) => shift.date))).sort();
	return [
		{ label: "All days", value: "all" },
		...dates.map((date) => ({ label: formatDay(date), value: date })),
	];
}

function filterShiftsByDayAndTerm<
	T extends {
		date: string;
		workerName?: string | null;
		positionName: string;
		note?: string | null;
	},
>(shifts: T[], day: string, search: string) {
	const term = search.trim().toLowerCase();
	return shifts.filter((shift) => {
		if (day !== "all" && shift.date !== day) return false;
		if (!term) return true;
		return `${shift.workerName ?? ""} ${shift.positionName} ${shift.note ?? ""}`
			.toLowerCase()
			.includes(term);
	});
}
type AcceptanceRow = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["pendingAcceptances"]
>[number];
type HistoryRow = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["history"]
>[number];
type SwapRow = { direction: "outgoing" | "incoming"; swap: SwapDetailDto };
type ShiftTask = { id: string; title: string; completed: boolean };

const acceptanceHelper = createDataColumnHelper<AcceptanceRow>();
const shiftHelper = createDataColumnHelper<WorkerShift>();
const historyHelper = createDataColumnHelper<HistoryRow>();
const swapHelper = createDataColumnHelper<SwapRow>();
const taskHelper = createDataColumnHelper<ShiftTask>();
const coworkerHelper = createDataColumnHelper<DayRosterEntry>();

type ScheduleSectionId =
	| "this-week"
	| "next-week"
	| "earlier"
	| "pending"
	| "tasks"
	| "requests"
	| "swaps";

const SCHEDULE_SECTIONS: {
	id: ScheduleSectionId;
	label: string;
	icon: LucideIcon;
}[] = [
	{ id: "this-week", label: "This week", icon: CalendarDaysIcon },
	{ id: "next-week", label: "Next week", icon: CalendarClockIcon },
	{ id: "earlier", label: "Earlier weeks", icon: HistoryIcon },
	{ id: "pending", label: "Pending changes", icon: CircleAlertIcon },
	{ id: "tasks", label: "Shift tasks", icon: ListChecksIcon },
	{ id: "requests", label: "Requests", icon: ClipboardListIcon },
	{ id: "swaps", label: "Swaps", icon: ArrowLeftRightIcon },
];

function SectionEmpty({
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
}

function WorkerHome() {
	const { formatMinute, formatShiftRange } = useDisplayPrefs();
	const { workplace } = useWorkplace();
	const schedule = useMySchedule(workplace?.id);
	const acknowledge = useAcknowledge();
	const respond = useRespondToAcceptance();
	const release = useRequestRelease();
	const [swapShift, setSwapShift] = useState<WorkerShift | null>(null);
	const [view, setView] = useState<"week" | "calendar">("week");
	const [weekSearch, setWeekSearch] = useState("");
	const [weekDay, setWeekDay] = useState("all");
	const [nextWeekSearch, setNextWeekSearch] = useState("");
	const [nextWeekDay, setNextWeekDay] = useState("all");
	const [historySearch, setHistorySearch] = useState("");
	const [section, setSection] = useState<ScheduleSectionId>("this-week");
	const nowMs = Date.now();

	const currentWeek = (schedule.data?.currentWeek ?? null) as WorkerWeek | null;
	const nextWeek = (schedule.data?.nextWeek ?? null) as WorkerWeek | null;
	const nextShift = schedule.data?.nextShift ?? null;
	const shiftTasks = useShiftTasks(nextShift?.id);
	const tasks = shiftTasks.data?.tasks ?? [];
	const queryClient = useQueryClient();
	const completeTask = useMutation({
		mutationFn: (taskId: string) =>
			api(`/v1/my/version-shifts/${nextShift?.id}/tasks/${taskId}/complete`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["shift-tasks", nextShift?.id],
			});
			toast.success("Shift Task completed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const roster = useDayRoster(workplace?.id, swapShift?.date);
	const proposeSwap = useProposeSwap();
	const mySwaps = useMySwaps(workplace?.id);
	const myReleases = useMyReleases(workplace?.id);
	const myPickups = useMyPickups(workplace?.id);

	const pendingAcceptances = schedule.data?.pendingAcceptances ?? [];
	const currentChanges = schedule.data?.currentChanges ?? [];
	const history = schedule.data?.history ?? [];
	const currentMineShifts = (currentWeek?.shifts ?? []).filter(
		(shift) => shift.isMine,
	);
	const needsAcknowledgement =
		currentWeek !== null &&
		currentWeek.version !== null &&
		currentMineShifts.some((shift) => !isPlanned(shift)) &&
		currentWeek.deliveryStatus !== "acknowledged";
	const currentHours =
		currentMineShifts.reduce((sum, shift) => {
			const end = shift.overnight ? shift.endMinute + 1440 : shift.endMinute;
			return sum + end - shift.startMinute;
		}, 0) / 60;

	const currentWeekFiltered = useMemo(
		() =>
			filterShiftsByDayAndTerm(currentWeek?.shifts ?? [], weekDay, weekSearch),
		[currentWeek, weekDay, weekSearch],
	);
	const currentWeekDayItems = useMemo(
		() => dayFilterItems(currentWeek?.shifts ?? []),
		[currentWeek],
	);
	const currentWeekPagination = useTablePagination(currentWeekFiltered, {
		resetKey: `${currentWeek?.weekStart ?? ""}|${weekDay}|${weekSearch}`,
	});
	const nextWeekFiltered = useMemo(
		() =>
			filterShiftsByDayAndTerm(
				nextWeek?.shifts ?? [],
				nextWeekDay,
				nextWeekSearch,
			),
		[nextWeek, nextWeekDay, nextWeekSearch],
	);
	const nextWeekDayItems = useMemo(
		() => dayFilterItems(nextWeek?.shifts ?? []),
		[nextWeek],
	);
	const nextWeekPagination = useTablePagination(nextWeekFiltered, {
		resetKey: `${nextWeek?.weekStart ?? ""}|${nextWeekDay}|${nextWeekSearch}`,
	});
	const historyFiltered = useMemo(() => {
		const term = historySearch.trim().toLowerCase();
		if (!term) return history;
		return history.filter((row) =>
			`${formatDay(row.weekStart)} v${row.versionNumber} ${row.publishedAt}`
				.toLowerCase()
				.includes(term),
		);
	}, [history, historySearch]);
	const historyPagination = useTablePagination(historyFiltered, {
		resetKey: historySearch,
	});
	const acceptancePagination = useTablePagination(pendingAcceptances, {
		resetKey: pendingAcceptances.length,
	});

	const activeSwaps = (mySwaps.data?.swaps ?? []).filter(
		(item) =>
			item.swap.status === "pending_counterpart" ||
			item.swap.status === "pending_manager",
	).length;
	const requestCount =
		(myReleases.data?.length ?? 0) +
		(myPickups.data?.length ?? 0) +
		(mySwaps.data?.swaps.length ?? 0);
	const sectionCounts: Partial<Record<ScheduleSectionId, number>> = {
		"this-week": currentWeek?.shifts.length ?? 0,
		"next-week": nextWeek?.shifts.length ?? 0,
		earlier: history.length,
		pending: pendingAcceptances.length,
		tasks: tasks.length,
		requests: requestCount,
		swaps: activeSwaps,
	};
	const hasAnySchedule = Boolean(currentWeek || nextWeek) || history.length > 0;
	const hasGlobalItems =
		(!schedule.isLoading && !schedule.isError && !nextShift) ||
		(needsAcknowledgement && currentWeek !== null);

	const acceptanceColumns = useMemo(
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
								disabled={respond.isPending}
								onClick={() =>
									respond.mutate(
										{ acceptanceId: row.original.id, decision: "accept" },
										{
											onSuccess: () => toast.success("Shift accepted."),
											onError: (error) => toast.error((error as Error).message),
										},
									)
								}
							>
								{respond.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Accept shift
							</Button>
							<ConfirmAction
								trigger="Decline"
								disabled={respond.isPending}
								title="Decline this shift change?"
								description="Declining tells your manager you can’t work the changed shift."
								confirmLabel="Decline shift"
								destructive
								onConfirm={() =>
									respond.mutate(
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
		[formatMinute, respond],
	);
	const weekShiftColumns = useMemo(
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
									disabled={
										release.isPending || shift.releaseStatus === "pending"
									}
									title="Release this shift?"
									description="Your manager must approve the release. You remain responsible for the shift until then."
									confirmLabel="Request release"
									onConfirm={() =>
										release.mutate(shift.id, {
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
		[formatShiftRange, nowMs, release],
	);
	const nextWeekColumns = useMemo(
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
	const historyColumns = useMemo(
		() =>
			historyHelper.columns([
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
									/>
								}
							>
								View
							</Button>
						</div>
					),
				}),
			]),
		[],
	);
	const taskColumns = useMemo(
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
								className="border-primary-foreground/60 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
								disabled={row.original.completed || completeTask.isPending}
								onClick={() => completeTask.mutate(row.original.id)}
							>
								{row.original.completed ? "Completed" : "Complete"}
							</Button>
						</div>
					),
				}),
			]),
		[completeTask],
	);

	return (
		<AppPage>
			<AppPageHeader
				title="My schedule"
				badge={
					currentWeek ? (
						<Badge variant="secondary">
							Week of {formatDay(currentWeek.weekStart)}
						</Badge>
					) : null
				}
				description={
					currentWeek
						? `${currentMineShifts.length} shift${currentMineShifts.length === 1 ? "" : "s"} · ${currentHours.toFixed(1)}h this week`
						: "Your published shifts, Shift Tasks, and swaps."
				}
				actions={
					<div className="flex items-center gap-2">
						<ToggleGroup
							aria-label="Schedule view"
							value={[view]}
							variant="outline"
							size="sm"
							spacing={0}
							onValueChange={(value) => {
								const next = value[0];
								if (next === "week" || next === "calendar") setView(next);
							}}
						>
							<ToggleGroupItem value="week">Week</ToggleGroupItem>
							<ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
						</ToggleGroup>
						<Button
							size="sm"
							variant="outline"
							nativeButton={false}
							render={<Link to="/worker/timecard" />}
						>
							My timecard
						</Button>
					</div>
				}
			/>
			<AppPageBody scroll={false} className="gap-0">
				{schedule.isLoading ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-28" />
						<Skeleton className="h-40" />
					</div>
				) : null}
				{schedule.isError ? (
					<Alert variant="destructive">
						<AlertTitle>We couldn’t load your schedule</AlertTitle>
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

				{hasGlobalItems ? (
					<div className="flex shrink-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
						{!schedule.isLoading && !schedule.isError && !nextShift ? (
							<Card>
								<CardHeader>
									<CardTitle>No upcoming shifts</CardTitle>
									<CardDescription>
										Your next assigned shift will appear here once it’s
										published. Check Open shifts for available work.
									</CardDescription>
								</CardHeader>
							</Card>
						) : null}
						{needsAcknowledgement && currentWeek ? (
							<Alert>
								<EyeIcon />
								<AlertTitle>Your manager published the schedule</AlertTitle>
								<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
									<span>Let them know you saw this week’s schedule.</span>
									<Button
										size="sm"
										disabled={acknowledge.isPending}
										onClick={() =>
											acknowledge.mutate(currentWeek.version?.id ?? "", {
												onSuccess: () => toast.success("Marked as seen."),
												onError: (error) =>
													toast.error((error as Error).message),
											})
										}
									>
										{acknowledge.isPending ? (
											<Spinner data-icon="inline-start" />
										) : null}
										I saw this
									</Button>
								</AlertDescription>
							</Alert>
						) : null}
					</div>
				) : null}

				{view === "calendar" ? (
					<div className="min-h-0 flex-1 overflow-y-auto">
						<WorkerScheduleCalendar workplaceId={workplace?.id} />
					</div>
				) : !schedule.isLoading && !schedule.isError && !hasAnySchedule ? (
					<div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 pt-6 md:px-6">
						<Empty className="border border-dashed">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<CalendarDaysIcon />
								</EmptyMedia>
								<EmptyTitle>No schedule has been published yet</EmptyTitle>
								<EmptyDescription>
									When your manager publishes the week, your next shift will
									appear here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				) : (
					<div className="flex min-h-0 w-full flex-1 flex-col gap-4 md:flex-row md:items-stretch md:gap-0">
						<aside className="w-full shrink-0 border-b bg-muted/30 md:w-52 md:overflow-y-auto md:border-r md:border-b-0">
							<nav
								aria-label="My schedule sections"
								className="flex gap-1 overflow-x-auto overscroll-x-contain p-2 md:flex-col md:gap-1 md:overflow-visible"
							>
								{SCHEDULE_SECTIONS.map((item) => {
									const count = sectionCounts[item.id] ?? 0;
									const active = section === item.id;
									return (
										<Button
											key={item.id}
											type="button"
											variant={active ? "secondary" : "ghost"}
											size="sm"
											aria-current={active ? "page" : undefined}
											className="w-auto shrink-0 justify-start gap-2 md:w-full"
											onClick={() => setSection(item.id)}
										>
											<item.icon />
											<span>{item.label}</span>
											{count > 0 ? (
												<Badge
													variant="secondary"
													className="ml-auto tabular-nums"
												>
													{count}
												</Badge>
											) : null}
										</Button>
									);
								})}
							</nav>
						</aside>

						<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
							<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
								{section === "this-week" ? (
									<>
										{currentWeek && currentWeek.shifts.length > 0 ? (
											<Card className="flex min-h-0 flex-1 flex-col">
												<CardHeader className="shrink-0">
													<div className="flex items-start justify-between gap-3">
														<div>
															<CardTitle>This week</CardTitle>
															<CardDescription>
																Week of {formatDay(currentWeek.weekStart)}
															</CardDescription>
														</div>
														<p className="font-medium text-muted-foreground text-sm tabular-nums">
															{currentMineShifts.length} shift
															{currentMineShifts.length === 1 ? "" : "s"} ·{" "}
															{currentHours.toFixed(1)}h
														</p>
													</div>
												</CardHeader>
												<CardContent className="flex min-h-0 flex-1 flex-col">
													<TableToolbar
														embedded
														className="shrink-0"
														left={
															<>
																<TableSearch
																	value={weekSearch}
																	onValueChange={setWeekSearch}
																	placeholder="Search shifts"
																/>
																{currentWeekDayItems.length > 1 ? (
																	<TableFilter
																		value={weekDay}
																		onValueChange={setWeekDay}
																		items={currentWeekDayItems}
																		ariaLabel="Filter by day"
																	/>
																) : null}
															</>
														}
														right={
															<TablePagination {...currentWeekPagination} />
														}
													/>
													<DataTable
														stacked
														stickyHeader
														columns={weekShiftColumns}
														data={currentWeekPagination.pageRows}
														getRowId={(row) => row.id}
														className="[&_tbody_tr:last-child]:border-b-0"
														empty={
															<p className="py-6 text-center text-muted-foreground text-sm">
																No shifts match your search or day filter.
															</p>
														}
													/>
												</CardContent>
												<CardFooter className="flex flex-col items-start gap-1">
													{currentWeek.shifts.some((shift) =>
														isPlanned(shift),
													) ? (
														<p className="text-muted-foreground text-xs">
															Planned shifts aren’t published yet and are
															subject to change. You can’t swap or release one
															until it is published.
														</p>
													) : null}
													<p className="text-muted-foreground text-xs">
														You remain responsible for a released shift until
														your manager approves the hand-off.
													</p>
												</CardFooter>
											</Card>
										) : (
											<SectionEmpty
												title="No shifts this week"
												description="Shifts assigned to you this week will appear here."
											/>
										)}
										<SwapSheet
											key={swapShift?.id ?? "closed"}
											shift={swapShift}
											open={swapShift !== null}
											onOpenChange={(open) => {
												if (!open) setSwapShift(null);
											}}
											roster={roster}
											proposeSwap={proposeSwap}
										/>
									</>
								) : null}

								{section === "next-week" ? (
									nextWeek && (nextWeek.shifts?.length ?? 0) > 0 ? (
										<Card className="flex min-h-0 flex-1 flex-col">
											<CardHeader className="shrink-0">
												<CardTitle>Next week</CardTitle>
												<CardDescription>
													Week of {formatDay(nextWeek.weekStart)}
												</CardDescription>
											</CardHeader>
											<CardContent className="flex min-h-0 flex-1 flex-col">
												<TableToolbar
													embedded
													className="shrink-0"
													left={
														<>
															<TableSearch
																value={nextWeekSearch}
																onValueChange={setNextWeekSearch}
																placeholder="Search shifts"
															/>
															{nextWeekDayItems.length > 1 ? (
																<TableFilter
																	value={nextWeekDay}
																	onValueChange={setNextWeekDay}
																	items={nextWeekDayItems}
																	ariaLabel="Filter by day"
																/>
															) : null}
														</>
													}
													right={<TablePagination {...nextWeekPagination} />}
												/>
												<DataTable
													stacked
													stickyHeader
													columns={nextWeekColumns}
													data={nextWeekPagination.pageRows}
													getRowId={(row) => row.id}
													empty={
														<p className="py-6 text-center text-muted-foreground text-sm">
															No shifts match your search or day filter.
														</p>
													}
												/>
												{nextWeek.shifts.some((shift) => isPlanned(shift)) ? (
													<p className="mt-2 text-muted-foreground text-xs">
														Planned shifts aren’t published yet and are subject
														to change.
													</p>
												) : null}
											</CardContent>
										</Card>
									) : (
										<SectionEmpty
											title="No shifts next week"
											description="Shifts planned or published for next week will appear here."
										/>
									)
								) : null}

								{section === "earlier" ? (
									history.length > 0 ? (
										<Card className="flex min-h-0 flex-1 flex-col">
											<CardHeader className="shrink-0">
												<CardTitle>Earlier published weeks</CardTitle>
												<CardDescription>
													Opening a past week does not mark it as seen.
												</CardDescription>
											</CardHeader>
											<CardContent className="flex min-h-0 flex-1 flex-col">
												<TableToolbar
													embedded
													className="shrink-0"
													left={
														<TableSearch
															value={historySearch}
															onValueChange={setHistorySearch}
															placeholder="Search weeks"
														/>
													}
													right={<TablePagination {...historyPagination} />}
												/>
												<DataTable
													stacked
													stickyHeader
													columns={historyColumns}
													data={historyPagination.pageRows}
													getRowId={(row) => row.versionId}
													empty={
														<p className="py-6 text-center text-muted-foreground text-sm">
															No published weeks match your search.
														</p>
													}
												/>
											</CardContent>
										</Card>
									) : (
										<SectionEmpty
											title="No earlier published weeks"
											description="Past published weeks you can still open will appear here."
										/>
									)
								) : null}

								{section === "pending" ? (
									pendingAcceptances.length > 0 || currentChanges.length > 0 ? (
										<>
											{currentChanges.length > 0 ? (
												<Alert>
													<AlertTitle>What changed this week</AlertTitle>
													<AlertDescription>
														<ul className="flex flex-col gap-1">
															{currentChanges.map((change) => (
																<li key={change}>{change}</li>
															))}
														</ul>
													</AlertDescription>
												</Alert>
											) : null}
											{pendingAcceptances.length > 0 ? (
												<Card>
													<CardHeader>
														<CardTitle>Your shift changed</CardTitle>
														<CardDescription>
															Your manager changed this shift after the schedule
															was sent. Accept if you can work it — if not,
															we’ll tell your manager.
														</CardDescription>
													</CardHeader>
													<CardContent className="flex flex-col">
														<TableToolbar
															embedded
															right={
																<TablePagination {...acceptancePagination} />
															}
														/>
														<DataTable
															stacked
															fill={false}
															columns={acceptanceColumns}
															data={acceptancePagination.pageRows}
															getRowId={(row) => row.id}
														/>
													</CardContent>
												</Card>
											) : null}
										</>
									) : (
										<SectionEmpty
											title="Nothing pending"
											description="Late schedule changes that need your acceptance appear here."
										/>
									)
								) : null}

								{section === "tasks" ? (
									tasks.length > 0 ? (
										<Card>
											<CardHeader>
												<CardTitle>Shift tasks</CardTitle>
												<CardDescription>
													Checklist for your next shift. Completing a task does
													not affect your hours.
												</CardDescription>
											</CardHeader>
											<CardContent className="flex flex-col">
												<DataTable
													stacked
													fill={false}
													columns={taskColumns}
													data={tasks}
													getRowId={(row) => row.id}
												/>
											</CardContent>
										</Card>
									) : (
										<SectionEmpty
											title="No shift tasks"
											description="Tasks for your next shift will appear here."
										/>
									)
								) : null}

								{section === "requests" ? (
									requestCount > 0 ? (
										<WorkerRequestsCard workplaceId={workplace?.id} />
									) : (
										<SectionEmpty
											title="No requests yet"
											description="Your releases, pickups, and swaps appear here."
										/>
									)
								) : null}

								{section === "swaps" ? (
									activeSwaps > 0 ? (
										<WorkerSwapsCard workplaceId={workplace?.id} />
									) : (
										<SectionEmpty
											title="No pending swaps"
											description="Swaps waiting on you or a manager appear here."
										/>
									)
								) : null}
							</div>
						</div>
					</div>
				)}
			</AppPageBody>
		</AppPage>
	);
}

const SWAP_STATUS_LABELS = {
	pending_counterpart: "Waiting for coworker",
	pending_manager: "Awaiting manager approval",
	approved: "Approved",
	declined_by_counterpart: "Declined by coworker",
	declined_by_manager: "Declined by manager",
	cancelled: "Cancelled",
} as const;

type WorkerRequestItem = {
	key: string;
	kind: "release" | "pickup" | "swap";
	title: string;
	detail: string;
	statusLabel: string;
	group: "pending" | "decided" | "cancelled";
	tone: "default" | "secondary" | "destructive" | "outline";
	releaseId?: string;
};

const REQUEST_GROUPS: { key: WorkerRequestItem["group"]; label: string }[] = [
	{ key: "pending", label: "Pending" },
	{ key: "decided", label: "Decided" },
	{ key: "cancelled", label: "Cancelled" },
];

function WorkerRequestsCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const { formatShiftRange, formatClockTime } = useDisplayPrefs();
	const releases = useMyReleases(workplaceId);
	const pickups = useMyPickups(workplaceId);
	const swaps = useMySwaps(workplaceId);
	const withdraw = useWithdrawRelease();

	const items = useMemo(() => {
		const list: WorkerRequestItem[] = [];
		for (const release of releases.data ?? []) {
			list.push({
				key: `release-${release.id}`,
				kind: "release",
				title: `Release · ${release.positionName}`,
				detail: `${formatDay(release.date)} · ${formatShiftRange(
					release.startMinute,
					release.endMinute,
					release.overnight,
				)}`,
				statusLabel: release.status,
				group: release.status === "pending" ? "pending" : "decided",
				tone:
					release.status === "approved"
						? "default"
						: release.status === "declined"
							? "destructive"
							: "secondary",
				releaseId: release.status === "pending" ? release.id : undefined,
			});
		}
		for (const pickup of pickups.data ?? []) {
			list.push({
				key: `pickup-${pickup.id}`,
				kind: "pickup",
				title: `Pickup · ${pickup.positionName}`,
				detail: pickup.date
					? `${formatDay(pickup.date)} · ${formatShiftRange(
							pickup.startMinute ?? 0,
							pickup.endMinute ?? 0,
							pickup.overnight,
						)} · ${pickup.locationName}`
					: pickup.locationName,
				statusLabel: pickup.status,
				group: pickup.status === "pending" ? "pending" : "decided",
				tone:
					pickup.status === "approved"
						? "default"
						: pickup.status === "declined"
							? "destructive"
							: "secondary",
			});
		}
		for (const { direction, swap } of swaps.data?.swaps ?? []) {
			if (
				swap.status === "pending_counterpart" ||
				swap.status === "pending_manager"
			) {
				continue;
			}
			list.push({
				key: `swap-${swap.id}`,
				kind: "swap",
				title:
					direction === "incoming"
						? `Swap from ${swap.requester.name}`
						: `Swap with ${swap.counterpart.name}`,
				detail: formatSwapExchange(direction, swap, formatClockTime),
				statusLabel: SWAP_STATUS_LABELS[swap.status],
				group: swap.status === "cancelled" ? "cancelled" : "decided",
				tone:
					swap.status === "approved"
						? "default"
						: swap.status.startsWith("declined")
							? "destructive"
							: "outline",
			});
		}
		return list;
	}, [
		formatClockTime,
		formatShiftRange,
		pickups.data,
		releases.data,
		swaps.data,
	]);

	const loading = releases.isLoading || pickups.isLoading || swaps.isLoading;
	if ((loading && items.length === 0) || items.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Requests</CardTitle>
				<CardDescription>
					Your releases, pickups, and swaps — including decisions. You can
					withdraw a release while it is pending.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{REQUEST_GROUPS.map((group) => {
					const groupItems = items.filter((item) => item.group === group.key);
					if (groupItems.length === 0) return null;
					return (
						<div key={group.key} className="flex flex-col gap-2">
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{group.label}
							</p>
							<ul className="divide-y rounded-md border">
								{groupItems.map((item) => (
									<li
										key={item.key}
										className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
									>
										<div className="min-w-0">
											<p className="font-medium text-sm">{item.title}</p>
											<p className="text-muted-foreground text-xs tabular-nums">
												{item.detail}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant={item.tone} className="uppercase">
												{item.statusLabel}
											</Badge>
											{item.releaseId ? (
												<ConfirmAction
													trigger="Withdraw request"
													triggerVariant="ghost"
													title="Withdraw this release request?"
													description="Your manager will no longer see it. You keep the shift."
													confirmLabel="Withdraw request"
													destructive
													disabled={withdraw.isPending}
													onConfirm={() =>
														withdraw.mutate(item.releaseId ?? "", {
															onSuccess: () =>
																toast.success("Release request withdrawn."),
															onError: (error) =>
																toast.error((error as Error).message),
														})
													}
												/>
											) : null}
										</div>
									</li>
								))}
							</ul>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

function WorkerSwapsCard({ workplaceId }: { workplaceId: string | undefined }) {
	const { formatClockTime } = useDisplayPrefs();
	const swaps = useMySwaps(workplaceId);
	const respond = useRespondToSwap();
	const cancel = useCancelSwap();
	const [search, setSearch] = useState("");
	const items = useMemo(
		() =>
			(swaps.data?.swaps ?? []).filter(
				(item) =>
					item.swap.status === "pending_counterpart" ||
					item.swap.status === "pending_manager",
			),
		[swaps.data],
	);
	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return items;
		return items.filter((row) =>
			`${row.swap.requester.name} ${row.swap.counterpart.name} ${
				SWAP_STATUS_LABELS[row.swap.status]
			} ${formatSwapExchange(row.direction, row.swap, formatClockTime)}`
				.toLowerCase()
				.includes(term),
		);
	}, [items, search, formatClockTime]);
	const pagination = useTablePagination(filtered, { resetKey: search });

	if (swaps.isLoading || items.length === 0) return null;

	const columns = swapHelper.columns([
		swapHelper.accessor(
			(row) =>
				row.direction === "incoming" &&
				row.swap.status === "pending_counterpart"
					? `${row.swap.requester.name} proposed a swap`
					: `Swap with ${row.swap.counterpart.name}`,
			{
				id: "title",
				header: "Swap",
				cell: ({ getValue }) => (
					<span className="font-medium">{getValue()}</span>
				),
			},
		),
		swapHelper.accessor((row) => SWAP_STATUS_LABELS[row.swap.status], {
			id: "status",
			header: "Status",
		}),
		swapHelper.accessor(
			(row) => formatSwapExchange(row.direction, row.swap, formatClockTime),
			{ id: "details", header: "Exchange" },
		),
		swapHelper.display({
			id: "actions",
			header: "Actions",
			enableSorting: false,
			cell: ({ row }) => {
				const { direction, swap } = row.original;
				const incoming =
					direction === "incoming" && swap.status === "pending_counterpart";
				const canCancel =
					direction === "outgoing" &&
					(swap.status === "pending_counterpart" ||
						swap.status === "pending_manager");
				return (
					<div className="flex flex-wrap items-center justify-end gap-2">
						{incoming ? (
							<>
								<ConfirmAction
									trigger="Accept"
									disabled={respond.isPending}
									title="Accept this swap?"
									description="A manager still has to approve. If they do, you will exchange these shift assignments."
									confirmLabel="Accept swap"
									onConfirm={() =>
										respond.mutate(
											{ swapId: swap.id, decision: "accept" },
											{
												onSuccess: () =>
													toast.success(
														"Accepted. A manager can now approve the swap.",
													),
												onError: (error) =>
													toast.error((error as Error).message),
											},
										)
									}
								/>
								<ConfirmAction
									trigger="Decline"
									disabled={respond.isPending}
									title="Decline this swap?"
									description="You will keep your current shift assignment."
									confirmLabel="Decline swap"
									destructive
									onConfirm={() =>
										respond.mutate(
											{ swapId: swap.id, decision: "decline" },
											{
												onSuccess: () => toast.success("Swap declined."),
												onError: (error) =>
													toast.error((error as Error).message),
											},
										)
									}
								/>
							</>
						) : null}
						{canCancel ? (
							<ConfirmAction
								trigger="Cancel"
								disabled={cancel.isPending}
								title="Cancel this swap?"
								description="Your coworker will be notified. Everyone keeps their current assignment."
								confirmLabel="Cancel swap"
								destructive
								onConfirm={() =>
									cancel.mutate(swap.id, {
										onSuccess: () => toast.success("Swap cancelled."),
										onError: (error) => toast.error((error as Error).message),
									})
								}
							/>
						) : null}
					</div>
				);
			},
		}),
	]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Shift swaps</CardTitle>
				<CardDescription>
					A swap only takes effect after your coworker agrees and a manager
					approves. Until then everyone keeps their own shift.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col">
				<TableToolbar
					embedded
					left={
						<TableSearch
							value={search}
							onValueChange={setSearch}
							placeholder="Search swaps"
						/>
					}
					right={<TablePagination {...pagination} />}
				/>
				<DataTable
					stacked
					fill={false}
					columns={columns}
					data={pagination.pageRows}
					getRowId={(row) => row.swap.id}
					empty={
						<p className="py-6 text-center text-muted-foreground text-sm">
							No swaps match your search.
						</p>
					}
				/>
			</CardContent>
		</Card>
	);
}

function SwapSheet({
	shift,
	open,
	onOpenChange,
	roster,
	proposeSwap,
}: {
	shift: WorkerShift | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	roster: ReturnType<typeof useDayRoster>;
	proposeSwap: ReturnType<typeof useProposeSwap>;
}) {
	const { formatClockTime, formatShiftRange } = useDisplayPrefs();
	const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
	const coworkers = (roster.data?.roster ?? []).filter(
		(row) =>
			!row.mine &&
			row.employmentId !== null &&
			new Date(row.startsAt).getTime() > Date.now(),
	);
	const selected = coworkers.find(
		(row) => row.versionShiftId === selectedShiftId,
	);
	const coworkerColumns = useMemo(
		() =>
			coworkerHelper.columns([
				coworkerHelper.accessor("workerName", {
					header: "Worker",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				coworkerHelper.accessor(
					(row) =>
						`${formatClockTime(row.startsAt)}–${formatClockTime(row.endsAt)}`,
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
				coworkerHelper.accessor("positionName", { header: "Position" }),
				coworkerHelper.display({
					id: "select",
					header: "Select",
					enableSorting: false,
					cell: ({ row }) => {
						const isSelected = selectedShiftId === row.original.versionShiftId;
						return (
							<div className="flex justify-end">
								<Button
									size="sm"
									variant={isSelected ? "secondary" : "outline"}
									onClick={() =>
										setSelectedShiftId(row.original.versionShiftId)
									}
								>
									{isSelected ? <CheckIcon data-icon="inline-start" /> : null}
									{isSelected ? "Selected" : "Select"}
								</Button>
							</div>
						);
					},
				}),
			]),
		[formatClockTime, selectedShiftId],
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) setSelectedShiftId(null);
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="flex max-h-[min(36rem,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
				<DialogHeader className="border-b px-6 py-4 pr-12">
					<DialogTitle>Propose a shift swap</DialogTitle>
					<DialogDescription>
						{shift
							? `You give ${formatDay(shift.startsAt)}, ${formatShiftRange(
									shift.startMinute,
									shift.endMinute,
									shift.overnight,
								)} · ${shift.positionName}`
							: "Choose a coworker's shift to exchange."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
					{roster.isLoading ? (
						<div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
							<Spinner /> Loading coworker shifts…
						</div>
					) : null}
					{roster.isError ? (
						<Alert variant="destructive">
							<AlertTitle>Couldn’t load coworker shifts</AlertTitle>
							<AlertDescription>
								{(roster.error as Error).message}
							</AlertDescription>
						</Alert>
					) : null}
					{!roster.isLoading && !roster.isError ? (
						<DataTable
							stacked
							fill={false}
							columns={coworkerColumns}
							data={coworkers}
							getRowId={(row) => row.versionShiftId}
							className="[&_tbody_tr:last-child]:border-b-0"
							empty={
								<p className="text-muted-foreground text-sm">
									No coworkers have an eligible shift on this day.
								</p>
							}
						/>
					) : null}
				</div>

				<DialogFooter className="border-t px-6 py-4 sm:justify-start">
					<Button
						disabled={
							!shift || !selected?.employmentId || proposeSwap.isPending
						}
						onClick={() => {
							if (!shift || !selected?.employmentId) return;
							proposeSwap.mutate(
								{
									requesterShiftId: shift.id,
									counterpartEmploymentId: selected.employmentId,
									counterpartShiftId: selected.versionShiftId,
								},
								{
									onSuccess: () => {
										toast.success(`Swap proposed to ${selected.workerName}.`);
										onOpenChange(false);
									},
									onError: (error) => toast.error((error as Error).message),
								},
							);
						}}
					>
						{proposeSwap.isPending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<ArrowLeftRightIcon data-icon="inline-start" />
						)}
						Send swap proposal
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
