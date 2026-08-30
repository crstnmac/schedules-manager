import { relations, sql } from "drizzle-orm";
import {
	check,
	date,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { locations, positions } from "./workplaces";

export const schedules = pgTable(
	"schedules",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		weekStartDate: date("week_start_date").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("schedules_location_week_unique").on(
			table.locationId,
			table.weekStartDate,
		),
	],
);

export const shifts = pgTable(
	"shifts",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		scheduleId: uuid("schedule_id")
			.notNull()
			.references(() => schedules.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id").references(() => employments.id, {
			onDelete: "set null",
		}),
		positionId: uuid("position_id")
			.notNull()
			.references(() => positions.id, { onDelete: "restrict" }),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		note: text("note"),
		unavailabilityOverrideReason: text("unavailability_override_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check("shifts_range_check", sql`${table.startsAt} < ${table.endsAt}`),
	],
);

export const scheduleRelations = relations(schedules, ({ one, many }) => ({
	location: one(locations, {
		fields: [schedules.locationId],
		references: [locations.id],
	}),
	shifts: many(shifts),
}));

export const shiftRelations = relations(shifts, ({ one }) => ({
	schedule: one(schedules, {
		fields: [shifts.scheduleId],
		references: [schedules.id],
	}),
	employment: one(employments, {
		fields: [shifts.employmentId],
		references: [employments.id],
	}),
	position: one(positions, {
		fields: [shifts.positionId],
		references: [positions.id],
	}),
}));

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
