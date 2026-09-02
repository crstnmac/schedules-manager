/** The exact Notice Window boundary is excluded; elapsed UTC time handles DST. */
export function isWithinNoticeWindow(
	startsAt: Date,
	now: number,
	hours: number,
) {
	return startsAt.getTime() - now < hours * 3_600_000;
}
