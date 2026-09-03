export function laborCents(input: {
	minutes: number;
	hourlyWageCents: number;
	overtimeWeeklyMinutes: number;
	/** 0 disables daily overtime. */
	overtimeDailyMinutes?: number;
	/** Worked minutes per calendar day. Used only when daily overtime is on. */
	dailyMinutes?: number[];
}): { regularCents: number; overtimeCents: number; totalCents: number } {
	const dailyLimit = input.overtimeDailyMinutes ?? 0;
	const dailyOtMinutes =
		dailyLimit > 0 && input.dailyMinutes && input.dailyMinutes.length > 0
			? input.dailyMinutes.reduce(
					(sum, day) => sum + Math.max(0, day - dailyLimit),
					0,
				)
			: 0;
	const remaining = Math.max(0, input.minutes - dailyOtMinutes);
	const weeklyOtMinutes = Math.max(0, remaining - input.overtimeWeeklyMinutes);
	const regularMinutes = Math.max(0, remaining - weeklyOtMinutes);
	const overtimeMinutes = dailyOtMinutes + weeklyOtMinutes;
	const regularCents = Math.round(
		(regularMinutes / 60) * input.hourlyWageCents,
	);
	const overtimeCents = Math.round(
		(overtimeMinutes / 60) * input.hourlyWageCents * 1.5,
	);
	return {
		regularCents,
		overtimeCents,
		totalCents: regularCents + overtimeCents,
	};
}

export function laborPercent(
	laborCentsTotal: number,
	salesCents: number,
): number | null {
	if (salesCents <= 0) return null;
	return Math.round((laborCentsTotal / salesCents) * 10_000) / 100;
}
