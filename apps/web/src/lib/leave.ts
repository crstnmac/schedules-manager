import { formatDay, formatMinute, toIsoDate, type TimeFormat } from "@/lib/time";

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
