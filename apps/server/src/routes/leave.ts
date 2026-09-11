import {
	calendarFeedTokens,
	db,
	employments,
	leaveApprovalChains,
	leaveApprovalDelegations,
	leaveApprovalSteps,
	leaveBalanceTransfers,
	leaveEncashments,
	leaveLedgerEntries,
	leavePolicies,
	leaveRequestDocuments,
	leaveTypes,
	profiles,
	ptoBalances,
	timeOffRequests,
} from "@SchedulesManager/db";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	sql,
} from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	requirePrivilege,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { csvAttachment } from "../csv-import";
import {
	BadRequestError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
} from "../errors";
import { leaveYearForDate, leaveYearRange } from "../leave";
import {
	leaveForecast,
	runLeaveAccruals,
	runLeaveCarryForward,
} from "../leave-accrual";
import { buildLeaveCalendarFeed } from "../leave-calendar";
import {
	LEAVE_DOCUMENT_MAX_BYTES,
	removeLeaveDocument,
	resolveLeaveDocumentPath,
	storeLeaveDocument,
} from "../leave-documents";
import {
	importLeaveBalances,
	importLeaveRecords,
	LEAVE_BALANCES_TEMPLATE,
	LEAVE_RECORDS_TEMPLATE,
} from "../leave-import";
import { applyLeaveLedger } from "../leave-ledger";
import { notifyEmployments, writeAudit } from "../notify";
import { firstRow } from "../rows";

const uuid = t.String({ format: "uuid" });
const dateSchema = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const monthDaySchema = t.String({ pattern: "^\\d{2}-\\d{2}$" });

const accrualMethodSchema = t.Union([
	t.Literal("none"),
	t.Literal("weekly"),
	t.Literal("biweekly"),
	t.Literal("semimonthly"),
	t.Literal("monthly"),
	t.Literal("annual"),
	t.Literal("per_hour_worked"),
]);

const approverKindSchema = t.Union([
	t.Literal("workplace_managers"),
	t.Literal("specific_employment"),
	t.Literal("privilege"),
]);

const policyBody = t.Object({
	accrualMethod: t.Optional(accrualMethodSchema),
	accrualMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 100_000 })),
	accrualDay: t.Optional(t.Integer({ minimum: 1, maximum: 28 })),
	accrualWeekday: t.Optional(t.Integer({ minimum: 0, maximum: 6 })),
	annualAccrualMonthDay: t.Optional(t.Union([monthDaySchema, t.Null()])),
	accrualPerHoursWorked: t.Optional(t.Integer({ minimum: 1, maximum: 10_000 })),
	prorateOnJoin: t.Optional(t.Boolean()),
	maxBalanceMinutes: t.Optional(
		t.Union([t.Integer({ minimum: 0, maximum: 2_000_000 }), t.Null()]),
	),
	carryForwardEnabled: t.Optional(t.Boolean()),
	maxCarryForwardMinutes: t.Optional(
		t.Union([t.Integer({ minimum: 0, maximum: 2_000_000 }), t.Null()]),
	),
	carryForwardExpiryMonths: t.Optional(
		t.Union([t.Integer({ minimum: 0, maximum: 60 }), t.Null()]),
	),
	allowNegative: t.Optional(t.Boolean()),
	maxNegativeMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 100_000 })),
	chargeWorkingDaysOnly: t.Optional(t.Boolean()),
	minServiceDays: t.Optional(t.Integer({ minimum: 0, maximum: 3650 })),
	noticeDays: t.Optional(t.Integer({ minimum: 0, maximum: 365 })),
	maxConsecutiveDays: t.Optional(
		t.Union([t.Integer({ minimum: 0, maximum: 365 }), t.Null()]),
	),
	documentRequiredAfterDays: t.Optional(
		t.Union([t.Integer({ minimum: 0, maximum: 365 }), t.Null()]),
	),
	encashmentEnabled: t.Optional(t.Boolean()),
	maxEncashmentMinutesPerYear: t.Optional(
		t.Union([t.Integer({ minimum: 0, maximum: 2_000_000 }), t.Null()]),
	),
	allowPartialDays: t.Optional(t.Boolean()),
	leaveYearStartMonthDay: t.Optional(monthDaySchema),
});

const chainStepBody = t.Object({
	approverKind: approverKindSchema,
	approverEmploymentId: t.Optional(t.Union([uuid, t.Null()])),
	approverPrivilege: t.Optional(
		t.Union([t.String({ maxLength: 60 }), t.Null()]),
	),
	escalateAfterHours: t.Optional(
		t.Union([t.Integer({ minimum: 0, maximum: 720 }), t.Null()]),
	),
	escalationKind: t.Optional(t.Union([approverKindSchema, t.Null()])),
	escalationEmploymentId: t.Optional(t.Union([uuid, t.Null()])),
});

const PRIVILEGES = [
	"schedule.view",
	"schedule.manage",
	"schedule.publish",
	"approvals.review",
	"policies.manage",
	"reports.view",
	"workers.manage",
	"settings.manage",
	"integrations.manage",
] as const;

function csvEscape(value: string) {
	if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
	return value;
}

async function loadEmploymentRows(workplaceId: string) {
	return db
		.select({
			id: employments.id,
			profileId: employments.profileId,
			kind: employments.kind,
			email: profiles.email,
			fullName: profiles.fullName,
			hourlyWageCents: employments.hourlyWageCents,
			joinedAt: employments.joinedAt,
			createdAt: employments.createdAt,
		})
		.from(employments)
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				eq(employments.status, "active"),
			),
		);
}

async function assertEmploymentInWorkplace(
	workplaceId: string,
	employmentId: string,
) {
	const [row] = await db
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.id, employmentId),
				eq(employments.workplaceId, workplaceId),
				eq(employments.status, "active"),
			),
		)
		.limit(1);
	if (!row) throw new NotFoundError("Employment not found");
}

async function assertLeaveTypesInWorkplace(
	workplaceId: string,
	leaveTypeIds: string[],
) {
	if (leaveTypeIds.length === 0) return;
	const rows = await db
		.select({ id: leaveTypes.id })
		.from(leaveTypes)
		.where(
			and(
				eq(leaveTypes.workplaceId, workplaceId),
				inArray(leaveTypes.id, leaveTypeIds),
			),
		);
	if (rows.length !== new Set(leaveTypeIds).size) {
		throw new NotFoundError("Leave type not found");
	}
}

async function canViewEmployment(
	profileId: string,
	workplaceId: string,
	employmentId: string,
): Promise<boolean> {
	const member = await requireWorkplaceMember(profileId, workplaceId);
	if (member.id === employmentId) return true;
	if (member.kind !== "manager" && member.kind !== "viewer") return false;
	try {
		await requirePrivilege(profileId, workplaceId, "approvals.review");
		return true;
	} catch {
		return false;
	}
}

