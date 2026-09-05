import {
	datetimeLocalToIso,
	formatDay,
	formatMinute,
	shiftDays,
	toIsoDate,
	type TimeFormat,
} from "@/lib/time";

export const PAID_DAY_MINUTES = 480;

export function formatLeaveHours(minutes: number): string {
	const safe = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safe / 60);
	const rest = safe % 60;
	if (hours === 0 && rest === 0) return "0h";
	if (rest === 0) return `${hours}h`;
	if (hours === 0) return `${rest}m`;
	return `${hours}h ${rest}m`;
}

export function hoursToMinutes(value: string): number {
	const hours = Number(value);
	if (!Number.isFinite(hours) || hours < 0) return 0;
	return Math.round(hours * 60);
}

export function minutesToHoursInput(minutes: number): string {
	const hours = minutes / 60;
	return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function formatLeaveRange(
	input: {
		startDate: string;
		endDate: string;
		allDay: boolean;
		startMinute?: number | null;
		endMinute?: number | null;
	},
	timeFormat: TimeFormat = "12h",
): string {
	const start = formatDay(input.startDate);
	const end = formatDay(input.endDate);
	if (input.allDay) {
		return input.startDate === input.endDate ? start : `${start} – ${end}`;
	}
	const times = `${formatMinute(input.startMinute ?? 0, timeFormat)}–${formatMinute(input.endMinute ?? 0, timeFormat)}`;
	return input.startDate === input.endDate
		? `${start} · ${times}`
		: `${start} ${formatMinute(input.startMinute ?? 0, timeFormat)} – ${end} ${formatMinute(input.endMinute ?? 0, timeFormat)}`;
}

export function leaveStatusLabel(status: "pending" | "approved" | "declined") {
	if (status === "pending") return "Needs a decision";
	if (status === "approved") return "Approved";
	return "Declined";
}

export function todayIsoDate(): string {
	return toIsoDate(new Date());
}

function wallToInstantOrNull(
	dateKey: string,
	minuteOfDay: number,
	timeZone: string,
): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
	const extraDays = Math.floor(minuteOfDay / 1440);
	const rest = minuteOfDay % 1440;
	const shifted = shiftDays(dateKey, extraDays);
	const hour = String(Math.floor(rest / 60)).padStart(2, "0");
	const minute = String(rest % 60).padStart(2, "0");
	const iso = datetimeLocalToIso(`${shifted}T${hour}:${minute}`, timeZone);
	return iso ? new Date(iso) : null;
}

export function leaveChargeMinutes(input: {
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number;
	endMinute: number;
	timeZone?: string;
}): number {
	if (!input.startDate || !input.endDate || input.endDate < input.startDate) {
		return 0;
	}
	if (input.allDay) {
		const start = Date.parse(`${input.startDate}T00:00:00Z`);
		const end = Date.parse(`${input.endDate}T00:00:00Z`);
		return (Math.round((end - start) / 86_400_000) + 1) * PAID_DAY_MINUTES;
	}
	if (input.startDate === input.endDate && input.startMinute >= input.endMinute) {
		return 0;
	}
	if (input.timeZone) {
		const start = wallToInstantOrNull(
			input.startDate,
			input.startMinute,
			input.timeZone,
		);
		const end = wallToInstantOrNull(
			input.endDate,
			input.endMinute,
			input.timeZone,
		);
		if (start && end && start.getTime() < end.getTime()) {
			return Math.max(
				1,
				Math.round((end.getTime() - start.getTime()) / 60_000),
			);
		}
	}
	const start =
		Date.parse(`${input.startDate}T00:00:00Z`) + input.startMinute * 60_000;
	const end =
		Date.parse(`${input.endDate}T00:00:00Z`) + input.endMinute * 60_000;
	return Math.max(0, Math.round((end - start) / 60_000));
}
