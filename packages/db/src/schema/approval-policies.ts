import { relations } from "drizzle-orm";
import {
	boolean,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { workplaces } from "./workplaces";

/**
 * Request types governed by an approval policy group. Each schedule may
 * reference a group; a group holds one rule per request type.
 */
export const approvalRequestTypeEnum = pgEnum("approval_request_type", [
	"time_off",
	"unavailability",
	"shift_release",
	"shift_pickup",
	"shift_swap",
]);

export const approvalPolicyGroups = pgTable(
	"approval_policy_groups",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("approval_policy_groups_workplace_name_unique").on(
			table.workplaceId,
			table.name,
		),
	],
);

export const approvalPolicyRules = pgTable(
	"approval_policy_rules",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => approvalPolicyGroups.id, { onDelete: "cascade" }),
		requestType: approvalRequestTypeEnum("request_type").notNull(),
		requiresApproval: boolean("requires_approval").notNull().default(true),
	},
	(table) => [
		unique("approval_policy_rules_group_type_unique").on(
			table.groupId,
			table.requestType,
		),
	],
);

export const approvalPolicyGroupRelations = relations(
	approvalPolicyGroups,
	({ one, many }) => ({
		workplace: one(workplaces, {
			fields: [approvalPolicyGroups.workplaceId],
			references: [workplaces.id],
		}),
		rules: many(approvalPolicyRules),
	}),
);

export const approvalPolicyRuleRelations = relations(
	approvalPolicyRules,
	({ one }) => ({
		group: one(approvalPolicyGroups, {
			fields: [approvalPolicyRules.groupId],
			references: [approvalPolicyGroups.id],
		}),
	}),
);

export type ApprovalPolicyGroup = typeof approvalPolicyGroups.$inferSelect;
export type NewApprovalPolicyGroup = typeof approvalPolicyGroups.$inferInsert;
export type ApprovalPolicyRule = typeof approvalPolicyRules.$inferSelect;
export type NewApprovalPolicyRule = typeof approvalPolicyRules.$inferInsert;
export type ApprovalRequestType =
	(typeof approvalRequestTypeEnum.enumValues)[number];
