import {
	date,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { profiles } from "./profiles";
import { versionShifts } from "./publication";
import { shifts } from "./schedules";
import { locations, positions, workplaces } from "./workplaces";

export const workerGroups = pgTable(
	"worker_groups",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("worker_groups_workplace_name_unique").on(
			table.workplaceId,
			table.name,
		),
	],
);

export const employmentGroups = pgTable(
	"employment_groups",
	{
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		groupId: uuid("group_id")
			.notNull()
			.references(() => workerGroups.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.employmentId, table.groupId] })],
);

export const shiftTags = pgTable(
	"shift_tags",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("shift_tags_workplace_name_unique").on(table.workplaceId, table.name),
	],
);

export const shiftTagAssignments = pgTable(
	"shift_tag_assignments",
	{
		shiftId: uuid("shift_id")
			.notNull()
			.references(() => shifts.id, { onDelete: "cascade" }),
		tagId: uuid("tag_id")
			.notNull()
			.references(() => shiftTags.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.shiftId, table.tagId] })],
);

export const timeBlocks = pgTable(
	"time_blocks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		startMinute: integer("start_minute").notNull(),
		endMinute: integer("end_minute").notNull(),
	},
	(table) => [
		unique("time_blocks_location_name_unique").on(table.locationId, table.name),
	],
);

export const dayParts = pgTable(
	"day_parts",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		startMinute: integer("start_minute").notNull(),
		endMinute: integer("end_minute").notNull(),
	},
	(table) => [
		unique("day_parts_location_name_unique").on(table.locationId, table.name),
	],
);

export const shiftTemplates = pgTable(
	"shift_templates",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		positionId: uuid("position_id")
			.notNull()
			.references(() => positions.id, { onDelete: "restrict" }),
		startMinute: integer("start_minute").notNull(),
		endMinute: integer("end_minute").notNull(),
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("shift_templates_location_name_unique").on(
			table.locationId,
			table.name,
		),
	],
);

export const locationSales = pgTable(
	"location_sales",
	{
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		saleDate: date("sale_date").notNull(),
		amountCents: integer("amount_cents").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.locationId, table.saleDate] })],
);

export const shiftTasks = pgTable("shift_tasks", {
	id: uuid("id").defaultRandom().primaryKey(),
	shiftId: uuid("shift_id")
		.notNull()
		.references(() => shifts.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	sortOrder: smallint("sort_order").notNull().default(0),
});

export const shiftTaskCompletions = pgTable(
	"shift_task_completions",
	{
		taskId: uuid("task_id")
			.notNull()
			.references(() => shiftTasks.id, { onDelete: "cascade" }),
		versionShiftId: uuid("version_shift_id")
			.notNull()
			.references(() => versionShifts.id, { onDelete: "cascade" }),
		completedByProfileId: uuid("completed_by_profile_id")
			.notNull()
			.references(() => profiles.id, { onDelete: "restrict" }),
		completedAt: timestamp("completed_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.taskId, table.versionShiftId] })],
);

export const announcements = pgTable("announcements", {
	id: uuid("id").defaultRandom().primaryKey(),
	workplaceId: uuid("workplace_id")
		.notNull()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	authorProfileId: uuid("author_profile_id")
		.notNull()
		.references(() => profiles.id, { onDelete: "restrict" }),
	title: text("title").notNull(),
	body: text("body").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const conversationKindEnum = pgEnum("conversation_kind", [
	"workplace",
	"direct",
]);

export const conversations = pgTable("conversations", {
	id: uuid("id").defaultRandom().primaryKey(),
	workplaceId: uuid("workplace_id")
		.notNull()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	kind: conversationKindEnum("kind").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const conversationMembers = pgTable(
	"conversation_members",
	{
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.conversationId, table.employmentId] }),
	],
);

export const workplaceMessages = pgTable("workplace_messages", {
	id: uuid("id").defaultRandom().primaryKey(),
	conversationId: uuid("conversation_id")
		.notNull()
		.references(() => conversations.id, { onDelete: "cascade" }),
	authorEmploymentId: uuid("author_employment_id")
		.notNull()
		.references(() => employments.id, { onDelete: "cascade" }),
	body: text("body").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const employmentDocuments = pgTable("employment_documents", {
	id: uuid("id").defaultRandom().primaryKey(),
	employmentId: uuid("employment_id")
		.notNull()
		.references(() => employments.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	url: text("url"),
	note: text("note"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export type WorkerGroup = typeof workerGroups.$inferSelect;
export type ShiftTag = typeof shiftTags.$inferSelect;
export type TimeBlock = typeof timeBlocks.$inferSelect;
export type DayPart = typeof dayParts.$inferSelect;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type LocationSale = typeof locationSales.$inferSelect;
export type ShiftTask = typeof shiftTasks.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type WorkplaceMessage = typeof workplaceMessages.$inferSelect;
export type EmploymentDocument = typeof employmentDocuments.$inferSelect;