export const leaveRoutes = new Elysia({ prefix: "/v1", tags: ["Leave"] })
	.get(
		"/workplaces/:workplaceId/leave-policies",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const [types, policies] = await Promise.all([
				db
					.select()
					.from(leaveTypes)
					.where(eq(leaveTypes.workplaceId, params.workplaceId)),
				db
					.select()
					.from(leavePolicies)
					.where(eq(leavePolicies.workplaceId, params.workplaceId)),
			]);
			return {
				policies: policies.map((policy) => ({
					...policy,
					leaveTypeName:
						types.find((type) => type.id === policy.leaveTypeId)?.name ?? "",
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.put(
		"/workplaces/:workplaceId/leave-types/:leaveTypeId/policy",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			await assertLeaveTypesInWorkplace(params.workplaceId, [
				params.leaveTypeId,
			]);
			const [existing] = await db
				.select()
				.from(leavePolicies)
				.where(eq(leavePolicies.leaveTypeId, params.leaveTypeId))
				.limit(1);
			const base = existing ?? {
				leaveTypeId: params.leaveTypeId,
				workplaceId: params.workplaceId,
				accrualMethod: "none" as const,
				accrualMinutes: 0,
				accrualDay: 1,
				accrualWeekday: 0,
				annualAccrualMonthDay: null,
				accrualPerHoursWorked: 40,
				prorateOnJoin: true,
				maxBalanceMinutes: null,
				carryForwardEnabled: false,
				maxCarryForwardMinutes: null,
				carryForwardExpiryMonths: null,
				allowNegative: false,
				maxNegativeMinutes: 0,
				chargeWorkingDaysOnly: true,
				minServiceDays: 0,
				noticeDays: 0,
				maxConsecutiveDays: null,
				documentRequiredAfterDays: null,
				encashmentEnabled: false,
				maxEncashmentMinutesPerYear: null,
				allowPartialDays: true,
				leaveYearStartMonthDay: "01-01",
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const next = {
				...base,
				...Object.fromEntries(
					Object.entries(body).filter(([, value]) => value !== undefined),
				),
			} as typeof base;
			if (
				next.accrualMethod !== "none" &&
				next.accrualMethod !== "per_hour_worked"
			) {
				if (next.accrualMinutes <= 0) {
					throw new BadRequestError("Accrual amount must be greater than zero");
				}
			}
			if (next.accrualMethod === "annual" && !next.annualAccrualMonthDay) {
				next.annualAccrualMonthDay = next.leaveYearStartMonthDay;
			}
			if (next.allowNegative === false) next.maxNegativeMinutes = 0;
			const updated = firstRow(
				await db
					.insert(leavePolicies)
					.values(next)
					.onConflictDoUpdate({
						target: leavePolicies.leaveTypeId,
						set: {
							accrualMethod: next.accrualMethod,
							accrualMinutes: next.accrualMinutes,
							accrualDay: next.accrualDay,
							accrualWeekday: next.accrualWeekday,
							annualAccrualMonthDay: next.annualAccrualMonthDay,
							accrualPerHoursWorked: next.accrualPerHoursWorked,
							prorateOnJoin: next.prorateOnJoin,
							maxBalanceMinutes: next.maxBalanceMinutes,
							carryForwardEnabled: next.carryForwardEnabled,
							maxCarryForwardMinutes: next.maxCarryForwardMinutes,
							carryForwardExpiryMonths: next.carryForwardExpiryMonths,
							allowNegative: next.allowNegative,
							maxNegativeMinutes: next.maxNegativeMinutes,
							chargeWorkingDaysOnly: next.chargeWorkingDaysOnly,
							minServiceDays: next.minServiceDays,
							noticeDays: next.noticeDays,
							maxConsecutiveDays: next.maxConsecutiveDays,
							documentRequiredAfterDays: next.documentRequiredAfterDays,
							encashmentEnabled: next.encashmentEnabled,
							maxEncashmentMinutesPerYear: next.maxEncashmentMinutesPerYear,
							allowPartialDays: next.allowPartialDays,
							leaveYearStartMonthDay: next.leaveYearStartMonthDay,
							updatedAt: new Date(),
						},
					})
					.returning(),
			);
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "leave_policy.updated",
				entityType: "leave_policy",
				entityId: params.leaveTypeId,
				summary: "Updated a Leave Type policy",
			});
			return { policy: updated };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, leaveTypeId: uuid }),
			body: policyBody,
		},
	)
	.get(
		"/workplaces/:workplaceId/leave-approval-chains",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const chains = await db
				.select()
				.from(leaveApprovalChains)
				.where(eq(leaveApprovalChains.workplaceId, params.workplaceId))
				.orderBy(asc(leaveApprovalChains.name));
			const steps =
				chains.length === 0
					? []
					: await db
							.select()
							.from(leaveApprovalSteps)
							.where(
								inArray(
									leaveApprovalSteps.chainId,
									chains.map((chain) => chain.id),
								),
							)
							.orderBy(asc(leaveApprovalSteps.stepOrder));
			return {
				chains: chains.map((chain) => ({
					...chain,
					steps: steps.filter((step) => step.chainId === chain.id),
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-approval-chains",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			validateSteps(body.steps);
			const created = await db.transaction(async () => {
				if (body.isDefault) {
					await db
						.update(leaveApprovalChains)
						.set({ isDefault: false })
						.where(eq(leaveApprovalChains.workplaceId, params.workplaceId));
				}
				const chain = firstRow(
					await db
						.insert(leaveApprovalChains)
						.values({
							workplaceId: params.workplaceId,
							name: body.name.trim(),
							description: body.description?.trim() || null,
							isDefault: body.isDefault ?? false,
						})
						.returning(),
				);
				await db.insert(leaveApprovalSteps).values(
					body.steps.map((step, index) => ({
						chainId: chain.id,
						stepOrder: index,
						approverKind: step.approverKind,
						approverEmploymentId: step.approverEmploymentId ?? null,
						approverPrivilege: step.approverPrivilege ?? null,
						escalateAfterHours: step.escalateAfterHours ?? null,
						escalationKind: step.escalationKind ?? null,
						escalationEmploymentId: step.escalationEmploymentId ?? null,
					})),
				);
				return chain;
			});
			await verifyStepEmployments(params.workplaceId, body.steps);
			return { chain: { id: created.id, name: created.name } };
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
				isDefault: t.Optional(t.Boolean()),
				steps: t.Array(chainStepBody, { minItems: 1, maxItems: 10 }),
			}),
		},
	)
	.put(
		"/workplaces/:workplaceId/leave-approval-chains/:chainId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			validateSteps(body.steps);
			const [existing] = await db
				.select()
				.from(leaveApprovalChains)
				.where(
					and(
						eq(leaveApprovalChains.id, params.chainId),
						eq(leaveApprovalChains.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Approval chain not found");
			await db.transaction(async () => {
				if (body.isDefault) {
					await db
						.update(leaveApprovalChains)
						.set({ isDefault: false })
						.where(eq(leaveApprovalChains.workplaceId, params.workplaceId));
				}
				await db
					.update(leaveApprovalChains)
					.set({
						name: body.name.trim(),
						description: body.description?.trim() || null,
						isDefault: body.isDefault ?? existing.isDefault,
						updatedAt: new Date(),
					})
					.where(eq(leaveApprovalChains.id, existing.id));
				await db
					.delete(leaveApprovalSteps)
					.where(eq(leaveApprovalSteps.chainId, existing.id));
				await db.insert(leaveApprovalSteps).values(
					body.steps.map((step, index) => ({
						chainId: existing.id,
						stepOrder: index,
						approverKind: step.approverKind,
						approverEmploymentId: step.approverEmploymentId ?? null,
						approverPrivilege: step.approverPrivilege ?? null,
						escalateAfterHours: step.escalateAfterHours ?? null,
						escalationKind: step.escalationKind ?? null,
						escalationEmploymentId: step.escalationEmploymentId ?? null,
					})),
				);
			});
			await verifyStepEmployments(params.workplaceId, body.steps);
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, chainId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				description: t.Optional(t.String({ maxLength: 300 })),
				isDefault: t.Optional(t.Boolean()),
				steps: t.Array(chainStepBody, { minItems: 1, maxItems: 10 }),
			}),
		},
	)
	.delete(
		"/workplaces/:workplaceId/leave-approval-chains/:chainId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const [deleted] = await db
				.delete(leaveApprovalChains)
				.where(
					and(
						eq(leaveApprovalChains.id, params.chainId),
						eq(leaveApprovalChains.workplaceId, params.workplaceId),
					),
				)
				.returning({ id: leaveApprovalChains.id });
			if (!deleted) throw new NotFoundError("Approval chain not found");
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, chainId: uuid }),
		},
	)
	.get(
		"/workplaces/:workplaceId/leave-delegations",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const canManage = member.kind === "manager" || member.kind === "viewer";
			const rows = await db
				.select({
					delegation: leaveApprovalDelegations,
					delegatorName: profiles.fullName,
					delegatorEmail: profiles.email,
				})
				.from(leaveApprovalDelegations)
				.innerJoin(
					employments,
					eq(employments.id, leaveApprovalDelegations.delegatorEmploymentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(
					and(
						eq(leaveApprovalDelegations.workplaceId, params.workplaceId),
						canManage
							? undefined
							: eq(leaveApprovalDelegations.delegateEmploymentId, member.id),
					),
				)
				.orderBy(desc(leaveApprovalDelegations.startsAt));
			return {
				delegations: rows.map((row) => ({
					id: row.delegation.id,
					delegatorEmploymentId: row.delegation.delegatorEmploymentId,
					delegateEmploymentId: row.delegation.delegateEmploymentId,
					delegatorName: row.delegatorName,
					delegatorEmail: row.delegatorEmail,
					startsAt: row.delegation.startsAt.toISOString(),
					endsAt: row.delegation.endsAt.toISOString(),
					reason: row.delegation.reason,
					revokedAt: row.delegation.revokedAt?.toISOString() ?? null,
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-delegations",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const delegatorId = body.delegatorEmploymentId ?? member.id;
			if (delegatorId !== member.id) {
				await requirePrivilege(
					profile.id,
					params.workplaceId,
					"policies.manage",
				);
			}
			if (body.delegateEmploymentId === delegatorId) {
				throw new BadRequestError("Choose a different delegate");
			}
			if (new Date(body.endsAt) <= new Date(body.startsAt)) {
				throw new BadRequestError("The delegation end must be after its start");
			}
			await assertEmploymentInWorkplace(params.workplaceId, delegatorId);
			await assertEmploymentInWorkplace(
				params.workplaceId,
				body.delegateEmploymentId,
			);
			const created = firstRow(
				await db
					.insert(leaveApprovalDelegations)
					.values({
						workplaceId: params.workplaceId,
						delegatorEmploymentId: delegatorId,
						delegateEmploymentId: body.delegateEmploymentId,
						startsAt: new Date(body.startsAt),
						endsAt: new Date(body.endsAt),
						reason: body.reason?.trim() || null,
						createdByProfileId: profile.id,
					})
					.returning(),
			);
			await notifyEmployments([body.delegateEmploymentId], {
				kind: "leave_delegation",
				title: "You are covering approvals",
				body: "A manager delegated their leave approval authority to you.",
			});
			return { delegation: { id: created.id } };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				delegatorEmploymentId: t.Optional(uuid),
				delegateEmploymentId: uuid,
				startsAt: t.String({ format: "date-time" }),
				endsAt: t.String({ format: "date-time" }),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
		},
	)
	.delete(
		"/workplaces/:workplaceId/leave-delegations/:delegationId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [delegation] = await db
				.select()
				.from(leaveApprovalDelegations)
				.where(
					and(
						eq(leaveApprovalDelegations.id, params.delegationId),
						eq(leaveApprovalDelegations.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!delegation) throw new NotFoundError("Delegation not found");
			if (delegation.delegatorEmploymentId !== member.id) {
				await requirePrivilege(
					profile.id,
					params.workplaceId,
					"policies.manage",
				);
			}
			await db
				.update(leaveApprovalDelegations)
				.set({ revokedAt: new Date() })
				.where(eq(leaveApprovalDelegations.id, delegation.id));
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, delegationId: uuid }),
		},
	)
	.get(
		"/workplaces/:workplaceId/leave-ledger",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const employmentId = query.employmentId ?? member.id;
			if (
				!(await canViewEmployment(profile.id, params.workplaceId, employmentId))
			) {
				throw new ForbiddenError("You cannot view this ledger");
			}
			const rows = await db
				.select({
					entry: leaveLedgerEntries,
					leaveTypeName: leaveTypes.name,
				})
				.from(leaveLedgerEntries)
				.innerJoin(
					leaveTypes,
					eq(leaveTypes.id, leaveLedgerEntries.leaveTypeId),
				)
				.where(
					and(
						eq(leaveLedgerEntries.workplaceId, params.workplaceId),
						eq(leaveLedgerEntries.employmentId, employmentId),
						query.leaveTypeId
							? eq(leaveLedgerEntries.leaveTypeId, query.leaveTypeId)
							: undefined,
						query.kind ? eq(leaveLedgerEntries.kind, query.kind) : undefined,
					),
				)
				.orderBy(desc(leaveLedgerEntries.createdAt))
				.limit(Math.min(Number(query.limit ?? 100), 500));
			return {
				entries: rows.map((row) => ({
					...row.entry,
					createdAt: row.entry.createdAt.toISOString(),
					leaveTypeName: row.leaveTypeName,
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			query: t.Object({
				employmentId: t.Optional(uuid),
				leaveTypeId: t.Optional(uuid),
				kind: t.Optional(
					t.Union([
						t.Literal("initial"),
						t.Literal("accrual"),
						t.Literal("usage"),
						t.Literal("adjustment"),
						t.Literal("carry_forward"),
						t.Literal("expiry"),
						t.Literal("encashment"),
						t.Literal("transfer_in"),
						t.Literal("transfer_out"),
						t.Literal("restoration"),
					]),
				),
				limit: t.Optional(t.String({ pattern: "^\\d{1,3}$" })),
			}),
		},
	)
	.get(
		"/workplaces/:workplaceId/leave-balances",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const [employmentsList, types, balances, ledgerSums, pendingSums] =
				await Promise.all([
					loadEmploymentRows(params.workplaceId),
					db
						.select()
						.from(leaveTypes)
						.where(eq(leaveTypes.workplaceId, params.workplaceId)),
					db
						.select()
						.from(ptoBalances)
						.innerJoin(
							employments,
							eq(employments.id, ptoBalances.employmentId),
						)
						.where(eq(employments.workplaceId, params.workplaceId)),
					db
						.select({
							employmentId: leaveLedgerEntries.employmentId,
							leaveTypeId: leaveLedgerEntries.leaveTypeId,
							accrued: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.kind} = 'accrual' then ${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
							used: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.kind} = 'usage' then -${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
							restored: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.kind} = 'restoration' then ${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
							carried: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.kind} = 'carry_forward' then coalesce(${leaveLedgerEntries.metaMinutes}, 0) else 0 end), 0)::int`,
							encashed: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.kind} = 'encashment' then -${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
							adjusted: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.kind} = 'adjustment' then ${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
							expired: sql<number>`coalesce(sum(case when ${leaveLedgerEntries.kind} = 'expiry' then -${leaveLedgerEntries.minutes} else 0 end), 0)::int`,
						})
						.from(leaveLedgerEntries)
						.where(eq(leaveLedgerEntries.workplaceId, params.workplaceId))
						.groupBy(
							leaveLedgerEntries.employmentId,
							leaveLedgerEntries.leaveTypeId,
						),
					db
						.select({
							employmentId: timeOffRequests.employmentId,
							leaveTypeId: timeOffRequests.leaveTypeId,
							pending: sql<number>`coalesce(sum(${timeOffRequests.chargeMinutes}), 0)::int`,
						})
						.from(timeOffRequests)
						.innerJoin(
							employments,
							eq(employments.id, timeOffRequests.employmentId),
						)
						.where(
							and(
								eq(employments.workplaceId, params.workplaceId),
								eq(timeOffRequests.status, "pending"),
							),
						)
						.groupBy(timeOffRequests.employmentId, timeOffRequests.leaveTypeId),
				]);

			const activeTypes = types.filter((type) => type.active);
			const rows = [];
			for (const employment of employmentsList) {
				for (const type of activeTypes) {
					const balanceRow = balances.find(
						(row) =>
							row.pto_balances.employmentId === employment.id &&
							row.pto_balances.leaveTypeId === type.id,
					);
					const ledger = ledgerSums.find(
						(row) =>
							row.employmentId === employment.id && row.leaveTypeId === type.id,
					);
					const pending = pendingSums.find(
						(row) =>
							row.employmentId === employment.id &&
							row.leaveTypeId === type.id &&
							row.leaveTypeId,
					);
					const balanceMinutes = balanceRow?.pto_balances.minutes ?? 0;
					const hasActivity =
						ledger != null ||
						balanceMinutes !== 0 ||
						(pending?.pending ?? 0) > 0;
					if (!hasActivity) continue;
					rows.push({
						employmentId: employment.id,
						employmentName: employment.fullName,
						employmentEmail: employment.email,
						employmentKind: employment.kind,
						leaveTypeId: type.id,
						leaveTypeName: type.name,
						leaveTypePaid: type.paid,
						balanceMinutes,
						accruedMinutes: ledger?.accrued ?? 0,
						usedMinutes: (ledger?.used ?? 0) - (ledger?.restored ?? 0),
						carriedMinutes: ledger?.carried ?? 0,
						encashedMinutes: ledger?.encashed ?? 0,
						adjustedMinutes: ledger?.adjusted ?? 0,
						expiredMinutes: ledger?.expired ?? 0,
						pendingMinutes: pending?.pending ?? 0,
					});
				}
			}
			return { balances: rows };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-adjustments",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "workers.manage");
			await assertEmploymentInWorkplace(params.workplaceId, body.employmentId);
			await assertLeaveTypesInWorkplace(params.workplaceId, [body.leaveTypeId]);
			if (body.minutes === 0) {
				throw new BadRequestError("Enter a non-zero adjustment");
			}
			const [leaveType] = await db
				.select({ name: leaveTypes.name })
				.from(leaveTypes)
				.where(eq(leaveTypes.id, body.leaveTypeId))
				.limit(1);
			const [policy] = await db
				.select()
				.from(leavePolicies)
				.where(eq(leavePolicies.leaveTypeId, body.leaveTypeId))
				.limit(1);
			const applied = await applyLeaveLedger({
				workplaceId: params.workplaceId,
				employmentId: body.employmentId,
				leaveTypeId: body.leaveTypeId,
				kind: "adjustment",
				minutes: body.minutes,
				effectiveDate:
					body.effectiveDate ?? new Date().toISOString().slice(0, 10),
				leaveYearStartMonthDay: policy?.leaveYearStartMonthDay ?? "01-01",
				allowNegative: true,
				note: body.note?.trim() || "Manual adjustment",
				createdByProfileId: profile.id,
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "leave.adjusted",
				entityType: "leave_ledger_entry",
				entityId: applied.entry.id,
				summary: `Adjusted ${leaveType?.name ?? "leave"} by ${body.minutes} minutes`,
			});
			return {
				entry: {
					id: applied.entry.id,
					minutes: applied.appliedMinutes,
					balanceAfter: applied.balanceAfter,
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				employmentId: uuid,
				leaveTypeId: uuid,
				minutes: t.Integer({ minimum: -200_000, maximum: 200_000 }),
				effectiveDate: t.Optional(dateSchema),
				note: t.Optional(t.String({ maxLength: 300 })),
			}),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-transfers",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "workers.manage");
			if (body.fromLeaveTypeId === body.toLeaveTypeId) {
				throw new BadRequestError("Choose two different Leave Types");
			}
			if (body.minutes <= 0) {
				throw new BadRequestError("Transfer minutes must be positive");
			}
			await assertEmploymentInWorkplace(params.workplaceId, body.employmentId);
			await assertLeaveTypesInWorkplace(params.workplaceId, [
				body.fromLeaveTypeId,
				body.toLeaveTypeId,
			]);
			const created = await db.transaction(async () => {
				const transfer = firstRow(
					await db
						.insert(leaveBalanceTransfers)
						.values({
							workplaceId: params.workplaceId,
							employmentId: body.employmentId,
							fromLeaveTypeId: body.fromLeaveTypeId,
							toLeaveTypeId: body.toLeaveTypeId,
							minutes: body.minutes,
							reason: body.reason?.trim() || null,
							createdByProfileId: profile.id,
						})
						.returning(),
				);
				const debited = await applyLeaveLedger({
					workplaceId: params.workplaceId,
					employmentId: body.employmentId,
					leaveTypeId: body.fromLeaveTypeId,
					kind: "transfer_out",
					minutes: -body.minutes,
					effectiveDate: new Date().toISOString().slice(0, 10),
					transferId: transfer.id,
					note: body.reason?.trim() || "Balance transfer",
					createdByProfileId: profile.id,
				});
				if (-debited.appliedMinutes < body.minutes) {
					throw new BadRequestError(
						"Not enough balance in the source Leave Type",
					);
				}
				await applyLeaveLedger({
					workplaceId: params.workplaceId,
					employmentId: body.employmentId,
					leaveTypeId: body.toLeaveTypeId,
					kind: "transfer_in",
					minutes: body.minutes,
					effectiveDate: new Date().toISOString().slice(0, 10),
					transferId: transfer.id,
					note: body.reason?.trim() || "Balance transfer",
					createdByProfileId: profile.id,
				});
				return transfer;
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "leave.transferred",
				entityType: "leave_balance_transfer",
				entityId: created.id,
				summary: `Transferred ${body.minutes} leave minutes`,
			});
			return { transfer: { id: created.id } };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				employmentId: uuid,
				fromLeaveTypeId: uuid,
				toLeaveTypeId: uuid,
				minutes: t.Integer({ minimum: 1, maximum: 200_000 }),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
		},
	)
	.get(
		"/workplaces/:workplaceId/leave-encashments",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const rows = await db
				.select({
					encashment: leaveEncashments,
					employmentName: profiles.fullName,
					employmentEmail: profiles.email,
					leaveTypeName: leaveTypes.name,
				})
				.from(leaveEncashments)
				.innerJoin(
					employments,
					eq(employments.id, leaveEncashments.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.innerJoin(leaveTypes, eq(leaveTypes.id, leaveEncashments.leaveTypeId))
				.where(
					and(
						eq(leaveEncashments.workplaceId, params.workplaceId),
						query.status
							? eq(leaveEncashments.status, query.status)
							: undefined,
					),
				)
				.orderBy(desc(leaveEncashments.createdAt));
			return {
				encashments: rows.map((row) => ({
					...row.encashment,
					createdAt: row.encashment.createdAt.toISOString(),
					updatedAt: row.encashment.updatedAt.toISOString(),
					decidedAt: row.encashment.decidedAt?.toISOString() ?? null,
					paidAt: row.encashment.paidAt?.toISOString() ?? null,
					employmentName: row.employmentName,
					employmentEmail: row.employmentEmail,
					leaveTypeName: row.leaveTypeName,
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			query: t.Object({
				status: t.Optional(
					t.Union([
						t.Literal("requested"),
						t.Literal("approved"),
						t.Literal("declined"),
						t.Literal("paid"),
						t.Literal("cancelled"),
					]),
				),
			}),
		},
	)
	.post(
		"/workplaces/:workplaceId/my/leave-encashments",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const created = await createEncashment({
				workplaceId: params.workplaceId,
				employmentId: member.id,
				profileId: profile.id,
				leaveTypeId: body.leaveTypeId,
				minutes: body.minutes,
				note: body.note ?? null,
				hourlyWageCents: member.hourlyWageCents,
			});
			await notifyEmployments(
				await managerEmploymentIdsForWorkplace(params.workplaceId),
				{
					kind: "leave_encashment_requested",
					title: "Leave encashment request",
					body: "A worker asked to encash leave minutes.",
				},
			);
			return { encashment: created };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				leaveTypeId: uuid,
				minutes: t.Integer({ minimum: 1, maximum: 200_000 }),
				note: t.Optional(t.String({ maxLength: 300 })),
			}),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-encashments",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			await assertEmploymentInWorkplace(params.workplaceId, body.employmentId);
			const [target] = await db
				.select({ hourlyWageCents: employments.hourlyWageCents })
				.from(employments)
				.where(eq(employments.id, body.employmentId))
				.limit(1);
			const created = await createEncashment({
				workplaceId: params.workplaceId,
				employmentId: body.employmentId,
				profileId: profile.id,
				leaveTypeId: body.leaveTypeId,
				minutes: body.minutes,
				note: body.note ?? null,
				hourlyWageCents: target?.hourlyWageCents ?? null,
			});
			return { encashment: created };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				employmentId: uuid,
				leaveTypeId: uuid,
				minutes: t.Integer({ minimum: 1, maximum: 200_000 }),
				note: t.Optional(t.String({ maxLength: 300 })),
			}),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-encashments/:encashmentId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const [encashment] = await db
				.select()
				.from(leaveEncashments)
				.where(
					and(
						eq(leaveEncashments.id, params.encashmentId),
						eq(leaveEncashments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!encashment) throw new NotFoundError("Encashment not found");
			if (encashment.status !== "requested") {
				throw new ConflictError("This encashment has already been decided");
			}
			const [policy] = await db
				.select()
				.from(leavePolicies)
				.where(eq(leavePolicies.leaveTypeId, encashment.leaveTypeId))
				.limit(1);

			if (body.decision === "declined") {
				await db
					.update(leaveEncashments)
					.set({
						status: "declined",
						decidedByProfileId: profile.id,
						decisionReason: body.reason?.trim() || null,
						decidedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(leaveEncashments.id, encashment.id));
			} else {
				await db.transaction(async () => {
					const applied = await applyLeaveLedger({
						workplaceId: params.workplaceId,
						employmentId: encashment.employmentId,
						leaveTypeId: encashment.leaveTypeId,
						kind: "encashment",
						minutes: -encashment.minutes,
						effectiveDate: new Date().toISOString().slice(0, 10),
						leaveYearStartMonthDay: policy?.leaveYearStartMonthDay ?? "01-01",
						encashmentId: encashment.id,
						note: "Leave encashment",
						createdByProfileId: profile.id,
						idempotencyKey: `encash:${encashment.id}`,
					});
					if (-applied.appliedMinutes < encashment.minutes) {
						throw new BadRequestError(
							"Not enough balance left to encash these minutes",
						);
					}
					await db
						.update(leaveEncashments)
						.set({
							status: "approved",
							decidedByProfileId: profile.id,
							decisionReason: body.reason?.trim() || null,
							decidedAt: new Date(),
							updatedAt: new Date(),
						})
						.where(eq(leaveEncashments.id, encashment.id));
				});
			}
			await notifyEmployments([encashment.employmentId], {
				kind:
					body.decision === "approved"
						? "leave_encashment_approved"
						: "leave_encashment_declined",
				title:
					body.decision === "approved"
						? "Leave encashment approved"
						: "Leave encashment declined",
				body:
					body.reason?.trim() ||
					"Your manager made a decision on your leave encashment.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: `leave_encashment.${body.decision}`,
				entityType: "leave_encashment",
				entityId: encashment.id,
				summary: `${body.decision === "approved" ? "Approved" : "Declined"} a leave encashment`,
			});
			return { ok: true as const, status: body.decision };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, encashmentId: uuid }),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-encashments/:encashmentId/paid",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const [encashment] = await db
				.select()
				.from(leaveEncashments)
				.where(
					and(
						eq(leaveEncashments.id, params.encashmentId),
						eq(leaveEncashments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!encashment) throw new NotFoundError("Encashment not found");
			if (encashment.status !== "approved") {
				throw new ConflictError("Only approved encashments can be marked paid");
			}
			await db
				.update(leaveEncashments)
				.set({
					status: "paid",
					paidAt: new Date(),
					note: body.note?.trim() || encashment.note,
					updatedAt: new Date(),
				})
				.where(eq(leaveEncashments.id, encashment.id));
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, encashmentId: uuid }),
			body: t.Object({ note: t.Optional(t.String({ maxLength: 300 })) }),
		},
	)
	.delete(
		"/workplaces/:workplaceId/my/leave-encashments/:encashmentId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [encashment] = await db
				.select()
				.from(leaveEncashments)
				.where(
					and(
						eq(leaveEncashments.id, params.encashmentId),
						eq(leaveEncashments.workplaceId, params.workplaceId),
						eq(leaveEncashments.employmentId, member.id),
					),
				)
				.limit(1);
			if (!encashment) throw new NotFoundError("Encashment not found");
			if (encashment.status !== "requested") {
				throw new ConflictError("Only requested encashments can be cancelled");
			}
			await db
				.update(leaveEncashments)
				.set({ status: "cancelled", updatedAt: new Date() })
				.where(eq(leaveEncashments.id, encashment.id));
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, encashmentId: uuid }),
		},
	)
	.get(
		"/workplaces/:workplaceId/employments/:employmentId/leave-forecast",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			if (
				!(await canViewEmployment(
					profile.id,
					params.workplaceId,
					params.employmentId,
				))
			) {
				throw new ForbiddenError("You cannot view this forecast");
			}
			const months = query.months ? Number(query.months) : 12;
			const forecast = await leaveForecast({
				workplaceId: params.workplaceId,
				employmentId: params.employmentId,
				months: Number.isFinite(months) ? months : 12,
			});
			return {
				forecast: [...forecast.entries()].map(([leaveTypeId, value]) => ({
					leaveTypeId,
					...value,
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, employmentId: uuid }),
			query: t.Object({
				months: t.Optional(t.String({ pattern: "^\\d{1,2}$" })),
			}),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-accruals/run",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const asOf = body.asOf ? new Date(`${body.asOf}T23:59:59Z`) : new Date();
			const accruals = await runLeaveAccruals({
				workplaceId: params.workplaceId,
				asOf,
			});
			const carry = await runLeaveCarryForward({
				workplaceId: params.workplaceId,
				asOf,
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "leave.accruals_run",
				entityType: "leave_policy",
				entityId: null,
				summary: `Accrual run: ${accruals.creditedEntries} credits, ${carry.carried} carry-forwards`,
			});
			return { accruals, carry };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({ asOf: t.Optional(dateSchema) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off/import",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const result = await importLeaveRecords({
				workplaceId: params.workplaceId,
				profileId: profile.id,
				csv: body.csv,
				dryRun: body.dryRun ?? false,
				defaultStatus: body.defaultStatus,
			});
			return { import: result };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				csv: t.String({ minLength: 1, maxLength: 2_000_000 }),
				dryRun: t.Optional(t.Boolean()),
				defaultStatus: t.Optional(
					t.Union([t.Literal("approved"), t.Literal("pending")]),
				),
			}),
			detail: {
				summary: "Import leave records from CSV (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/time-off/import/template.csv",
		async ({ headers, params, set }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			csvAttachment(set, "leave-import-template.csv");
			return LEAVE_RECORDS_TEMPLATE;
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "Download the leave import CSV template (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-balances/import",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "workers.manage");
			const result = await importLeaveBalances({
				workplaceId: params.workplaceId,
				profileId: profile.id,
				csv: body.csv,
				dryRun: body.dryRun ?? false,
			});
			return { import: result };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				csv: t.String({ minLength: 1, maxLength: 2_000_000 }),
				dryRun: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Import leave balances from CSV (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/leave-balances/import/template.csv",
		async ({ headers, params, set }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "workers.manage");
			csvAttachment(set, "leave-balance-import-template.csv");
			return LEAVE_BALANCES_TEMPLATE;
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "Download the leave balance import CSV template (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/calendar-tokens",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const rows = await db
				.select()
				.from(calendarFeedTokens)
				.where(eq(calendarFeedTokens.workplaceId, params.workplaceId))
				.orderBy(desc(calendarFeedTokens.createdAt));
			return {
				tokens: rows.map((row) => ({
					id: row.id,
					employmentId: row.employmentId,
					label: row.label,
					revokedAt: row.revokedAt?.toISOString() ?? null,
					lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
					createdAt: row.createdAt.toISOString(),
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/calendar-tokens",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const token = firstRow(
				await db
					.insert(calendarFeedTokens)
					.values({
						workplaceId: params.workplaceId,
						employmentId: null,
						token: crypto.randomUUID().replaceAll("-", ""),
						label: body.label?.trim() || "Workplace calendar",
						createdByProfileId: profile.id,
					})
					.returning(),
			);
			return {
				token: {
					id: token.id,
					url: `/v1/calendar/${token.token}/feed.ics`,
					label: token.label,
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({ label: t.Optional(t.String({ maxLength: 80 })) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/my/calendar-token",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			await db
				.update(calendarFeedTokens)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(calendarFeedTokens.workplaceId, params.workplaceId),
						eq(calendarFeedTokens.employmentId, member.id),
						isNull(calendarFeedTokens.revokedAt),
					),
				);
			const token = firstRow(
				await db
					.insert(calendarFeedTokens)
					.values({
						workplaceId: params.workplaceId,
						employmentId: member.id,
						token: crypto.randomUUID().replaceAll("-", ""),
						label: "My leave calendar",
						createdByProfileId: profile.id,
					})
					.returning(),
			);
			return {
				token: {
					id: token.id,
					url: `/v1/calendar/${token.token}/feed.ics`,
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.delete(
		"/workplaces/:workplaceId/calendar-tokens/:tokenId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [token] = await db
				.select()
				.from(calendarFeedTokens)
				.where(
					and(
						eq(calendarFeedTokens.id, params.tokenId),
						eq(calendarFeedTokens.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!token) throw new NotFoundError("Calendar token not found");
			const ownsToken = token.employmentId === member.id;
			if (!ownsToken) {
				await requirePrivilege(
					profile.id,
					params.workplaceId,
					"settings.manage",
				);
			}
			await db
				.update(calendarFeedTokens)
				.set({ revokedAt: new Date() })
				.where(eq(calendarFeedTokens.id, token.id));
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, tokenId: uuid }),
		},
	)
	.get(
		"/calendar/:token/feed.ics",
		async ({ params, set }) => {
			const [token] = await db
				.select()
				.from(calendarFeedTokens)
				.where(
					and(
						eq(calendarFeedTokens.token, params.token),
						isNull(calendarFeedTokens.revokedAt),
					),
				)
				.limit(1);
			if (!token) {
				set.status = 404;
				return "Calendar feed not found";
			}
			const body = await buildLeaveCalendarFeed({
				workplaceId: token.workplaceId,
				employmentId: token.employmentId,
				label: token.label,
			});
			await db
				.update(calendarFeedTokens)
				.set({ lastUsedAt: new Date() })
				.where(eq(calendarFeedTokens.id, token.id));
			set.headers["content-type"] = "text/calendar; charset=utf-8";
			set.headers["cache-control"] = "private, max-age=300";
			return body;
		},
		{
			params: t.Object({ token: t.String({ minLength: 16, maxLength: 64 }) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off/:requestId/documents",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [request] = await db
				.select({
					request: timeOffRequests,
					workplaceId: employments.workplaceId,
				})
				.from(timeOffRequests)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.where(eq(timeOffRequests.id, params.requestId))
				.limit(1);
			if (!request || request.workplaceId !== params.workplaceId) {
				throw new NotFoundError("Time-off request not found");
			}
			if (request.request.employmentId !== member.id) {
				await requirePrivilege(
					profile.id,
					params.workplaceId,
					"approvals.review",
				);
			}
			const file = (body as { file: File }).file;
			const stored = await storeLeaveDocument({
				file,
				workplaceId: params.workplaceId,
				requestId: params.requestId,
			});
			const document = firstRow(
				await db
					.insert(leaveRequestDocuments)
					.values({
						workplaceId: params.workplaceId,
						requestId: params.requestId,
						uploadedByProfileId: profile.id,
						fileName: stored.fileName,
						mimeType: stored.mimeType,
						sizeBytes: stored.sizeBytes,
						storageKey: stored.storageKey,
					})
					.returning(),
			);
			const uploader = await db
				.select({ id: employments.id })
				.from(employments)
				.where(eq(employments.id, request.request.employmentId))
				.limit(1);
			if (uploader[0] && request.request.employmentId !== member.id) {
				await notifyEmployments([request.request.employmentId], {
					kind: "leave_document_uploaded",
					title: "Document attached",
					body: "A manager attached a document to your leave request.",
				});
			} else {
				await notifyEmployments(
					await managerEmploymentIdsForWorkplace(params.workplaceId),
					{
						kind: "leave_document_uploaded",
						title: "Supporting document uploaded",
						body: "A worker uploaded a document for a leave request.",
					},
				);
			}
			return {
				document: {
					...document,
					createdAt: document.createdAt.toISOString(),
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			body: t.Object({
				file: t.File({ maxSize: LEAVE_DOCUMENT_MAX_BYTES }),
			}),
		},
	)
	.delete(
		"/workplaces/:workplaceId/leave-documents/:documentId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const member = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [document] = await db
				.select()
				.from(leaveRequestDocuments)
				.where(
					and(
						eq(leaveRequestDocuments.id, params.documentId),
						eq(leaveRequestDocuments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!document) throw new NotFoundError("Document not found");
			if (document.uploadedByProfileId !== profile.id) {
				await requirePrivilege(
					profile.id,
					params.workplaceId,
					"approvals.review",
				);
			}
			void member;
			await db
				.delete(leaveRequestDocuments)
				.where(eq(leaveRequestDocuments.id, document.id));
			await removeLeaveDocument(document.storageKey);
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, documentId: uuid }),
		},
	)
	.get(
		"/leave-documents/:documentId",
		async ({ headers, params, set }) => {
			const { profile } = await requireSession(headers);
			const [row] = await db
				.select({
					document: leaveRequestDocuments,
					workplaceId: employments.workplaceId,
					employmentId: timeOffRequests.employmentId,
				})
				.from(leaveRequestDocuments)
				.innerJoin(
					timeOffRequests,
					eq(timeOffRequests.id, leaveRequestDocuments.requestId),
				)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.where(eq(leaveRequestDocuments.id, params.documentId))
				.limit(1);
			if (!row) throw new NotFoundError("Document not found");
			const isOwner =
				row.employmentId ===
				(await requireWorkplaceMember(profile.id, row.workplaceId)).id;
			if (!isOwner) {
				await requirePrivilege(profile.id, row.workplaceId, "approvals.review");
			}
			const path = resolveLeaveDocumentPath(row.document.storageKey);
			const file = Bun.file(path);
			if (!(await file.exists())) {
				throw new NotFoundError("Document file is missing");
			}
			set.headers["content-type"] = row.document.mimeType;
			set.headers["content-disposition"] =
				`inline; filename="${row.document.fileName.replaceAll('"', "")}"`;
			return new Response(file);
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ documentId: uuid }),
		},
	)
	.get(
		"/workplaces/:workplaceId/reports/leave",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");
			const from = query.from ?? shiftDate(new Date(), -30);
			const to = query.to ?? shiftDate(new Date(), 30);
			return buildLeaveReport({
				workplaceId: params.workplaceId,
				from,
				to,
			});
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			query: t.Object({
				from: t.Optional(dateSchema),
				to: t.Optional(dateSchema),
			}),
		},
	)
	.get(
		"/workplaces/:workplaceId/reports/leave-payroll.csv",
		async ({ headers, params, query, set }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");
			const from = query.from ?? shiftDate(new Date(), -30);
			const to = query.to ?? shiftDate(new Date(), 30);
			const report = await buildLeaveReport({
				workplaceId: params.workplaceId,
				from,
				to,
			});
			const lines = [
				"worker,email,leave_type,paid,approved_minutes,unpaid_minutes,overdrawn_minutes,encashment_minutes,encashment_cents,paid_status",
			];
			for (const row of report.rows) {
				lines.push(
					[
						csvEscape(row.employmentName ?? ""),
						csvEscape(row.employmentEmail),
						csvEscape(row.leaveTypeName),
						row.leaveTypePaid ? "yes" : "no",
						String(row.approvedMinutes),
						String(row.unpaidMinutes),
						String(row.overdrawnMinutes),
						String(row.encashmentMinutes),
						String(row.encashmentCents),
						csvEscape(row.encashmentStatus ?? ""),
					].join(","),
				);
			}
			lines.push(
				[
					"",
					"",
					"TOTAL",
					"",
					String(report.totals.approvedMinutes),
					String(report.totals.unpaidMinutes),
					String(report.totals.overdrawnMinutes),
					String(report.totals.encashmentMinutes),
					String(report.totals.encashmentCents),
					"",
				].join(","),
			);
			set.headers["content-type"] = "text/csv; charset=utf-8";
			set.headers["content-disposition"] =
				`attachment; filename="leave-payroll-${from}-${to}.csv"`;
			return lines.join("\n");
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			query: t.Object({
				from: t.Optional(dateSchema),
				to: t.Optional(dateSchema),
			}),
		},
	);

async function managerEmploymentIdsForWorkplace(
	workplaceId: string,
): Promise<string[]> {
	const rows = await db
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				eq(employments.kind, "manager"),
				eq(employments.status, "active"),
			),
		);
	return rows.map((row) => row.id);
}

function validateSteps(
	steps: Array<{
		approverKind: "workplace_managers" | "specific_employment" | "privilege";
		approverEmploymentId?: string | null;
		approverPrivilege?: string | null;
		escalationKind?:
			| "workplace_managers"
			| "specific_employment"
			| "privilege"
			| null;
		escalationEmploymentId?: string | null;
	}>,
) {
	for (const step of steps) {
		if (
			step.approverKind === "specific_employment" &&
			!step.approverEmploymentId
		) {
			throw new BadRequestError("Choose who approves this step");
		}
		if (
			step.approverKind === "privilege" &&
			(!step.approverPrivilege ||
				!PRIVILEGES.includes(
					step.approverPrivilege as (typeof PRIVILEGES)[number],
				))
		) {
			throw new BadRequestError("Choose a valid approver capability");
		}
		if (
			step.escalationKind === "specific_employment" &&
			!step.escalationEmploymentId
		) {
			throw new BadRequestError("Choose who receives the escalation");
		}
	}
}

async function verifyStepEmployments(
	workplaceId: string,
	steps: Array<{
		approverEmploymentId?: string | null;
		escalationEmploymentId?: string | null;
	}>,
) {
	const ids = steps
		.flatMap((step) => [step.approverEmploymentId, step.escalationEmploymentId])
		.filter((id): id is string => Boolean(id));
	if (ids.length === 0) return;
	const rows = await db
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				inArray(employments.id, ids),
			),
		);
	if (rows.length !== new Set(ids).size) {
		throw new NotFoundError("Approver not found in this workplace");
	}
}

