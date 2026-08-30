export function formatMinute(minute: number): string {
	const hours = Math.floor(minute / 60);
	const mins = minute % 60;
	const suffix = hours >= 12 ? "PM" : "AM";
	const display = hours % 12 === 0 ? 12 : hours % 12;
	return `${display}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatShiftRange(
	startMinute: number,
	endMinute: number,
	overnight: boolean,
): string {
	const end = endMinute === 0 ? "12:00 AM" : formatMinute(endMinute);
	return `${formatMinute(startMinute)}–${end}${overnight ? " +1" : ""}`;
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

export const WEEKDAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;
