import {
	db,
	employments,
	type LeavePolicy,
	leavePolicies,
	leaveTypes,
	ptoBalances,
	timeEntries,
	timeOffRequests,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import {
	addMonthsToDateKey,
	daysBetween,
	leaveYearForDate,
	leaveYearRange,
	leaveYearStartDate,
} from "./leave";
import { applyLeaveLedger } from "./leave-ledger";
import { shiftDays } from "./time";

interface AccrualTarget {
	policy: LeavePolicy;
	leaveTypeName: string;
	employment: {
		id: string;
		workplaceId: string;
		joinedAt: string | null;
		createdAt: Date;
	};
	periodKey: string;
	periodStart: string;
	periodEnd: string;
	amountMinutes: number;
	/** Minutes worked, for per_hour_worked. */
	workedMinutes?: number;
}

function firstWeekdayOnOrAfter(dateKey: string, weekday: number): string {
	let cursor = dateKey;
	for (let index = 0; index < 7; index += 1) {
		if (new Date(`${cursor}T00:00:00Z`).getUTCDay() === weekday) return cursor;
		cursor = shiftDays(cursor, 1);
	}
	return cursor;
}

function clampDayOfMonth(year: number, month: number, day: number): string {
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function prorate(
	amount: number,
	periodStart: string,
	periodEnd: string,
	serviceStart: string,
	enabled: boolean,
): number {
	if (!enabled || serviceStart <= periodStart) return amount;
	const eligibleStart = serviceStart > periodEnd ? periodEnd : serviceStart;
	const daysInPeriod = daysBetween(periodStart, periodEnd) + 1;
	const eligibleDays = daysBetween(eligibleStart, periodEnd) + 1;
	if (daysInPeriod <= 0) return amount;
	return Math.round((amount * eligibleDays) / daysInPeriod);
}

/**
 * Enumerates every accrual grant that has come due for one employment and
 * policy. Periods are keyed so reruns are idempotent.
 */
export function dueAccrualPeriods(input: {
	policy: LeavePolicy;
	leaveTypeName: string;
	employment: {
		id: string;
		workplaceId: string;
		joinedAt: string | null;
		createdAt: Date;
	};
	asOfDate: string;
	workedMinutesByMonth: Map<string, number>;
}): AccrualTarget[] {
	const { policy, leaveTypeName, employment, asOfDate } = input;
	const serviceStart =
		employment.joinedAt ?? employment.createdAt.toISOString().slice(0, 10);
	if (serviceStart > asOfDate) return [];
	const targets: AccrualTarget[] = [];
	const base = (
		periodKey: string,
		periodStart: string,
		periodEnd: string,
		rawAmount: number,
		workedMinutes?: number,
	) => {
		const amount = prorate(
			rawAmount,
			periodStart,
			periodEnd,
			serviceStart,
			policy.prorateOnJoin,
		);
		targets.push({
			policy,
			leaveTypeName,
			employment,
			periodKey,
			periodStart,
			periodEnd,
			amountMinutes: Math.max(0, amount),
			workedMinutes,
		});
	};

	if (
		policy.accrualMethod === "weekly" ||
		policy.accrualMethod === "biweekly"
	) {
		const stepDays = policy.accrualMethod === "weekly" ? 7 : 14;
		let periodEnd = firstWeekdayOnOrAfter(serviceStart, policy.accrualWeekday);
		let guard = 0;
		while (periodEnd <= asOfDate && guard < 600) {
			const periodStart = shiftDays(periodEnd, -(stepDays - 1));
			if (periodEnd >= serviceStart) {
				base(`W:${periodEnd}`, periodStart, periodEnd, policy.accrualMinutes);
			}
			periodEnd = shiftDays(periodEnd, stepDays);
			guard += 1;
		}
		return targets;
	}

	if (
		policy.accrualMethod === "monthly" ||
		policy.accrualMethod === "semimonthly"
	) {
		const serviceYear = Number(serviceStart.slice(0, 4));
		const serviceMonth = Number(serviceStart.slice(5, 7));
		const asOfYear = Number(asOfDate.slice(0, 4));
		const asOfMonth = Number(asOfDate.slice(5, 7));
		let year = serviceYear;
		let month = serviceMonth;
		let guard = 0;
		while (
			(year < asOfYear || (year === asOfYear && month <= asOfMonth)) &&
			guard < 600
		) {
			const days =
				policy.accrualMethod === "semimonthly"
					? [
							clampDayOfMonth(year, month, policy.accrualDay),
							clampDayOfMonth(year, month, 16),
						].sort()
					: [clampDayOfMonth(year, month, policy.accrualDay)];
			let previousMonth = month - 1;
			let previousYear = year;
			if (previousMonth < 1) {
				previousMonth = 12;
				previousYear -= 1;
			}
			let previousAccrual = clampDayOfMonth(
				previousYear,
				previousMonth,
				policy.accrualDay,
			);
			for (const periodEnd of days) {
				const periodStart = shiftDays(previousAccrual, 1);
				previousAccrual = periodEnd;
				if (periodEnd > asOfDate || periodEnd < serviceStart) continue;
				const monthKey = periodEnd.slice(0, 7);
				base(
					`M:${periodEnd}`,
					periodStart,
					periodEnd,
					policy.accrualMinutes,
					input.workedMinutesByMonth.get(monthKey),
				);
			}
			month += 1;
			if (month > 12) {
				month = 1;
				year += 1;
			}
			guard += 1;
		}
		return targets;
	}

	if (policy.accrualMethod === "annual") {
		const monthDay =
			policy.annualAccrualMonthDay ?? policy.leaveYearStartMonthDay;
		const month = Number(monthDay.slice(0, 2));
		const day = Number(monthDay.slice(3, 5));
		const startYear = Number(serviceStart.slice(0, 4));
		const endYear = Number(asOfDate.slice(0, 4));
		for (let year = startYear; year <= endYear; year += 1) {
			const periodEnd = clampDayOfMonth(year, month, day);
			if (periodEnd > asOfDate || periodEnd < serviceStart) continue;
			const range = leaveYearRange(year, policy.leaveYearStartMonthDay);
			base(
				`A:${periodEnd}`,
				range.startDate,
				shiftDays(addMonthsToDateKey(range.startDate, 12), -1),
				policy.accrualMinutes,
			);
		}
		return targets;
	}

	if (policy.accrualMethod === "per_hour_worked") {
		const denominator = policy.accrualPerHoursWorked * 60;
		if (denominator <= 0) return targets;
		for (const [monthKey, workedMinutes] of input.workedMinutesByMonth) {
			const [yearText, monthText] = monthKey.split("-");
			const year = Number(yearText);
			const month = Number(monthText);
			const periodEnd = clampDayOfMonth(year, month, 28);
			const periodStart = clampDayOfMonth(year, month, 1);
			if (periodEnd > asOfDate) continue;
			const amount = prorate(
				Math.floor((workedMinutes * policy.accrualMinutes) / denominator),
				periodStart,
				periodEnd,
				serviceStart,
				false,
			);
			if (amount > 0) {
				base(`H:${monthKey}`, periodStart, periodEnd, amount, workedMinutes);
			}
		}
		return targets;
	}

	return targets;
}

export interface AccrualRunSummary {
	workplaces: number;
	creditedEntries: number;
	creditedMinutes: number;
	cappedMinutes: number;
	skippedDuplicates: number;
}

/**
 * Credits every due accrual. Idempotent per period via ledger keys, so the
 * dispatcher can call it as often as it likes.
 */
export async function runLeaveAccruals(input: {
	workplaceId?: string;
	asOf?: Date;
}): Promise<AccrualRunSummary> {
	const asOf = input.asOf ?? new Date();
	const asOfDate = asOf.toISOString().slice(0, 10);
	const summary: AccrualRunSummary = {
		workplaces: 0,
		creditedEntries: 0,
		creditedMinutes: 0,
		cappedMinutes: 0,
		skippedDuplicates: 0,
	};

	const policyRows = await db
		.select({
			policy: leavePolicies,
			leaveTypeName: leaveTypes.name,
			workplaceId: workplaces.id,
		})
		.from(leavePolicies)
		.innerJoin(leaveTypes, eq(leaveTypes.id, leavePolicies.leaveTypeId))
		.innerJoin(workplaces, eq(workplaces.id, leavePolicies.workplaceId))
		.where(
			input.workplaceId
				? and(
						eq(leavePolicies.workplaceId, input.workplaceId),
						eq(leaveTypes.active, true),
					)
				: eq(leaveTypes.active, true),
		);
	const withAccrual = policyRows.filter(
		(row) => row.policy.accrualMethod !== "none",
	);
	if (withAccrual.length === 0) return summary;

	const workplaceIds = [...new Set(withAccrual.map((row) => row.workplaceId))];
	summary.workplaces = workplaceIds.length;

	const employmentRows = await db
		.select({
			id: employments.id,
			workplaceId: employments.workplaceId,
			joinedAt: employments.joinedAt,
			createdAt: employments.createdAt,
		})
		.from(employments)
		.where(
			and(
				inArray(employments.workplaceId, workplaceIds),
				eq(employments.status, "active"),
			),
		);

	const hourlyPolicyEmploymentIds = new Set<string>();
	for (const row of withAccrual) {
		if (row.policy.accrualMethod !== "per_hour_worked") continue;
		for (const employment of employmentRows) {
			if (employment.workplaceId === row.workplaceId) {
				hourlyPolicyEmploymentIds.add(employment.id);
			}
		}
	}
	const workedMinutesByEmployment = await workedMinutesForEmployments(
		[...hourlyPolicyEmploymentIds],
		asOfDate,
	);

	for (const policyRow of withAccrual) {
		for (const employment of employmentRows) {
			if (employment.workplaceId !== policyRow.workplaceId) continue;
			const workedMinutesByMonth =
				policyRow.policy.accrualMethod === "per_hour_worked"
					? (workedMinutesByEmployment.get(employment.id) ?? new Map())
					: new Map<string, number>();
			const targets = dueAccrualPeriods({
				policy: policyRow.policy,
				leaveTypeName: policyRow.leaveTypeName,
				employment,
				asOfDate,
				workedMinutesByMonth,
			});
			for (const target of targets) {
				const idempotencyKey = `accrual:${target.policy.leaveTypeId}:${employment.id}:${target.periodKey}`;
				const applied = await applyLeaveLedger({
					workplaceId: employment.workplaceId,
					employmentId: employment.id,
					leaveTypeId: target.policy.leaveTypeId,
					kind: "accrual",
					minutes: target.amountMinutes,
					effectiveDate: target.periodEnd,
					leaveYearStartMonthDay: target.policy.leaveYearStartMonthDay,
					maxBalanceMinutes: target.policy.maxBalanceMinutes,
					note:
						target.workedMinutes != null
							? `Accrual for ${target.periodKey} (${target.workedMinutes} minutes worked)`
							: `Accrual for ${target.periodKey}`,
					idempotencyKey,
				});
				if (applied.duplicate) {
					summary.skippedDuplicates += 1;
					continue;
				}
				summary.creditedEntries += 1;
				summary.creditedMinutes += applied.appliedMinutes;
				summary.cappedMinutes += Math.max(
					0,
					target.amountMinutes - applied.appliedMinutes,
				);
			}
		}
	}
	return summary;
}

async function workedMinutesForEmployments(
	employmentIds: string[],
	asOfDate: string,
): Promise<Map<string, Map<string, number>>> {
	const result = new Map<string, Map<string, number>>();
	if (employmentIds.length === 0) return result;
	const rows = await db
		.select({
			employmentId: timeEntries.employmentId,
			clockedInAt: timeEntries.clockedInAt,
			clockedOutAt: timeEntries.clockedOutAt,
		})
		.from(timeEntries)
		.where(
			and(
				inArray(timeEntries.employmentId, employmentIds),
				isNotNull(timeEntries.clockedOutAt),
			),
		);
	for (const row of rows) {
		if (!row.clockedOutAt) continue;
		const monthKey = row.clockedInAt.toISOString().slice(0, 7);
		if (`${monthKey}-01` > asOfDate) continue;
		const minutes = Math.max(
			0,
			Math.round(
				(row.clockedOutAt.getTime() - row.clockedInAt.getTime()) / 60_000,
			),
		);
		const byMonth = result.get(row.employmentId) ?? new Map<string, number>();
		byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + minutes);
		result.set(row.employmentId, byMonth);
	}
	return result;
}

/**
 * Annual rollover: labels the unused balance carried into the new leave year,
 * expires anything above the carry-forward cap, and later expires carried
 * minutes once the expiry window passes. All steps are idempotent.
 */
export async function runLeaveCarryForward(input: {
	workplaceId?: string;
	asOf?: Date;
}): Promise<{ carried: number; expired: number }> {
	const asOf = input.asOf ?? new Date();
	const asOfDate = asOf.toISOString().slice(0, 10);
	const policies = await db
		.select()
		.from(leavePolicies)
		.where(
			input.workplaceId
				? and(
						eq(leavePolicies.workplaceId, input.workplaceId),
						eq(leavePolicies.carryForwardEnabled, true),
					)
				: eq(leavePolicies.carryForwardEnabled, true),
		);
	let carried = 0;
	let expired = 0;

	for (const policy of policies) {
		const employmentRows = await db
			.select({
				id: employments.id,
				workplaceId: employments.workplaceId,
				joinedAt: employments.joinedAt,
				createdAt: employments.createdAt,
			})
			.from(employments)
			.where(
				and(
					eq(employments.workplaceId, policy.workplaceId),
					eq(employments.status, "active"),
				),
			);
		for (const employment of employmentRows) {
			const joinedAt =
				employment.joinedAt ?? employment.createdAt.toISOString().slice(0, 10);
			if (joinedAt > asOfDate) continue;
			const leaveYear = leaveYearForDate(
				asOfDate,
				policy.leaveYearStartMonthDay,
			);
			const yearStart = leaveYearStartDate(
				asOfDate,
				policy.leaveYearStartMonthDay,
			);
			const [balanceRow] = await db
				.select({ minutes: ptoBalances.minutes })
				.from(ptoBalances)
				.where(
					and(
						eq(ptoBalances.employmentId, employment.id),
						eq(ptoBalances.leaveTypeId, policy.leaveTypeId),
					),
				)
				.limit(1);
			const balance = balanceRow?.minutes ?? 0;

			const carryKey = `carry:${policy.leaveTypeId}:${employment.id}:${leaveYear}`;
			const carryEntry = await applyLeaveLedger({
				workplaceId: policy.workplaceId,
				employmentId: employment.id,
				leaveTypeId: policy.leaveTypeId,
				kind: "carry_forward",
				minutes: 0,
				metaMinutes: Math.min(
					balance,
					policy.maxCarryForwardMinutes ?? balance,
				),
				effectiveDate: yearStart,
				leaveYearStartMonthDay: policy.leaveYearStartMonthDay,
				note: `Balance carried into leave year ${leaveYear}`,
				idempotencyKey: carryKey,
			});
			if (!carryEntry.duplicate) carried += 1;

			const carriedMinutes = carryEntry.entry.metaMinutes ?? 0;
			const excess = Math.max(
				0,
				balance - (policy.maxCarryForwardMinutes ?? balance),
			);
			if (excess > 0) {
				const expiry = await applyLeaveLedger({
					workplaceId: policy.workplaceId,
					employmentId: employment.id,
					leaveTypeId: policy.leaveTypeId,
					kind: "expiry",
					minutes: -excess,
					metaMinutes: excess,
					effectiveDate: yearStart,
					leaveYearStartMonthDay: policy.leaveYearStartMonthDay,
					note: `Carry-forward cap of ${policy.maxCarryForwardMinutes} minutes`,
					idempotencyKey: `carry-cap:${policy.leaveTypeId}:${employment.id}:${leaveYear}`,
				});
				if (!expiry.duplicate) expired += 1;
			}

			if (
				carriedMinutes > 0 &&
				policy.carryForwardExpiryMonths != null &&
				policy.carryForwardExpiryMonths > 0
			) {
				const expiresOn = addMonthsToDateKey(
					yearStart,
					policy.carryForwardExpiryMonths,
				);
				if (asOfDate >= expiresOn) {
					const [current] = await db
						.select({ minutes: ptoBalances.minutes })
						.from(ptoBalances)
						.where(
							and(
								eq(ptoBalances.employmentId, employment.id),
								eq(ptoBalances.leaveTypeId, policy.leaveTypeId),
							),
						)
						.limit(1);
					const remaining = Math.max(0, current?.minutes ?? 0);
					const expireMinutes = Math.min(carriedMinutes, remaining);
					if (expireMinutes > 0) {
						const result = await applyLeaveLedger({
							workplaceId: policy.workplaceId,
							employmentId: employment.id,
							leaveTypeId: policy.leaveTypeId,
							kind: "expiry",
							minutes: -expireMinutes,
							metaMinutes: expireMinutes,
							effectiveDate: expiresOn,
							leaveYearStartMonthDay: policy.leaveYearStartMonthDay,
							note: `Carried minutes expired after ${policy.carryForwardExpiryMonths} months`,
							idempotencyKey: `carry-expiry:${policy.leaveTypeId}:${employment.id}:${leaveYear}`,
						});
						if (!result.duplicate) expired += 1;
					}
				}
			}
		}
	}
	return { carried, expired };
}

export interface ForecastPoint {
	month: string;
	accruedMinutes: number;
	plannedUsageMinutes: number;
	balanceMinutes: number;
}

/**
 * Projects a balance forward using the policy accrual pattern and already
 * approved future leave. Pending requests are reported separately.
 */
export async function leaveForecast(input: {
	workplaceId: string;
	employmentId: string;
	months: number;
	asOf?: Date;
}): Promise<
	Map<
		string,
		{
			leaveTypeName: string;
			startingMinutes: number;
			points: ForecastPoint[];
			pendingMinutes: number;
		}
	>
> {
	const asOf = input.asOf ?? new Date();
	const startMonth = asOf.toISOString().slice(0, 7);
	const horizon = Math.max(1, Math.min(input.months, 36));

	const policyRows = await db
		.select({
			policy: leavePolicies,
			leaveTypeId: leaveTypes.id,
			leaveTypeName: leaveTypes.name,
			active: leaveTypes.active,
		})
		.from(leavePolicies)
		.innerJoin(leaveTypes, eq(leaveTypes.id, leavePolicies.leaveTypeId))
		.where(eq(leavePolicies.workplaceId, input.workplaceId));

	const balanceRows = await db
		.select({
			leaveTypeId: ptoBalances.leaveTypeId,
			minutes: ptoBalances.minutes,
		})
		.from(ptoBalances)
		.where(eq(ptoBalances.employmentId, input.employmentId));

	const requests = await db
		.select()
		.from(timeOffRequests)
		.where(eq(timeOffRequests.employmentId, input.employmentId));

	const result = new Map<
		string,
		{
			leaveTypeName: string;
			startingMinutes: number;
			points: ForecastPoint[];
			pendingMinutes: number;
		}
	>();

	for (const row of policyRows) {
		if (row.policy.accrualMethod === "none") continue;
		const starting =
			balanceRows.find((balance) => balance.leaveTypeId === row.leaveTypeId)
				?.minutes ?? 0;
		const points: ForecastPoint[] = [];
		let balance = starting;
		for (let offset = 0; offset < horizon; offset += 1) {
			const monthKey = addMonthsToDateKey(`${startMonth}-01`, offset).slice(
				0,
				7,
			);
			const accrued = monthlyAccrualFor(row.policy, monthKey);
			const plannedUsage = requests
				.filter(
					(request) =>
						request.leaveTypeId === row.leaveTypeId &&
						request.status === "approved" &&
						request.startsAt.toISOString().slice(0, 7) === monthKey,
				)
				.reduce((total, request) => total + (request.chargeMinutes ?? 0), 0);
			balance = balance + accrued - plannedUsage;
			points.push({
				month: monthKey,
				accruedMinutes: accrued,
				plannedUsageMinutes: plannedUsage,
				balanceMinutes: balance,
			});
		}
		const pendingMinutes = requests
			.filter(
				(request) =>
					request.leaveTypeId === row.leaveTypeId &&
					request.status === "pending",
			)
			.reduce((total, request) => total + (request.chargeMinutes ?? 0), 0);
		result.set(row.leaveTypeId, {
			leaveTypeName: row.leaveTypeName,
			startingMinutes: starting,
			points,
			pendingMinutes,
		});
	}
	return result;
}

function monthlyAccrualFor(policy: LeavePolicy, monthKey: string): number {
	switch (policy.accrualMethod) {
		case "monthly":
			return policy.accrualMinutes;
		case "semimonthly":
			return policy.accrualMinutes * 2;
		case "weekly":
			return policy.accrualMinutes * 4;
		case "biweekly":
			return policy.accrualMinutes * 2;
		case "annual": {
			const monthDay = (
				policy.annualAccrualMonthDay ?? policy.leaveYearStartMonthDay
			).slice(0, 5);
			return monthKey.slice(5) === monthDay ? policy.accrualMinutes : 0;
		}
		default:
			return 0;
	}
}

/** Marks nothing; exported for tests. */
export function accrualPeriodKey(input: {
	leaveTypeId: string;
	employmentId: string;
	periodKey: string;
}): string {
	return `accrual:${input.leaveTypeId}:${input.employmentId}:${input.periodKey}`;
}

export const accrualHelpers = {
	addMonthsToDateKey,
	daysBetween,
	firstWeekdayOnOrAfter,
	prorate,
};
