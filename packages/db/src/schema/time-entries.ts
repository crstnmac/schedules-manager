import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { profiles } from "./profiles";
import { versionShifts } from "./publication";

export const timesheetApprovalEnum = pgEnum("timesheet_approval_status", [
	"pending",
	"approved",
	"declined",
]);

export const timeEntries = pgTable(
	"time_entries",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		versionShiftId: uuid("version_shift_id")
			.notNull()
			.references(() => versionShifts.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		clockedInAt: timestamp("clocked_in_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		clockedOutAt: timestamp("clocked_out_at", { withTimezone: true }),
		/** Set when the system closed a forgotten open punch after shift end + grace. */
		autoClosedAt: timestamp("auto_closed_at", { withTimezone: true }),
		approvalStatus: timesheetApprovalEnum("approval_status")
			.notNull()
			.default("pending"),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		approvedByProfileId: uuid("approved_by_profile_id").references(
			() => profiles.id,
			{ onDelete: "set null" },
		),
		editedAt: timestamp("edited_at", { withTimezone: true }),
		editedByProfileId: uuid("edited_by_profile_id").references(
			() => profiles.id,
			{ onDelete: "set null" },
		),
		editReason: text("edit_reason"),
		workerNote: text("worker_note"),
	},
	(table) => [
		unique("time_entries_version_shift_unique").on(table.versionShiftId),
		index("time_entries_employment_idx").on(table.employmentId),
		index("time_entries_open_idx").on(table.clockedOutAt),
	],
);

export const timeEntryBreaks = pgTable(
	"time_entry_breaks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		timeEntryId: uuid("time_entry_id")
			.notNull()
			.references(() => timeEntries.id, { onDelete: "cascade" }),
		startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
		endedAt: timestamp("ended_at", { withTimezone: true }),
	},
	(table) => [index("time_entry_breaks_entry_idx").on(table.timeEntryId)],
);

export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type TimeEntryBreak = typeof timeEntryBreaks.$inferSelect;
export type NewTimeEntryBreak = typeof timeEntryBreaks.$inferInsert;
