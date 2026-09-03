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

export function formatDateKey(dateKey: string): string {
	return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

export function formatLeaveRange(input: {
	startDate?: string;
	endDate?: string;
	allDay?: boolean;
	startsAt: string;
	endsAt: string;
}): string {
	if (input.startDate && input.endDate) {
		const start = formatDateKey(input.startDate);
		const end = formatDateKey(input.endDate);
		if (input.allDay) {
			return input.startDate === input.endDate ? start : `${start} – ${end}`;
		}
		return `${start} – ${end}`;
	}
	const start = new Date(input.startsAt).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
	const end = new Date(input.endsAt).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
	return start === end ? start : `${start} – ${end}`;
}

export function todayIsoDate(): string {
	return new Date().toLocaleDateString("sv-SE");
}

export function shiftDays(dateKey: string, days: number): string {
	const parsed = new Date(`${dateKey}T00:00:00Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}
