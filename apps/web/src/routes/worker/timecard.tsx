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
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeftIcon, TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type TimecardEntry,
	useMySchedule,
	useMyTimeEntries,
} from "@/lib/queries";
import { formatClockTime, formatDurationMs } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/timecard")({
	component: TimecardPage,
});

interface DayGroup {
	label: string;
	totalMs: number;
	entries: TimecardEntry[];
}

function TimecardPage() {
	const { workplace } = useWorkplace();
	const timecard = useMyTimeEntries(workplace?.id);
	const schedule = useMySchedule(workplace?.id);
	const weekStartDay = schedule.data?.weekStartDay ?? 1;
	const [nowMs, setNowMs] = useState(() => Date.now());
	const entries = timecard.data?.timeEntries ?? [];
	const hasOpen = entries.some((entry) => entry.clockedOutAt === null);

	useEffect(() => {
		if (!hasOpen) return;
		const timer = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [hasOpen]);

	const groups = groupByDay(entries, nowMs);
	const week = currentWeekTotals(entries, nowMs, weekStartDay);

	return (
		<section className="flex flex-col gap-4">
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

					{groups.length === 0 ? (
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
					) : null}

					{groups.map((group) => (
						<Card key={group.label}>
							<CardHeader>
								<div className="flex items-center justify-between gap-3">
									<CardTitle>{group.label}</CardTitle>
									<p className="font-medium text-muted-foreground text-sm tabular-nums">
										{formatDurationMs(group.totalMs)}
									</p>
								</div>
							</CardHeader>
							<CardContent className="flex flex-col">
								{group.entries.map((entry) => {
									const open = entry.clockedOutAt === null;
									const durationMs = open
										? nowMs - new Date(entry.clockedInAt).getTime()
										: new Date(entry.clockedOutAt ?? "").getTime() -
											new Date(entry.clockedInAt).getTime();
									return (
										<div
											key={entry.id}
											className="flex items-center justify-between gap-3 border-t py-3 first:border-t-0 first:pt-0 last:pb-0"
										>
											<div className="min-w-0">
												<p className="font-medium text-sm">
													{entry.positionName}
												</p>
												<p className="text-muted-foreground text-sm tabular-nums">
													{formatClockTime(entry.clockedInAt)} –{" "}
													{open
														? "on the clock"
														: formatClockTime(entry.clockedOutAt ?? undefined)}
													{" · "}
													{formatDurationMs(durationMs)}
												</p>
											</div>
											{open ? <Badge>Open</Badge> : null}
										</div>
									);
								})}
							</CardContent>
						</Card>
					))}

					{entries.length > 0 ? (
						<p className="text-center text-muted-foreground text-xs">
							Showing your last {entries.length} punches.
						</p>
					) : null}
				</>
			) : null}
		</section>
	);
}

function formatDayLabel(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function groupByDay(entries: TimecardEntry[], now: number): DayGroup[] {
	const map = new Map<string, DayGroup>();
	for (const entry of entries) {
		const date = new Date(entry.clockedInAt);
		const label = date.toLocaleDateString(undefined, {
			weekday: "long",
			month: "short",
			day: "numeric",
		});
		const group = map.get(label) ?? { label, totalMs: 0, entries: [] };
		const end = entry.clockedOutAt
			? new Date(entry.clockedOutAt).getTime()
			: now;
		group.totalMs += Math.max(0, end - new Date(entry.clockedInAt).getTime());
		group.entries.push(entry);
		map.set(label, group);
	}
	return [...map.values()];
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
