import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
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
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeftIcon, TimerIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
	type TimecardEntry,
	useMySchedule,
	useMyTimeEntries,
} from "@/lib/queries";
import { formatDurationMs } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";
import { AppDocument } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";

export const Route = createFileRoute("/worker/timecard")({
	component: TimecardPage,
});

const punchHelper = createDataColumnHelper<TimecardEntry>();

function TimecardPage() {
	const { workplace } = useWorkplace();
	const { formatClockTime } = useDisplayPrefs();
	const notesEnabled = workplace?.policies.timesheetNotesEnabled ?? false;
	const timecard = useMyTimeEntries(workplace?.id);
	const schedule = useMySchedule(workplace?.id);
	const weekStartDay = schedule.data?.weekStartDay ?? 1;
	const [nowMs, setNowMs] = useState(() => Date.now());
	const [breakStates, setBreakStates] = useState<Record<string, boolean>>({});
	const queryClient = useQueryClient();
	const updateBreak = useMutation({
		mutationFn: (input: { timeEntryId: string; action: "start" | "end" }) =>
			api(`/v1/my/time-entries/${input.timeEntryId}/breaks/${input.action}`, {
				method: "POST",
			}),
		onSuccess: (_, input) => {
			setBreakStates((current) => ({
				...current,
				[input.timeEntryId]: input.action === "start",
			}));
			queryClient.invalidateQueries({ queryKey: ["timecard"] });
			toast.success(
				input.action === "start" ? "Break started." : "Break ended.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const entries = timecard.data?.timeEntries ?? [];
	const hasOpen = entries.some((entry) => entry.clockedOutAt === null);

	useEffect(() => {
		if (!hasOpen) return;
		const timer = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [hasOpen]);

	const week = currentWeekTotals(entries, nowMs, weekStartDay);
	const columns = useMemo(
		() =>
			punchHelper.columns([
				punchHelper.accessor((row) => formatDayLabel(row.clockedInAt), {
					id: "day",
					header: "Day",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				punchHelper.accessor("positionName", { header: "Position" }),
				punchHelper.accessor(
					(row) =>
						`${formatClockTime(row.clockedInAt)} – ${
							row.clockedOutAt
								? formatClockTime(row.clockedOutAt)
								: "on the clock"
						}`,
					{
						id: "window",
						header: "Clock window",
						cell: ({ getValue }) => (
							<span className="tabular-nums text-muted-foreground">
								{getValue()}
							</span>
						),
					},
				),
				punchHelper.accessor(
					(row) =>
						row.clockedOutAt == null
							? nowMs - new Date(row.clockedInAt).getTime()
							: new Date(row.clockedOutAt).getTime() -
								new Date(row.clockedInAt).getTime(),
					{
						id: "duration",
						header: "Duration",
						cell: ({ getValue }) => (
							<span className="tabular-nums">{formatDurationMs(getValue())}</span>
						),
					},
				),
				...(notesEnabled
					? [
							punchHelper.accessor((row) => row.workerNote ?? "", {
								id: "note",
								header: "Note",
								cell: ({ getValue }) => getValue() || "—",
							}),
						]
					: []),
				punchHelper.display({
					id: "status",
					header: "Status",
					enableSorting: false,
					cell: ({ row }) => {
						if (row.original.clockedOutAt !== null) return null;
						return (
							<Badge>{breakStates[row.original.id] ? "On Break" : "Open"}</Badge>
						);
					},
				}),
				punchHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const entry = row.original;
						if (entry.clockedOutAt !== null) return null;
						const breakOpen = breakStates[entry.id];
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={updateBreak.isPending || breakOpen === true}
									onClick={() =>
										updateBreak.mutate({
											timeEntryId: entry.id,
											action: "start",
										})
									}
								>
									{updateBreak.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Start Break
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={updateBreak.isPending || breakOpen === false}
									onClick={() =>
										updateBreak.mutate({
											timeEntryId: entry.id,
											action: "end",
										})
									}
								>
									End Break
								</Button>
							</div>
						);
					},
				}),
			]),
		[breakStates, formatClockTime, notesEnabled, nowMs, updateBreak],
	);

	return (
		<AppDocument>
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				nativeButton={false}
				render={<Link to="/worker" />}
			>
				<ChevronLeftIcon data-icon="inline-start" />
				My schedule
			</Button>

			{timecard.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-28" />
					<Skeleton className="h-40" />
				</div>
			) : null}

			{timecard.isError ? (
				<Card>
					<CardHeader>
						<CardTitle>We couldn’t load your timecard</CardTitle>
						<CardDescription>
							{(timecard.error as Error).message}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void timecard.refetch()}
						>
							{timecard.isFetching ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Try again
						</Button>
					</CardContent>
				</Card>
			) : null}

			{!timecard.isLoading && !timecard.isError ? (
				<>
					<Card>
						<CardHeader>
							<CardDescription>
								Week of {formatDayLabel(week.startsAt)}
							</CardDescription>
							<CardTitle className="font-bold text-4xl tabular-nums tracking-[-0.025em]">
								{formatDurationMs(week.totalMs)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								Punches are your record of started and finished work.
							</p>
						</CardContent>
					</Card>

					{entries.length === 0 ? (
						<Empty className="border border-dashed">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<TimerIcon />
								</EmptyMedia>
								<EmptyTitle>No punches yet</EmptyTitle>
								<EmptyDescription>
									Clock in from your schedule when your shift starts — your
									punches will show up here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<DataTable
							columns={columns}
							data={entries}
							getRowId={(row) => row.id}
							fill={false}
						/>
					)}

					{entries.length > 0 ? (
						<p className="text-center text-muted-foreground text-xs">
							Showing your last {entries.length} punches.
						</p>
					) : null}
				</>
			) : null}
		</AppDocument>
	);
}

function formatDayLabel(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}

function mondayStart(from: Date, weekStartDay: number): Date {
	const date = new Date(from);
	date.setHours(0, 0, 0, 0);
	const diff = (date.getDay() - weekStartDay + 7) % 7;
	date.setDate(date.getDate() - diff);
	return date;
}

function currentWeekTotals(
	entries: TimecardEntry[],
	now: number,
	weekStartDay: number,
) {
	const start = mondayStart(new Date(), weekStartDay);
	const end = new Date(start);
	end.setDate(end.getDate() + 7);
	let totalMs = 0;
	for (const entry of entries) {
		const inAt = new Date(entry.clockedInAt);
		if (inAt < start || inAt >= end) continue;
		const outAt = entry.clockedOutAt
			? new Date(entry.clockedOutAt).getTime()
			: now;
		totalMs += Math.max(0, outAt - inAt.getTime());
	}
	return { startsAt: start.toISOString(), totalMs };
}
