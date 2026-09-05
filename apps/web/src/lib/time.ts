export type TimeFormat = "12h" | "24h";
export type NameFormat = "full" | "first_last_initial" | "first";

export function formatMinute(
	minute: number,
	format: TimeFormat = "12h",
): string {
	const normalizedMinute = ((minute % 1440) + 1440) % 1440;
	const hours = Math.floor(normalizedMinute / 60);
	const mins = normalizedMinute % 60;
	if (format === "24h") {
		return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
	}
	const suffix = hours >= 12 ? "PM" : "AM";
	const display = hours % 12 === 0 ? 12 : hours % 12;
	return `${display}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatClockTime(
	iso?: string,
	format: TimeFormat = "12h",
): string {
	if (!iso) return "";
	return new Date(iso).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		hour12: format !== "24h",
	});
}

export function formatPersonName(
	fullName: string | null | undefined,
	email: string,
	format: NameFormat = "full",
): string {
	const name = fullName?.trim();
	if (!name) return email;
	if (format === "full") return name;
	const parts = name.split(/\s+/).filter(Boolean);
	const first = parts[0] ?? name;
	if (format === "first") return first;
	const last = parts.length > 1 ? parts[parts.length - 1] : "";
	if (!last) return first;
	return `${first} ${last.charAt(0).toUpperCase()}.`;
}

export function formatDurationMs(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / 60000));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0 && m === 0) return "0m";
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatTimerMs(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const CLOCK_IN_EARLY_MS = 15 * 60 * 1000;

export function formatShiftRange(
	startMinute: number,
	endMinute: number,
	overnight: boolean,
	format: TimeFormat = "12h",
): string {
	const end =
		endMinute === 0
			? format === "24h"
				? "00:00"
				: "12:00 AM"
			: formatMinute(endMinute, format);
	return `${formatMinute(startMinute, format)}–${end}${overnight ? " +1" : ""}`;
}

export function formatDay(isoOrDate: string): string {
	const value = isoOrDate.includes("T")
		? new Date(isoOrDate)
		: new Date(`${isoOrDate}T12:00:00`);
	return value.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

export function minutesToTimeInput(minute: number): string {
	const hours = Math.floor(minute / 60);
	const mins = minute % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeInputToMinutes(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 24 || minutes > 59) return null;
	return hours * 60 + minutes;
}

export function parseIsoDate(value: string): Date | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
	const date = new Date(`${value}T12:00:00`);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toIsoDate(date: Date): string {
	return date.toLocaleDateString("sv-SE");
}

export function shiftDays(dateKey: string, days: number): string {
	const parsed = new Date(`${dateKey}T00:00:00Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}

function tzOffsetMinutes(instant: Date, timeZone: string): number {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const map = new Map<string, number>();
	for (const part of dtf.formatToParts(instant)) {
		if (part.type !== "literal") map.set(part.type, Number(part.value));
	}
	let hour = map.get("hour") ?? 0;
	if (hour === 24) hour = 0;
	const asUtc = Date.UTC(
		map.get("year") ?? 0,
		(map.get("month") ?? 1) - 1,
		map.get("day") ?? 1,
		hour,
		map.get("minute") ?? 0,
		map.get("second") ?? 0,
	);
	return (asUtc - instant.getTime()) / 60_000;
}

export function isoToDatetimeLocal(iso: string, timeZone: string): string {
	if (!iso) return "";
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date(iso));
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	const hour = get("hour") === "24" ? "00" : get("hour");
	return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export function datetimeLocalToIso(
	value: string,
	timeZone: string,
): string | null {
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const dateKey = match[1] ?? "";
	const hour = Number(match[2]);
	const minute = Number(match[3]);
	if (hour > 23 || minute > 59) return null;
	const year = Number(dateKey.slice(0, 4));
	const month = Number(dateKey.slice(5, 7));
	const day = Number(dateKey.slice(8, 10));
	const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
	const offset1 = tzOffsetMinutes(naive, timeZone);
	const candidate = new Date(naive.getTime() - offset1 * 60_000);
	const offset2 = tzOffsetMinutes(candidate, timeZone);
	const instant =
		offset2 !== offset1
			? new Date(naive.getTime() - offset2 * 60_000)
			: candidate;
	return instant.toISOString();
}

export const WEEKDAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;
