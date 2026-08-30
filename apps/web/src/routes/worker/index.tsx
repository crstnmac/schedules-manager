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
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDaysIcon, EyeIcon } from "lucide-react";
import { toast } from "sonner";
import {
	useAcknowledge,
	useMySchedule,
	useRequestRelease,
	useRespondToAcceptance,
} from "@/lib/queries";
import { formatDay, formatMinute, formatShiftRange } from "@/lib/time";
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

	const currentWeek = schedule.data?.currentWeek ?? null;
	const nextWeek = schedule.data?.nextWeek ?? null;
	const nextShift = schedule.data?.nextShift ?? null;
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
		<section className="flex flex-col gap-6">
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
				<div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm">
					<p className="mb-3 font-medium text-primary-foreground/75 text-sm">
						Next shift
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
										<Button
											size="sm"
											variant="outline"
											disabled={respond.isPending}
											onClick={() =>
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
										>
											Decline
										</Button>
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
													disabled={
														release.isPending ||
														shift.releaseStatus === "pending"
													}
													onClick={() =>
														release.mutate(shift.id, {
															onSuccess: () =>
																toast.success(
																	"Release requested. You remain responsible until a manager approves.",
																),
															onError: (error) =>
																toast.error((error as Error).message),
														})
													}
												>
													{shift.releaseStatus === "pending"
														? "Release pending"
														: "Request release"}
												</Button>
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
