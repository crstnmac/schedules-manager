import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@SchedulesManager/ui/components/alert-dialog";
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
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@SchedulesManager/ui/components/sheet";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeftRightIcon,
	CalendarDaysIcon,
	CheckIcon,
	EyeIcon,
	TimerIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import {
	useAcknowledge,
	useClockIn,
	useClockOut,
	useDayRoster,
	useMySchedule,
	useProposeSwap,
	useRequestRelease,
	useRespondToAcceptance,
} from "@/lib/queries";
import {
	CLOCK_IN_EARLY_MS,
	formatClockTime,
	formatDay,
	formatMinute,
	formatShiftRange,
	formatTimerMs,
} from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/")({
	component: WorkerHome,
});

function WorkerHome() {
	const { workplace } = useWorkplace();
	const schedule = useMySchedule(workplace?.id);
	const acknowledge = useAcknowledge();
	const respond = useRespondToAcceptance();
	const release = useRequestRelease();
	const clockIn = useClockIn();
	const clockOut = useClockOut();
	const [confirmingIn, setConfirmingIn] = useState(false);
	const [confirmingOut, setConfirmingOut] = useState(false);
	const [swapShift, setSwapShift] = useState<WorkerShift | null>(null);
	const [nowMs, setNowMs] = useState(() => Date.now());

	const currentWeek = schedule.data?.currentWeek ?? null;
	const nextWeek = schedule.data?.nextWeek ?? null;
	const nextShift = schedule.data?.nextShift ?? null;
	const entry = nextShift?.timeEntry ?? null;
	const onClock = entry !== null && entry.clockedOutAt === null;
	const roster = useDayRoster(workplace?.id, swapShift?.date);
	const proposeSwap = useProposeSwap();

	useEffect(() => {
		if (!onClock) return;
		const timer = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [onClock]);

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

	const shiftsByDay = new Map<
		string,
		NonNullable<typeof currentWeek>["shifts"]
	>();
	for (const shift of currentWeek?.shifts ?? []) {
		const list = shiftsByDay.get(shift.date) ?? [];
		list.push(shift);
		shiftsByDay.set(shift.date, list);
	}

	return (
		<section className="flex flex-col gap-4">
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
				<div className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm">
					<div>
						<p className="mb-3 font-medium text-primary-foreground/75 text-sm">
							{onClock ? "You're on the clock" : "Next shift"}
						</p>
						<h1 className="font-semibold text-2xl tracking-[-0.025em]">
							{formatDay(nextShift.startsAt)}
						</h1>
						<p className="mt-1 font-medium text-lg tabular-nums">
							{formatShiftRange(
								nextShift.startMinute,
								nextShift.endMinute,
								nextShift.overnight,
							)}{" "}
							· {nextShift.positionName}
						</p>
					</div>

					{onClock && entry ? (
						<div className="flex flex-col gap-2">
							<p
								className="font-mono font-semibold text-3xl tabular-nums"
								aria-live="off"
							>
								{formatTimerMs(nowMs - new Date(entry.clockedInAt).getTime())}
							</p>
							<p className="text-primary-foreground/75 text-sm">
								Clocked in at {formatClockTime(entry.clockedInAt)}
							</p>
							<Button
								variant="outline"
								className="self-start border-primary-foreground/60 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
								disabled={clockOut.isPending}
								onClick={() => setConfirmingOut(true)}
							>
								{clockOut.isPending ? (
									<Spinner data-icon="inline-start" />
								) : (
									<TimerIcon data-icon="inline-start" />
								)}
								Clock out
							</Button>
						</div>
					) : null}

					{!onClock && entry && entry.clockedOutAt !== null ? (
						<p className="text-primary-foreground/75 text-sm">
							Last punch · In {formatClockTime(entry.clockedInAt)} · Out{" "}
							{formatClockTime(entry.clockedOutAt)}
						</p>
					) : null}

					{!entry &&
					nowMs >= new Date(nextShift.startsAt).getTime() - CLOCK_IN_EARLY_MS &&
					nowMs <= new Date(nextShift.endsAt).getTime() ? (
						<div className="flex flex-col gap-2">
							<Button
								variant="secondary"
								className="self-start bg-primary-foreground text-primary hover:bg-primary-foreground/90"
								disabled={clockIn.isPending}
								onClick={() => setConfirmingIn(true)}
							>
								{clockIn.isPending ? (
									<Spinner data-icon="inline-start" />
								) : (
									<TimerIcon data-icon="inline-start" />
								)}
								Clock in
							</Button>
							{clockIn.isError ? (
								<p className="text-primary-foreground/75 text-sm">
									{(clockIn.error as Error).message}
								</p>
							) : null}
						</div>
					) : null}

					{!entry &&
					nowMs < new Date(nextShift.startsAt).getTime() - CLOCK_IN_EARLY_MS ? (
						<p className="text-primary-foreground/75 text-sm">
							Clock-in opens at{" "}
							{formatClockTime(
								new Date(
									new Date(nextShift.startsAt).getTime() - CLOCK_IN_EARLY_MS,
								).toISOString(),
							)}{" "}
							— 15 minutes before your shift.
						</p>
					) : null}

					{clockOut.isError ? (
						<p className="text-primary-foreground/75 text-sm">
							{(clockOut.error as Error).message}
						</p>
					) : null}

					<Button
						variant="ghost"
						className="self-start text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
						nativeButton={false}
						render={<Link to="/worker/timecard" />}
					>
						My timecard
						<CalendarDaysIcon data-icon="inline-end" />
					</Button>
				</div>
			) : null}

			<AlertDialog
				open={confirmingIn}
				onOpenChange={(open) => {
					if (!open) setConfirmingIn(false);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Clock in?</AlertDialogTitle>
						<AlertDialogDescription>
							{nextShift
								? `${nextShift.positionName} · ${formatShiftRange(
										nextShift.startMinute,
										nextShift.endMinute,
										nextShift.overnight,
									)}. Start work at ${formatClockTime(
										new Date().toISOString(),
									)}?`
								: "Start work now?"}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								nextShift &&
								clockIn.mutate(nextShift.id, {
									onSuccess: () => toast.success("Clocked in."),
									onError: (error) => toast.error((error as Error).message),
								})
							}
						>
							Clock in
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmingOut}
				onOpenChange={(open) => {
					if (!open) setConfirmingOut(false);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Clock out?</AlertDialogTitle>
						<AlertDialogDescription>
							You've been on the clock for{" "}
							{entry
								? formatTimerMs(
										Date.now() - new Date(entry.clockedInAt).getTime(),
									)
								: ""}
							. This ends your Time Entry for this shift.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								nextShift &&
								clockOut.mutate(nextShift.id, {
									onSuccess: () => toast.success("Clocked out."),
									onError: (error) => toast.error((error as Error).message),
								})
							}
						>
							Clock out
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

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
						<ItemGroup>
							{pendingAcceptances.map((acceptance) => (
								<Item key={acceptance.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>
											{formatDay(acceptance.date)} ·{" "}
											{formatMinute(acceptance.startMinute)}
										</ItemTitle>
										<ItemDescription>
											{acceptance.positionName} · {acceptance.changeSummary}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Button
											size="sm"
											disabled={respond.isPending}
											onClick={() =>
												respond.mutate(
													{
														acceptanceId: acceptance.id,
														decision: "accept",
													},
													{
														onSuccess: () => toast.success("Shift accepted."),
														onError: (error) =>
															toast.error((error as Error).message),
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
													{
														acceptanceId: acceptance.id,
														decision: "decline",
													},
													{
														onError: (error) =>
															toast.error((error as Error).message),
													},
												)
											}
										/>
									</ItemActions>
								</Item>
							))}
						</ItemGroup>
					</CardContent>
				</Card>
			) : null}

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
					<CardContent className="flex flex-col gap-4">
						{[...shiftsByDay.entries()].map(([date, shifts]) => (
							<div key={date} className="grid gap-2 sm:grid-cols-[7rem_1fr]">
								<p className="pt-2 font-medium text-sm">{formatDay(date)}</p>
								<ItemGroup>
									{shifts.map((shift) => (
										<Item key={shift.id} variant="outline" role="listitem">
											<ItemContent>
												<ItemTitle>
													{formatShiftRange(
														shift.startMinute,
														shift.endMinute,
														shift.overnight,
													)}
												</ItemTitle>
												<ItemDescription>
													{shift.positionName}
													{shift.note ? ` · ${shift.note}` : ""}
												</ItemDescription>
											</ItemContent>
											<ItemActions>
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
														release.isPending ||
														shift.releaseStatus === "pending"
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
															onError: (error) =>
																toast.error((error as Error).message),
														})
													}
												/>
											</ItemActions>
										</Item>
									))}
								</ItemGroup>
							</div>
						))}
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
					<CardContent className="flex flex-col gap-3">
						{nextWeek.shifts.map((shift) => (
							<Item key={shift.id} variant="outline" role="listitem">
								<ItemContent>
									<ItemTitle>
										{formatDay(shift.date)} ·{" "}
										{formatShiftRange(
											shift.startMinute,
											shift.endMinute,
											shift.overnight,
										)}
									</ItemTitle>
									<ItemDescription>{shift.positionName}</ItemDescription>
								</ItemContent>
							</Item>
						))}
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
						<ItemGroup>
							{history.map((entry) => (
								<Item key={entry.versionId} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>
											Week of {formatDay(entry.weekStart)} · v
											{entry.versionNumber}
										</ItemTitle>
										<ItemDescription>
											Published {new Date(entry.publishedAt).toLocaleString()}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Button
											size="sm"
											variant="outline"
											nativeButton={false}
											render={
												<Link
													to="/worker/history/$versionId"
													params={{ versionId: entry.versionId }}
												/>
											}
										>
											View
										</Button>
									</ItemActions>
								</Item>
							))}
						</ItemGroup>
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
		</section>
	);
}

