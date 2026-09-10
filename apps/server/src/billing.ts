import { db, workplaceSubscriptions } from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";

import { ForbiddenError } from "./errors";

export type BillingPlan = "schedule" | "operations";
export type BillingInterval = "month" | "year";

export const billingCatalog = {
	schedule: {
		month: {
			productId:
				env.POLAR_SCHEDULE_MONTHLY_PRODUCT_ID ??
				"b02d60a0-1cb1-41eb-ba74-d636d59ea2b7",
			unitAmount: 3_900,
		},
		year: {
			productId:
				env.POLAR_SCHEDULE_ANNUAL_PRODUCT_ID ??
				"799fc80e-da01-489c-b62a-d71006254464",
			unitAmount: 37_200,
		},
	},
	operations: {
		month: {
			productId:
				env.POLAR_OPERATIONS_MONTHLY_PRODUCT_ID ??
				"9318287b-5060-40e7-b1c1-05822b045dcb",
			unitAmount: 7_900,
		},
		year: {
			productId:
				env.POLAR_OPERATIONS_ANNUAL_PRODUCT_ID ??
				"edccbf84-a8c1-4efb-8b57-83069b60dcd5",
			unitAmount: 75_600,
		},
	},
} as const;

const productLookup = new Map(
	(
		Object.entries(billingCatalog) as [
			BillingPlan,
			(typeof billingCatalog)[BillingPlan],
		][]
	).flatMap(([plan, intervals]) =>
		(
			Object.entries(intervals) as [
				BillingInterval,
				{ productId: string; unitAmount: number },
			][]
		).map(([interval, product]) => [product.productId, { plan, interval }]),
	),
);

export function billingProduct(productId: string) {
	return productLookup.get(productId);
}

export function polarClient() {
	if (!env.POLAR_ACCESS_TOKEN) {
		throw new Error("Polar billing is not configured");
	}
	return new Polar({
		accessToken: env.POLAR_ACCESS_TOKEN,
		server: env.POLAR_MODE,
	});
}

export function hasActiveSubscription(status: string) {
	return status === "active" || status === "trialing";
}

export type ProductCapability =
	| "scheduling"
	| "time_clock"
	| "kiosk"
	| "timesheets"
	| "attendance"
	| "labor_reports"
	| "auto_assign";

const operationsCapabilities = new Set<ProductCapability>([
	"time_clock",
	"kiosk",
	"timesheets",
	"attendance",
	"labor_reports",
	"auto_assign",
]);

export function planAllows(
	plan: BillingPlan,
	capability: ProductCapability,
): boolean {
	return (
		capability === "scheduling" ||
		(plan === "operations" && operationsCapabilities.has(capability))
	);
}

export async function requireSubscriptionCapability(
	workplaceId: string,
	capability: ProductCapability,
) {
	const [subscription] = await db
		.select({
			plan: workplaceSubscriptions.plan,
			status: workplaceSubscriptions.status,
		})
		.from(workplaceSubscriptions)
		.where(eq(workplaceSubscriptions.workplaceId, workplaceId))
		.limit(1);

	if (!subscription || !hasActiveSubscription(subscription.status)) {
		throw new ForbiddenError(
			"An active subscription is required. Choose a plan in Subscription settings.",
		);
	}
	if (!planAllows(subscription.plan, capability)) {
		throw new ForbiddenError(
			"This feature requires the Operations plan. Upgrade in Subscription settings.",
		);
	}
	return subscription;
}
