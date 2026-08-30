import { relations } from "drizzle-orm";
import {
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { versionShifts } from "./publication";
import { shifts } from "./schedules";
import { locations, positions } from "./workplaces";

export const coverageRequestStatusEnum = pgEnum("coverage_request_status", [
	"pending",
	"approved",
	"declined",
]);

export const openShiftStatusEnum = pgEnum("open_shift_status", [
	"open",
	"filled",
	"closed",
]);

export const shiftReleases = pgTable("shift_releases", {
	id: uuid("id").defaultRandom().primaryKey(),
	versionShiftId: uuid("version_shift_id")
		.notNull()
		.references(() => versionShifts.id, { onDelete: "cascade" }),
	requestedBy: uuid("requested_by")
		.notNull()
		.references(() => employments.id, { onDelete: "cascade" }),
	reason: text("reason"),
	status: coverageRequestStatusEnum("status").notNull().default("pending"),
	decidedBy: uuid("decided_by"),
	decidedAt: timestamp("decided_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const openShifts = pgTable("open_shifts", {
	id: uuid("id").defaultRandom().primaryKey(),
	shiftId: uuid("shift_id")
		.notNull()
		.references(() => shifts.id, { onDelete: "cascade" }),
	locationId: uuid("location_id")
		.notNull()
		.references(() => locations.id, { onDelete: "cascade" }),
	positionId: uuid("position_id")
		.notNull()
		.references(() => positions.id, { onDelete: "cascade" }),
	releasedFrom: uuid("released_from").references(() => employments.id, {
		onDelete: "set null",
	}),
	note: text("note"),
	status: openShiftStatusEnum("status").notNull().default("open"),
	offeredAt: timestamp("offered_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const shiftPickups = pgTable(
	"shift_pickups",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		openShiftId: uuid("open_shift_id")
			.notNull()
			.references(() => openShifts.id, { onDelete: "cascade" }),
		requestedBy: uuid("requested_by")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		status: coverageRequestStatusEnum("status").notNull().default("pending"),
		decidedBy: uuid("decided_by"),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("shift_pickups_open_shift_requester_unique").on(
			table.openShiftId,
			table.requestedBy,
		),
	],
);

export const shiftReleaseRelations = relations(shiftReleases, ({ one }) => ({
	versionShift: one(versionShifts, {
		fields: [shiftReleases.versionShiftId],
		references: [versionShifts.id],
	}),
	requester: one(employments, {
		fields: [shiftReleases.requestedBy],
		references: [employments.id],
	}),
}));

export const openShiftRelations = relations(openShifts, ({ one, many }) => ({
	shift: one(shifts, {
		fields: [openShifts.shiftId],
		references: [shifts.id],
	}),
	location: one(locations, {
		fields: [openShifts.locationId],
		references: [locations.id],
	}),
	position: one(positions, {
		fields: [openShifts.positionId],
		references: [positions.id],
	}),
	pickups: many(shiftPickups),
}));

export const shiftPickupRelations = relations(shiftPickups, ({ one }) => ({
	openShift: one(openShifts, {
		fields: [shiftPickups.openShiftId],
		references: [openShifts.id],
	}),
	requester: one(employments, {
		fields: [shiftPickups.requestedBy],
		references: [employments.id],
	}),
}));

export type ShiftRelease = typeof shiftReleases.$inferSelect;
export type NewShiftRelease = typeof shiftReleases.$inferInsert;
export type OpenShift = typeof openShifts.$inferSelect;
export type NewOpenShift = typeof openShifts.$inferInsert;
export type ShiftPickup = typeof shiftPickups.$inferSelect;
export type NewShiftPickup = typeof shiftPickups.$inferInsert;