async function createEncashment(input: {
	workplaceId: string;
	employmentId: string;
	profileId: string;
	leaveTypeId: string;
	minutes: number;
	note: string | null;
	hourlyWageCents: number | null;
}) {
	await assertLeaveTypesInWorkplace(input.workplaceId, [input.leaveTypeId]);
	const [policy] = await db
		.select()
		.from(leavePolicies)
		.where(eq(leavePolicies.leaveTypeId, input.leaveTypeId))
		.limit(1);
	if (!policy?.encashmentEnabled) {
		throw new BadRequestError("This Leave Type cannot be encashed");
	}
	const [balance] = await db
		.select({ minutes: ptoBalances.minutes })
		.from(ptoBalances)
		.where(
			and(
				eq(ptoBalances.employmentId, input.employmentId),
				eq(ptoBalances.leaveTypeId, input.leaveTypeId),
			),
		)
		.limit(1);
	if ((balance?.minutes ?? 0) < input.minutes) {
		throw new BadRequestError("Not enough balance to encash these minutes");
	}
	if (policy.maxEncashmentMinutesPerYear != null) {
		const leaveYear = leaveYearForDate(
			new Date().toISOString().slice(0, 10),
			policy.leaveYearStartMonthDay,
		);
		const range = leaveYearRange(leaveYear, policy.leaveYearStartMonthDay);
		const [used] = await db
			.select({
				total: sql<number>`coalesce(sum(${leaveEncashments.minutes}), 0)::int`,
			})
			.from(leaveEncashments)
			.where(
				and(
					eq(leaveEncashments.employmentId, input.employmentId),
					eq(leaveEncashments.leaveTypeId, input.leaveTypeId),
					inArray(leaveEncashments.status, ["requested", "approved", "paid"]),
					gte(
						leaveEncashments.createdAt,
						new Date(`${range.startDate}T00:00:00Z`),
					),
					lte(
						leaveEncashments.createdAt,
						new Date(`${range.endDate}T23:59:59Z`),
					),
				),
			);
		if (
			(used?.total ?? 0) + input.minutes >
			policy.maxEncashmentMinutesPerYear
		) {
			throw new BadRequestError(
				"This would exceed the yearly encashment limit",
			);
		}
	}
	const wage = input.hourlyWageCents ?? 0;
	const amountCents = Math.round((input.minutes / 60) * wage);
	const created = firstRow(
		await db
			.insert(leaveEncashments)
			.values({
				workplaceId: input.workplaceId,
				employmentId: input.employmentId,
				leaveTypeId: input.leaveTypeId,
				minutes: input.minutes,
				hourlyWageCentsSnapshot: input.hourlyWageCents,
				amountCents,
				requestedByProfileId: input.profileId,
				note: input.note,
			})
			.returning(),
	);
	return {
		...created,
		createdAt: created.createdAt.toISOString(),
		updatedAt: created.updatedAt.toISOString(),
		decidedAt: null,
		paidAt: null,
	};
}

