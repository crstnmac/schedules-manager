import {
	boolean,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { workplaces } from "./workplaces";

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
	"schedule",
	"operations",
]);

export const billingIntervalEnum = pgEnum("billing_interval", [
	"month",
	"year",
]);

export const workplaceSubscriptions = pgTable(
	"workplace_subscriptions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		polarSubscriptionId: text("polar_subscription_id").notNull(),
		polarCustomerId: text("polar_customer_id").notNull(),
		polarProductId: text("polar_product_id").notNull(),
		plan: subscriptionPlanEnum("plan").notNull(),
		billingInterval: billingIntervalEnum("billing_interval").notNull(),
		status: text("status").notNull(),
		locationCount: integer("location_count").notNull().default(1),
		currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("workplace_subscriptions_workplace_unique").on(table.workplaceId),
		unique("workplace_subscriptions_polar_unique").on(
			table.polarSubscriptionId,
		),
	],
);

export const polarWebhookEvents = pgTable("polar_webhook_events", {
	id: text("id").primaryKey(),
	type: text("type").notNull(),
	receivedAt: timestamp("received_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type WorkplaceSubscription = typeof workplaceSubscriptions.$inferSelect;
