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
import { Link } from "@tanstack/react-router";
import { CalendarDaysIcon, TimerIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { useClockIn, useClockOut } from "@/lib/queries";
import { CLOCK_IN_EARLY_MS, formatDay, formatTimerMs } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export type TimeClockShift = {
	id: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	timeEntry: {
		clockedInAt: string;
		clockedOutAt: string | null;
	} | null;
};

export function TimeClockCard({
	shift,
	timecardTo,
	children,
}: {
	shift: TimeClockShift;
	timecardTo?: "/worker/timecard";
	children?: ReactNode;
}) {
	const clockIn = useClockIn();
	const clockOut = useClockOut();
	const { workplace } = useWorkplace();
	const { formatClockTime, formatShiftRange } = useDisplayPrefs();
	const notesEnabled = workplace?.policies.timesheetNotesEnabled ?? false;
	const [confirmingIn, setConfirmingIn] = useState(false);
	const [confirmingOut, setConfirmingOut] = useState(false);
	const [workerNote, setWorkerNote] = useState("");
	const [nowMs, setNowMs] = useState(() => Date.now());
	const entry = shift.timeEntry;
	const onClock = entry !== null && entry.clockedOutAt === null;
	const canStart =
		entry === null &&
		nowMs >= new Date(shift.startsAt).getTime() - CLOCK_IN_EARLY_MS &&
		nowMs <= new Date(shift.endsAt).getTime();

	useEffect(() => {
		if (!onClock) return;
		const timer = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [onClock]);

	const shiftRange = formatShiftRange(
		shift.startMinute,
		shift.endMinute,
		shift.overnight,
	);

	return (
		<>
			<div className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm">
				<div>
					<p className="mb-3 font-medium text-primary-foreground/75 text-sm">
						{onClock ? "You're on the clock" : "Next shift"}
					</p>
					<h1 className="font-semibold text-2xl tracking-[-0.025em]">
						{formatDay(shift.startsAt)}
					</h1>
					<p className="mt-1 font-medium text-lg tabular-nums">
						{shiftRange} · {shift.positionName}
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

				{!onClock && entry && entry.clockedOutAt !== null ? (
					<p className="text-primary-foreground/75 text-sm">
						Last punch · In {formatClockTime(entry.clockedInAt)} · Out{" "}
						{formatClockTime(entry.clockedOutAt)}
					</p>
				) : null}

				{canStart ? (
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

				{!canStart && entry === null ? (
					<p className="text-primary-foreground/75 text-sm">
						Clock-in opens at{" "}
						{formatClockTime(
							new Date(
								new Date(shift.startsAt).getTime() - CLOCK_IN_EARLY_MS,
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

				{children}

				{timecardTo ? (
					<Button
						variant="ghost"
						className="self-start text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
						nativeButton={false}
						render={<Link to={timecardTo} />}
					>
						My timecard
						<CalendarDaysIcon data-icon="inline-end" />
					</Button>
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
								htmlFor="clock-out-note"
								className="font-medium text-sm"
							>
								Note (optional)
							</label>
							<Textarea
								id="clock-out-note"
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
