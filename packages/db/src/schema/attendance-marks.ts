import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { profiles } from "./profiles";
import { versionShifts } from "./publication";

export const attendanceMarkKindEnum = pgEnum("attendance_mark_kind", [
	"late",
	"no_show",
	"sick",
]);

export const attendanceMarks = pgTable(
	"attendance_marks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		versionShiftId: uuid("version_shift_id")
			.notNull()
			.references(() => versionShifts.id, { onDelete: "cascade" }),
		kind: attendanceMarkKindEnum("kind").notNull(),
		markedByProfileId: uuid("marked_by_profile_id")
			.notNull()
			.references(() => profiles.id, { onDelete: "restrict" }),
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("attendance_marks_version_shift_unique").on(table.versionShiftId),
	],
);

export type AttendanceMark = typeof attendanceMarks.$inferSelect;
export type NewAttendanceMark = typeof attendanceMarks.$inferInsert;
