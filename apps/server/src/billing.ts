import { env } from "@SchedulesManager/env/server";
import { Polar } from "@polar-sh/sdk";

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
