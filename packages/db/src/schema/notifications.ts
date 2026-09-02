import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { profiles } from "./profiles";
import { workplaces } from "./workplaces";

export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("notifications_employment_idx").on(table.employmentId)],
);

export const notificationOutbox = pgTable(
	"notification_outbox",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		notificationId: uuid("notification_id")
			.notNull()
			.references(() => notifications.id, { onDelete: "cascade" }),
		attempts: integer("attempts").notNull().default(0),
		availableAt: timestamp("available_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		lockedAt: timestamp("locked_at", { withTimezone: true }),
		processedAt: timestamp("processed_at", { withTimezone: true }),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("notification_outbox_notification_unique").on(table.notificationId),
		index("notification_outbox_pending_idx").on(
			table.processedAt,
			table.availableAt,
		),
	],
);

export const auditEvents = pgTable(
	"audit_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		actorProfileId: uuid("actor_profile_id").references(() => profiles.id, {
			onDelete: "set null",
		}),
		action: text("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id"),
		summary: text("summary").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("audit_events_workplace_idx").on(table.workplaceId)],
);

export const pilotFeedback = pgTable(
	"pilot_feedback",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		profileId: uuid("profile_id").references(() => profiles.id, {
			onDelete: "set null",
		}),
		category: text("category").notNull(),
		message: text("message").notNull(),
		page: text("page"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("pilot_feedback_workplace_idx").on(table.workplaceId)],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationOutbox = typeof notificationOutbox.$inferSelect;
export type NewNotificationOutbox = typeof notificationOutbox.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type PilotFeedback = typeof pilotFeedback.$inferSelect;
export type NewPilotFeedback = typeof pilotFeedback.$inferInsert;
