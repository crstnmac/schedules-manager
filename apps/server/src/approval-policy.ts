import {
	type ApprovalRequestType,
	approvalPolicyRules,
	db,
	schedules,
} from "@SchedulesManager/db";
import { and, desc, eq, isNotNull, lt } from "drizzle-orm";

/** The full set of approval-governed request types, in display order. */
export const APPROVAL_REQUEST_TYPES: readonly ApprovalRequestType[] = [
	"time_off",
	"unavailability",
	"shift_release",
	"shift_pickup",
	"shift_swap",
] as const;

export type ApprovalPolicyRules = Record<ApprovalRequestType, boolean>;

export interface ApprovalPolicyRuleDto {
	requestType: ApprovalRequestType;
	requiresApproval: boolean;
}

export interface ApprovalPolicyGroupDto {
	id: string;
	name: string;
	description: string | null;
	rules: ApprovalPolicyRuleDto[];
}

/** Missing rules mean a request still needs approval. */
export function allApprovalRequired(): ApprovalPolicyRules {
	return {
		time_off: true,
		unavailability: true,
		shift_release: true,
		shift_pickup: true,
		shift_swap: true,
	};
}

/** Normalizes stored rules into a complete map, defaulting absent types to true. */
export function normalizeApprovalRules(
	rules: Array<{ requestType: ApprovalRequestType; requiresApproval: boolean }>,
): ApprovalPolicyRules {
	const effective = allApprovalRequired();
	for (const rule of rules) {
		effective[rule.requestType] = rule.requiresApproval;
	}
	return effective;
}

/**
 * Effective approval rules for one schedule:
 * 1. the schedule's own policy group, if attached;
 * 2. otherwise the most recent earlier week at the same location with a group;
 * 3. otherwise every request type requires approval.
 *
 * This lets a workplace set a policy once and have later weeks inherit it until
 * a week pins its own group.
 */
export async function resolveScheduleApprovalPolicy(
	scheduleId: string,
): Promise<ApprovalPolicyRules> {
	const [schedule] = await db
		.select()
		.from(schedules)
		.where(eq(schedules.id, scheduleId))
		.limit(1);
	if (!schedule) return allApprovalRequired();

	let groupId = schedule.policyGroupId;
	if (!groupId) {
		const [prior] = await db
			.select({ policyGroupId: schedules.policyGroupId })
			.from(schedules)
			.where(
				and(
					eq(schedules.locationId, schedule.locationId),
					isNotNull(schedules.policyGroupId),
					lt(schedules.weekStartDate, schedule.weekStartDate),
				),
			)
			.orderBy(desc(schedules.weekStartDate))
			.limit(1);
		groupId = prior?.policyGroupId ?? null;
	}
	if (!groupId) return allApprovalRequired();

	const rules = await db
		.select({
			requestType: approvalPolicyRules.requestType,
			requiresApproval: approvalPolicyRules.requiresApproval,
		})
		.from(approvalPolicyRules)
		.where(eq(approvalPolicyRules.groupId, groupId));
	return normalizeApprovalRules(rules);
}
