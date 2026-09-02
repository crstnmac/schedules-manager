export function laborCents(input: {
	minutes: number;
	hourlyWageCents: number;
	overtimeWeeklyMinutes: number;
}): { regularCents: number; overtimeCents: number; totalCents: number } {
	const regularMinutes = Math.min(input.minutes, input.overtimeWeeklyMinutes);
	const overtimeMinutes = Math.max(0, input.minutes - input.overtimeWeeklyMinutes);
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
