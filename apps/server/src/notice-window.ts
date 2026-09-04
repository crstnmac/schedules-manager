/** True only for upcoming shifts inside the window; the exact boundary is
 * excluded and elapsed UTC time handles DST. Already-started shifts never
 * require acceptance. */
export function isWithinNoticeWindow(
	startsAt: Date,
	now: number,
	hours: number,
) {
	const delta = startsAt.getTime() - now;
	return delta >= 0 && delta < hours * 3_600_000;
}
