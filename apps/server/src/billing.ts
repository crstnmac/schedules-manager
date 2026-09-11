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
				"938a1520-965b-4ff3-ad5f-596c7e579aed",
			unitAmount: 3_900,
		},
		year: {
			productId:
				env.POLAR_SCHEDULE_ANNUAL_PRODUCT_ID ??
				"c539a634-7878-4bf6-a80d-285e050ce88f",
			unitAmount: 37_200,
		},
	},
	operations: {
		month: {
			productId:
				env.POLAR_OPERATIONS_MONTHLY_PRODUCT_ID ??
				"4d49d70d-c163-4dbe-a2fb-11a7177a77ef",
			unitAmount: 7_900,
		},
		year: {
			productId:
				env.POLAR_OPERATIONS_ANNUAL_PRODUCT_ID ??
				"6c1ad0bc-e4a9-4e04-af39-7ee865d477a5",
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

/**
 * Per-Location billing is seat-based: Polar only lets the seat count change on
 * a product that carries a seat-based price. Guard checkout so a misconfigured
 * fixed-price product fails with a clear message instead of a raw API error.
 */
export async function requireSeatBasedProduct(productId: string) {
	const product = await polarClient().products.get({ id: productId });
	if (!product.prices.some((price) => price.amountType === "seat_based")) {
		throw new Error(
			`Polar product ${productId} must use per-seat pricing for per-Location billing.`,
		);
	}
	return product;
}

export function hasActiveSubscription(status: string) {
	return status === "active" || status === "trialing";
}

export type WorkplaceSubscriptionRecord =
	typeof workplaceSubscriptions.$inferSelect;

export async function loadWorkplaceSubscription(workplaceId: string) {
	const [subscription] = await db
		.select()
		.from(workplaceSubscriptions)
		.where(eq(workplaceSubscriptions.workplaceId, workplaceId))
		.limit(1);
	return subscription;
}

export async function requireActiveSubscription(workplaceId: string) {
	const subscription = await loadWorkplaceSubscription(workplaceId);
	if (!subscription || !hasActiveSubscription(subscription.status)) {
		throw new ForbiddenError(
			"An active subscription is required. Choose a plan in Subscription settings.",
		);
	}
	return subscription;
}

/**
 * A Seat is one billable Location. Adding a Location raises the paid seat count
 * to cover it; removing one lowers the count back down, never below a single
 * Location. Reducing seats produces a prorated credit for the unused time.
 */
export function seatsForLocationChange(
	direction: "add" | "remove",
	currentSeats: number,
	activeCount: number,
) {
	const seats = Math.max(1, currentSeats);
	const active = Math.max(1, activeCount);
	return direction === "add"
		? Math.max(seats, active)
		: Math.max(1, Math.min(seats, active));
}

/**
 * Push a new seat count to Polar and mirror it locally. Polar only supports
 * changing seats on seat-based products, so the catalog must be configured
 * with per-Location pricing. Callers that cannot tolerate a failure (Location
 * creation) must handle the thrown error; callers that must proceed (Location
 * deletion) should catch it.
 */
export async function setSubscriptionSeats(
	subscription: WorkplaceSubscriptionRecord,
	seats: number,
) {
	const target = Math.max(1, seats);
	if (target === subscription.locationCount) return subscription;
	if (!hasActiveSubscription(subscription.status)) {
		throw new ForbiddenError(
			"An active subscription is required to change the number of Locations.",
		);
	}
	await polarClient().subscriptions.update({
		id: subscription.polarSubscriptionId,
		subscriptionUpdate: { seats: target, prorationBehavior: "prorate" },
	});
	try {
		const [updated] = await db
			.update(workplaceSubscriptions)
			.set({ locationCount: target, updatedAt: new Date() })
			.where(eq(workplaceSubscriptions.id, subscription.id))
			.returning();
		return updated ?? subscription;
	} catch (error) {
		await polarClient()
			.subscriptions.update({
				id: subscription.polarSubscriptionId,
				subscriptionUpdate: {
					seats: subscription.locationCount,
					prorationBehavior: "prorate",
				},
			})
			.catch(() => undefined);
		throw error;
	}
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
	const subscription = await requireActiveSubscription(workplaceId);
	if (!planAllows(subscription.plan, capability)) {
		throw new ForbiddenError(
			"This feature requires the Operations plan. Upgrade in Subscription settings.",
		);
	}
	return subscription;
}
