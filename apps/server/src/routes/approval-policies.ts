import {
	type ApprovalRequestType,
	approvalPolicyGroups,
	approvalPolicyRules,
	db,
	locations,
	schedules,
} from "@SchedulesManager/db";
import { and, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	APPROVAL_REQUEST_TYPES,
	type ApprovalPolicyGroupDto,
	normalizeApprovalRules,
} from "../approval-policy";
import { requirePrivilege, requireSession } from "../context";
import { BadRequestError, NotFoundError } from "../errors";

const uuid = t.String({ format: "uuid" });
const dateKey = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const requestTypeSchema = t.Union([
	t.Literal("time_off"),
	t.Literal("unavailability"),
	t.Literal("shift_release"),
	t.Literal("shift_pickup"),
	t.Literal("shift_swap"),
]);

const ruleInputSchema = t.Object({
	requestType: requestTypeSchema,
	requiresApproval: t.Boolean(),
});

type RuleInput = {
	requestType: ApprovalRequestType;
	requiresApproval: boolean;
};

function rulesForGroup(
	groupId: string,
	stored: Array<{
		groupId: string;
		requestType: ApprovalRequestType;
		requiresApproval: boolean;
	}>,
): ApprovalPolicyGroupDto["rules"] {
	const byType = new Map(
		stored
			.filter((rule) => rule.groupId === groupId)
			.map((rule) => [rule.requestType, rule.requiresApproval] as const),
	);
	return APPROVAL_REQUEST_TYPES.map((requestType) => ({
		requestType,
		requiresApproval: byType.get(requestType) ?? true,
	}));
}

/** Serializes a stored group into a DTO with every request type represented. */
async function loadGroupDto(groupId: string): Promise<ApprovalPolicyGroupDto> {
	const [group] = await db
		.select()
		.from(approvalPolicyGroups)
		.where(eq(approvalPolicyGroups.id, groupId))
		.limit(1);
	if (!group) throw new NotFoundError("Approval policy group not found");

	const ruleRows = await db
		.select({
			groupId: approvalPolicyRules.groupId,
			requestType: approvalPolicyRules.requestType,
			requiresApproval: approvalPolicyRules.requiresApproval,
		})
		.from(approvalPolicyRules)
		.where(eq(approvalPolicyRules.groupId, groupId));

	return {
		id: group.id,
		name: group.name,
		description: group.description,
		rules: rulesForGroup(groupId, ruleRows),
	};
}

/** Replaces the rule set for a group with the caller-provided rules. */
async function replaceRules(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	groupId: string,
	rules: RuleInput[],
) {
	await tx
		.delete(approvalPolicyRules)
		.where(eq(approvalPolicyRules.groupId, groupId));
	const normalized = normalizeApprovalRules(rules);
	const values = APPROVAL_REQUEST_TYPES.map((requestType) => ({
		groupId,
		requestType,
		requiresApproval: normalized[requestType],
	}));
	if (values.length > 0) {
		await tx.insert(approvalPolicyRules).values(values);
	}
}

