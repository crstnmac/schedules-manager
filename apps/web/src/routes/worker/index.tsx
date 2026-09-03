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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeftRightIcon,
	CalendarDaysIcon,
	CheckIcon,
	EyeIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppDocument } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { TimeClockCard } from "@/components/time-clock-card";
import { api } from "@/lib/api";
import {
	type DayRosterEntry,
	type SwapDetailDto,
	useAcknowledge,
	useCancelSwap,
	useDayRoster,
	useMySchedule,
	useMySwaps,
	useProposeSwap,
	useRequestRelease,
	useRespondToAcceptance,
	useRespondToSwap,
	useShiftTasks,
} from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/")({
	component: WorkerHome,
});

type WorkerShift = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["currentWeek"]
>["shifts"][number];
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

function WorkerHome() {
	const { formatMinute, formatShiftRange } = useDisplayPrefs();
	const { workplace } = useWorkplace();
	const schedule = useMySchedule(workplace?.id);
	const acknowledge = useAcknowledge();
	const respond = useRespondToAcceptance();
	const release = useRequestRelease();
	const [swapShift, setSwapShift] = useState<WorkerShift | null>(null);
	const nowMs = Date.now();

	const currentWeek = schedule.data?.currentWeek ?? null;
	const nextWeek = schedule.data?.nextWeek ?? null;
	const nextShift = schedule.data?.nextShift ?? null;
	const shiftTasks = useShiftTasks(nextShift?.id);
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

	const pendingAcceptances = schedule.data?.pendingAcceptances ?? [];
	const currentChanges = schedule.data?.currentChanges ?? [];
	const history = schedule.data?.history ?? [];
	const needsAcknowledgement =
		currentWeek !== null &&
		(currentWeek.shifts?.length ?? 0) > 0 &&
		currentWeek.deliveryStatus !== "acknowledged";
	const currentHours =
		(currentWeek?.shifts.reduce((sum, shift) => {
			const end = shift.overnight ? shift.endMinute + 1440 : shift.endMinute;
			return sum + end - shift.startMinute;
		}, 0) ?? 0) / 60;

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
								description="Your manager will see that you declined this late material change."
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
		[respond],
	);
	const weekShiftColumns = useMemo(
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
		[nowMs, release],
	);
	const nextWeekColumns = useMemo(
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
		[],
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
		<AppDocument>
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

			{nextShift ? (
				<TimeClockCard shift={nextShift} timecardTo="/worker/timecard">
					{(shiftTasks.data?.tasks.length ?? 0) > 0 ? (
						<div className="grid gap-2 border-primary-foreground/30 border-t pt-4">
							<p className="font-medium text-sm">Shift Tasks</p>
							<DataTable
								fill={false}
								columns={taskColumns}
								data={shiftTasks.data?.tasks ?? []}
								getRowId={(row) => row.id}
							/>
						</div>
					) : null}
				</TimeClockCard>
			) : null}

			{pendingAcceptances.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Accept this change</CardTitle>
						<CardDescription>
							This is a late material change. Accepting means you agree to work
							the shift. Seeing the schedule is a separate action.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<DataTable
							fill={false}
							columns={acceptanceColumns}
							data={pendingAcceptances}
							getRowId={(row) => row.id}
						/>
					</CardContent>
				</Card>
			) : null}

			<WorkerSwapsCard workplaceId={workplace?.id} />

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

			{needsAcknowledgement && currentWeek ? (
				<div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="font-semibold text-sm">Schedule published</p>
						<p className="text-muted-foreground text-sm">
							Let your manager know you saw this week’s schedule.
						</p>
					</div>
					<Button
						disabled={acknowledge.isPending}
						onClick={() =>
							acknowledge.mutate(currentWeek.version.id, {
								onSuccess: () => toast.success("Marked as seen."),
								onError: (error) => toast.error((error as Error).message),
							})
						}
					>
						{acknowledge.isPending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<EyeIcon data-icon="inline-start" />
						)}
						I saw this
					</Button>
				</div>
			) : null}

			{currentWeek && currentWeek.shifts.length > 0 ? (
				<Card>
					<CardHeader>
						<div className="flex items-start justify-between gap-3">
							<div>
								<CardTitle>This week</CardTitle>
								<CardDescription>
									Week of {formatDay(currentWeek.weekStart)}
								</CardDescription>
							</div>
							<p className="font-medium text-muted-foreground text-sm tabular-nums">
								{currentWeek.shifts.length} shift
								{currentWeek.shifts.length === 1 ? "" : "s"} ·{" "}
								{currentHours.toFixed(1)}h
							</p>
						</div>
					</CardHeader>
					<CardContent>
						<DataTable
							fill={false}
							columns={weekShiftColumns}
							data={currentWeek.shifts}
							getRowId={(row) => row.id}
						/>
					</CardContent>
					<CardFooter>
						<p className="text-muted-foreground text-xs">
							You remain responsible for a released shift until your manager
							approves the hand-off.
						</p>
					</CardFooter>
				</Card>
			) : null}

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

			{nextWeek && (nextWeek.shifts?.length ?? 0) > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Next week</CardTitle>
						<CardDescription>
							Week of {formatDay(nextWeek.weekStart)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<DataTable
							fill={false}
							columns={nextWeekColumns}
							data={nextWeek.shifts}
							getRowId={(row) => row.id}
						/>
					</CardContent>
				</Card>
			) : null}

			{history.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Earlier published weeks</CardTitle>
						<CardDescription>
							Opening a past week does not mark it as seen.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<DataTable
							fill={false}
							columns={historyColumns}
							data={history}
							getRowId={(row) => row.versionId}
						/>
					</CardContent>
				</Card>
			) : null}

			{!schedule.isLoading && !schedule.isError && !currentWeek ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CalendarDaysIcon />
						</EmptyMedia>
						<EmptyTitle>No schedule has been published yet</EmptyTitle>
						<EmptyDescription>
							When your manager publishes the week, your next shift will appear
							here.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}
		</AppDocument>
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

function formatSwapShift(
	shift: {
		positionName: string;
		startsAt: string;
		endsAt: string;
	},
	formatClockTime: (iso?: string) => string,
) {
	return `${formatDay(shift.startsAt)} · ${formatClockTime(shift.startsAt)}–${formatClockTime(shift.endsAt)} · ${shift.positionName}`;
}

function WorkerSwapsCard({ workplaceId }: { workplaceId: string | undefined }) {
	const { formatClockTime } = useDisplayPrefs();
	const swaps = useMySwaps(workplaceId);
	const respond = useRespondToSwap();
	const cancel = useCancelSwap();
	const items = (swaps.data?.swaps ?? []).filter(
		(item) =>
			item.swap.status === "pending_counterpart" ||
			item.swap.status === "pending_manager",
	);

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
			(row) => {
				const incoming =
					row.direction === "incoming" &&
					row.swap.status === "pending_counterpart";
				const give = incoming
					? row.swap.counterpartShift
					: row.swap.requesterShift;
				const take = incoming
					? row.swap.requesterShift
					: row.swap.counterpartShift;
				return `Give ${formatSwapShift(give, formatClockTime)} · take ${formatSwapShift(take, formatClockTime)}`;
			},
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
			<CardContent>
				<DataTable
					fill={false}
					columns={columns}
					data={items}
					getRowId={(row) => row.swap.id}
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
		[selectedShiftId],
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
							fill={false}
							columns={coworkerColumns}
							data={coworkers}
							getRowId={(row) => row.versionShiftId}
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
