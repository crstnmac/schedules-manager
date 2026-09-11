import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardAction,
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
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemSeparator,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlarmClockIcon,
	BellRingIcon,
	ChevronRightIcon,
	CircleCheckIcon,
	CircleIcon,
	ClipboardListIcon,
	MapPinIcon,
	TagsIcon,
	TriangleAlertIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { AppDocument } from "@/components/app-page";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import {
	useAcceptances,
	useLocations,
	useMySchedule,
	usePilotStatus,
	usePositions,
	useSchedule,
	useScheduleLabor,
	useWorkers,
	useWorkplaceSettings,
} from "@/lib/queries";
import { addDays, weekStartOf } from "@/lib/schedule-calendar";
import { formatDay } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

function formatWeekLabel(weekStart: string): string {
	const start = new Date(`${weekStart}T12:00:00`);
	const end = new Date(`${addDays(weekStart, 6)}T12:00:00`);
	const fmt = (date: Date) =>
		date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	return `${fmt(start)} – ${fmt(end)}`;
}

function formatHours(minutes: number): string {
	return `${(minutes / 60).toFixed(1)}h`;
}

function formatCurrency(cents: number): string {
	return (cents / 100).toLocaleString(undefined, {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	});
}

function StatCard({
	label,
	value,
	hint,
	tone = "default",
}: {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	tone?: "default" | "amber" | "destructive";
}) {
	return (
		<Card>
			<CardHeader>
				<CardDescription>{label}</CardDescription>
				<CardTitle
					className={cn(
						"text-2xl tabular-nums",
						tone === "amber" && "text-warning-foreground",
						tone === "destructive" && "text-destructive",
					)}
				>
					{value}
				</CardTitle>
				{hint ? <CardDescription>{hint}</CardDescription> : null}
			</CardHeader>
		</Card>
	);
}

function StatLink({
	icon: Icon,
	value,
	label,
	to,
}: {
	icon: typeof MapPinIcon;
	value: number;
	label: string;
	to:
		| "/dashboard/settings/locations"
		| "/dashboard/settings/positions"
		| "/dashboard/workers";
}) {
	return (
		<Item size="sm" render={<Link to={to} />} className="min-w-0">
			<ItemMedia variant="icon" className="text-muted-foreground">
				<Icon />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{label}</ItemTitle>
			</ItemContent>
			<ItemActions>
				<span className="font-semibold text-base tabular-nums">{value}</span>
				<ChevronRightIcon
					aria-hidden="true"
					className="size-4 text-muted-foreground"
				/>
			</ItemActions>
		</Item>
	);
}

function AttentionItem({
	icon: Icon,
	label,
	description,
	count,
	hash,
}: {
	icon: typeof MapPinIcon;
	label: string;
	description: string;
	count: number;
	hash: string;
}) {
	return (
		<Item
			size="sm"
			render={<Link to="/dashboard/schedule" hash={hash} />}
			className="min-w-0"
		>
			<ItemMedia variant="icon" className="text-muted-foreground">
				<Icon />
			</ItemMedia>
			<ItemContent>
				<ItemTitle>{label}</ItemTitle>
				<ItemDescription>{description}</ItemDescription>
			</ItemContent>
			<ItemActions>
				<Badge variant="secondary" className="tabular-nums">
					{count}
				</Badge>
				<ChevronRightIcon
					aria-hidden="true"
					className="size-4 text-muted-foreground"
				/>
			</ItemActions>
		</Item>
	);
}

