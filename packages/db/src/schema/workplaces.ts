import {
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

export const workplaces = pgTable("workplaces", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	noticeWindowHours: integer("notice_window_hours").notNull().default(48),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const locations = pgTable(
	"locations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		timezone: text("timezone").notNull().default("America/Chicago"),
		addressLine: text("address_line"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("locations_workplace_name_unique").on(table.workplaceId, table.name),
	],
);

export const positions = pgTable(
	"positions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("positions_workplace_name_unique").on(table.workplaceId, table.name),
	],
);

export type Workplace = typeof workplaces.$inferSelect;
export type NewWorkplace = typeof workplaces.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
