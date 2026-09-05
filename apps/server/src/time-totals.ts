export interface GrossWorkedEntry {
	clockedInAt: Date;
	clockedOutAt: Date | null;
}

export function grossWorkedMs(
	entries: GrossWorkedEntry[],
	period: { startsAt: Date; endsAt: Date },
	now: Date,
): number {
	const start = period.startsAt.getTime();
	const end = period.endsAt.getTime();
	const nowMs = now.getTime();
	let totalMs = 0;
	for (const entry of entries) {
		const inAt = entry.clockedInAt.getTime();
		if (inAt < start || inAt >= end) continue;
		const outAt = entry.clockedOutAt ? entry.clockedOutAt.getTime() : nowMs;
		totalMs += Math.max(0, outAt - inAt);
	}
	return totalMs;
}
