import { relations } from "drizzle-orm";
import {
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { locations, positions, workplaces } from "./workplaces";

export const employmentKindEnum = pgEnum("employment_kind", [
	"manager",
	"worker",
]);

export const employmentStatusEnum = pgEnum("employment_status", [
	"active",
	"deactivated",
]);

export const employments = pgTable(
	"employments",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		profileId: uuid("profile_id").notNull(),
		kind: employmentKindEnum("kind").notNull().default("worker"),
		status: employmentStatusEnum("status").notNull().default("active"),
		hourlyWageCents: integer("hourly_wage_cents"),
		kioskPinHash: text("kiosk_pin_hash"),
		emergencyContactName: text("emergency_contact_name"),
		emergencyContactPhone: text("emergency_contact_phone"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
	},
	(table) => [
		unique("employments_workplace_profile_unique").on(
			table.workplaceId,
			table.profileId,
		),
	],
);

export const employmentLocations = pgTable(
	"employment_locations",
	{
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.employmentId, table.locationId] })],
);

export const employmentPositions = pgTable(
	"employment_positions",
	{
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		positionId: uuid("position_id")
			.notNull()
			.references(() => positions.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.employmentId, table.positionId] })],
);

export const employmentRelations = relations(employments, ({ one, many }) => ({
	workplace: one(workplaces, {
		fields: [employments.workplaceId],
		references: [workplaces.id],
	}),
	locationAccess: many(employmentLocations),
	positionAccess: many(employmentPositions),
}));

export type Employment = typeof employments.$inferSelect;
export type NewEmployment = typeof employments.$inferInsert;
