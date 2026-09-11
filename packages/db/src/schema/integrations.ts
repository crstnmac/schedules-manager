import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { workplaces } from "./workplaces";

export const apiKeyScopeEnum = pgEnum("api_key_scope", [
	"schedule.read",
	"schedule.write",
	"workers.read",
	"reports.read",
	"requests.read",
	"requests.write",
]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
	"pending",
	"delivered",
	"failed",
]);

export const apiKeys = pgTable("api_keys", {
	id: uuid("id").defaultRandom().primaryKey(),
	workplaceId: uuid("workplace_id")
		.notNull()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	/** First characters of the token, shown for identification. */
	keyPrefix: text("key_prefix").notNull(),
	keyHash: text("key_hash").notNull().unique(),
	scopes: apiKeyScopeEnum("scopes").array().notNull().default([]),
	createdBy: uuid("created_by"),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
	id: uuid("id").defaultRandom().primaryKey(),
	workplaceId: uuid("workplace_id")
		.notNull()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	url: text("url").notNull(),
	name: text("name").notNull(),
	/** HMAC-SHA256 signing secret. */
	secret: text("secret").notNull(),
	/** Event names such as schedule.published. Empty means all events. */
	eventTypes: text("event_types").array().notNull().default([]),
	active: boolean("active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
	id: uuid("id").defaultRandom().primaryKey(),
	endpointId: uuid("endpoint_id")
		.notNull()
		.references(() => webhookEndpoints.id, { onDelete: "cascade" }),
	eventType: text("event_type").notNull(),
	payload: jsonb("payload").notNull(),
	status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
	attempts: integer("attempts").notNull().default(0),
	responseStatus: integer("response_status"),
	lastError: text("last_error"),
	nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
	deliveredAt: timestamp("delivered_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
	workplace: one(workplaces, {
		fields: [apiKeys.workplaceId],
		references: [workplaces.id],
	}),
}));

export const webhookEndpointRelations = relations(
	webhookEndpoints,
	({ one, many }) => ({
		workplace: one(workplaces, {
			fields: [webhookEndpoints.workplaceId],
			references: [workplaces.id],
		}),
		deliveries: many(webhookDeliveries),
	}),
);

export const webhookDeliveryRelations = relations(
	webhookDeliveries,
	({ one }) => ({
		endpoint: one(webhookEndpoints, {
			fields: [webhookDeliveries.endpointId],
			references: [webhookEndpoints.id],
		}),
	}),
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type ApiKeyScope = (typeof apiKeyScopeEnum.enumValues)[number];
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
