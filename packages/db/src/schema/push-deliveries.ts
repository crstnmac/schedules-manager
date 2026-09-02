import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { notificationOutbox } from "./notifications";

export const pushDeliveries = pgTable(
	"push_deliveries",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		outboxId: uuid("outbox_id")
			.notNull()
			.references(() => notificationOutbox.id, { onDelete: "cascade" }),
		token: text("token").notNull(),
		ticketId: text("ticket_id").notNull(),
		status: text("status").notNull().default("sent"),
		attempts: integer("attempts").notNull().default(0),
		availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
		lockedAt: timestamp("locked_at", { withTimezone: true }),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("push_delivery_ticket_unique").on(table.ticketId),
		index("push_delivery_poll_idx").on(table.status, table.availableAt),
	],
);
