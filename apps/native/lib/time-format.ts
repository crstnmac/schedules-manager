/** "7 h 30 m" / "45 m" — worked or elapsed durations. */
export function formatDuration(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / 60000));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** "2:04:09" — a live on-the-clock timer. */
export function formatTimer(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const sec = totalSeconds % 60;
	return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Shift length in hours from minute-of-day bounds. */
export function shiftHours(
	startMinute: number,
	endMinute: number,
	overnight: boolean,
): number {
	const end =
		overnight || endMinute <= startMinute ? endMinute + 1440 : endMinute;
	return (end - startMinute) / 60;
}

/** "8h" / "7.5h" */
export function formatHoursShort(hours: number): string {
	const rounded = Math.round(hours * 10) / 10;
	return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

export function localDateKey(date: Date = new Date()): string {
	return date.toLocaleDateString("sv-SE");
}

/** "Today" / "Tomorrow" / "Wednesday" (this week) / "Wed, Oct 1". */
export function relativeDayLabel(dateKey: string, now = new Date()): string {
	const today = localDateKey(now);
	const target = new Date(`${dateKey}T12:00:00`);
	const base = new Date(`${today}T12:00:00`);
	const days = Math.round((target.getTime() - base.getTime()) / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days === -1) return "Yesterday";
	if (days > 1 && days < 7)
		return target.toLocaleDateString(undefined, { weekday: "long" });
	return target.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

/** "in 45 min" / "in 2 h 15 min" / "in 3 days", or null once started. */
export function startsIn(startsAt: string, nowMs = Date.now()): string | null {
	const diff = new Date(startsAt).getTime() - nowMs;
	if (diff <= 0) return null;
	const minutes = Math.round(diff / 60000);
	if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		const rest = minutes % 60;
		return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
	}
	const days = Math.round(hours / 24);
	return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function greeting(now = new Date()): string {
	const hour = now.getHours();
	if (hour < 5) return "Good evening";
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}
