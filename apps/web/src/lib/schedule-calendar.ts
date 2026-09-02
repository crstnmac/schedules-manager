export function addDays(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T12:00:00`);
	date.setDate(date.getDate() + days);
	return date.toLocaleDateString("sv-SE");
}

export function weekStartOf(date: Date, weekStartDay: number): string {
	const result = new Date(date);
	const diff = (result.getDay() - weekStartDay + 7) % 7;
	result.setDate(result.getDate() - diff);
	return result.toLocaleDateString("sv-SE");
}

export function monthStartOf(dateKey: string): string {
	const date = new Date(`${dateKey}T12:00:00`);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addCalendarMonths(monthStart: string, delta: number): string {
	const date = new Date(`${monthStart}T12:00:00`);
	date.setMonth(date.getMonth() + delta);
	return monthStartOf(date.toLocaleDateString("sv-SE"));
}

/** Month that contains the Thursday of this workweek, so a week straddling months lands on the dominant month. */
export function monthStartForView(weekStart: string): string {
	return monthStartOf(addDays(weekStart, 3));
}

export function formatMonthLabel(monthStart: string): string {
	return new Date(`${monthStart}T12:00:00`).toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	});
}

export function monthKeys(monthStart: string, weekStartDay: number): string[] {
	const date = new Date(`${monthStart}T12:00:00`);
	const first = new Date(date.getFullYear(), date.getMonth(), 1);
	const offset = (first.getDay() - weekStartDay + 7) % 7;
	const start = new Date(first);
	start.setDate(first.getDate() - offset);
	return Array.from({ length: 42 }, (_, index) => {
		const next = new Date(start);
		next.setDate(start.getDate() + index);
		return next.toLocaleDateString("sv-SE");
	});
}

export function formatCompactMinute(minute: number): string {
	const normalizedMinute = minute % 1440;
	const hours = Math.floor(normalizedMinute / 60);
	const minutes = normalizedMinute % 60;
	const displayHour = hours % 12 === 0 ? 12 : hours % 12;
	const minuteLabel =
		minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`;
	return `${displayHour}${minuteLabel}${hours >= 12 ? "p" : "a"}`;
}

export function formatCompactShiftRange(
	startMinute: number,
	endMinute: number,
	overnight: boolean,
): string {
	return `${formatCompactMinute(startMinute)}–${formatCompactMinute(endMinute)}${overnight ? " +1" : ""}`;
}

export const POSITION_PALETTE = [
	{
		block: "bg-category-1 text-category-1-foreground hover:bg-category-1/80",
		dot: "bg-category-1-marker",
	},
	{
		block: "bg-category-2 text-category-2-foreground hover:bg-category-2/80",
		dot: "bg-category-2-marker",
	},
	{
		block: "bg-category-3 text-category-3-foreground hover:bg-category-3/80",
		dot: "bg-category-3-marker",
	},
	{
		block: "bg-category-4 text-category-4-foreground hover:bg-category-4/80",
		dot: "bg-category-4-marker",
	},
	{
		block: "bg-category-5 text-category-5-foreground hover:bg-category-5/80",
		dot: "bg-category-5-marker",
	},
	{
		block: "bg-category-6 text-category-6-foreground hover:bg-category-6/80",
		dot: "bg-category-6-marker",
	},
] as const;

export function positionColor(name: string) {
	let hash = 0;
	for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	return POSITION_PALETTE[Math.abs(hash) % POSITION_PALETTE.length];
}

export type ShiftDisplayStatus = {
	kind: "conflict" | "attendance" | "missed" | "clocked" | "variance";
	label: string;
	detail?: string;
	tone: "danger" | "warning" | "info";
};

export function shiftDisplayStatus(input: {
	hasConflicts: boolean;
	attendance: "late" | "no_show" | "sick" | null | undefined;
	clockStatus: "open" | "closed" | null | undefined;
	clockedInAt?: string | null;
	workedMinutes?: number | null;
	scheduledMinutes: number;
	shiftEndedAt: string;
}): ShiftDisplayStatus | null {
	if (input.hasConflicts) {
		return { kind: "conflict", label: "Conflict", tone: "danger" };
	}
	if (input.attendance === "no_show") {
		return { kind: "attendance", label: "No-show", tone: "danger" };
	}
	if (input.attendance === "sick") {
		return { kind: "attendance", label: "Sick", tone: "danger" };
	}
	if (input.attendance === "late") {
		return { kind: "attendance", label: "Late", tone: "warning" };
	}
	const missedPunch =
		input.clockStatus == null &&
		new Date(input.shiftEndedAt).getTime() + 15 * 60 * 1000 < Date.now();
	if (missedPunch) {
		return { kind: "missed", label: "No punch", tone: "danger" };
	}
	if (input.clockStatus === "open") {
		return {
			kind: "clocked",
			label: "On clock",
			detail: input.clockedInAt
				? `since ${new Date(input.clockedInAt).toLocaleTimeString([], {
						hour: "numeric",
						minute: "2-digit",
					})}`
				: undefined,
			tone: "info",
		};
	}
	if (input.clockStatus === "closed" && input.workedMinutes != null) {
		const variance = input.workedMinutes - Math.round(input.scheduledMinutes);
		if (Math.abs(variance) > 10) {
			return {
				kind: "variance",
				label: `${variance > 0 ? "+" : "−"}${Math.abs(variance)}m`,
				tone: variance > 0 ? "danger" : "warning",
			};
		}
	}
	return null;
}