type WorkerShift = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["currentWeek"]
>["shifts"][number];

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

	return (
		<Sheet
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) setSelectedShiftId(null);
				onOpenChange(nextOpen);
			}}
		>
			<SheetContent className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Propose a shift swap</SheetTitle>
					<SheetDescription>
						{shift
							? `You give ${formatDay(shift.startsAt)}, ${formatShiftRange(
									shift.startMinute,
									shift.endMinute,
									shift.overnight,
								)} · ${shift.positionName}`
							: "Choose a coworker's shift to exchange."}
					</SheetDescription>
				</SheetHeader>

				<div
					className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-6 pb-4"
					role="radiogroup"
					aria-label="Coworker shifts"
				>
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
					{!roster.isLoading && !roster.isError && coworkers.length === 0 ? (
						<p className="py-8 text-muted-foreground text-sm">
							No coworkers have an eligible shift on this day.
						</p>
					) : null}
					{coworkers.map((row) => {
						const selected = selectedShiftId === row.versionShiftId;
						return (
							<label
								key={row.versionShiftId}
								className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors duration-150 hover:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
								data-selected={selected}
							>
								<input
									type="radio"
									name="coworker-shift"
									value={row.versionShiftId}
									checked={selected}
									onChange={() => setSelectedShiftId(row.versionShiftId)}
									className="sr-only"
								/>
								<div className="min-w-0 flex-1">
									<p className="font-medium text-sm">{row.workerName}</p>
									<p className="text-muted-foreground text-xs">
										Offers {formatClockTime(row.startsAt)}–
										{formatClockTime(row.endsAt)} · {row.positionName}
									</p>
								</div>
								{selected ? (
									<CheckIcon className="size-4 text-primary" />
								) : null}
							</label>
						);
					})}
				</div>

				<SheetFooter>
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
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
