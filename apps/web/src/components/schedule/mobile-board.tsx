import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	CalendarX2Icon,
	PlusIcon,
	StarIcon,
	UserRoundIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ShiftTile } from "@/components/schedule-shift-tile";
import type { ScheduleResponse, ScheduleShiftDto } from "@/lib/queries";

type MobileStaffMember = {
	employmentId: string;
	name: string;
	kind: string;
};

type HolidayInfo = { id: string; name: string };

type TimeclockEntry = ScheduleResponse["timeclock"][number];

/** Height of the sticky day rail; day headers stick right below it. */
const RAIL_STICKY = "top-0";
const DAY_HEADER_STICKY = "top-[3.9rem]";
const SECTION_SCROLL_MARGIN = "scroll-mt-[3.9rem]";

function weekdayShort(dateKey: string): string {
	return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
		new Date(`${dateKey}T12:00:00`),
	);
}

function dayOfMonth(dateKey: string): number {
	return new Date(`${dateKey}T12:00:00`).getDate();
}

function formatHours(minutes: number): string {
	return `${(minutes / 60).toFixed(1)}h`;
}

function shiftMinutes(shift: ScheduleShiftDto): number {
	return shift.endMinute > shift.startMinute
		? shift.endMinute - shift.startMinute
		: 1440 - shift.startMinute + shift.endMinute;
}

/** A single weekday chip in the sticky rail. */
function ScheduleDayChip({
	dayKey,
	active,
	isToday,
	minutes,
	openCount,
	conflictCount,
	onSelect,
}: {
	dayKey: string;
	active: boolean;
	isToday: boolean;
	minutes: number;
	openCount: number;
	conflictCount: number;
	onSelect: () => void;
}) {
	return (
		<Button
			variant={active ? "default" : "outline"}
			size="sm"
			className="h-auto shrink-0 snap-start flex-col gap-0 px-2.5 py-1.5"
			aria-current={isToday ? "date" : undefined}
			aria-label={`${weekdayShort(dayKey)} ${dayOfMonth(dayKey)}, ${formatHours(minutes)} scheduled${openCount > 0 ? `, ${openCount} open` : ""}${conflictCount > 0 ? `, ${conflictCount} conflicts` : ""}`}
			onClick={onSelect}
		>
			<span className="text-xs uppercase leading-tight opacity-80">
				{weekdayShort(dayKey)}
			</span>
			<span className="font-semibold text-sm tabular-nums leading-tight">
				{dayOfMonth(dayKey)}
			</span>
			<span className="flex items-center gap-1 leading-tight">
				<span className="text-xs tabular-nums opacity-80">
					{minutes > 0 ? formatHours(minutes) : "—"}
				</span>
				{openCount > 0 ? (
					<span className="size-1.5 rounded-full bg-warning">
						<span className="sr-only">{`${openCount} open shifts`}</span>
					</span>
				) : null}
				{conflictCount > 0 ? (
					<span className="size-1.5 rounded-full bg-destructive">
						<span className="sr-only">{`${conflictCount} conflicts`}</span>
					</span>
				) : null}
			</span>
		</Button>
	);
}

/** Sticky rail of weekday chips for jumping between day sections. */
function ScheduleDayRail({
	days,
	activeDay,
	todayKey,
	daySummaries,
	openCounts,
	conflictCounts,
	onSelectDay,
}: {
	days: string[];
	activeDay: string;
	todayKey: string;
	daySummaries: Map<string, { shifts: number; minutes: number }>;
	openCounts: Map<string, number>;
	conflictCounts: Map<string, number>;
	onSelectDay: (day: string) => void;
}) {
	return (
		<nav
			aria-label="Days of week"
			className={cn(
				"sticky z-30 border-b bg-background px-2 py-2",
				RAIL_STICKY,
			)}
		>
			<div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto">
				{days.map((day) => (
					<ScheduleDayChip
						key={day}
						dayKey={day}
						active={day === activeDay}
						isToday={day === todayKey}
						minutes={daySummaries.get(day)?.minutes ?? 0}
						openCount={openCounts.get(day) ?? 0}
						conflictCount={conflictCounts.get(day) ?? 0}
						onSelect={() => onSelectDay(day)}
					/>
				))}
			</div>
		</nav>
	);
}

/** One worker's shifts on one day. */
function ScheduleWorkerGroup({
	name,
	kind,
	shifts,
	timeclockByShiftId,
	shiftsPending,
	onOpenShift,
}: {
	name: string;
	kind: string;
	shifts: ScheduleShiftDto[];
	timeclockByShiftId: Map<string, TimeclockEntry>;
	shiftsPending: boolean;
	onOpenShift: (shift: ScheduleShiftDto) => void;
}) {
	const minutes = shifts.reduce((sum, shift) => sum + shiftMinutes(shift), 0);
	return (
		<section className="flex flex-col gap-1.5">
			<div className="flex items-baseline gap-2">
				<UserRoundIcon
					aria-hidden
					className="size-3.5 shrink-0 self-center text-muted-foreground"
				/>
				<span
					className="truncate font-medium text-sm leading-tight"
					title={name}
				>
					{name}
				</span>
				{kind === "manager" ? (
					<Badge variant="secondary" className="px-1.5 font-normal text-xs">
						Manager
					</Badge>
				) : null}
				<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
					{formatHours(minutes)}
				</span>
			</div>
			{shifts.map((shift) => (
				<ShiftTile
					key={shift.id}
					shift={shift}
					onOpen={onOpenShift}
					draggable={false}
					disabled={shiftsPending}
					timeclock={timeclockByShiftId.get(shift.id)}
				/>
			))}
		</section>
	);
}

