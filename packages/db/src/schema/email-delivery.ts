import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { invitations } from "./invitations";
import { workplaces } from "./workplaces";

export const emailDeliveryStatusEnum = pgEnum("email_delivery_status", [
	"queued",
	"sending",
	"sent",
	"delivered",
	"bounced",
	"failed",
	"cancelled",
]);
export const emailDeliveries = pgTable(
	"email_deliveries",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		invitationId: uuid("invitation_id")
			.notNull()
			.references(() => invitations.id, { onDelete: "cascade" }),
		token: text("token").notNull().unique(),
		email: text("email").notNull(),
		workplaceName: text("workplace_name").notNull(),
		kind: text("kind").notNull(),
		status: emailDeliveryStatusEnum("status").notNull().default("queued"),
		attempts: integer("attempts").notNull().default(0),
		availableAt: timestamp("available_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		lockedAt: timestamp("locked_at", { withTimezone: true }),
		leaseId: uuid("lease_id"),
		providerMessageId: text("provider_message_id"),
		lastError: text("last_error"),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		bouncedAt: timestamp("bounced_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("email_deliveries_pending_idx").on(table.status, table.availableAt),
		index("email_deliveries_workplace_idx").on(table.workplaceId),
		index("email_deliveries_provider_idx").on(table.providerMessageId),
	],
);

// Only event identity and outcome are retained; webhook payloads contain personal data.
export const emailWebhookEvents = pgTable("email_webhook_events", {
	id: text("id").primaryKey(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
