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
import { scheduleVersions, versionShifts } from "./publication";

export const shiftAcceptanceStatusEnum = pgEnum("shift_acceptance_status", [
	"pending",
	"accepted",
	"declined",
]);

export const shiftAcceptances = pgTable(
	"shift_acceptances",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		versionId: uuid("version_id")
			.notNull()
			.references(() => scheduleVersions.id, { onDelete: "cascade" }),
		versionShiftId: uuid("version_shift_id")
			.notNull()
			.references(() => versionShifts.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		changeSummary: text("change_summary").notNull(),
		status: shiftAcceptanceStatusEnum("status").notNull().default("pending"),
		respondedAt: timestamp("responded_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("shift_acceptances_unique").on(
			table.versionId,
			table.versionShiftId,
			table.employmentId,
		),
	],
);

export const shiftAcceptanceRelations = relations(
	shiftAcceptances,
	({ one }) => ({
		version: one(scheduleVersions, {
			fields: [shiftAcceptances.versionId],
			references: [scheduleVersions.id],
		}),
		versionShift: one(versionShifts, {
			fields: [shiftAcceptances.versionShiftId],
			references: [versionShifts.id],
		}),
		employment: one(employments, {
			fields: [shiftAcceptances.employmentId],
			references: [employments.id],
		}),
	}),
);

export type ShiftAcceptance = typeof shiftAcceptances.$inferSelect;
export type NewShiftAcceptance = typeof shiftAcceptances.$inferInsert;
