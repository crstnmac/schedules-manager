import {
	db,
	type LeaveLedgerEntry,
	leaveLedgerEntries,
	ptoBalances,
} from "@SchedulesManager/db";
import { and, asc, eq, sql } from "drizzle-orm";

import { leaveYearForDate } from "./leave";

export type LeaveLedgerKind =
	| "initial"
	| "accrual"
	| "usage"
	| "adjustment"
	| "carry_forward"
	| "expiry"
	| "encashment"
	| "transfer_in"
	| "transfer_out"
	| "restoration";

export interface ApplyLeaveLedgerInput {
	workplaceId: string;
	employmentId: string;
	leaveTypeId: string;
	kind: LeaveLedgerKind;
	/** Desired signed delta. Negative values debit the balance. */
	minutes: number;
	effectiveDate: string;
	leaveYearStartMonthDay?: string;
	metaMinutes?: number | null;
	note?: string | null;
	requestId?: string | null;
	encashmentId?: string | null;
	transferId?: string | null;
	createdByProfileId?: string | null;
	idempotencyKey?: string | null;
	/** Let the balance go below zero. */
	allowNegative?: boolean;
	maxNegativeMinutes?: number;
	/** Stop credits at this balance. */
	maxBalanceMinutes?: number | null;
}

export interface AppliedLeaveLedger {
	entry: LeaveLedgerEntry;
	/** Minutes actually applied after clamping. */
	appliedMinutes: number;
	balanceAfter: number;
	/** True when an idempotency key matched an existing entry. */
	duplicate: boolean;
}

/**
 * Every balance mutation flows through here so `pto_balances` and the ledger
 * can never drift: the row is locked, the delta is clamped by policy, the
 * balance is updated, and the signed entry is recorded with its running total.
 */
export async function applyLeaveLedger(
	input: ApplyLeaveLedgerInput,
): Promise<AppliedLeaveLedger> {
	if (input.idempotencyKey) {
		const [existing] = await db
			.select()
			.from(leaveLedgerEntries)
			.where(eq(leaveLedgerEntries.idempotencyKey, input.idempotencyKey))
			.limit(1);
		if (existing) {
			return {
				entry: existing,
				appliedMinutes: existing.minutes,
				balanceAfter: existing.balanceAfter,
				duplicate: true,
			};
		}
	}

	await db
		.insert(ptoBalances)
		.values({
			employmentId: input.employmentId,
			leaveTypeId: input.leaveTypeId,
			minutes: 0,
		})
		.onConflictDoNothing();

	const [balanceRow] = await db
		.select({ minutes: ptoBalances.minutes })
		.from(ptoBalances)
		.where(
			and(
				eq(ptoBalances.employmentId, input.employmentId),
				eq(ptoBalances.leaveTypeId, input.leaveTypeId),
			),
		)
		.for("update");
	const current = balanceRow?.minutes ?? 0;

	// Anchor manually imported balances in the ledger the first time an
	// automated entry touches them, so history always explains the total.
	await anchorInitialBalance(input, current);

	let applied = input.minutes;
	if (applied < 0) {
		const floor = input.allowNegative ? -(input.maxNegativeMinutes ?? 0) : 0;
		applied = -Math.min(-applied, current - floor);
	} else if (applied > 0 && input.maxBalanceMinutes != null) {
		applied = Math.min(applied, input.maxBalanceMinutes - current);
	}
	if (applied < 0 && current + applied < 0 && !input.allowNegative) {
		applied = -current;
	}

	const balanceAfter = current + applied;
	await db
		.update(ptoBalances)
		.set({ minutes: balanceAfter, updatedAt: new Date() })
		.where(
			and(
				eq(ptoBalances.employmentId, input.employmentId),
				eq(ptoBalances.leaveTypeId, input.leaveTypeId),
			),
		);

	const [entry] = await db
		.insert(leaveLedgerEntries)
		.values({
			workplaceId: input.workplaceId,
			employmentId: input.employmentId,
			leaveTypeId: input.leaveTypeId,
			kind: input.kind,
			minutes: applied,
			metaMinutes: input.metaMinutes ?? null,
			balanceAfter,
			effectiveDate: input.effectiveDate,
			leaveYear: leaveYearForDate(
				input.effectiveDate,
				input.leaveYearStartMonthDay ?? "01-01",
			),
			requestId: input.requestId ?? null,
			encashmentId: input.encashmentId ?? null,
			transferId: input.transferId ?? null,
			createdByProfileId: input.createdByProfileId ?? null,
			note: input.note ?? null,
			idempotencyKey: input.idempotencyKey ?? null,
		})
		.returning();

	if (!entry) throw new Error("Failed to record leave ledger entry");
	return { entry, appliedMinutes: applied, balanceAfter, duplicate: false };
}

async function anchorInitialBalance(
	input: ApplyLeaveLedgerInput,
	current: number,
): Promise<void> {
	if (current === 0 || input.kind === "initial") return;
	const [existing] = await db
		.select({ id: leaveLedgerEntries.id })
		.from(leaveLedgerEntries)
		.where(
			and(
				eq(leaveLedgerEntries.employmentId, input.employmentId),
				eq(leaveLedgerEntries.leaveTypeId, input.leaveTypeId),
			),
		)
		.orderBy(asc(leaveLedgerEntries.createdAt))
		.limit(1);
	if (existing) return;
	await db.insert(leaveLedgerEntries).values({
		workplaceId: input.workplaceId,
		employmentId: input.employmentId,
		leaveTypeId: input.leaveTypeId,
		kind: "initial",
		minutes: current,
		metaMinutes: null,
		balanceAfter: current,
		effectiveDate: input.effectiveDate,
		leaveYear: leaveYearForDate(
			input.effectiveDate,
			input.leaveYearStartMonthDay ?? "01-01",
		),
		note: "Opening balance",
		createdByProfileId: input.createdByProfileId ?? null,
	});
}

export async function leaveBalanceMinutes(
	employmentId: string,
	leaveTypeId: string,
): Promise<number> {
	const [row] = await db
		.select({ minutes: ptoBalances.minutes })
		.from(ptoBalances)
		.where(
			and(
				eq(ptoBalances.employmentId, employmentId),
				eq(ptoBalances.leaveTypeId, leaveTypeId),
			),
		)
		.limit(1);
	return row?.minutes ?? 0;
}

/** Credits accrued automatically, respecting the policy balance cap. */
export async function creditLeaveLedger(
	input: Omit<ApplyLeaveLedgerInput, "minutes"> & { minutes: number },
): Promise<AppliedLeaveLedger> {
	return applyLeaveLedger(input);
}

/** Debits usage, clamped by the negative-balance policy. */
export async function debitLeaveLedger(
	input: Omit<ApplyLeaveLedgerInput, "minutes"> & { minutes: number },
): Promise<AppliedLeaveLedger> {
	return applyLeaveLedger({
		...input,
		minutes: -Math.abs(input.minutes),
	});
}

export async function leaveLedgerTotals(
	employmentId: string,
	leaveTypeId: string,
): Promise<{ credited: number; debited: number; entryCount: number }> {
	const [row] = await db
		.select({
			credited: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.minutes} > 0 then ${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
			debited: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.minutes} < 0 then -${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
			entryCount: sql<number>`count(*)::int`,
		})
		.from(leaveLedgerEntries)
		.where(
			and(
				eq(leaveLedgerEntries.employmentId, employmentId),
				eq(leaveLedgerEntries.leaveTypeId, leaveTypeId),
			),
		);
	return {
		credited: row?.credited ?? 0,
		debited: row?.debited ?? 0,
		entryCount: row?.entryCount ?? 0,
	};
}
