import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
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
import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { api } from "@/lib/api";
import {
	type TimecardEntry,
	useMySchedule,
	useMyTimeEntries,
} from "@/lib/queries";
import { formatDurationMs } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

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
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const queryClient = useQueryClient();
	const updateBreak = useMutation({
		mutationFn: (input: { timeEntryId: string; action: "start" | "end" }) =>
			api(`/v1/my/time-entries/${input.timeEntryId}/breaks/${input.action}`, {
				method: "POST",
			}),
		onSuccess: (_, input) => {
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
	const filteredEntries = useMemo(() => {
		const term = search.trim().toLowerCase();
		return entries.filter((entry) => {
			if (statusFilter === "open" && entry.clockedOutAt !== null) return false;
			if (statusFilter === "closed" && entry.clockedOutAt === null) {
				return false;
			}
			if (!term) return true;
			return entry.positionName.toLowerCase().includes(term);
		});
	}, [entries, search, statusFilter]);
	const pagination = useTablePagination(filteredEntries, {
		resetKey: `${search}|${statusFilter}`,
	});
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
							<span className="text-muted-foreground tabular-nums">
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
							<span className="tabular-nums">
								{formatDurationMs(getValue())}
							</span>
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
						const entry = row.original;
						if (entry.clockedOutAt !== null) return null;
						return entry.openBreakStartedAt ? (
							<Badge variant="secondary">
								On break since {formatClockTime(entry.openBreakStartedAt)}
							</Badge>
						) : (
							<Badge>On the clock</Badge>
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
						const breakOpen = entry.openBreakStartedAt !== null;
						const pendingThis =
							updateBreak.isPending &&
							updateBreak.variables?.timeEntryId === entry.id;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={breakOpen || pendingThis}
									onClick={() =>
										updateBreak.mutate({
											timeEntryId: entry.id,
											action: "start",
										})
									}
								>
									{pendingThis && updateBreak.variables?.action === "start" ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Start Break
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={!breakOpen || pendingThis}
									onClick={() =>
										updateBreak.mutate({
											timeEntryId: entry.id,
											action: "end",
										})
									}
								>
									{pendingThis && updateBreak.variables?.action === "end" ? (
										<Spinner data-icon="inline-start" />
									) : null}
									End Break
								</Button>
							</div>
						);
					},
				}),
			]),
		[formatClockTime, notesEnabled, nowMs, updateBreak],
	);

	return (
		<AppPage>
			<AppPageHeader
				title="Timecard"
				badge={
					<Badge variant="secondary">
						{formatDurationMs(week.totalMs)} this week
					</Badge>
				}
				description={`Week of ${formatDayLabel(week.startsAt)} · every Time Entry you started and finished.`}
				actions={
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={<Link to="/worker" />}
					>
						<ChevronLeftIcon data-icon="inline-start" />
						My schedule
					</Button>
				}
			/>
			<AppPageBody scroll={false}>
				{timecard.isLoading ? (
					<div className="flex flex-col gap-3 p-4 md:p-6">
						<Skeleton className="h-12" />
						<Skeleton className="h-40" />
					</div>
				) : null}

				{timecard.isError ? (
					<div className="p-4 md:p-6">
						<Alert variant="destructive">
							<AlertTitle>We couldn’t load your timecard</AlertTitle>
							<AlertDescription className="flex flex-wrap items-center gap-2">
								<span>{(timecard.error as Error).message}</span>
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
							</AlertDescription>
						</Alert>
					</div>
				) : null}

				{!timecard.isLoading && !timecard.isError ? (
					entries.length === 0 ? (
						<div className="p-4 md:p-6">
							<Empty className="border border-dashed">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<TimerIcon />
									</EmptyMedia>
									<EmptyTitle>No Time Entries yet</EmptyTitle>
									<EmptyDescription>
										Clock in from your schedule when your shift starts — your
										entries will show up here.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						</div>
					) : (
						<div className="flex min-h-0 flex-1 flex-col">
							<TableToolbar
								left={
									<>
										<TableSearch
											value={search}
											onValueChange={setSearch}
											placeholder="Search position"
										/>
										<TableFilter
											value={statusFilter}
											onValueChange={setStatusFilter}
											items={[
												{ label: "All entries", value: "all" },
												{ label: "On the clock", value: "open" },
												{ label: "Completed", value: "closed" },
											]}
											ariaLabel="Filter by entry status"
										/>
									</>
								}
								right={<TablePagination {...pagination} />}
							/>
							<div className="min-h-0 flex-1 overflow-auto">
								<DataTable
									stacked
									fill={false}
									columns={columns}
									data={pagination.pageRows}
									getRowId={(row) => row.id}
									empty={
										<p className="p-4 text-muted-foreground text-sm">
											No entries match your search.
										</p>
									}
								/>
							</div>
						</div>
					)
				) : null}
			</AppPageBody>
		</AppPage>
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
