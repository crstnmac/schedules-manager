import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
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
import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowLeftRightIcon,
	CalendarClockIcon,
	CalendarDaysIcon,
	CircleAlertIcon,
	ClipboardListIcon,
	EyeIcon,
	HistoryIcon,
	ListChecksIcon,
	type LucideIcon,
} from "lucide-react";
import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { NextShiftBar } from "@/components/next-shift-bar";
import {
	type MyScheduleResponse,
	useAcknowledge,
	useMyPickups,
	useMyReleases,
	useMySchedule,
	useMySwaps,
	useShiftTasks,
} from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";
import {
	HistorySection,
	NextWeekSection,
	PendingSection,
	TasksSection,
} from "./-home/other-sections";
import {
	isPlanned,
	NO_ACCEPTANCES,
	NO_HISTORY,
	SectionEmpty,
	type ShiftTask,
	type WorkerWeek,
} from "./-home/shared";
import { ThisWeekSection } from "./-home/this-week-section";
import { useStablePrefs } from "./-shared/use-stable-prefs";

// The calendar view and the request/swap cards are only needed on demand.
const WorkerScheduleCalendar = lazy(() =>
	import("@/components/worker-schedule-calendar").then((module) => ({
		default: module.WorkerScheduleCalendar,
	})),
);
const loadRequests = () => import("./-home/requests");
const WorkerRequestsCard = lazy(() =>
	loadRequests().then((module) => ({ default: module.WorkerRequestsCard })),
);
const WorkerSwapsCard = lazy(() =>
	loadRequests().then((module) => ({ default: module.WorkerSwapsCard })),
);

export const Route = createFileRoute("/worker/")({
	component: WorkerHome,
});

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

const NO_TASKS: ShiftTask[] = [];
const NO_CHANGES: string[] = [];

type NextShift = NonNullable<MyScheduleResponse["nextShift"]>;

function relativeDayLabel(date: string): string {
	const today = new Date();
	today.setHours(12, 0, 0, 0);
	const day = new Date(`${date}T12:00:00`);
	const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
	if (diff <= 0) return "Today";
	if (diff === 1) return "Tomorrow";
	return `In ${diff} days`;
}

/**
 * The single strongest block on the worker screen: when and what they work
 * next. Clocking in stays in the top bar so this panel is read-only context.
 */
const NextShiftHero = memo(function NextShiftHero({
	shift,
	range,
	taskCount,
	onShowTasks,
}: {
	shift: NextShift;
	range: string;
	taskCount: number;
	onShowTasks: () => void;
}) {
	const onClock =
		shift.timeEntry !== null && shift.timeEntry.clockedOutAt === null;
	const longDay = new Date(`${shift.date}T12:00:00`).toLocaleDateString(
		undefined,
		{ weekday: "long", month: "long", day: "numeric" },
	);
	return (
		<section
			aria-labelledby="next-shift-heading"
			className="flex flex-col gap-5 rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm md:p-6"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1.5">
					<h2
						id="next-shift-heading"
						className="font-medium text-primary-foreground/80 text-sm"
					>
						{onClock
							? "You’re on the clock"
							: shift.planned
								? "Planned shift"
								: "Your next shift"}
					</h2>
					<p className="font-heading font-semibold text-3xl tabular-nums tracking-tight md:text-4xl">
						{range}
					</p>
					<p className="text-primary-foreground/85 text-sm">
						{longDay} · {shift.positionName}
					</p>
				</div>
				<Badge className="h-6 border-transparent bg-primary-foreground/15 px-2.5 text-primary-foreground">
					{onClock ? "Now" : relativeDayLabel(shift.date)}
				</Badge>
			</div>
			<div className="flex flex-wrap items-center gap-3 border-primary-foreground/20 border-t pt-4">
				<NextShiftBar variant="hero" />
				{taskCount > 0 ? (
					<Button
						size="sm"
						variant="secondary"
						className="bg-primary-foreground text-primary [@media(hover:hover)]:hover:bg-primary-foreground/90"
						onClick={onShowTasks}
					>
						<ListChecksIcon data-icon="inline-start" />
						{taskCount} shift task{taskCount === 1 ? "" : "s"}
					</Button>
				) : null}
				{shift.planned ? (
					<p className="text-primary-foreground/80 text-xs">
						Planned shifts aren’t published yet and may change.
					</p>
				) : null}
			</div>
		</section>
	);
});

