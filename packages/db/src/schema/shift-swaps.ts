import { index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { profiles } from "./profiles";
import { versionShifts } from "./publication";

export const swapStatusEnum = pgEnum("swap_status", [
	"pending_counterpart",
	"pending_manager",
	"approved",
	"declined_by_counterpart",
	"declined_by_manager",
	"cancelled",
]);

export const shiftSwaps = pgTable(
	"shift_swaps",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		requesterEmploymentId: uuid("requester_employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		requesterShiftId: uuid("requester_shift_id")
			.notNull()
			.references(() => versionShifts.id, { onDelete: "cascade" }),
		counterpartEmploymentId: uuid("counterpart_employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		counterpartShiftId: uuid("counterpart_shift_id")
			.notNull()
			.references(() => versionShifts.id, { onDelete: "cascade" }),
		status: swapStatusEnum("status").notNull().default("pending_counterpart"),
		requestedAt: timestamp("requested_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		respondedAt: timestamp("responded_at", { withTimezone: true }),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		decidedByProfileId: uuid("decided_by_profile_id").references(
			() => profiles.id,
			{ onDelete: "set null" },
		),
	},
	(table) => [
		index("shift_swaps_requester_idx").on(table.requesterEmploymentId),
		index("shift_swaps_counterpart_idx").on(table.counterpartEmploymentId),
	],
);

export type ShiftSwap = typeof shiftSwaps.$inferSelect;
export type NewShiftSwap = typeof shiftSwaps.$inferInsert;
