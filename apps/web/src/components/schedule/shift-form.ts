import type { ScheduleResponse, ScheduleShiftDto } from "@/lib/queries";
import { addDays } from "@/lib/schedule-calendar";
import { workplaceTodayKey } from "@/lib/time";

export interface ShiftFormState {
	shiftId: string | null;
	employmentId: string;
	positionId: string;
	date: string;
	startMinute: number;
	endMinute: number;
	note: string;
	unavailabilityOverrideReason: string;
	tagIds: string[];
	taskTitles: string;
}

export function emptyForm(date: string): ShiftFormState {
	return {
		shiftId: null,
		employmentId: "",
		positionId: "",
		date,
		startMinute: 9 * 60,
		endMinute: 17 * 60,
		note: "",
		unavailabilityOverrideReason: "",
		tagIds: [],
		taskTitles: "",
	};
}

export function staffWindowOverlaps(
	window: {
		kind: "recurring" | "date";
		weekday: number | null;
		date: string | null;
		startMinute: number;
		endMinute: number;
	},
	date: string,
	startMinute: number,
	endMinute: number,
): boolean {
	const overnight = endMinute <= startMinute;
	const dates = overnight ? [date, addDays(date, 1)] : [date];
	const shiftStartAbs = startMinute;
	const shiftEndAbs = overnight ? endMinute + 1440 : endMinute;

	for (const key of dates) {
		if (window.kind === "recurring" && window.weekday !== null) {
			if (new Date(`${key}T12:00:00`).getDay() !== window.weekday) continue;
		} else if (window.kind === "date" && window.date) {
			if (window.date !== key) continue;
		} else {
			continue;
		}
		const offset = key === date ? 0 : 1440;
		const winStart = window.startMinute + offset;
		const winEnd = window.endMinute + offset;
		if (shiftStartAbs < winEnd && winStart < shiftEndAbs) return true;
	}
	return false;
}

function dayOffset(weekStart: string, date: string): number {
	const start = new Date(`${weekStart}T12:00:00`).getTime();
	const day = new Date(`${date}T12:00:00`).getTime();
	return Math.round((day - start) / 86_400_000);
}

export function shiftRangeMinutes(
	weekStart: string,
	date: string,
	startMinute: number,
	endMinute: number,
): [number, number] {
	const start = dayOffset(weekStart, date) * 1440 + startMinute;
	const overnight = endMinute <= startMinute;
	const endDate = overnight ? addDays(date, 1) : date;
	const end = dayOffset(weekStart, endDate) * 1440 + endMinute;
	return [start, end];
}

export function defaultAddDate(weekStart: string, timeZone: string): string {
	const today = workplaceTodayKey(timeZone);
	const last = addDays(weekStart, 6);
	if (today >= weekStart && today <= last) return today;
	return weekStart;
}

export function positionsForWorker(
	positions: ScheduleResponse["positions"],
	member: ScheduleResponse["staff"][number] | undefined,
) {
	if (!member || member.positionIds.length === 0) return positions;
	return positions.filter((position) =>
		member.positionIds.includes(position.id),
	);
}

export function workerNeedsPositionApproval(
	member: ScheduleResponse["staff"][number] | undefined,
	positionId: string,
): boolean {
	if (!positionId) return false;
	const positionIds =
		member?.kind === "worker" ? member.positionIds : undefined;
	if (!positionIds || positionIds.length === 0) return false;
	return !positionIds.includes(positionId);
}

export type PositionApproval =
	| {
			kind: "save";
			form: ShiftFormState;
			workerName: string;
			positionName: string;
			shiftCount: number;
	  }
	| {
			kind: "move";
			shift: ScheduleShiftDto;
			employmentId: string;
			date: string;
			workerName: string;
			positionName: string;
	  };

export function positionApprovalCopy(approval: PositionApproval) {
	const consequence =
		approval.kind === "move"
			? "moves this shift"
			: approval.shiftCount > 1
				? `adds ${approval.shiftCount} shifts`
				: approval.form.shiftId
					? "saves this shift"
					: "adds this shift";
	return {
		title: `Add ${approval.positionName} to ${approval.workerName}?`,
		description: `${approval.workerName} isn’t approved for ${approval.positionName} yet. Confirming adds this Position to their Employment, then ${consequence}.`,
		confirmLabel: `Add ${approval.positionName} and ${approval.kind === "move" ? "move" : "save"}`,
	};
}
