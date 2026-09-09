import { laborCents } from "./labor";
import { minutesByZonedDate, weekStartOfDateKey, zonedDayInfo } from "./time";

export type ReportRow = {
	entryId: string;
	employmentId: string;
	/** Resolved interval start (clock-in). */
	intervalStart: Date;
	/** Resolved interval end (clock-out, or `now` for an open punch). */
	intervalEnd: Date;
	timezone: string;
	/** Worked minutes for this entry, after subtracting breaks. */
	worked: number;
	hourlyWageCents: number;
	overtimeWeeklyMinutes: number;
	overtimeDailyMinutes: number;
};

/**
 * Distribute `total` across `weights` so the shares sum exactly to `total`,
 * using cumulative rounding to avoid penny drift. Weights are non-negative.
 */
export function distributeByWeight(total: number, weights: number[]): number[] {
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	const shares = new Array<number>(weights.length).fill(0);
	if (totalWeight <= 0 || total <= 0) return shares;
	let cumulativeWeight = 0;
	let cumulativeShare = 0;
	weights.forEach((weight, index) => {
		cumulativeWeight += weight;
		const target = Math.round((cumulativeWeight * total) / totalWeight);
		shares[index] = target - cumulativeShare;
		cumulativeShare = target;
	});
	return shares;
}

/**
 * Compute per-time-entry labor cents by aggregating worked minutes per
 * (employment, workplace-week) and applying weekly + daily overtime with the
 * same `laborCents` contract the scheduling endpoints use. Each week's total
 * is then prorated back to its rows by worked minutes so the column sums
 * exactly to the aggregated weekly cost.
 */
export function computeLaborByEntry(
	rows: readonly ReportRow[],
	weekStartDay: number,
): Map<string, number> {
	type WeekGroup = {
		/** Per `(timezone, dateKey)` worked minutes for daily OT, keyed as `tz:date`. */
		rawByDate: Map<string, number>;
		totalRaw: number;
		totalWorked: number;
		hourlyWageCents: number;
		overtimeWeeklyMinutes: number;
		overtimeDailyMinutes: number;
		members: { entryId: string; worked: number }[];
	};
	const groups = new Map<string, WeekGroup>();
	for (const row of rows) {
		const dateKey = zonedDayInfo(row.intervalStart, row.timezone).dateKey;
		const weekKey = `${row.employmentId}:${weekStartOfDateKey(dateKey, weekStartDay)}`;
		let group = groups.get(weekKey);
		if (!group) {
			group = {
				rawByDate: new Map<string, number>(),
				totalRaw: 0,
				totalWorked: 0,
				hourlyWageCents: row.hourlyWageCents,
				overtimeWeeklyMinutes: row.overtimeWeeklyMinutes,
				overtimeDailyMinutes: row.overtimeDailyMinutes,
				members: [],
			};
			groups.set(weekKey, group);
		}
		for (const [day, dayRaw] of minutesByZonedDate(
			row.intervalStart,
			row.intervalEnd,
			row.timezone,
		)) {
			// Key the per-day bucket on the row's timezone as well as the
			// zoned date string. `minutesByZonedDate` splits this row's
			// minutes into days defined in `row.timezone`; a bare date string
			// from a *different* timezone denotes a different absolute 24h
			// window, so merging by date string alone would assemble a "day"
			// that exists under no single timezone and inflate daily OT.
			// Same-timezone rows still share a key, preserving the existing
			// workplace-wide daily-OT pool for single-zone workplaces.
			const dayKey = `${row.timezone}:${day}`;
			group.rawByDate.set(dayKey, (group.rawByDate.get(dayKey) ?? 0) + dayRaw);
			group.totalRaw += dayRaw;
		}
		group.totalWorked += row.worked;
		group.members.push({ entryId: row.entryId, worked: row.worked });
	}

	const laborByEntry = new Map<string, number>();
	for (const group of groups.values()) {
		// Scale raw per-day minutes down to worked minutes (after breaks) so
		// daily overtime is computed against worked time, not paid break time.
		const dailyMinutes =
			group.totalRaw > 0 && group.totalWorked > 0
				? distributeByWeight(group.totalWorked, [...group.rawByDate.values()])
				: [];
		const labor = laborCents({
			minutes: group.totalWorked,
			hourlyWageCents: group.hourlyWageCents,
			overtimeWeeklyMinutes: group.overtimeWeeklyMinutes,
			overtimeDailyMinutes: group.overtimeDailyMinutes,
			dailyMinutes,
		});
		const shares = distributeByWeight(
			labor.totalCents,
			group.members.map((member) => member.worked),
		);
		group.members.forEach((member, index) => {
			laborByEntry.set(member.entryId, shares[index] ?? 0);
		});
	}
	return laborByEntry;
}
