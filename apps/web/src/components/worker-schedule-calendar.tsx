import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { type MyCalendarShift, useMyCalendar } from "@/lib/queries";
import {
	addCalendarMonths,
	formatCompactShiftRange,
	formatMonthLabel,
	monthKeys,
	monthStartOf,
	positionColor,
} from "@/lib/schedule-calendar";

const VISIBLE_CHIPS = 3;

function todayKey(): string {
	return new Date().toLocaleDateString("sv-SE");
}

/**
 * Worker month calendar for the caller's own published Shifts.
 *
 * Limitation: this reflects the latest *published* Schedule Version only.
 * Unpublished draft changes, Open Shifts, and coworker shifts are not shown.
 */
export function WorkerScheduleCalendar({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const today = todayKey();
	const [monthStart, setMonthStart] = useState(() => monthStartOf(today));
	const calendar = useMyCalendar(workplaceId, monthStart);
	const weekStartDay = calendar.data?.weekStartDay ?? 1;
	const days = useMemo(
		() => monthKeys(monthStart, weekStartDay),
		[monthStart, weekStartDay],
	);
	const shifts = calendar.data?.shifts ?? [];
	const monthIndex = new Date(`${monthStart}T12:00:00`).getMonth();

	const byDay = new Map<string, MyCalendarShift[]>();
	for (const shift of shifts) {
		const list = byDay.get(shift.date);
		if (list) list.push(shift);
		else byDay.set(shift.date, [shift]);
	}

	const weekdayNames = Array.from({ length: 7 }, (_, index) =>
		new Date(`${days[index] ?? monthStart}T12:00:00`).toLocaleDateString(
			undefined,
			{ weekday: "short" },
		),
	);

	return (
		<Card className="overflow-hidden">
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>{formatMonthLabel(monthStart)}</CardTitle>
						<CardDescription>
							Your shifts. Planned (unpublished) shifts are shown dashed and may
							still change.
						</CardDescription>
					</div>
					<div className="flex items-center gap-1">
						<Button
							size="sm"
							variant="outline"
							aria-label="Previous month"
							onClick={() => setMonthStart(addCalendarMonths(monthStart, -1))}
						>
							<ChevronLeftIcon />
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setMonthStart(monthStartOf(today))}
						>
							Today
						</Button>
						<Button
							size="sm"
							variant="outline"
							aria-label="Next month"
							onClick={() => setMonthStart(addCalendarMonths(monthStart, 1))}
						>
							<ChevronRightIcon />
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				{calendar.isLoading && shifts.length === 0 ? (
					<div className="grid gap-2 p-4 sm:grid-cols-3">
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
					</div>
				) : (
					<div className="flex flex-col">
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
						<div className="grid grid-cols-7">
							{days.map((day) => {
								const inMonth =
									new Date(`${day}T12:00:00`).getMonth() === monthIndex;
								const isToday = day === today;
								const isWeekend =
									new Date(`${day}T12:00:00`).getDay() % 6 === 0;
								const dayShifts = (byDay.get(day) ?? [])
									.slice()
									.sort((a, b) =>
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

								return (
									<div
										key={day}
										className={cn(
											"relative flex min-h-[7rem] flex-col border-border/60 border-r border-b p-1.5",
											isWeekend && "bg-muted/25",
											!inMonth && "bg-muted/10",
											isToday && "bg-accent/40",
										)}
									>
										<div className="mb-1 flex items-center gap-1 px-0.5">
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
													{(minutes / 60).toFixed(1)}h
												</p>
											) : null}
										</div>
										<div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
											{visible.map((shift) => {
												const color = positionColor(shift.positionName);
												const timeLabel = formatCompactShiftRange(
													shift.startMinute,
													shift.endMinute,
													shift.overnight,
												);
												return (
													<div
														key={shift.id}
														title={`${timeLabel} · ${shift.positionName}${shift.note ? ` · ${shift.note}` : ""}${shift.planned ? " · Planned" : ""}`}
														className={cn(
															"flex min-h-7 items-center gap-1 overflow-hidden rounded-md border border-transparent px-1.5 py-0.5 leading-none",
															color.block,
															shift.planned && "border-dashed opacity-80",
														)}
													>
														<span className="shrink-0 font-medium text-[10px] tabular-nums">
															{timeLabel}
														</span>
														<span className="min-w-0 truncate text-[10px]">
															{shift.positionName}
														</span>
													</div>
												);
											})}
											{hidden > 0 ? (
												<p className="px-1 text-[10px] text-muted-foreground">
													+{hidden} more
												</p>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
