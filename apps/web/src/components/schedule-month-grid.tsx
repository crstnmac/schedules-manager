import { Button } from "@SchedulesManager/ui/components/button";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { AlertTriangleIcon } from "lucide-react";

import {
	formatCompactShiftRange,
	monthKeys,
	positionColor,
	shiftDisplayStatus,
} from "@/lib/schedule-calendar";
import type { ScheduleResponse, ScheduleShiftDto } from "@/lib/queries";

const VISIBLE_CHIPS = 4;

function firstName(name: string | null, isOpen: boolean): string {
	if (isOpen || !name) return "Open";
	return name.split(/\s+/)[0] ?? name;
}

export function ScheduleMonthGrid({
	monthStart,
	weekStartDay,
	todayKey,
	shifts,
	timeclockByShiftId,
	filterShift,
	isPending,
	onSelectDay,
	onOpenShift,
}: {
	monthStart: string;
	weekStartDay: number;
	todayKey: string;
	shifts: ScheduleShiftDto[];
	timeclockByShiftId: Map<string, ScheduleResponse["timeclock"][number]>;
	filterShift: (shift: ScheduleShiftDto) => boolean;
	isPending?: boolean;
	onSelectDay: (day: string) => void;
	onOpenShift: (shift: ScheduleShiftDto) => void;
}) {
	const days = monthKeys(monthStart, weekStartDay);
	const weekdayNames = Array.from({ length: 7 }, (_, index) =>
		new Date(
			`${days[index] ?? monthStart}T12:00:00`,
		).toLocaleDateString(undefined, { weekday: "short" }),
	);
	const monthIndex = new Date(`${monthStart}T12:00:00`).getMonth();
	const byDay = new Map<string, ScheduleShiftDto[]>();
	for (const shift of shifts) {
		if (!filterShift(shift)) continue;
		const list = byDay.get(shift.date);
		if (list) list.push(shift);
		else byDay.set(shift.date, [shift]);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
			<div className="grid grid-cols-7 border-b">
				{weekdayNames.map((name) => (
					<div
						key={name}
						className="px-2 py-2 text-center font-medium text-muted-foreground text-xs"
					>
						{name}
					</div>
				))}
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-7">
				{days.map((day) => {
					const inMonth =
						new Date(`${day}T12:00:00`).getMonth() === monthIndex;
					const isToday = day === todayKey;
					const isWeekend = new Date(`${day}T12:00:00`).getDay() % 6 === 0;
					const dayShifts = (byDay.get(day) ?? []).slice().sort((a, b) =>
						a.startMinute === b.startMinute
							? a.positionName.localeCompare(b.positionName)
							: a.startMinute - b.startMinute,
					);
					const visible = dayShifts.slice(0, VISIBLE_CHIPS);
					const hidden = dayShifts.length - visible.length;
					const minutes = dayShifts.reduce(
						(sum, shift) =>
							sum +
							Math.round(
								(new Date(shift.endsAt).getTime() -
									new Date(shift.startsAt).getTime()) /
									60_000,
							),
						0,
					);
					const hasConflict = dayShifts.some(
						(shift) => shift.conflicts.length > 0,
					);
					const openCount = dayShifts.filter(
						(shift) => shift.employmentId === null,
					).length;

					return (
						<div
							key={day}
							className={cn(
								"relative flex min-h-[8.5rem] flex-col border-border/60 border-r border-b p-1.5 last:border-r-0",
								isWeekend && "bg-muted/25",
								!inMonth && "bg-muted/10",
								isToday && "bg-accent/40",
							)}
						>
							<button
								type="button"
								className="absolute inset-0 z-0"
								aria-label={`Open ${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
								onClick={() => onSelectDay(day)}
							/>
							<div className="relative z-10 mb-1 flex items-center gap-1 px-0.5">
								<span
									className={cn(
										"inline-flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs tabular-nums",
										isToday && "bg-primary text-primary-foreground",
										!inMonth && !isToday && "text-muted-foreground/60",
									)}
								>
									{new Date(`${day}T12:00:00`).getDate()}
								</span>
								{dayShifts.length > 0 ? (
									<p className="min-w-0 truncate text-[10px] text-muted-foreground tabular-nums">
										{dayShifts.length} · {(minutes / 60).toFixed(1)}h
										{openCount > 0 ? ` · ${openCount} open` : ""}
									</p>
								) : isPending ? (
									<Skeleton className="h-3 w-10" />
								) : null}
								{hasConflict ? (
									<AlertTriangleIcon className="ml-auto size-3 shrink-0 text-destructive" />
								) : null}
							</div>
							<div className="relative z-10 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
								{visible.map((shift) => {
									const isOpen = shift.employmentId === null;
									const hasConflicts = shift.conflicts.length > 0;
									const color = positionColor(shift.positionName);
									const timeclock = timeclockByShiftId.get(shift.id);
									const scheduledMinutes =
										(new Date(shift.endsAt).getTime() -
											new Date(shift.startsAt).getTime()) /
										60_000;
									const status = shiftDisplayStatus({
										hasConflicts,
										attendance: timeclock?.attendance,
										clockStatus: timeclock?.status,
										clockedInAt: timeclock?.clockedInAt,
										workedMinutes: timeclock?.workedMinutes,
										scheduledMinutes,
										shiftEndedAt: shift.endsAt,
									});
									const timeLabel = formatCompactShiftRange(
										shift.startMinute,
										shift.endMinute,
										shift.overnight,
									);
									const who = firstName(shift.workerName, isOpen);
									return (
										<Button
											key={shift.id}
											type="button"
											variant="ghost"
											title={`${timeLabel} · ${shift.workerName ?? "Open"} · ${shift.positionName}${status ? ` · ${status.label}` : ""}`}
											aria-label={`${timeLabel}, ${shift.workerName ?? "Open"}, ${shift.positionName}. Activate to edit.`}
											className={cn(
												"h-auto min-h-7 w-full justify-start gap-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-left leading-none",
												hasConflicts
													? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
													: isOpen
														? "border-warning-border bg-warning text-warning-foreground hover:bg-warning/80"
														: cn(
																"border-transparent hover:opacity-90",
																color.block,
															),
											)}
											onClick={(event) => {
												event.stopPropagation();
												onOpenShift(shift);
											}}
										>
											<span className="shrink-0 font-medium text-[10px] tabular-nums">
												{timeLabel}
											</span>
											<span className="min-w-0 truncate text-[10px]">
												{who}
											</span>
											{hasConflicts ? (
												<AlertTriangleIcon className="ml-auto size-2.5 shrink-0" />
											) : (
												<span className="ml-auto hidden min-w-0 truncate text-[10px] opacity-80 xl:inline">
													{shift.positionName}
												</span>
											)}
										</Button>
									);
								})}
								{hidden > 0 ? (
									<Button
										type="button"
										variant="ghost"
										size="xs"
										className="h-auto justify-start px-1 text-muted-foreground"
										onClick={() => onSelectDay(day)}
									>
										+{hidden} more
									</Button>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
