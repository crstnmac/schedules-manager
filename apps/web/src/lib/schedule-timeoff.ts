import {
	datetimeLocalToIso,
	isoToDatetimeLocal,
	minutesToTimeInput,
	shiftDays,
} from "./time";

export interface ScheduleTimeOffRequest {
	startsAt: string;
	endsAt: string;
}

export function timeOffCoversDay(
	request: ScheduleTimeOffRequest,
	day: string,
	timeZone: string,
): boolean {
	const startKey = isoToDatetimeLocal(request.startsAt, timeZone).slice(0, 10);
	const endExclusiveIso = new Date(
		new Date(request.endsAt).getTime() - 1,
	).toISOString();
	const endKey = isoToDatetimeLocal(endExclusiveIso, timeZone).slice(0, 10);
	return day >= startKey && day <= endKey;
}

export function shiftOverlapsTimeOff(
	request: ScheduleTimeOffRequest,
	date: string,
	startMinute: number,
	endMinute: number,
	timeZone: string,
): boolean {
	const startIso = datetimeLocalToIso(
		`${date}T${minutesToTimeInput(startMinute)}`,
		timeZone,
	);
	const overnight = endMinute <= startMinute;
	const endDate = shiftDays(date, overnight || endMinute >= 1440 ? 1 : 0);
	const endIso = datetimeLocalToIso(
		`${endDate}T${minutesToTimeInput(endMinute % 1440)}`,
		timeZone,
	);
	if (!startIso || !endIso) return false;
	return (
		new Date(startIso) < new Date(request.endsAt) &&
		new Date(request.startsAt) < new Date(endIso)
	);
}
