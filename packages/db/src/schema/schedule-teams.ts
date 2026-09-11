import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { locations, workplaces } from "./workplaces";

/**
 * A named team segment within a Location. A Schedule may belong to one team,
 * letting a single Location run several parallel schedules (for example,
 * Front of House and Back of House) in the same workweek.
 */
export const scheduleTeams = pgTable(
	"schedule_teams",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		color: text("color"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("schedule_teams_location_name_unique").on(
			table.locationId,
			table.name,
		),
	],
);

export const scheduleTeamRelations = relations(scheduleTeams, ({ one }) => ({
	workplace: one(workplaces, {
		fields: [scheduleTeams.workplaceId],
		references: [workplaces.id],
	}),
	location: one(locations, {
		fields: [scheduleTeams.locationId],
		references: [locations.id],
	}),
}));

export type ScheduleTeam = typeof scheduleTeams.$inferSelect;
export type NewScheduleTeam = typeof scheduleTeams.$inferInsert;