const SectionTabs = memo(function SectionTabs({
	section,
	onSectionChange,
	counts,
}: {
	section: ScheduleSectionId;
	onSectionChange: (section: ScheduleSectionId) => void;
	counts: Partial<Record<ScheduleSectionId, number>>;
}) {
	return (
		<Tabs
			value={section}
			onValueChange={(value) => onSectionChange(value as ScheduleSectionId)}
			className="min-w-0"
		>
			<div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-1">
				<TabsList aria-label="My schedule sections">
					{SCHEDULE_SECTIONS.map((item) => {
						const count = counts[item.id] ?? 0;
						return (
							<TabsTrigger key={item.id} value={item.id}>
								<item.icon />
								{item.label}
								{count > 0 ? (
									<Badge
										variant={item.id === "pending" ? "default" : "secondary"}
										className="h-4 min-w-4 px-1 tabular-nums"
									>
										{count}
									</Badge>
								) : null}
							</TabsTrigger>
						);
					})}
				</TabsList>
			</div>
		</Tabs>
	);
});

const CalendarFallback = (
	<div className="flex flex-col gap-3" role="status">
		<span className="sr-only">Loading</span>
		<Skeleton className="h-10 w-1/2 rounded-lg" />
		<Skeleton className="h-96 rounded-xl" />
	</div>
);

const CardFallback = <Skeleton className="h-40 rounded-xl" />;

