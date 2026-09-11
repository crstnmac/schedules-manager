import type { Workplace } from "@SchedulesManager/db";

import { BadRequestError } from "./errors";
import { shiftDays, wallToInstant, zonedDayInfo } from "./time";

export const PAID_DAY_MINUTES = 480;
export function inclusiveDayCount(startDate: string, endDate: string): number {
	const start = Date.parse(`${startDate}T00:00:00Z`);
	const end = Date.parse(`${endDate}T00:00:00Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
		throw new BadRequestError("End date must be on or after the start date");
	}
	return Math.round((end - start) / 86_400_000) + 1;
}

export function leaveChargeMinutes(input: {
	allDay: boolean;
	startDate: string;
	endDate: string;
	startsAt: Date;
	endsAt: Date;
}): number {
	if (input.allDay) {
		return inclusiveDayCount(input.startDate, input.endDate) * PAID_DAY_MINUTES;
	}
	return Math.max(
		1,
		Math.round((input.endsAt.getTime() - input.startsAt.getTime()) / 60_000),
	);
}

export function describeLeaveWindow(
	startsAt: Date,
	endsAt: Date,
	timeZone: string,
): {
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number | null;
	endMinute: number | null;
	chargeMinutes: number;
} {
	const start = zonedDayInfo(startsAt, timeZone);
	const end = zonedDayInfo(endsAt, timeZone);
	const allDay =
		start.minuteOfDay === 0 &&
		end.minuteOfDay === 0 &&
		start.dateKey < end.dateKey;
	const endDate = allDay ? shiftDays(end.dateKey, -1) : end.dateKey;
	return {
		startDate: start.dateKey,
		endDate,
		allDay,
		startMinute: allDay ? null : start.minuteOfDay,
		endMinute: allDay ? null : end.minuteOfDay,
		chargeMinutes: leaveChargeMinutes({
			allDay,
			startDate: start.dateKey,
			endDate,
			startsAt,
			endsAt,
		}),
	};
}

export function resolveLeaveWindow(input: {
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute?: number;
	endMinute?: number;
	timeZone: string;
}): {
	startsAt: Date;
	endsAt: Date;
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number | null;
	endMinute: number | null;
	chargeMinutes: number;
} {
	if (input.endDate < input.startDate) {
		throw new BadRequestError("End date must be on or after the start date");
	}

	if (input.allDay) {
		const startsAt = wallToInstant(input.startDate, 0, input.timeZone);
		const endsAt = wallToInstant(
			shiftDays(input.endDate, 1),
			0,
			input.timeZone,
		);
		return {
			startsAt,
			endsAt,
			startDate: input.startDate,
			endDate: input.endDate,
			allDay: true,
			startMinute: null,
			endMinute: null,
			chargeMinutes:
				inclusiveDayCount(input.startDate, input.endDate) * PAID_DAY_MINUTES,
		};
	}

	const startMinute = input.startMinute ?? 0;
	const endMinute = input.endMinute ?? 24 * 60;
	if (input.startDate === input.endDate && startMinute >= endMinute) {
		throw new BadRequestError("Start must be before end");
	}

	const startsAt = wallToInstant(input.startDate, startMinute, input.timeZone);
	const endsAt = wallToInstant(input.endDate, endMinute, input.timeZone);
	if (startsAt >= endsAt) {
		throw new BadRequestError("Start must be before end");
	}

	return {
		startsAt,
		endsAt,
		startDate: input.startDate,
		endDate: input.endDate,
		allDay: false,
		startMinute,
		endMinute,
		chargeMinutes: Math.max(
			1,
			Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
		),
	};
}

function padMonthDay(month: number, day: number): string {
	return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clampCalendarDay(year: number, month: number, day: number): string {
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const clamped = Math.min(day, lastDay);
	return `${year}-${padMonthDay(month, clamped)}`;
}

function nextMonthDayOnOrAfter(
	fromDateKey: string,
	month: number,
	day: number,
): string {
	const year = Number(fromDateKey.slice(0, 4));
	const thisYear = clampCalendarDay(year, month, day);
	if (thisYear >= fromDateKey) return thisYear;
	return clampCalendarDay(year + 1, month, day);
}

/**
 * Leave-cap reset is a Workplace calendar policy, not an automated job.
 * Remaining PTO minutes are not zeroed here; this only names the next
 * reset date so UIs can show when a cap would roll.
 */
export function nextLeaveCapReset(input: {
	leaveCapReset: Workplace["leaveCapReset"];
	leaveCapResetMonthDay: string | null;
	hiredAt: Date;
	now?: Date;
	timeZone: string;
}): string | null {
	if (input.leaveCapReset === "none") return null;
	const now = input.now ?? new Date();
	const today = zonedDayInfo(now, input.timeZone).dateKey;
	if (input.leaveCapReset === "calendar_year") {
		return nextMonthDayOnOrAfter(today, 1, 1);
	}
	if (input.leaveCapReset === "hire_date") {
		const hired = zonedDayInfo(input.hiredAt, input.timeZone);
		const month = Number(hired.dateKey.slice(5, 7));
		const day = Number(hired.dateKey.slice(8, 10));
		return nextMonthDayOnOrAfter(today, month, day);
	}
	const match = /^(\d{2})-(\d{2})$/.exec(input.leaveCapResetMonthDay ?? "");
	if (!match) return null;
	return nextMonthDayOnOrAfter(today, Number(match[1]), Number(match[2]));
}

export function leaveCapResetPayload(
	workplace: Pick<Workplace, "leaveCapReset" | "leaveCapResetMonthDay">,
	hiredAt: Date,
	timeZone: string,
	now?: Date,
) {
	return {
		leaveCapReset: workplace.leaveCapReset,
		leaveCapResetMonthDay: workplace.leaveCapResetMonthDay,
		nextResetDate: nextLeaveCapReset({
			leaveCapReset: workplace.leaveCapReset,
			leaveCapResetMonthDay: workplace.leaveCapResetMonthDay,
			hiredAt,
			now,
			timeZone,
		}),
	};
}

/**
 * Calendar-day helpers for leave policy maths. All date keys are bare
 * `YYYY-MM-DD` strings evaluated in UTC so weekend and holiday comparisons are
 * calendar questions, not clock questions.
 */
export function enumerateDateKeys(
	startDate: string,
	endDate: string,
): string[] {
	const keys: string[] = [];
	let cursor = startDate;
	while (cursor <= endDate) {
		keys.push(cursor);
		cursor = shiftDays(cursor, 1);
	}
	return keys;
}

export function isWeekend(
	dateKey: string,
	weekendDays: readonly number[],
): boolean {
	return weekendDays.includes(new Date(`${dateKey}T00:00:00Z`).getUTCDay());
}

export interface LeaveChargeContext {
	/** Charge only working days; weekend and holiday days cost nothing. */
	workingDaysOnly: boolean;
	weekendDays: readonly number[];
	/** Holiday date keys, already expanded for the requested range. */
	holidayDates: ReadonlySet<string>;
}

/**
 * Policy-aware charge for a leave window. Partial days always charge their
 * actual elapsed minutes; all-day windows charge full paid days, optionally
 * skipping weekends and holidays.
 */
export function chargeLeaveMinutes(
	window: {
		allDay: boolean;
		startDate: string;
		endDate: string;
		startsAt: Date;
		endsAt: Date;
	},
	context?: LeaveChargeContext,
): number {
	if (!window.allDay || !context?.workingDaysOnly) {
		return leaveChargeMinutes(window);
	}
	const workingDays = enumerateDateKeys(
		window.startDate,
		window.endDate,
	).filter(
		(dateKey) =>
			!isWeekend(dateKey, context.weekendDays) &&
			!context.holidayDates.has(dateKey),
	).length;
	return workingDays * PAID_DAY_MINUTES;
}

/** Number of calendar days in the window that count as working days. */
export function workingDaysInWindow(
	startDate: string,
	endDate: string,
	weekendDays: readonly number[],
	holidayDates: ReadonlySet<string>,
): number {
	return enumerateDateKeys(startDate, endDate).filter(
		(dateKey) => !isWeekend(dateKey, weekendDays) && !holidayDates.has(dateKey),
	).length;
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

export function parseMonthDay(monthDay: string | null | undefined): {
	month: number;
	day: number;
} {
	const match = /^(\d{2})-(\d{2})$/.exec(monthDay ?? "");
	if (!match) return { month: 1, day: 1 };
	return { month: Number(match[1]), day: Number(match[2]) };
}

function clampDayOfMonth(year: number, month: number, day: number): string {
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${pad2(month)}-${pad2(Math.min(day, lastDay))}`;
}

/** First date key of the leave year that contains `dateKey`. */
export function leaveYearStartDate(
	dateKey: string,
	leaveYearStartMonthDay: string,
): string {
	const { month, day } = parseMonthDay(leaveYearStartMonthDay);
	const year = Number(dateKey.slice(0, 4));
	const startThisYear = clampDayOfMonth(year, month, day);
	return dateKey >= startThisYear
		? startThisYear
		: clampDayOfMonth(year - 1, month, day);
}

export function leaveYearForDate(
	dateKey: string,
	leaveYearStartMonthDay: string,
): number {
	return Number(
		leaveYearStartDate(dateKey, leaveYearStartMonthDay).slice(0, 4),
	);
}

/** Inclusive bounds of a leave year labelled by its start year. */
export function leaveYearRange(
	leaveYear: number,
	leaveYearStartMonthDay: string,
): { startDate: string; endDate: string } {
	const { month, day } = parseMonthDay(leaveYearStartMonthDay);
	return {
		startDate: clampDayOfMonth(leaveYear, month, day),
		endDate: shiftDays(clampDayOfMonth(leaveYear + 1, month, day), -1),
	};
}

export function addMonthsToDateKey(dateKey: string, months: number): string {
	const year = Number(dateKey.slice(0, 4));
	const month = Number(dateKey.slice(5, 7));
	const day = Number(dateKey.slice(8, 10));
	const targetMonthIndex = month - 1 + months;
	const targetYear = year + Math.floor(targetMonthIndex / 12);
	const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
	return clampDayOfMonth(targetYear, targetMonth + 1, day);
}

/** Whole days between two date keys, floored at zero. */
export function daysBetween(startDate: string, endDate: string): number {
	const start = Date.parse(`${startDate}T00:00:00Z`);
	const end = Date.parse(`${endDate}T00:00:00Z`);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
	return Math.max(0, Math.round((end - start) / 86_400_000));
}

/** Expands recurring holidays (month/day) into the given window. */
export function holidayDatesInRange(
	holidays: ReadonlyArray<{ date: string; recurring: boolean }>,
	startDate: string,
	endDate: string,
): Set<string> {
	const keys = new Set<string>();
	for (const holiday of holidays) {
		if (!holiday.recurring) {
			if (holiday.date >= startDate && holiday.date <= endDate) {
				keys.add(holiday.date);
			}
			continue;
		}
		const monthDay = holiday.date.slice(5);
		for (const dateKey of enumerateDateKeys(startDate, endDate)) {
			if (dateKey.slice(5) === monthDay) keys.add(dateKey);
		}
	}
	return keys;
}
