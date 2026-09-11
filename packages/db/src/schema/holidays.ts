import { relations } from "drizzle-orm";
import {
	boolean,
	date,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { locations, workplaces } from "./workplaces";

export const holidays = pgTable(
	"holidays",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		locationId: uuid("location_id").references(() => locations.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		/** Calendar date. When recurring, only the month/day is significant. */
		date: date("date").notNull(),
		recurring: boolean("recurring").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("holidays_workplace_date_name_unique").on(
			table.workplaceId,
			table.date,
			table.name,
		),
	],
);

export const holidayRelations = relations(holidays, ({ one }) => ({
	workplace: one(workplaces, {
		fields: [holidays.workplaceId],
		references: [workplaces.id],
	}),
	location: one(locations, {
		fields: [holidays.locationId],
		references: [locations.id],
	}),
}));

export type Holiday = typeof holidays.$inferSelect;
export type NewHoliday = typeof holidays.$inferInsert;