/** Grouped tile list that needs manager attention (open or off-roster). */
function ScheduleAttentionGroup({
	tone,
	title,
	description,
	shifts,
	timeclockByShiftId,
	shiftsPending,
	onOpenShift,
}: {
	tone: "open" | "offRoster";
	title: string;
	description: string;
	shifts: ScheduleShiftDto[];
	timeclockByShiftId: Map<string, TimeclockEntry>;
	shiftsPending: boolean;
	onOpenShift: (shift: ScheduleShiftDto) => void;
}) {
	return (
		<section
			className={cn(
				"flex flex-col gap-1.5 rounded-lg border border-dashed p-2",
				tone === "open" ? "border-primary/30 bg-accent/30" : "bg-muted/40",
			)}
		>
			<div className="flex items-baseline gap-2">
				<p className="font-medium text-sm leading-tight">{title}</p>
				<span className="text-muted-foreground text-xs leading-tight">
					{description}
				</span>
				<Badge
					variant="outline"
					className="ml-auto h-5 shrink-0 rounded-md px-1.5 tabular-nums"
				>
					{shifts.length}
				</Badge>
			</div>
			{shifts.map((shift) => (
				<ShiftTile
					key={shift.id}
					shift={shift}
					onOpen={onOpenShift}
					draggable={false}
					disabled={shiftsPending}
					timeclock={timeclockByShiftId.get(shift.id)}
				/>
			))}
		</section>
	);
}

function ScheduleDayEmptyState({ canManage }: { canManage: boolean }) {
	return (
		<Empty className="border-none py-4">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CalendarX2Icon />
				</EmptyMedia>
				<EmptyTitle>No shifts scheduled</EmptyTitle>
				<EmptyDescription>
					{canManage
						? "Tap the + in the day header to add the first shift."
						: "Check back once the manager publishes the schedule."}
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent />
		</Empty>
	);
}

/**
 * Mobile schedule surface: a sticky day rail plus one section per day of the
 * week, so a manager can build and manage the whole week by scrolling and
 * tapping instead of panning a desktop grid. Editing reuses the same shift
 * sheet as desktop via onOpenShift / onCreateShift.
 */
