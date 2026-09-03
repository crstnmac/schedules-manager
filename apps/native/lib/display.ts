import { useMe } from "./queries";

export type TimeFormat = "12h" | "24h";
export type NameFormat = "full" | "first_last_initial" | "first";

export function formatMinute(
	minute: number,
	format: TimeFormat = "12h",
): string {
	const hours = Math.floor(minute / 60);
	const mins = minute % 60;
	if (format === "24h") {
		return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
	}
	const suffix = hours >= 12 ? "PM" : "AM";
	const display = hours % 12 === 0 ? 12 : hours % 12;
	return `${display}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatClockTime(
	iso: string | undefined,
	format: TimeFormat = "12h",
): string {
	if (!iso) return "";
	return new Date(iso).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		hour12: format !== "24h",
	});
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
	const timeFormat: TimeFormat = me.data?.profile.timeFormat ?? "12h";
	const nameFormat: NameFormat = me.data?.profile.nameFormat ?? "full";

	return {
		timeFormat,
		nameFormat,
		formatMinute: (minute: number) => formatMinute(minute, timeFormat),
		formatClockTime: (iso?: string) => formatClockTime(iso, timeFormat),
		formatShiftRange: (
			startMinute: number,
			endMinute: number,
			overnight: boolean,
		) => formatShiftRange(startMinute, endMinute, overnight, timeFormat),
		formatPerson: (fullName: string | null | undefined, email: string) =>
			formatPersonName(fullName, email, nameFormat),
	};
}
