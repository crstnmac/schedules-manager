import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { schedules, shifts } from "./schedules";

export const deliveryStatusEnum = pgEnum("delivery_status", [
	"sent",
	"delivered",
	"acknowledged",
]);

export const scheduleVersions = pgTable(
	"schedule_versions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		scheduleId: uuid("schedule_id")
			.notNull()
			.references(() => schedules.id, { onDelete: "cascade" }),
		versionNumber: integer("version_number").notNull(),
		publishedBy: uuid("published_by"),
		publishedAt: timestamp("published_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		note: text("note"),
	},
	(table) => [
		unique("schedule_versions_schedule_number_unique").on(
			table.scheduleId,
			table.versionNumber,
		),
	],
);

export const versionShifts = pgTable("version_shifts", {
	id: uuid("id").defaultRandom().primaryKey(),
	versionId: uuid("version_id")
		.notNull()
		.references(() => scheduleVersions.id, { onDelete: "cascade" }),
	shiftId: uuid("shift_id"),
	employmentId: uuid("employment_id"),
	positionId: uuid("position_id").notNull(),
	startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
	note: text("note"),
});

export const workerDeliveries = pgTable(
	"worker_deliveries",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		versionId: uuid("version_id")
			.notNull()
			.references(() => scheduleVersions.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		status: deliveryStatusEnum("status").notNull().default("sent"),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
	},
	(table) => [
		unique("worker_deliveries_version_employment_unique").on(
			table.versionId,
			table.employmentId,
		),
		index("worker_deliveries_employment_idx").on(table.employmentId),
	],
);

export const scheduleVersionRelations = relations(
	scheduleVersions,
	({ one, many }) => ({
		schedule: one(schedules, {
			fields: [scheduleVersions.scheduleId],
			references: [schedules.id],
		}),
		shifts: many(versionShifts),
		deliveries: many(workerDeliveries),
	}),
);

export const versionShiftRelations = relations(versionShifts, ({ one }) => ({
	version: one(scheduleVersions, {
		fields: [versionShifts.versionId],
		references: [scheduleVersions.id],
	}),
	draftShift: one(shifts, {
		fields: [versionShifts.shiftId],
		references: [shifts.id],
	}),
}));

export type ScheduleVersion = typeof scheduleVersions.$inferSelect;
export type NewScheduleVersion = typeof scheduleVersions.$inferInsert;
export type VersionShift = typeof versionShifts.$inferSelect;
export type NewVersionShift = typeof versionShifts.$inferInsert;
export type WorkerDelivery = typeof workerDeliveries.$inferSelect;
export type NewWorkerDelivery = typeof workerDeliveries.$inferInsert;
