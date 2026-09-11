import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { locations, positions, workplaces } from "./workplaces";

/**
 * A Shift Pattern is a reusable, multi-week rotation of shift skeletons for a
 * Location. A Manager assigns members to a pattern and can project it across
 * one or more future weeks before persisting it into a draft.
 */
export const shiftPatterns = pgTable(
	"shift_patterns",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		/** Null means the pattern applies to any Location in the Workplace. */
		locationId: uuid("location_id").references(() => locations.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		description: text("description"),
		/** Length of the rotation cycle in weeks (1-8). */
		cycleWeeks: smallint("cycle_weeks").notNull().default(2),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("shift_patterns_workplace_name_unique").on(
			table.workplaceId,
			table.name,
		),
	],
);

export const shiftPatternShifts = pgTable("shift_pattern_shifts", {
	id: uuid("id").defaultRandom().primaryKey(),
	patternId: uuid("pattern_id")
		.notNull()
		.references(() => shiftPatterns.id, { onDelete: "cascade" }),
	/** Zero-based week within the rotation cycle. */
	weekIndex: smallint("week_index").notNull().default(0),
	/** Zero-based weekday offset from the week start. */
	weekdayOffset: smallint("weekday_offset").notNull(),
	positionId: uuid("position_id")
		.notNull()
		.references(() => positions.id, { onDelete: "restrict" }),
	startMinute: integer("start_minute").notNull(),
	endMinute: integer("end_minute").notNull(),
	overnight: boolean("overnight").notNull().default(false),
	/** Number of members required for this shift slot. */
	coverageTarget: integer("coverage_target").notNull().default(1),
	note: text("note"),
});

export const shiftPatternMembers = pgTable(
	"shift_pattern_members",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		patternId: uuid("pattern_id")
			.notNull()
			.references(() => shiftPatterns.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		/** Position in the rotation order. */
		rotationSlot: smallint("rotation_slot").notNull().default(0),
	},
	(table) => [
		unique("shift_pattern_members_pattern_employment_unique").on(
			table.patternId,
			table.employmentId,
		),
	],
);

export const shiftPatternRelations = relations(
	shiftPatterns,
	({ one, many }) => ({
		workplace: one(workplaces, {
			fields: [shiftPatterns.workplaceId],
			references: [workplaces.id],
		}),
		location: one(locations, {
			fields: [shiftPatterns.locationId],
			references: [locations.id],
		}),
		shifts: many(shiftPatternShifts),
		members: many(shiftPatternMembers),
	}),
);

export const shiftPatternShiftRelations = relations(
	shiftPatternShifts,
	({ one }) => ({
		pattern: one(shiftPatterns, {
			fields: [shiftPatternShifts.patternId],
			references: [shiftPatterns.id],
		}),
		position: one(positions, {
			fields: [shiftPatternShifts.positionId],
			references: [positions.id],
		}),
	}),
);

export const shiftPatternMemberRelations = relations(
	shiftPatternMembers,
	({ one }) => ({
		pattern: one(shiftPatterns, {
			fields: [shiftPatternMembers.patternId],
			references: [shiftPatterns.id],
		}),
		employment: one(employments, {
			fields: [shiftPatternMembers.employmentId],
			references: [employments.id],
		}),
	}),
);

export type ShiftPattern = typeof shiftPatterns.$inferSelect;
export type NewShiftPattern = typeof shiftPatterns.$inferInsert;
export type ShiftPatternShift = typeof shiftPatternShifts.$inferSelect;
export type NewShiftPatternShift = typeof shiftPatternShifts.$inferInsert;
export type ShiftPatternMember = typeof shiftPatternMembers.$inferSelect;
export type NewShiftPatternMember = typeof shiftPatternMembers.$inferInsert;
