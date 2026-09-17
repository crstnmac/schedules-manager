import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { CalendarOffIcon, PlusIcon, StarIcon } from "lucide-react";
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

/** Height of the sticky day rail; section headers stick right below it. */
const RAIL_STICKY = "top-0";
const SECTION_STICKY = "top-[3.7rem]";
const SECTION_SCROLL_MARGIN = "scroll-mt-[3.7rem]";

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

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			<div
				className={cn(
					"sticky z-30 border-b bg-background px-2 py-2",
					RAIL_STICKY,
				)}
			>
				<div className="flex gap-1.5 overflow-x-auto">
					{days.map((day) => {
						const isActive = day === activeDay;
						const isToday = day === todayKey;
						const minutes = daySummaries.get(day)?.minutes ?? 0;
						return (
							<Button
								key={day}
								variant={isActive ? "default" : "outline"}
								size="sm"
								className="h-auto shrink-0 flex-col gap-0 px-2.5 py-1.5"
								aria-current={isToday ? "date" : undefined}
								onClick={() => scrollToDay(day)}
							>
								<span className="text-[0.65rem] uppercase leading-tight opacity-80">
									{weekdayShort(day)}
								</span>
								<span className="font-semibold text-sm tabular-nums leading-tight">
									{dayOfMonth(day)}
								</span>
								<span className="text-[0.65rem] tabular-nums leading-tight opacity-80">
									{minutes > 0 ? formatHours(minutes) : "—"}
								</span>
							</Button>
						);
					})}
				</div>
			</div>

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
						className={cn("border-t first:border-t-0", SECTION_SCROLL_MARGIN)}
					>
						<header
							className={cn(
								"sticky z-20 flex items-center gap-2 border-b bg-background px-3 py-2",
								SECTION_STICKY,
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
							{isEmpty ? (
								<p className="py-4 text-center text-muted-foreground text-sm">
									{canManage
										? "No shifts yet — tap + to add the first one."
										: "No shifts scheduled."}
								</p>
							) : null}

							{staffGroups.map((group) => (
								<section
									key={group.member.employmentId}
									className="flex flex-col gap-1.5"
								>
									<div className="flex items-baseline gap-2">
										<span className="truncate font-medium text-sm leading-tight">
											{group.member.name}
										</span>
										{group.member.kind === "manager" ? (
											<Badge
												variant="secondary"
												className="px-1.5 font-normal text-[0.65rem]"
											>
												Manager
											</Badge>
										) : null}
										<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
											{formatHours(
												group.shifts.reduce(
													(sum, shift) => sum + shiftMinutes(shift),
													0,
												),
											)}
										</span>
									</div>
									{group.shifts.map((shift) => (
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
							))}

							{openShifts.length > 0 ? (
								<section className="flex flex-col gap-1.5 rounded-lg border border-dashed bg-accent/30 p-2">
									<p className="font-medium text-sm leading-tight">
										Open shifts
									</p>
									{openShifts.map((shift) => (
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
							) : null}

							{offRoster.length > 0 ? (
								<section className="flex flex-col gap-1.5 rounded-lg border border-dashed bg-muted/40 p-2">
									<p className="flex items-center gap-1.5 font-medium text-sm leading-tight">
										<CalendarOffIcon className="size-3.5" />
										Off-roster
									</p>
									{offRoster.map((shift) => (
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
		<div className="flex min-h-0 flex-1 flex-col">
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
