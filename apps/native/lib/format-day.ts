export type TimeFormat = "12h" | "24h";

/**
 * Shift instants are shown in the Location's time zone, not the device's, so
 * a worker travelling (or a simulator on another zone) sees the same day as
 * the schedule. Without a time zone the device zone is used.
 */
export function formatDayShort(iso: string, timeZone?: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone,
	});
}

export function formatDayLong(iso: string, timeZone?: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
		timeZone,
	});
}

/**
 * Formats an instant as a wall-clock time. Pass the Location's time zone so
 * it matches shift ranges, which are already Location-local minutes.
 */
export function formatClockTime(
	iso: string | undefined,
	format: TimeFormat = "12h",
	timeZone?: string,
): string {
	if (!iso) return "";
	return new Date(iso).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		hour12: format !== "24h",
		timeZone,
	});
}
