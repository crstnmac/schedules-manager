import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { versionShifts } from "./publication";

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
	},
	(table) => [
		unique("time_entries_version_shift_unique").on(table.versionShiftId),
		index("time_entries_employment_idx").on(table.employmentId),
	],
);

export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
