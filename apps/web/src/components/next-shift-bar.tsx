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
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useClockIn, useClockOut, useMySchedule } from "@/lib/queries";
import { CLOCK_IN_EARLY_MS, formatDay, formatTimerMs } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

/**
 * Compact next-shift and time-clock control for the workspace top bar. Keeps
 * the worker's immediate action (clock in/out) always visible without the
 * large card on the schedule page.
 */
export function NextShiftBar() {
	const { workplace } = useWorkplace();
	const schedule = useMySchedule(workplace?.id);
	const shift = schedule.data?.nextShift ?? null;
	const clockIn = useClockIn();
	const clockOut = useClockOut();
	const { formatClockTime, formatShiftRange } = useDisplayPrefs();
	const notesEnabled = workplace?.policies.timesheetNotesEnabled ?? false;
	const [confirmingIn, setConfirmingIn] = useState(false);
	const [confirmingOut, setConfirmingOut] = useState(false);
	const [workerNote, setWorkerNote] = useState("");
	const [nowMs, setNowMs] = useState(() => Date.now());

	const entry = shift?.timeEntry ?? null;
	const onClock = entry !== null && entry.clockedOutAt === null;

	useEffect(() => {
		if (!onClock) return;
		const timer = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [onClock]);

	if (!shift) return null;

	const canStart =
		!shift.planned &&
		entry === null &&
		nowMs >= new Date(shift.startsAt).getTime() - CLOCK_IN_EARLY_MS &&
		nowMs <= new Date(shift.endsAt).getTime();
	const shiftRange = formatShiftRange(
		shift.startMinute,
		shift.endMinute,
		shift.overnight,
	);

	return (
		<>
			<div className="flex min-w-0 items-center gap-3">
				<div className="hidden min-w-0 text-right sm:block">
					<p className="truncate text-muted-foreground text-xs">
						{onClock
							? "On the clock"
							: shift.planned
								? "Planned shift"
								: "Next shift"}
					</p>
					<p className="truncate font-medium text-sm tabular-nums">
						{formatDay(shift.startsAt)} · {shiftRange} · {shift.positionName}
					</p>
				</div>

				{onClock && entry ? (
					<div className="flex items-center gap-2">
						<span
							className="hidden font-mono text-sm tabular-nums sm:inline"
							aria-live="off"
						>
							{formatTimerMs(nowMs - new Date(entry.clockedInAt).getTime())}
						</span>
						<Button
							size="sm"
							variant="outline"
							disabled={clockOut.isPending}
							onClick={() => {
								setWorkerNote("");
								setConfirmingOut(true);
							}}
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

				{canStart ? (
					<Button
						size="sm"
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
				) : null}

				{!onClock && !canStart && !shift.planned ? (
					<span className="hidden text-muted-foreground text-xs md:inline">
						Clock-in opens{" "}
						{formatClockTime(
							new Date(
								new Date(shift.startsAt).getTime() - CLOCK_IN_EARLY_MS,
							).toISOString(),
						)}
					</span>
				) : null}

				{shift.planned ? (
					<span className="hidden text-muted-foreground text-xs md:inline">
						Planned — not yet published
					</span>
				) : null}
			</div>

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
							{`${shift.positionName} · ${shiftRange}. Start work at ${formatClockTime(new Date().toISOString())}?`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmingIn(false);
								clockIn.mutate(shift.id, {
									onSuccess: () => toast.success("Clocked in."),
									onError: (error) => toast.error((error as Error).message),
								});
							}}
						>
							Clock in
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmingOut}
				onOpenChange={(open) => {
					if (!open) {
						setConfirmingOut(false);
						setWorkerNote("");
					}
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
					{notesEnabled ? (
						<div className="grid gap-2 px-1">
							<label
								htmlFor="clock-bar-out-note"
								className="font-medium text-sm"
							>
								Note (optional)
							</label>
							<Textarea
								id="clock-bar-out-note"
								value={workerNote}
								onChange={(event) => setWorkerNote(event.target.value)}
								maxLength={500}
								placeholder="Anything managers should know about this shift"
								rows={3}
							/>
						</div>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmingOut(false);
								const note = workerNote.trim();
								setWorkerNote("");
								clockOut.mutate(
									{
										versionShiftId: shift.id,
										workerNote: note || undefined,
									},
									{
										onSuccess: () => toast.success("Clocked out."),
										onError: (error) => toast.error((error as Error).message),
									},
								);
							}}
						>
							Clock out
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