export function ScheduleMobileBoard({
	days,
	todayKey,
	staff,
	shiftsByWorkerDay,
	offRosterShiftsByDay,
	daySummaries,
	holidayByDate,
	filterShift,
	timeclockByShiftId,
	canManage,
	shiftsPending,
	onOpenShift,
	onCreateShift,
	className,
}: {
	days: string[];
	todayKey: string;
	staff: MobileStaffMember[];
	shiftsByWorkerDay: Map<string, ScheduleShiftDto[]>;
	offRosterShiftsByDay: Map<string, ScheduleShiftDto[]>;
	daySummaries: Map<string, { shifts: number; minutes: number }>;
	holidayByDate: Map<string, HolidayInfo>;
	filterShift: (shift: ScheduleShiftDto) => boolean;
	timeclockByShiftId: Map<string, TimeclockEntry>;
	canManage: boolean;
	shiftsPending: boolean;
	onOpenShift: (shift: ScheduleShiftDto) => void;
	onCreateShift: (date: string) => void;
	className?: string;
}) {
	const [activeDay, setActiveDay] = useState(days[0] ?? "");
	const sectionRefs = useRef(new Map<string, HTMLElement>());

	// Keep the day rail in sync with the section the manager scrolled to.
	// biome-ignore lint/correctness/useExhaustiveDependencies: sections register via refs during render, so re-attach whenever the week's day set changes.
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const day = (entry.target as HTMLElement).dataset.day;
					if (day) setActiveDay(day);
				}
			},
			// Fires for whichever day section crosses the upper third of the
			// viewport, i.e. the one under the sticky rail + header.
			{ rootMargin: "-25% 0px -65% 0px" },
		);
		for (const section of sectionRefs.current.values()) {
			observer.observe(section);
		}
		return () => observer.disconnect();
	}, [days]);

	const scrollToDay = (day: string) => {
		setActiveDay(day);
		sectionRefs.current.get(day)?.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
	};

	const openCounts = new Map<string, number>();
	const conflictCounts = new Map<string, number>();
	for (const day of days) {
		const dayShifts = [
			...(shiftsByWorkerDay.get(`open:${day}`) ?? []),
			...(offRosterShiftsByDay.get(day) ?? []),
			...staff.flatMap(
				(member) =>
					shiftsByWorkerDay.get(`${member.employmentId}:${day}`) ?? [],
			),
		].filter(filterShift);
		openCounts.set(
			day,
			dayShifts.filter((shift) => shift.employmentId === null).length,
		);
		conflictCounts.set(
			day,
			dayShifts.reduce((sum, shift) => sum + shift.conflicts.length, 0),
		);
	}

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			<ScheduleDayRail
				days={days}
				activeDay={activeDay}
				todayKey={todayKey}
				daySummaries={daySummaries}
				openCounts={openCounts}
				conflictCounts={conflictCounts}
				onSelectDay={scrollToDay}
			/>

			{days.map((day) => {
				const isToday = day === todayKey;
				const holiday = holidayByDate.get(day);
				const summary = daySummaries.get(day);
				const openShifts = (shiftsByWorkerDay.get(`open:${day}`) ?? []).filter(
					filterShift,
				);
				const offRoster = (offRosterShiftsByDay.get(day) ?? []).filter(
					filterShift,
				);
				const staffGroups = staff
					.map((member) => ({
						member,
						shifts: (
							shiftsByWorkerDay.get(`${member.employmentId}:${day}`) ?? []
						).filter(filterShift),
					}))
					.filter((group) => group.shifts.length > 0);
				const isEmpty =
					staffGroups.length === 0 &&
					openShifts.length === 0 &&
					offRoster.length === 0;
				return (
					<section
						key={day}
						data-day={day}
						ref={(node) => {
							if (node) sectionRefs.current.set(day, node);
							else sectionRefs.current.delete(day);
						}}
						aria-label={`${weekdayShort(day)} ${dayOfMonth(day)}`}
						className={cn("border-t first:border-t-0", SECTION_SCROLL_MARGIN)}
					>
						<header
							className={cn(
								"sticky z-20 flex items-center gap-2 border-b bg-background px-3 py-2",
								DAY_HEADER_STICKY,
								isToday && "bg-accent/40",
							)}
						>
							<div className="flex min-w-0 items-baseline gap-1.5">
								<span
									className={cn(
										"font-semibold text-sm leading-none",
										isToday && "text-primary",
									)}
								>
									{weekdayShort(day)}
								</span>
								<span className="text-muted-foreground text-sm tabular-nums leading-none">
									{dayOfMonth(day)}
								</span>
								{summary && summary.minutes > 0 ? (
									<span className="text-muted-foreground text-xs tabular-nums leading-none">
										{formatHours(summary.minutes)}
									</span>
								) : null}
							</div>
							{holiday ? (
								<Badge
									variant="outline"
									className="gap-1 border-dashed px-1.5 font-normal text-muted-foreground text-xs"
								>
									<StarIcon data-icon="inline-start" />
									<span className="max-w-28 truncate">{holiday.name}</span>
								</Badge>
							) : null}
							{canManage ? (
								<Button
									variant="outline"
									size="icon-sm"
									className="ml-auto shrink-0"
									aria-label={`Add shifts on ${weekdayShort(day)} ${dayOfMonth(day)}`}
									onClick={() => onCreateShift(day)}
								>
									<PlusIcon />
								</Button>
							) : null}
						</header>

						<div className="flex flex-col gap-3 px-3 py-3">
							{isEmpty ? <ScheduleDayEmptyState canManage={canManage} /> : null}

							{staffGroups.map((group) => (
								<ScheduleWorkerGroup
									key={group.member.employmentId}
									name={group.member.name}
									kind={group.member.kind}
									shifts={group.shifts}
									timeclockByShiftId={timeclockByShiftId}
									shiftsPending={shiftsPending}
									onOpenShift={onOpenShift}
								/>
							))}

							{openShifts.length > 0 ? (
								<ScheduleAttentionGroup
									tone="open"
									title="Open shifts"
									description="Needs a worker"
									shifts={openShifts}
									timeclockByShiftId={timeclockByShiftId}
									shiftsPending={shiftsPending}
									onOpenShift={onOpenShift}
								/>
							) : null}

							{offRoster.length > 0 ? (
								<ScheduleAttentionGroup
									tone="offRoster"
									title="Off-roster"
									description="Reassign or remove"
									shifts={offRoster}
									timeclockByShiftId={timeclockByShiftId}
									shiftsPending={shiftsPending}
									onOpenShift={onOpenShift}
								/>
							) : null}
						</div>
					</section>
				);
			})}
		</div>
	);
}

export function ScheduleMobileBoardSkeleton() {
	const railKeys = ["mo", "tu", "we", "th", "fr", "sa", "su"];
	const sectionKeys = ["a", "b", "c"];
	return (
		<div className="flex min-h-0 flex-1 flex-col" role="status">
			<span className="sr-only">Loading</span>
			<div className="sticky top-0 z-30 flex gap-1.5 border-b bg-background px-2 py-2">
				{railKeys.map((key) => (
					<Skeleton key={key} className="h-11 w-11 shrink-0 rounded-lg" />
				))}
			</div>
			{sectionKeys.map((key) => (
				<div key={key} className="flex flex-col gap-2 border-t px-3 py-3">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-12 rounded-md" />
					<Skeleton className="h-12 rounded-md" />
				</div>
			))}
		</div>
	);
}
