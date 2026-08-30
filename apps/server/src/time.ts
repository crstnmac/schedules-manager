import { BadRequestError } from "./errors";

export function tzOffsetMinutes(instant: Date, timeZone: string): number {
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
		if (part.type !== "literal") {
			map.set(part.type, Number(part.value));
		}
	}

	const year = map.get("year");
	const month = map.get("month");
	const day = map.get("day");
	let hour = map.get("hour");
	const minute = map.get("minute");
	const second = map.get("second");

	if (
		year === undefined ||
		month === undefined ||
		day === undefined ||
		hour === undefined ||
		minute === undefined ||
		second === undefined
	) {
		throw new BadRequestError(`Unknown time zone: ${timeZone}`);
	}

	if (hour === 24) hour = 0;

	const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
	return (asUTC - instant.getTime()) / 60_000;
}

export function wallToInstant(
	dateKey: string,
	minuteOfDay: number,
	timeZone: string,
): Date {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
		throw new BadRequestError(`Invalid date: ${dateKey}`);
	}
	const year = Number(dateKey.slice(0, 4));
	const month = Number(dateKey.slice(5, 7));
	const day = Number(dateKey.slice(8, 10));
	const extraDays = Math.floor(minuteOfDay / 1440);
	const rest = minuteOfDay % 1440;
	const naive = new Date(
		Date.UTC(
			year,
			month - 1,
			day + extraDays,
			Math.floor(rest / 60),
			rest % 60,
		),
	);
	const offset1 = tzOffsetMinutes(naive, timeZone);
	const candidate = new Date(naive.getTime() - offset1 * 60_000);
	const offset2 = tzOffsetMinutes(candidate, timeZone);
	if (offset2 !== offset1) {
		return new Date(naive.getTime() - offset2 * 60_000);
	}
	return candidate;
}

export function zonedDayInfo(
	instant: Date,
	timeZone: string,
): { dateKey: string; weekday: number; minuteOfDay: number } {
	const offset = tzOffsetMinutes(instant, timeZone);
	const shifted = new Date(instant.getTime() + offset * 60_000);
	return {
		dateKey: shifted.toISOString().slice(0, 10),
		weekday: shifted.getUTCDay(),
		minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
	};
}

export function assertMonday(dateKey: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
		throw new BadRequestError("Week must be a date like 2026-08-31");
	}
	const parsed = new Date(`${dateKey}T00:00:00Z`);
	if (Number.isNaN(parsed.getTime())) {
		throw new BadRequestError(`Invalid date: ${dateKey}`);
	}
	if (parsed.getUTCDay() !== 1) {
		throw new BadRequestError("Week must start on a Monday");
	}
	return dateKey;
}

export function shiftDays(dateKey: string, days: number): string {
	const parsed = new Date(`${dateKey}T00:00:00Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}
