import { shiftDays, zonedDayInfo } from "./time";

export type PolicyConflictType = "clopening" | "consecutive_days";

export interface PolicyConflict {
	shiftId: string;
	type: PolicyConflictType;
	message: string;
}

type Interval = {
	id: string;
	employmentId: string | null;
	startsAt: Date;
	endsAt: Date;
};

function workDateKeys(shift: Interval, timeZone: string): string[] {
	const start = zonedDayInfo(shift.startsAt, timeZone);
	const end = zonedDayInfo(shift.endsAt, timeZone);
	if (end.dateKey === start.dateKey || end.minuteOfDay === 0) {
		return [start.dateKey];
	}
	return [start.dateKey, end.dateKey];
}

function groupedByEmployment(shifts: Interval[]) {
	const groups = new Map<string, Interval[]>();
	for (const shift of shifts) {
		if (!shift.employmentId) continue;
		const list = groups.get(shift.employmentId) ?? [];
		list.push(shift);
		groups.set(shift.employmentId, list);
	}
	for (const list of groups.values()) {
		list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
	}
	return groups;
}

export function clopeningConflicts(
	shifts: Interval[],
	clopeningMinutes: number,
	emitForIds: Set<string>,
): PolicyConflict[] {
	if (clopeningMinutes <= 0) return [];
	const restMs = clopeningMinutes * 60_000;
	const conflicts: PolicyConflict[] = [];
	for (const list of groupedByEmployment(shifts).values()) {
		for (let index = 1; index < list.length; index++) {
			const previous = list[index - 1];
			const current = list[index];
			if (!previous || !current) continue;
			if (previous.endsAt.getTime() >= current.startsAt.getTime()) continue;
			const gap = current.startsAt.getTime() - previous.endsAt.getTime();
			if (gap >= restMs) continue;
			const hours = Math.round((clopeningMinutes / 60) * 10) / 10;
			const message = `Less than ${hours} hours of rest after the previous shift`;
			if (emitForIds.has(current.id)) {
				conflicts.push({
					shiftId: current.id,
					type: "clopening",
					message,
				});
			}
			if (emitForIds.has(previous.id)) {
				conflicts.push({
					shiftId: previous.id,
					type: "clopening",
					message: `Less than ${hours} hours of rest before the next shift`,
				});
			}
		}
	}
	return conflicts;
}

export function consecutiveWorkDayConflicts(
	shifts: Interval[],
	maxConsecutiveWorkDays: number,
	timeZone: string,
	emitForIds: Set<string>,
): PolicyConflict[] {
	if (maxConsecutiveWorkDays <= 0) return [];
	const conflicts: PolicyConflict[] = [];
	for (const list of groupedByEmployment(shifts).values()) {
		const dates = new Set<string>();
		const shiftsByDate = new Map<string, Interval[]>();
		for (const shift of list) {
			for (const dateKey of workDateKeys(shift, timeZone)) {
				dates.add(dateKey);
				const dayShifts = shiftsByDate.get(dateKey) ?? [];
				dayShifts.push(shift);
				shiftsByDate.set(dateKey, dayShifts);
			}
		}
		const sorted = [...dates].sort();
		let streakStart = 0;
		for (let index = 0; index < sorted.length; index++) {
			const date = sorted[index];
			const previous = index > 0 ? sorted[index - 1] : null;
			const continues = previous != null && date === shiftDays(previous, 1);
			if (!continues) streakStart = index;
			const length = index - streakStart + 1;
			if (length <= maxConsecutiveWorkDays) continue;
			const streakDates = sorted.slice(streakStart, index + 1);
			const flagged = new Set<string>();
			for (const streakDate of streakDates) {
				for (const shift of shiftsByDate.get(streakDate) ?? []) {
					if (!emitForIds.has(shift.id) || flagged.has(shift.id)) continue;
					flagged.add(shift.id);
					conflicts.push({
						shiftId: shift.id,
						type: "consecutive_days",
						message: `More than ${maxConsecutiveWorkDays} consecutive scheduled days`,
					});
				}
			}
		}
	}
	return conflicts;
}

export function isLateArrival(
	clockedInAt: Date,
	shiftStartsAt: Date,
	graceMinutes: number,
): boolean {
	return (
		clockedInAt.getTime() >
		shiftStartsAt.getTime() + Math.max(0, graceMinutes) * 60_000
	);
}

export function publicWorkerName(
	fullName: string | null | undefined,
	email: string,
	contactDetailsVisible: boolean,
): string {
	const name = fullName?.trim();
	if (name) return name;
	if (contactDetailsVisible) return email;
	return "Teammate";
}