function WorkerHome() {
	const { formatShiftRange } = useStablePrefs();
	const { workplace } = useWorkplace();
	const workplaceId = workplace?.id;
	const schedule = useMySchedule(workplaceId);
	const acknowledge = useAcknowledge();
	const acknowledgeMutate = acknowledge.mutate;
	const [view, setView] = useState<"week" | "calendar">("week");
	const [section, setSection] = useState<ScheduleSectionId>("this-week");

	const data = schedule.data;
	const currentWeek = (data?.currentWeek ?? null) as WorkerWeek | null;
	const nextWeek = (data?.nextWeek ?? null) as WorkerWeek | null;
	const nextShift = data?.nextShift ?? null;
	const shiftTasks = useShiftTasks(nextShift?.id);
	const tasks = shiftTasks.data?.tasks ?? NO_TASKS;
	const mySwaps = useMySwaps(workplaceId);
	const myReleases = useMyReleases(workplaceId);
	const myPickups = useMyPickups(workplaceId);

	const pendingAcceptances = data?.pendingAcceptances ?? NO_ACCEPTANCES;
	const currentChanges = data?.currentChanges ?? NO_CHANGES;
	const history = data?.history ?? NO_HISTORY;

	const { mineCount, needsAcknowledgement, currentHours } = useMemo(() => {
		const mine = (currentWeek?.shifts ?? []).filter((shift) => shift.isMine);
		return {
			mineCount: mine.length,
			needsAcknowledgement:
				currentWeek !== null &&
				currentWeek.version !== null &&
				mine.some((shift) => !isPlanned(shift)) &&
				currentWeek.deliveryStatus !== "acknowledged",
			currentHours:
				mine.reduce((sum, shift) => {
					const end = shift.overnight
						? shift.endMinute + 1440
						: shift.endMinute;
					return sum + end - shift.startMinute;
				}, 0) / 60,
		};
	}, [currentWeek]);

	const swapItems = mySwaps.data?.swaps;
	const activeSwaps = useMemo(
		() =>
			(swapItems ?? []).filter(
				(item) =>
					item.swap.status === "pending_counterpart" ||
					item.swap.status === "pending_manager",
			).length,
		[swapItems],
	);
	const requestCount =
		(myReleases.data?.length ?? 0) +
		(myPickups.data?.length ?? 0) +
		(swapItems?.length ?? 0);
	const currentCount = currentWeek?.shifts.length ?? 0;
	const nextCount = nextWeek?.shifts.length ?? 0;
	const sectionCounts = useMemo<Partial<Record<ScheduleSectionId, number>>>(
		() => ({
			"this-week": currentCount,
			"next-week": nextCount,
			earlier: history.length,
			pending: pendingAcceptances.length,
			tasks: tasks.length,
			requests: requestCount,
			swaps: activeSwaps,
		}),
		[
			activeSwaps,
			currentCount,
			history.length,
			nextCount,
			pendingAcceptances.length,
			requestCount,
			tasks.length,
		],
	);
	const hasAnySchedule = Boolean(currentWeek || nextWeek) || history.length > 0;

	const showTasks = useCallback(() => {
		setView("week");
		setSection("tasks");
	}, []);
	const showPending = useCallback(() => {
		setView("week");
		setSection("pending");
	}, []);
	const changeSection = useCallback(
		(next: ScheduleSectionId) => setSection(next),
		[],
	);

	const nextShiftRange = nextShift
		? formatShiftRange(
				nextShift.startMinute,
				nextShift.endMinute,
				nextShift.overnight,
			)
		: "";

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
						? `${mineCount} shift${mineCount === 1 ? "" : "s"} · ${currentHours.toFixed(1)}h this week`
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
					</div>
				}
			/>
			<AppPageBody className="gap-4">
				{schedule.isLoading ? (
					<div className="flex flex-col gap-4" role="status">
						<span className="sr-only">Loading</span>
						<Skeleton className="h-40 rounded-2xl" />
						<Skeleton className="h-64 rounded-xl" />
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

				{!schedule.isLoading && !schedule.isError ? (
					nextShift ? (
						<NextShiftHero
							shift={nextShift}
							range={nextShiftRange}
							taskCount={tasks.length}
							onShowTasks={showTasks}
						/>
					) : (
						<Card>
							<CardHeader>
								<CardTitle>No upcoming shifts</CardTitle>
								<CardDescription>
									Your next assigned shift will appear here once it’s published.
								</CardDescription>
							</CardHeader>
						</Card>
					)
				) : null}

				{pendingAcceptances.length > 0 ? (
					<Alert variant="warning">
						<CircleAlertIcon />
						<AlertTitle>
							{pendingAcceptances.length === 1
								? "A shift change needs your response"
								: `${pendingAcceptances.length} shift changes need your response`}
						</AlertTitle>
						<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
							<span>Review the change and accept or decline it.</span>
							<Button
								size="sm"
								variant="outline"
								className="bg-background"
								onClick={showPending}
							>
								Review change
							</Button>
						</AlertDescription>
					</Alert>
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
									acknowledgeMutate(currentWeek.version?.id ?? "", {
										onSuccess: () => toast.success("Marked as seen."),
										onError: (error) => toast.error((error as Error).message),
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

				{view === "calendar" ? (
					<Suspense fallback={CalendarFallback}>
						<WorkerScheduleCalendar workplaceId={workplaceId} />
					</Suspense>
				) : !schedule.isLoading && !schedule.isError && !hasAnySchedule ? (
					<div className="flex flex-col">
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
					<div className="flex min-w-0 flex-col gap-4">
						<SectionTabs
							section={section}
							onSectionChange={changeSection}
							counts={sectionCounts}
						/>

						<div
							key={section}
							className="motion-safe:fade-in-0 flex min-w-0 flex-col gap-4 motion-safe:animate-in motion-safe:duration-150"
						>
							{section === "this-week" ? (
								<ThisWeekSection
									week={currentWeek}
									workplaceId={workplaceId}
									mineCount={mineCount}
									hours={currentHours}
								/>
							) : null}

							{section === "next-week" ? (
								<NextWeekSection week={nextWeek} />
							) : null}

							{section === "earlier" ? (
								<HistorySection history={history} />
							) : null}

							{section === "pending" ? (
								<PendingSection
									acceptances={pendingAcceptances}
									changes={currentChanges}
								/>
							) : null}

							{section === "tasks" ? (
								<TasksSection shiftId={nextShift?.id} tasks={tasks} />
							) : null}

							{section === "requests" ? (
								requestCount > 0 ? (
									<Suspense fallback={CardFallback}>
										<WorkerRequestsCard workplaceId={workplaceId} />
									</Suspense>
								) : (
									<SectionEmpty
										title="No requests yet"
										description="Your releases, pickups, and swaps appear here."
									/>
								)
							) : null}

							{section === "swaps" ? (
								activeSwaps > 0 ? (
									<Suspense fallback={CardFallback}>
										<WorkerSwapsCard workplaceId={workplaceId} />
									</Suspense>
								) : (
									<SectionEmpty
										title="No pending swaps"
										description="Swaps waiting on you or a manager appear here."
									/>
								)
							) : null}
						</div>
					</div>
				)}
			</AppPageBody>
		</AppPage>
	);
}
