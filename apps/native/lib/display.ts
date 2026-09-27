import {
	formatClockTime,
	formatDayLong,
	formatDayShort,
	type TimeFormat,
} from "./format-day";
import { useMe, useMySchedule } from "./queries";
import { useSelectedWorkplaceId } from "./workplace-store";

export type { TimeFormat };
export { formatClockTime };

export type NameFormat = "full" | "first_last_initial" | "first";

export function formatMinute(
	minute: number,
	format: TimeFormat = "12h",
): string {
	const normalizedMinute = ((minute % 1440) + 1440) % 1440;
	const hours = Math.floor(normalizedMinute / 60);
	const mins = normalizedMinute % 60;
	if (format === "24h") {
		return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
	}
	const suffix = hours >= 12 ? "PM" : "AM";
	const display = hours % 12 === 0 ? 12 : hours % 12;
	return `${display}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatShiftRange(
	startMinute: number,
	endMinute: number,
	overnight: boolean,
	format: TimeFormat = "12h",
): string {
	const end =
		endMinute === 0
			? format === "24h"
				? "00:00"
				: "12:00 AM"
			: formatMinute(endMinute, format);
	return `${formatMinute(startMinute, format)}–${end}${overnight ? " +1" : ""}`;
}

export function formatPersonName(
	fullName: string | null | undefined,
	email: string,
	format: NameFormat = "full",
): string {
	const name = fullName?.trim();
	if (!name) return email;
	if (format === "full") return name;
	const parts = name.split(/\s+/).filter(Boolean);
	const first = parts[0] ?? name;
	if (format === "first") return first;
	const last = parts.length > 1 ? parts[parts.length - 1] : "";
	if (!last) return first;
	return `${first} ${last.charAt(0).toUpperCase()}.`;
}

export function useDisplayPrefs() {
	const me = useMe();
	const { selected } = useSelectedWorkplaceId();
	const timeFormat: TimeFormat = me.data?.profile.timeFormat ?? "12h";
	const nameFormat: NameFormat = me.data?.profile.nameFormat ?? "full";

	// Same workplace resolution as the home screens; the schedule query is
	// shared through the query cache, so this adds no request.
	const employments = me.data?.employments ?? [];
	const workplaceId = (
		employments.find((e) => e.workplace.id === selected) ?? employments[0]
	)?.workplace.id;
	const schedule = useMySchedule(workplaceId).data;
	const timeZone =
		schedule?.currentWeek?.timezone ?? schedule?.nextWeek?.timezone;

	return {
		timeFormat,
		nameFormat,
		timeZone,
		formatMinute: (minute: number) => formatMinute(minute, timeFormat),
		formatClockTime: (iso?: string) =>
			formatClockTime(iso, timeFormat, timeZone),
		formatDayShort: (iso: string) => formatDayShort(iso, timeZone),
		formatDayLong: (iso: string) => formatDayLong(iso, timeZone),
		formatShiftRange: (
			startMinute: number,
			endMinute: number,
			overnight: boolean,
		) => formatShiftRange(startMinute, endMinute, overnight, timeFormat),
		formatPerson: (fullName: string | null | undefined, email: string) =>
			formatPersonName(fullName, email, nameFormat),
	};
}
