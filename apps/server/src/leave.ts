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
		const endsAt = wallToInstant(shiftDays(input.endDate, 1), 0, input.timeZone);
		return {
			startsAt,
			endsAt,
			startDate: input.startDate,
			endDate: input.endDate,
			allDay: true,
			startMinute: null,
			endMinute: null,
			chargeMinutes: inclusiveDayCount(input.startDate, input.endDate) *
				PAID_DAY_MINUTES,
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
	workplace: Pick<
		Workplace,
		"leaveCapReset" | "leaveCapResetMonthDay"
	>,
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