export const approvalPolicyRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Approval Policies"],
})
	.get(
		"/workplaces/:workplaceId/approval-policy-groups",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.view");

			const groups = await db
				.select()
				.from(approvalPolicyGroups)
				.where(eq(approvalPolicyGroups.workplaceId, params.workplaceId))
				.orderBy(approvalPolicyGroups.name);
			if (groups.length === 0) return { groups: [] };

			const ruleRows = await db
				.select({
					groupId: approvalPolicyRules.groupId,
					requestType: approvalPolicyRules.requestType,
					requiresApproval: approvalPolicyRules.requiresApproval,
				})
				.from(approvalPolicyRules)
				.where(
					inArray(
						approvalPolicyRules.groupId,
						groups.map((group) => group.id),
					),
				);

			return {
				groups: groups.map((group) => ({
					id: group.id,
					name: group.name,
					description: group.description,
					rules: rulesForGroup(group.id, ruleRows),
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "List Approval Policy Groups with their rules (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/approval-policy-groups",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "policies.manage");

			const groupId = await db.transaction(async (tx) => {
				const [group] = await tx
					.insert(approvalPolicyGroups)
					.values({
						workplaceId: params.workplaceId,
						name: body.name.trim(),
						description: body.description?.trim() || null,
					})
					.onConflictDoNothing({
						target: [
							approvalPolicyGroups.workplaceId,
							approvalPolicyGroups.name,
						],
					})
					.returning();
				if (!group) {
					throw new BadRequestError(
						"An approval policy group with that name already exists",
					);
				}
				await replaceRules(tx, group.id, body.rules ?? []);
				return group.id;
			});

			return { group: await loadGroupDto(groupId) };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				description: t.Optional(t.String({ maxLength: 300 })),
				rules: t.Optional(t.Array(ruleInputSchema)),
			}),
			detail: {
				summary: "Create an Approval Policy Group (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/workplaces/:workplaceId/approval-policy-groups/:groupId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "policies.manage");

			await db.transaction(async (tx) => {
				const conflicting = await tx
					.select({ id: approvalPolicyGroups.id })
					.from(approvalPolicyGroups)
					.where(
						and(
							eq(approvalPolicyGroups.workplaceId, params.workplaceId),
							eq(approvalPolicyGroups.name, body.name.trim()),
						),
					)
					.limit(1);
				if (conflicting[0] && conflicting[0].id !== params.groupId) {
					throw new BadRequestError(
						"An approval policy group with that name already exists",
					);
				}
				const updated = await tx
					.update(approvalPolicyGroups)
					.set({
						name: body.name.trim(),
						description: body.description?.trim() || null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(approvalPolicyGroups.id, params.groupId),
							eq(approvalPolicyGroups.workplaceId, params.workplaceId),
						),
					)
					.returning({ id: approvalPolicyGroups.id });
				if (updated.length === 0) {
					throw new NotFoundError("Approval policy group not found");
				}
				await replaceRules(tx, params.groupId, body.rules ?? []);
			});

			return { group: await loadGroupDto(params.groupId) };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, groupId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				description: t.Optional(t.String({ maxLength: 300 })),
				rules: t.Optional(t.Array(ruleInputSchema)),
			}),
			detail: {
				summary: "Replace an Approval Policy Group and its rules (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/approval-policy-groups/:groupId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "policies.manage");

			const deleted = await db
				.delete(approvalPolicyGroups)
				.where(
					and(
						eq(approvalPolicyGroups.id, params.groupId),
						eq(approvalPolicyGroups.workplaceId, params.workplaceId),
					),
				)
				.returning({ id: approvalPolicyGroups.id });
			if (deleted.length === 0) {
				throw new NotFoundError("Approval policy group not found");
			}
			// Schedules referencing the group fall back to inherited/default rules
			// because the FK is ON DELETE SET NULL.
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, groupId: uuid }),
			detail: {
				summary: "Delete an Approval Policy Group (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/locations/:locationId/schedules/:weekStart/policy-group",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requirePrivilege(
				profile.id,
				location.workplaceId,
				"policies.manage",
			);

			const [schedule] = await db
				.select()
				.from(schedules)
				.where(
					and(
						eq(schedules.locationId, params.locationId),
						eq(schedules.weekStartDate, params.weekStart),
					),
				)
				.limit(1);
			if (!schedule) {
				throw new NotFoundError("No Schedule exists for that week");
			}

			if (body.policyGroupId !== null) {
				const [group] = await db
					.select({ id: approvalPolicyGroups.id })
					.from(approvalPolicyGroups)
					.where(
						and(
							eq(approvalPolicyGroups.id, body.policyGroupId),
							eq(approvalPolicyGroups.workplaceId, location.workplaceId),
						),
					)
					.limit(1);
				if (!group) {
					throw new BadRequestError(
						"That Approval Policy Group is not in this Workplace",
					);
				}
			}

			await db
				.update(schedules)
				.set({ policyGroupId: body.policyGroupId, updatedAt: new Date() })
				.where(eq(schedules.id, schedule.id));

			return {
				schedule: {
					id: schedule.id,
					locationId: schedule.locationId,
					weekStartDate: schedule.weekStartDate,
					policyGroupId: body.policyGroupId,
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ locationId: uuid, weekStart: dateKey }),
			body: t.Object({
				policyGroupId: t.Union([uuid, t.Null()]),
			}),
			detail: {
				summary:
					"Attach an Approval Policy Group to one Schedule week, or clear it (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
