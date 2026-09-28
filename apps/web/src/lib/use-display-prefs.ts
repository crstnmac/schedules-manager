import { formatLeaveRange } from "./leave";
import { useMe } from "./queries";
import {
	formatClockTime,
	formatMinute,
	formatPersonName,
	formatShiftRange,
	type NameFormat,
	type TimeFormat,
} from "./time";

export function useDisplayPrefs() {
	const me = useMe();
	const timeFormat: TimeFormat = me.data?.profile.timeFormat ?? "12h";
	const nameFormat: NameFormat = me.data?.profile.nameFormat ?? "full";

	return {
		timeFormat,
		nameFormat,
		formatMinute: (minute: number) => formatMinute(minute, timeFormat),
		/** Pass the row's Location zone when it has one. */
		formatClockTime: (iso?: string, timeZone?: string | null) =>
			formatClockTime(iso, timeFormat, timeZone),
		formatShiftRange: (
			startMinute: number,
			endMinute: number,
			overnight: boolean,
		) => formatShiftRange(startMinute, endMinute, overnight, timeFormat),
		formatLeaveRange: (input: Parameters<typeof formatLeaveRange>[0]) =>
			formatLeaveRange(input, timeFormat),
		formatPerson: (fullName: string | null | undefined, email: string) =>
			formatPersonName(fullName, email, nameFormat),
	};
}
