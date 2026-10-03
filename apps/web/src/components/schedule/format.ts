import type { ScheduleResponse } from "@/lib/queries";
import { timeOffCoversDay } from "@/lib/schedule-timeoff";

export function formatDayLabel(dateKey: string): string {
	return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

export function weekdayShort(dateKey: string): string {
	return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
	});
}

export function formatCents(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(cents / 100);
}

export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

export function positionsLabel(count: number): string {
	if (count === 0) return "All positions";
	return `${count} position${count === 1 ? "" : "s"}`;
}

export interface CellConstraint {
	key: string;
	kind: "unavailability" | "timeOff";
	label: string;
}

export function cellConstraints(
	member: ScheduleResponse["staff"][number],
	day: string,
	formatMinute: (minute: number) => string,
	timeZone: string,
): CellConstraint[] {
	const weekday = new Date(`${day}T12:00:00`).getDay();
	const constraints: CellConstraint[] = [];
	for (const window of member.unavailability ?? []) {
		const matches =
			window.kind === "recurring"
				? window.weekday === weekday
				: window.date === day;
		if (!matches) continue;
		constraints.push({
			key: `unavailability-${window.kind}-${window.weekday ?? window.date}-${window.startMinute}`,
			kind: "unavailability",
			label: `Can't work ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`,
		});
	}
	for (const request of member.timeOff ?? []) {
		if (request.status === "declined") continue;
		if (!timeOffCoversDay(request, day, timeZone)) continue;
		constraints.push({
			key: `timeOff-${request.startsAt}`,
			kind: "timeOff",
			label: request.status === "approved" ? "Time off" : "Time off (pending)",
		});
	}
	return constraints;
}