function Overview() {
	const { workplace } = useWorkplace();
	const { formatShiftRange } = useDisplayPrefs();
	const settings = useWorkplaceSettings(workplace?.id);
	const locations = useLocations(workplace?.id);
	const positions = usePositions(workplace?.id);
	const workers = useWorkers(workplace?.id);
	const pilot = usePilotStatus(workplace?.id);
	const [focusLocationId, setFocusLocationId] = useState<string | null>(null);
	const focusLocation =
		locations.data?.find((location) => location.id === focusLocationId) ??
		locations.data?.[0];
	const weekStart = settings.data
		? weekStartOf(new Date(), settings.data.weekStartDay)
		: undefined;
	const currentSchedule = useSchedule(focusLocation?.id, weekStart);
	const scheduleLabor = useScheduleLabor(focusLocation?.id, weekStart);
	const acceptances = useAcceptances(currentSchedule.data?.schedule.id);
	const mySchedule = useMySchedule(workplace?.id, "home");
	const nextShift = mySchedule.data?.nextShift ?? null;
	const onClock =
		nextShift?.timeEntry != null && nextShift.timeEntry.clockedOutAt === null;
	const queryClient = useQueryClient();
	const remind = useMutation({
		mutationFn: () =>
			api<{ reminded: number }>(
				`/v1/workplaces/${workplace?.id}/reminders/unacknowledged`,
				{ method: "POST" },
			),
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: ["pilot-status", workplace?.id],
			});
			toast.success(
				result.reminded > 0
					? `Reminded ${result.reminded} worker${result.reminded === 1 ? "" : "s"}.`
					: "Everyone is already caught up.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const isLoading =
		locations.isLoading || positions.isLoading || workers.isLoading;

	const activeWorkers =
		workers.data?.workers.filter(
			(worker) => worker.status === "active" && worker.kind === "worker",
		) ?? [];
	const pendingInvitations =
		workers.data?.invitations.filter(
			(invitation) =>
				invitation.status === "pending" &&
				new Date(invitation.expiresAt).getTime() > Date.now(),
		) ?? [];

	const pilotCounts = pilot.data?.counts;
	const checklist = [
		{
			label: "Add your first location",
			done: (pilotCounts?.locations ?? 0) > 0,
			to: "/dashboard/settings/locations" as const,
		},
		{
			label: "Add positions",
			done: (pilotCounts?.positions ?? 0) > 0,
			to: "/dashboard/settings/positions" as const,
		},
		{
			label: "Import or invite your team",
			done:
				(pilotCounts?.activeWorkers ?? 0) +
					(pilotCounts?.pendingInvitations ?? 0) >
				0,
			to: "/dashboard/workers" as const,
		},
		{
			label: "Build the first week",
			done: (pilotCounts?.draftShifts ?? 0) > 0,
			to: "/dashboard/schedule" as const,
		},
		{
			label: "Publish the first schedule",
			done: (pilotCounts?.publishedVersions ?? 0) > 0,
			to: "/dashboard/schedule" as const,
		},
	];
	const completedSteps = checklist.filter((step) => step.done).length;

	const scheduleData = currentSchedule.data;
	const openShiftCount =
		scheduleData?.shifts.filter((shift) => shift.employmentId === null)
			.length ?? 0;
	const conflictCount =
		scheduleData?.shifts.reduce(
			(sum, shift) => sum + shift.conflicts.length,
			0,
		) ?? 0;
	const scheduledMinutes =
		scheduleData?.hours.reduce((sum, entry) => sum + entry.minutes, 0) ?? 0;
	const laborPercent = scheduleLabor.data?.laborPercent ?? null;
	const laborGoal = settings.data?.laborCostPercentGoal ?? null;
	const latestVersion = scheduleData?.publication.latestVersionNumber ?? null;
	const hasUnpublishedChanges =
		scheduleData?.publication.hasUnpublishedChanges ?? false;
	const unacknowledged = pilotCounts?.unacknowledgedDeliveries ?? 0;

	const scheduleStatus =
		latestVersion === null
			? { label: "Draft schedule", published: false }
			: hasUnpublishedChanges
				? { label: `Draft changes on v${latestVersion}`, published: false }
				: { label: `Published v${latestVersion}`, published: true };

	const constrainedStaff = (scheduleData?.staff ?? []).filter(
		(member) =>
			(member.unavailability?.length ?? 0) > 0 ||
			member.preference ||
			(member.timeOff?.length ?? 0) > 0,
	);
	const outstandingAcceptances = (acceptances.data?.acceptances ?? []).filter(
		(acceptance) => acceptance.status !== "accepted",
	);
	const attentionLoading =
		settings.isLoading ||
		locations.isLoading ||
		currentSchedule.isLoading ||
		acceptances.isLoading ||
		mySchedule.isLoading;
	const attentionError =
		settings.isError ||
		locations.isError ||
		currentSchedule.isError ||
		acceptances.isError ||
		mySchedule.isError;

	const hasAttentionItems =
		constrainedStaff.length > 0 || outstandingAcceptances.length > 0;

	return (
		<AppDocument widthClassName="max-w-7xl" className="gap-6 py-6 md:py-8">
			<PageHeader
				title="Overview"
				description="Your week, your team, and what needs your attention."
				actions={
					<span className="text-muted-foreground text-sm">
						{workplace?.name}
					</span>
				}
			/>
			{nextShift ? (
				<Card className={cn(onClock && "border-primary/40 bg-primary/5")}>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlarmClockIcon className="size-4 text-primary" />
							{onClock ? "You're on the clock" : "Your next shift"}
						</CardTitle>
						<CardDescription>
							{formatDay(nextShift.startsAt)} ·{" "}
							{formatShiftRange(
								nextShift.startMinute,
								nextShift.endMinute,
								nextShift.overnight,
							)}{" "}
							· {nextShift.positionName}
						</CardDescription>
						<CardAction>
							<Button
								size="sm"
								nativeButton={false}
								render={<Link to="/dashboard/clock" />}
							>
								{onClock ? "Open clock" : "View shift & clock"}
							</Button>
						</CardAction>
					</CardHeader>
				</Card>
			) : null}

			<section
				aria-labelledby="overview-week-heading"
				className="flex flex-col gap-3"
			>
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="flex min-w-0 flex-col gap-1">
						<div className="flex flex-wrap items-center gap-2">
							<h2
								id="overview-week-heading"
								className="font-heading font-medium text-sm"
							>
								This week
							</h2>
							<Badge
								variant={scheduleStatus.published ? "default" : "secondary"}
							>
								{scheduleStatus.published ? (
									<CircleCheckIcon data-icon="inline-start" />
								) : (
									<CircleIcon data-icon="inline-start" />
								)}
								{scheduleStatus.label}
							</Badge>
						</div>
						<p className="text-muted-foreground text-xs">
							{weekStart ? formatWeekLabel(weekStart) : "Loading week"}
							{focusLocation ? ` · ${focusLocation.name}` : ""}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{(locations.data?.length ?? 0) > 1 ? (
							<Select
								items={(locations.data ?? []).map((location) => ({
									label: location.name,
									value: location.id,
								}))}
								value={focusLocation?.id ?? null}
								onValueChange={(value) => {
									if (value) setFocusLocationId(value);
								}}
							>
								<SelectTrigger
									aria-label="Week location"
									size="sm"
									className="w-44 max-w-full"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{(locations.data ?? []).map((location) => (
											<SelectItem key={location.id} value={location.id}>
												{location.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						) : null}
						<Button
							size="sm"
							nativeButton={false}
							render={<Link to="/dashboard/schedule" />}
						>
							Open schedule
						</Button>
					</div>
				</div>
				{settings.isError || locations.isError || currentSchedule.isError ? (
					<Alert variant="destructive">
						<AlertTitle>Couldn’t load this week’s schedule.</AlertTitle>
						<AlertDescription>
							Check your connection and try again.
						</AlertDescription>
						<AlertAction>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									void settings.refetch();
									void locations.refetch();
									void currentSchedule.refetch();
								}}
							>
								Try again
							</Button>
						</AlertAction>
					</Alert>
				) : isLoading || settings.isLoading || currentSchedule.isLoading ? (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{["hours", "labor", "open", "conflicts"].map((key) => (
							<Skeleton key={key} className="h-24" />
						))}
					</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<StatCard
							label="Scheduled"
							value={formatHours(scheduledMinutes)}
							hint={
								scheduleLabor.data
									? formatCurrency(scheduleLabor.data.scheduledCents)
									: undefined
							}
						/>
						<StatCard
							label="Labor %"
							value={laborPercent == null ? "—" : `${laborPercent.toFixed(1)}%`}
							hint={laborGoal == null ? undefined : `Goal ${laborGoal}%`}
						/>
						<StatCard
							label="Open shifts"
							value={openShiftCount}
							tone={openShiftCount > 0 ? "amber" : "default"}
							hint={
								openShiftCount > 0
									? "Need a worker"
									: scheduleData?.shifts.length
										? "All assigned"
										: "No shifts yet"
							}
						/>
						<StatCard
							label="Conflicts"
							value={conflictCount}
							tone={conflictCount > 0 ? "destructive" : "default"}
							hint={conflictCount > 0 ? "Resolve before publishing" : "None"}
						/>
					</div>
				)}
			</section>

			{scheduleData && weekStart ? (
				<Card>
					<CardHeader>
						<CardTitle>Daily shifts</CardTitle>
						<CardDescription>
							Shifts scheduled each day this week.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<section
							className="overflow-x-auto"
							aria-label="Daily shift summary"
							// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll this region.
							tabIndex={0}
						>
							<div className="grid min-w-[42rem] grid-cols-7 divide-x rounded-lg border">
								{Array.from({ length: 7 }, (_, index) => {
									const date = addDays(weekStart, index);
									const day = new Date(`${date}T12:00:00`);
									const shifts = scheduleData.shifts.filter(
										(shift) => shift.date === date,
									);
									const open = shifts.filter(
										(shift) => shift.employmentId === null,
									).length;
									const today =
										new Date().toDateString() === day.toDateString();
									return (
										<div
											key={date}
											className={cn("px-4 py-4", today && "bg-primary/5")}
										>
											<div className="flex items-center justify-between gap-1 text-xs">
												<span
													className={cn(
														"text-muted-foreground",
														today && "font-semibold text-primary",
													)}
												>
													{day.toLocaleDateString(undefined, {
														weekday: "short",
													})}
												</span>
												<span className="font-medium tabular-nums">
													{day.getDate()}
												</span>
											</div>
											<p className="mt-3 font-medium text-sm tabular-nums">
												{shifts.length}{" "}
												{shifts.length === 1 ? "shift" : "shifts"}
											</p>
											<p
												className={cn(
													"mt-1 text-xs",
													open
														? "text-warning-foreground"
														: "text-muted-foreground",
												)}
											>
												{open
													? `${open} open`
													: today
														? "Today"
														: shifts.length
															? "All assigned"
															: "—"}
											</p>
										</div>
									);
								})}
							</div>
						</section>
					</CardContent>
				</Card>
			) : null}

			{unacknowledged > 0 ? (
				<Alert>
					<BellRingIcon />
					<AlertTitle>Schedule changes need acknowledgement</AlertTitle>
					<AlertDescription>
						{unacknowledged} schedule change
						{unacknowledged === 1 ? "" : "s"} still need acknowledgement.
					</AlertDescription>
					<AlertAction>
						<Button
							variant="outline"
							size="xs"
							disabled={remind.isPending}
							onClick={() => remind.mutate()}
						>
							{remind.isPending ? "Sending…" : "Remind"}
						</Button>
					</AlertAction>
				</Alert>
			) : null}

			<div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							Needs attention
							{hasAttentionItems ? (
								<Badge variant="secondary" className="tabular-nums">
									{constrainedStaff.length + outstandingAcceptances.length}
								</Badge>
							) : null}
						</CardTitle>
						<CardDescription>
							Current-week constraints and unresolved shift decisions
							{focusLocation ? ` for ${focusLocation.name}` : ""}.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{attentionLoading ? (
							<div
								role="status"
								aria-label="Loading attention items"
								className="grid gap-3"
							>
								<Skeleton className="h-12" />
								<Skeleton className="h-12" />
								<Skeleton className="h-12" />
							</div>
						) : attentionError ? (
							<Alert variant="destructive">
								<AlertTitle>
									Some shift decisions couldn’t be loaded.
								</AlertTitle>
								<AlertAction>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											void settings.refetch();
											void locations.refetch();
											void currentSchedule.refetch();
											void acceptances.refetch();
											void mySchedule.refetch();
										}}
									>
										Try again
									</Button>
								</AlertAction>
							</Alert>
						) : !hasAttentionItems ? (
							<Empty className="min-h-48">
								<EmptyHeader>
									<EmptyMedia variant="icon" className="text-primary">
										<CircleCheckIcon />
									</EmptyMedia>
									<EmptyTitle>You're all caught up</EmptyTitle>
									<EmptyDescription>
										No worker constraints or pending shift decisions for this
										week.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<ItemGroup className="gap-0">
								{constrainedStaff.length > 0 ? (
									<AttentionItem
										icon={TriangleAlertIcon}
										label="Scheduling constraints"
										description={`${constrainedStaff.length} worker${
											constrainedStaff.length === 1 ? "" : "s"
										} can't work as scheduled this week.`}
										count={constrainedStaff.length}
										hash="schedule-constraints-heading"
									/>
								) : null}
								{constrainedStaff.length > 0 &&
								outstandingAcceptances.length > 0 ? (
									<ItemSeparator />
								) : null}
								{outstandingAcceptances.length > 0 ? (
									<AttentionItem
										icon={ClipboardListIcon}
										label="Shift acceptances"
										description={
											outstandingAcceptances.length === 1
												? "1 late change still needs a response."
												: `${outstandingAcceptances.length} late changes still need a response.`
										}
										count={outstandingAcceptances.length}
										hash="schedule-acceptances-heading"
									/>
								) : null}
							</ItemGroup>
						)}
					</CardContent>
				</Card>

				<aside
					aria-label="Workplace summary"
					className="grid min-w-0 gap-6 border-t pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6"
				>
					{pilot.data && completedSteps < checklist.length ? (
						<Card>
							<CardHeader>
								<CardTitle className="flex flex-wrap items-center justify-between gap-2">
									Set up scheduling
									<Badge variant="secondary">
										{completedSteps} of {checklist.length} complete
									</Badge>
								</CardTitle>
								<CardDescription>
									Finish these steps to get your workplace ready.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ItemGroup>
									{checklist.map((step) => (
										<Item
											key={step.label}
											size="sm"
											render={<Link to={step.to} />}
											className={cn(step.done && "text-muted-foreground")}
										>
											<ItemMedia variant="icon">
												{step.done ? (
													<CircleCheckIcon className="text-primary" />
												) : (
													<CircleIcon />
												)}
											</ItemMedia>
											<ItemContent>
												<ItemTitle className={cn(step.done && "line-through")}>
													{step.label}
												</ItemTitle>
											</ItemContent>
											<span className="sr-only">
												{step.done ? "Completed" : "Not completed"}
											</span>
										</Item>
									))}
								</ItemGroup>
							</CardContent>
						</Card>
					) : null}

					<Card>
						<CardHeader>
							<CardTitle>Workplace</CardTitle>
							<CardDescription>Team and settings at a glance.</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{isLoading ? (
								<div className="grid gap-1">
									{["locations", "positions", "workers", "invitations"].map(
										(key) => (
											<Skeleton key={key} className="h-12" />
										),
									)}
								</div>
							) : (
								<ItemGroup className="gap-0">
									<StatLink
										icon={MapPinIcon}
										value={locations.data?.length ?? 0}
										label="Locations"
										to="/dashboard/settings/locations"
									/>
									<ItemSeparator />
									<StatLink
										icon={TagsIcon}
										value={positions.data?.length ?? 0}
										label="Positions"
										to="/dashboard/settings/positions"
									/>
									<ItemSeparator />
									<StatLink
										icon={UsersIcon}
										value={activeWorkers.length}
										label="Active workers"
										to="/dashboard/workers"
									/>
									<ItemSeparator />
									<StatLink
										icon={UserPlusIcon}
										value={pendingInvitations.length}
										label="Pending invitations"
										to="/dashboard/workers"
									/>
								</ItemGroup>
							)}
							{pendingInvitations.length > 0 ? (
								<Button
									variant="link"
									size="sm"
									className="self-start px-0"
									nativeButton={false}
									render={<Link to="/dashboard/workers" />}
								>
									Review pending invitations
									<ChevronRightIcon data-icon="inline-end" />
								</Button>
							) : null}
						</CardContent>
					</Card>
				</aside>
			</div>
		</AppDocument>
	);
}
