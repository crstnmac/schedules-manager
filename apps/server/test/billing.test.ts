import { describe, expect, test } from "bun:test";

import {
	billingCatalog,
	billingProduct,
	hasActiveSubscription,
} from "../src/billing";

describe("billing catalog", () => {
	test("maps every Polar product back to its entitlement", () => {
		for (const [plan, intervals] of Object.entries(billingCatalog)) {
			for (const [interval, product] of Object.entries(intervals)) {
				expect(billingProduct(product.productId)).toEqual({ plan, interval });
			}
		}
	});

	test("annual pricing saves at least twenty percent", () => {
		expect(billingCatalog.schedule.year.unitAmount).toBeLessThanOrEqual(
			billingCatalog.schedule.month.unitAmount * 12 * 0.8,
		);
		expect(billingCatalog.operations.year.unitAmount).toBeLessThanOrEqual(
			billingCatalog.operations.month.unitAmount * 12 * 0.8,
		);
	});

	test("only active and trialing subscriptions grant service", () => {
		expect(hasActiveSubscription("active")).toBe(true);
		expect(hasActiveSubscription("trialing")).toBe(true);
		expect(hasActiveSubscription("past_due")).toBe(false);
		expect(hasActiveSubscription("revoked")).toBe(false);
	});
});
