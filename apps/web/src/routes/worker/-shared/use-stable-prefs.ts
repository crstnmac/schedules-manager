import { useMemo } from "react";
import { formatLeaveRange } from "@/lib/leave";
import { useMe } from "@/lib/queries";
import {
	formatClockTime,
	formatMinute,
	formatShiftRange,
	type TimeFormat,
} from "@/lib/time";

/**
 * Same formatters as `useDisplayPrefs`, but with identities that only change
 * when the viewer's time format does. Lets column definitions and derived rows
 * stay memoised instead of rebuilding on every render.
 */
export function useStablePrefs() {
	const me = useMe();
	const timeFormat: TimeFormat = me.data?.profile.timeFormat ?? "12h";
	return useMemo(
		() => ({
			timeFormat,
			formatMinute: (minute: number) => formatMinute(minute, timeFormat),
			formatClockTime: (iso?: string, timeZone?: string | null) =>
				formatClockTime(iso, timeFormat, timeZone),
			formatShiftRange: (
				startMinute: number,
				endMinute: number,
				overnight: boolean,
			) => formatShiftRange(startMinute, endMinute, overnight, timeFormat),
			formatLeaveRange: (input: Parameters<typeof formatLeaveRange>[0]) =>
				formatLeaveRange(input, timeFormat),
		}),
		[timeFormat],
	);
}
