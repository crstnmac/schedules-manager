import { db, workplaceSubscriptions } from "@SchedulesManager/db";
import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";

import { billingCatalog } from "./billing";
import { managerEmploymentIds, notifyEmployments } from "./notify";

/**
 * Auto-renewal notices. The Terms commit to warning managers before money
 * moves: at least 7 days before a free trial converts to a paid subscription
 * and at least 30 days before an annual renewal. Both scans are idempotent —
 * a notice is sent once per trial, and once per upcoming period.
 */
const TRIAL_NOTICE_DAYS = 7;
const RENEWAL_NOTICE_DAYS = 30;

const PLAN_NAMES = {
	schedule: "Schedule",
	operations: "Operations",
} as const;

function money(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(cents / 100);
}

function day(date: Date) {
	return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
}

function planPriceCents(
	plan: "schedule" | "operations",
	interval: "month" | "year",
) {
	return billingCatalog[plan][interval].unitAmount;
}

export async function processSubscriptionNoticeBatch(limit = 100) {
	const now = new Date();
	const trialHorizon = new Date(
		now.getTime() + TRIAL_NOTICE_DAYS * 24 * 60 * 60 * 1000,
	);
	const renewalHorizon = new Date(
		now.getTime() + RENEWAL_NOTICE_DAYS * 24 * 60 * 60 * 1000,
	);

	const trialing = await db
		.select()
		.from(workplaceSubscriptions)
		.where(
			and(
				eq(workplaceSubscriptions.status, "trialing"),
				isNull(workplaceSubscriptions.trialNoticeSentAt),
				gte(workplaceSubscriptions.trialEndsAt, now),
				lte(workplaceSubscriptions.trialEndsAt, trialHorizon),
			),
		)
		.limit(limit);

	for (const subscription of trialing) {
		if (!subscription.trialEndsAt) continue;
		const total = money(
			planPriceCents(subscription.plan, subscription.billingInterval) *
				Math.max(1, subscription.locationCount),
		);
		await notifyEmployments(
			await managerEmploymentIds(subscription.workplaceId),
			{
				kind: "billing_trial_ending",
				title: "Your free trial ends soon",
				body: `Your ${PLAN_NAMES[subscription.plan]} plan starts on ${day(
					subscription.trialEndsAt,
				)} at ${total} per ${
					subscription.billingInterval === "year" ? "year" : "month"
				} for ${Math.max(1, subscription.locationCount)} location${
					subscription.locationCount === 1 ? "" : "s"
				} unless you cancel before then in Settings → Subscription.`,
			},
		);
		await db
			.update(workplaceSubscriptions)
			.set({ trialNoticeSentAt: new Date() })
			.where(eq(workplaceSubscriptions.id, subscription.id));
	}

	const renewing = await db
		.select()
		.from(workplaceSubscriptions)
		.where(
			and(
				eq(workplaceSubscriptions.billingInterval, "year"),
				eq(workplaceSubscriptions.cancelAtPeriodEnd, false),
				// A trialing subscription already receives the trial-ending notice;
				// its first renewal notice comes once it is genuinely renewing.
				ne(workplaceSubscriptions.status, "trialing"),
				gte(workplaceSubscriptions.currentPeriodEnd, now),
				lte(workplaceSubscriptions.currentPeriodEnd, renewalHorizon),
				sql`(${workplaceSubscriptions.renewalNoticePeriodEnd} is null or ${workplaceSubscriptions.renewalNoticePeriodEnd} <> ${workplaceSubscriptions.currentPeriodEnd})`,
			),
		)
		.limit(limit);

	for (const subscription of renewing) {
		if (!subscription.currentPeriodEnd) continue;
		const total = money(
			planPriceCents(subscription.plan, subscription.billingInterval) *
				Math.max(1, subscription.locationCount),
		);
		await notifyEmployments(
			await managerEmploymentIds(subscription.workplaceId),
			{
				kind: "billing_renewal_upcoming",
				title: "Annual renewal coming up",
				body: `Your ${PLAN_NAMES[subscription.plan]} plan renews on ${day(
					subscription.currentPeriodEnd,
				)} at ${total} per year for ${Math.max(
					1,
					subscription.locationCount,
				)} location${
					subscription.locationCount === 1 ? "" : "s"
				}, plus any taxes. Manage or cancel in Settings → Subscription.`,
			},
		);
		await db
			.update(workplaceSubscriptions)
			.set({ renewalNoticePeriodEnd: subscription.currentPeriodEnd })
			.where(eq(workplaceSubscriptions.id, subscription.id));
	}

	return { trials: trialing.length, renewals: renewing.length };
}