function shiftDate(date: Date, days: number): string {
	const copy = new Date(date.getTime() + days * 86_400_000);
	return copy.toISOString().slice(0, 10);
}

async function buildLeaveReport(input: {
	workplaceId: string;
	from: string;
	to: string;
}) {
	const requestRows = await db
		.select({
			request: timeOffRequests,
			employmentName: profiles.fullName,
			employmentEmail: profiles.email,
			leaveTypeName: leaveTypes.name,
			leaveTypePaid: leaveTypes.paid,
		})
		.from(timeOffRequests)
		.innerJoin(employments, eq(employments.id, timeOffRequests.employmentId))
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.leftJoin(leaveTypes, eq(leaveTypes.id, timeOffRequests.leaveTypeId))
		.where(
			and(
				eq(employments.workplaceId, input.workplaceId),
				inArray(timeOffRequests.status, ["approved", "cancelled"]),
				gte(timeOffRequests.startsAt, new Date(`${input.from}T00:00:00Z`)),
				lte(timeOffRequests.startsAt, new Date(`${input.to}T23:59:59Z`)),
			),
		);
	const encashments = await db
		.select({
			encashment: leaveEncashments,
			employmentName: profiles.fullName,
			employmentEmail: profiles.email,
			leaveTypeName: leaveTypes.name,
		})
		.from(leaveEncashments)
		.innerJoin(employments, eq(employments.id, leaveEncashments.employmentId))
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.innerJoin(leaveTypes, eq(leaveTypes.id, leaveEncashments.leaveTypeId))
		.where(
			and(
				eq(leaveEncashments.workplaceId, input.workplaceId),
				inArray(leaveEncashments.status, ["approved", "paid"]),
				gte(leaveEncashments.createdAt, new Date(`${input.from}T00:00:00Z`)),
				lte(leaveEncashments.createdAt, new Date(`${input.to}T23:59:59Z`)),
			),
		);

	type Row = {
		employmentId: string;
		employmentName: string | null;
		employmentEmail: string;
		leaveTypeId: string | null;
		leaveTypeName: string;
		leaveTypePaid: boolean;
		approvedMinutes: number;
		unpaidMinutes: number;
		overdrawnMinutes: number;
		encashmentMinutes: number;
		encashmentCents: number;
		encashmentStatus: string | null;
	};
	const rows = new Map<string, Row>();
	for (const row of requestRows) {
		if (row.request.status === "cancelled") continue;
		const key = `${row.request.employmentId}:${row.request.leaveTypeId ?? "none"}`;
		const charge =
			row.request.chargeMinutes ??
			Math.round(
				(row.request.endsAt.getTime() - row.request.startsAt.getTime()) /
					60_000,
			);
		const deducted = row.request.deductedMinutes ?? charge;
		const overdrawn = Math.max(0, charge - deducted);
		const existing = rows.get(key) ?? {
			employmentId: row.request.employmentId,
			employmentName: row.employmentName,
			employmentEmail: row.employmentEmail,
			leaveTypeId: row.request.leaveTypeId,
			leaveTypeName: row.leaveTypeName ?? "Unspecified",
			leaveTypePaid: row.leaveTypePaid ?? true,
			approvedMinutes: 0,
			unpaidMinutes: 0,
			overdrawnMinutes: 0,
			encashmentMinutes: 0,
			encashmentCents: 0,
			encashmentStatus: null,
		};
		existing.approvedMinutes += charge;
		if (existing.leaveTypePaid === false) {
			existing.unpaidMinutes += charge;
		}
		existing.overdrawnMinutes += overdrawn;
		rows.set(key, existing);
	}
	for (const row of encashments) {
		const key = `${row.encashment.employmentId}:${row.encashment.leaveTypeId}`;
		const existing = rows.get(key) ?? {
			employmentId: row.encashment.employmentId,
			employmentName: row.employmentName,
			employmentEmail: row.employmentEmail,
			leaveTypeId: row.encashment.leaveTypeId,
			leaveTypeName: row.leaveTypeName,
			leaveTypePaid: true,
			approvedMinutes: 0,
			unpaidMinutes: 0,
			overdrawnMinutes: 0,
			encashmentMinutes: 0,
			encashmentCents: 0,
			encashmentStatus: null,
		};
		existing.encashmentMinutes += row.encashment.minutes;
		existing.encashmentCents += row.encashment.amountCents;
		existing.encashmentStatus = row.encashment.status;
		rows.set(key, existing);
	}
	const list = [...rows.values()].sort(
		(a, b) =>
			(a.employmentName ?? a.employmentEmail).localeCompare(
				b.employmentName ?? b.employmentEmail,
			) || a.leaveTypeName.localeCompare(b.leaveTypeName),
	);
	return {
		from: input.from,
		to: input.to,
		rows: list,
		totals: {
			approvedMinutes: list.reduce((sum, row) => sum + row.approvedMinutes, 0),
			unpaidMinutes: list.reduce((sum, row) => sum + row.unpaidMinutes, 0),
			overdrawnMinutes: list.reduce(
				(sum, row) => sum + row.overdrawnMinutes,
				0,
			),
			encashmentMinutes: list.reduce(
				(sum, row) => sum + row.encashmentMinutes,
				0,
			),
			encashmentCents: list.reduce((sum, row) => sum + row.encashmentCents, 0),
		},
	};
}
