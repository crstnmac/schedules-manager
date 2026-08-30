import { relations, sql } from "drizzle-orm";
import {
	check,
	date,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";

export const unavailabilityKindEnum = pgEnum("unavailability_kind", [
	"recurring",
	"date",
]);

export const unavailability = pgTable(
	"unavailability",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		kind: unavailabilityKindEnum("kind").notNull(),
		weekday: integer("weekday"),
		specificDate: date("specific_date"),
		startMinute: integer("start_minute").notNull(),
		endMinute: integer("end_minute").notNull(),
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"unavailability_range_check",
			sql`${table.startMinute} < ${table.endMinute}`,
		),
	],
);

export const timeOffStatusEnum = pgEnum("time_off_status", [
	"pending",
	"approved",
	"declined",
]);

export const timeOffRequests = pgTable("time_off_requests", {
	id: uuid("id").defaultRandom().primaryKey(),
	employmentId: uuid("employment_id")
		.notNull()
		.references(() => employments.id, { onDelete: "cascade" }),
	startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
	reason: text("reason"),
	status: timeOffStatusEnum("status").notNull().default("pending"),
	decidedBy: uuid("decided_by"),
	decisionReason: text("decision_reason"),
	decidedAt: timestamp("decided_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const workPreferences = pgTable("work_preferences", {
	id: uuid("id").defaultRandom().primaryKey(),
	employmentId: uuid("employment_id")
		.notNull()
		.references(() => employments.id, { onDelete: "cascade" }),
	note: text("note").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const unavailabilityRelations = relations(unavailability, ({ one }) => ({
	employment: one(employments, {
		fields: [unavailability.employmentId],
		references: [employments.id],
	}),
}));

export const timeOffRequestRelations = relations(
	timeOffRequests,
	({ one }) => ({
		employment: one(employments, {
			fields: [timeOffRequests.employmentId],
			references: [employments.id],
		}),
	}),
);

export type Unavailability = typeof unavailability.$inferSelect;
export type NewUnavailability = typeof unavailability.$inferInsert;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type NewTimeOffRequest = typeof timeOffRequests.$inferInsert;
export type WorkPreference = typeof workPreferences.$inferSelect;
export type NewWorkPreference = typeof workPreferences.$inferInsert;
