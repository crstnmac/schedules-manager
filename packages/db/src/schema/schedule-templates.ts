import {
	boolean,
	integer,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { locations, positions } from "./workplaces";

export const scheduleTemplates = pgTable(
	"schedule_templates",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("schedule_templates_location_name_unique").on(
			table.locationId,
			table.name,
		),
	],
);

export const templateShifts = pgTable("template_shifts", {
	id: uuid("id").defaultRandom().primaryKey(),
	templateId: uuid("template_id")
		.notNull()
		.references(() => scheduleTemplates.id, { onDelete: "cascade" }),
	employmentId: uuid("employment_id").references(() => employments.id, {
		onDelete: "set null",
	}),
	positionId: uuid("position_id")
		.notNull()
		.references(() => positions.id, { onDelete: "restrict" }),
	weekdayOffset: smallint("weekday_offset").notNull(),
	startMinute: integer("start_minute").notNull(),
	endMinute: integer("end_minute").notNull(),
	overnight: boolean("overnight").notNull().default(false),
	note: text("note"),
});

export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;
export type NewScheduleTemplate = typeof scheduleTemplates.$inferInsert;
export type TemplateShift = typeof templateShifts.$inferSelect;
export type NewTemplateShift = typeof templateShifts.$inferInsert;
