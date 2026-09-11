import { describe, expect, test } from "bun:test";

import {
	billingCatalog,
	billingProduct,
	hasActiveSubscription,
	planAllows,
	seatsForLocationChange,
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

	test("scopes operational capabilities to the Operations plan", () => {
		expect(planAllows("schedule", "scheduling")).toBe(true);
		expect(planAllows("operations", "scheduling")).toBe(true);
		expect(planAllows("schedule", "time_clock")).toBe(false);
		expect(planAllows("schedule", "labor_reports")).toBe(false);
		expect(planAllows("operations", "time_clock")).toBe(true);
		expect(planAllows("operations", "kiosk")).toBe(true);
		expect(planAllows("operations", "timesheets")).toBe(true);
		expect(planAllows("operations", "attendance")).toBe(true);
		expect(planAllows("operations", "labor_reports")).toBe(true);
		expect(planAllows("operations", "auto_assign")).toBe(true);
	});

	test("adding a Location raises seats only once paid capacity is exceeded", () => {
		expect(seatsForLocationChange("add", 1, 1)).toBe(1);
		expect(seatsForLocationChange("add", 1, 2)).toBe(2);
		expect(seatsForLocationChange("add", 3, 2)).toBe(3);
		expect(seatsForLocationChange("add", 3, 5)).toBe(5);
	});

	test("removing a Location lowers seats but never below one", () => {
		expect(seatsForLocationChange("remove", 3, 2)).toBe(2);
		expect(seatsForLocationChange("remove", 3, 5)).toBe(3);
		expect(seatsForLocationChange("remove", 2, 1)).toBe(1);
		expect(seatsForLocationChange("remove", 1, 0)).toBe(1);
	});
});
