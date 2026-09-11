import {
	db,
	type Employment,
	type EmploymentPrivilege,
	employments,
	leaveApprovalChains,
	leaveApprovalDelegations,
	leaveApprovalSteps,
	leaveRequestApprovals,
	leaveTypes,
	timeOffRequests,
} from "@SchedulesManager/db";
import {
	and,
	asc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	lte,
	ne,
	type SQL,
} from "drizzle-orm";

import { hasPrivilege } from "./context";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { describeLeaveWindow } from "./leave";
import { applyLeaveLedger } from "./leave-ledger";
import { loadEmploymentLeaveContext } from "./leave-policy";
import { managerEmploymentIds, notifyEmployments } from "./notify";

export type LeaveApproverKind =
	| "workplace_managers"
	| "specific_employment"
	| "privilege";

export interface ApprovalStepDescriptor {
	stepOrder: number;
	approverKind: LeaveApproverKind;
	approverEmploymentId: string | null;
	approverPrivilege: string | null;
	escalateAfterHours: number | null;
	escalationKind: LeaveApproverKind | null;
	escalationEmploymentId: string | null;
}

const MAX_STEPS = 10;

/**
 * Steps for a new request: the Leave Type's chain, else the workplace default
 * chain, else one implicit manager step (legacy behaviour).
 */
export async function resolveApprovalSteps(
	workplaceId: string,
	leaveTypeId: string | null,
): Promise<ApprovalStepDescriptor[]> {
	let chainId: string | null = null;
	if (leaveTypeId) {
		const [leaveType] = await db
			.select({ approvalChainId: leaveTypes.approvalChainId })
			.from(leaveTypes)
			.where(
				and(
					eq(leaveTypes.id, leaveTypeId),
					eq(leaveTypes.workplaceId, workplaceId),
				),
			)
			.limit(1);
		chainId = leaveType?.approvalChainId ?? null;
	}
	if (!chainId) {
		const [defaultChain] = await db
			.select({ id: leaveApprovalChains.id })
			.from(leaveApprovalChains)
			.where(
				and(
					eq(leaveApprovalChains.workplaceId, workplaceId),
					eq(leaveApprovalChains.isDefault, true),
				),
			)
			.limit(1);
		chainId = defaultChain?.id ?? null;
	}

	if (chainId) {
		const steps = await db
			.select()
			.from(leaveApprovalSteps)
			.where(eq(leaveApprovalSteps.chainId, chainId))
			.orderBy(asc(leaveApprovalSteps.stepOrder));
		if (steps.length > 0) {
			return steps.slice(0, MAX_STEPS).map((step, index) => ({
				stepOrder: index,
				approverKind: step.approverKind,
				approverEmploymentId: step.approverEmploymentId,
				approverPrivilege: step.approverPrivilege,
				escalateAfterHours: step.escalateAfterHours,
				escalationKind: step.escalationKind,
				escalationEmploymentId: step.escalationEmploymentId,
			}));
		}
	}

	return [
		{
			stepOrder: 0,
			approverKind: "workplace_managers",
			approverEmploymentId: null,
			approverPrivilege: null,
			escalateAfterHours: null,
			escalationKind: null,
			escalationEmploymentId: null,
		},
	];
}

function dueAtFor(step: ApprovalStepDescriptor, from: Date): Date | null {
	if (step.escalateAfterHours == null || step.escalateAfterHours <= 0) {
		return null;
	}
	return new Date(from.getTime() + step.escalateAfterHours * 3_600_000);
}

export async function createRequestApprovalSteps(input: {
	requestId: string;
	workplaceId: string;
	leaveTypeId: string | null;
	now?: Date;
}): Promise<number> {
	const steps = await resolveApprovalSteps(
		input.workplaceId,
		input.leaveTypeId,
	);
	const now = input.now ?? new Date();
	await db.insert(leaveRequestApprovals).values(
		steps.map((step) => ({
			requestId: input.requestId,
			stepOrder: step.stepOrder,
			approverKind: step.approverKind,
			approverEmploymentId: step.approverEmploymentId,
			approverPrivilege: step.approverPrivilege,
			dueAt: step.stepOrder === 0 ? dueAtFor(step, now) : null,
			escalateAfterHours: step.escalateAfterHours,
			escalationKind: step.escalationKind,
			escalationEmploymentId: step.escalationEmploymentId,
		})),
	);
	return steps.length;
}

/** Records an auto-approved step so manager-recorded leave still has a trail. */
export async function recordAutoApprovedStep(input: {
	requestId: string;
	profileId: string;
	reason?: string | null;
}): Promise<void> {
	await db.insert(leaveRequestApprovals).values({
		requestId: input.requestId,
		stepOrder: 0,
		approverKind: "workplace_managers",
		status: "approved",
		decidedByProfileId: input.profileId,
		decisionReason: input.reason ?? "Recorded by a manager",
		decidedAt: new Date(),
	});
}

async function activeDelegateEmploymentIds(
	delegatorEmploymentId: string,
	workplaceId: string,
): Promise<string[]> {
	const rows = await db
		.select({ id: leaveApprovalDelegations.delegateEmploymentId })
		.from(leaveApprovalDelegations)
		.where(
			and(
				eq(leaveApprovalDelegations.workplaceId, workplaceId),
				eq(
					leaveApprovalDelegations.delegatorEmploymentId,
					delegatorEmploymentId,
				),
				isNull(leaveApprovalDelegations.revokedAt),
				lte(leaveApprovalDelegations.startsAt, new Date()),
				gte(leaveApprovalDelegations.endsAt, new Date()),
			),
		);
	return rows.map((row) => row.id);
}

export async function approverEmploymentIdsForStep(
	workplaceId: string,
	step: Pick<
		ApprovalStepDescriptor,
		"approverKind" | "approverEmploymentId" | "approverPrivilege"
	>,
): Promise<string[]> {
	if (step.approverKind === "specific_employment") {
		if (!step.approverEmploymentId) return managerEmploymentIds(workplaceId);
		return [
			step.approverEmploymentId,
			...(await activeDelegateEmploymentIds(
				step.approverEmploymentId,
				workplaceId,
			)),
		];
	}
	if (step.approverKind === "privilege" && step.approverPrivilege) {
		const rows = await db
			.select()
			.from(employments)
			.where(
				and(
					eq(employments.workplaceId, workplaceId),
					eq(employments.status, "active"),
				),
			);
		return rows
			.filter((employment) =>
				hasPrivilege(employment, step.approverPrivilege as EmploymentPrivilege),
			)
			.map((employment) => employment.id);
	}
	return managerEmploymentIds(workplaceId);
}

export async function notifyApprovalStep(input: {
	step: Pick<
		ApprovalStepDescriptor,
		"approverKind" | "approverEmploymentId" | "approverPrivilege"
	>;
	workplaceId: string;
}): Promise<void> {
	const targets = await approverEmploymentIdsForStep(
		input.workplaceId,
		input.step,
	);
	await notifyEmployments(targets, {
		kind: "leave_approval_requested",
		title: "Leave needs a decision",
		body: "A time-off request is waiting for your approval.",
	});
}

export interface ApprovalAuthorization {
	allowed: boolean;
	via: "direct" | "delegation" | null;
}

async function employmentCanDecide(input: {
	employment: Employment;
	approverKind: LeaveApproverKind;
	approverEmploymentId: string | null;
	approverPrivilege: string | null;
}): Promise<boolean> {
	if (input.approverKind === "specific_employment") {
		return input.employment.id === input.approverEmploymentId;
	}
	if (input.approverKind === "privilege") {
		return input.approverPrivilege
			? hasPrivilege(
					input.employment,
					input.approverPrivilege as EmploymentPrivilege,
				)
			: false;
	}
	return hasPrivilege(input.employment, "approvals.review");
}

export async function authorizeApprovalDecision(input: {
	profileId: string;
	workplaceId: string;
	approval: {
		approverKind: LeaveApproverKind;
		approverEmploymentId: string | null;
		approverPrivilege: string | null;
	};
}): Promise<ApprovalAuthorization> {
	const [caller] = await db
		.select()
		.from(employments)
		.where(
			and(
				eq(employments.profileId, input.profileId),
				eq(employments.workplaceId, input.workplaceId),
				eq(employments.status, "active"),
			),
		)
		.limit(1);
	if (!caller) return { allowed: false, via: null };

	if (await employmentCanDecide({ employment: caller, ...input.approval })) {
		return { allowed: true, via: "direct" };
	}

	const delegations = await db
		.select({ delegator: leaveApprovalDelegations.delegatorEmploymentId })
		.from(leaveApprovalDelegations)
		.where(
			and(
				eq(leaveApprovalDelegations.workplaceId, input.workplaceId),
				eq(leaveApprovalDelegations.delegateEmploymentId, caller.id),
				isNull(leaveApprovalDelegations.revokedAt),
				lte(leaveApprovalDelegations.startsAt, new Date()),
				gte(leaveApprovalDelegations.endsAt, new Date()),
			),
		);
	for (const delegation of delegations) {
		const [delegator] = await db
			.select()
			.from(employments)
			.where(eq(employments.id, delegation.delegator))
			.limit(1);
		if (
			delegator &&
			delegator.status === "active" &&
			(await employmentCanDecide({ employment: delegator, ...input.approval }))
		) {
			return { allowed: true, via: "delegation" };
		}
	}
	return { allowed: false, via: null };
}

async function selectOpenApproval(
	requestId: string,
	condition: SQL,
): Promise<typeof leaveRequestApprovals.$inferSelect | null> {
	const [row] = await db
		.select()
		.from(leaveRequestApprovals)
		.where(
			and(
				eq(leaveRequestApprovals.requestId, requestId),
				condition,
				inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
			),
		)
		.limit(1)
		.for("update", { of: leaveRequestApprovals });
	return row ?? null;
}

export interface DecideApprovalInput {
	workplaceId: string;
	requestId: string;
	profileId: string;
	decision: "approved" | "declined";
	reason?: string | null;
	/** Decide a specific step; defaults to the current one. */
	approvalId?: string;
}

export interface DecideApprovalResult {
	requestId: string;
	status: "pending" | "approved" | "declined";
	stepOrder: number;
	completed: boolean;
	via: ApprovalAuthorization["via"];
}

/**
 * Applies one approval decision. The request row is locked so concurrent
 * approvers cannot double-decide or double-deduct.
 */
export async function decideLeaveRequest(
	input: DecideApprovalInput,
): Promise<DecideApprovalResult> {
	return db.transaction(async () => {
		const [request] = await db
			.select({
				request: timeOffRequests,
				workplaceId: employments.workplaceId,
			})
			.from(timeOffRequests)
			.innerJoin(employments, eq(employments.id, timeOffRequests.employmentId))
			.where(eq(timeOffRequests.id, input.requestId))
			.limit(1)
			.for("update", { of: timeOffRequests });
		if (!request || request.workplaceId !== input.workplaceId) {
			throw new NotFoundError("Time-off request not found");
		}
		if (request.request.status !== "pending") {
			throw new ConflictError("This request has already been decided");
		}

		const condition = input.approvalId
			? eq(leaveRequestApprovals.id, input.approvalId)
			: eq(leaveRequestApprovals.stepOrder, request.request.currentStep);
		let approval = await selectOpenApproval(input.requestId, condition);
		if (!approval && !input.approvalId) {
			// Requests created before approval chains existed have no step rows.
			const [anyStep] = await db
				.select({ id: leaveRequestApprovals.id })
				.from(leaveRequestApprovals)
				.where(eq(leaveRequestApprovals.requestId, input.requestId))
				.limit(1);
			if (!anyStep) {
				await db.insert(leaveRequestApprovals).values({
					requestId: input.requestId,
					stepOrder: request.request.currentStep,
					approverKind: "workplace_managers",
				});
				approval = await selectOpenApproval(input.requestId, condition);
			}
		}
		if (!approval) {
			throw new ConflictError("This approval step is no longer open");
		}

		const authorization = await authorizeApprovalDecision({
			profileId: input.profileId,
			workplaceId: input.workplaceId,
			approval,
		});
		if (!authorization.allowed) {
			throw new ForbiddenError("You cannot decide this approval step");
		}

		const now = new Date();
		if (input.decision === "declined") {
			const skipped = await db
				.update(timeOffRequests)
				.set({
					status: "declined",
					decidedBy: input.profileId,
					decisionReason: input.reason ?? null,
					decidedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(timeOffRequests.id, request.request.id),
						eq(timeOffRequests.status, "pending"),
					),
				)
				.returning({ id: timeOffRequests.id });
			if (skipped.length === 0) {
				throw new ConflictError("This request has already been decided");
			}
			await db
				.update(leaveRequestApprovals)
				.set({
					status: "declined",
					decidedByProfileId: input.profileId,
					decisionReason: input.reason ?? null,
					decidedAt: now,
				})
				.where(eq(leaveRequestApprovals.id, approval.id));
			await db
				.update(leaveRequestApprovals)
				.set({
					status: "skipped",
					decidedByProfileId: input.profileId,
					decisionReason: "Closed by an earlier decline",
					decidedAt: now,
				})
				.where(
					and(
						eq(leaveRequestApprovals.requestId, request.request.id),
						ne(leaveRequestApprovals.id, approval.id),
						inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
					),
				);
			await notifyEmployments([request.request.employmentId], {
				kind: "time_off_declined",
				title: "Time off declined",
				body: input.reason?.trim() || "Your time-off request was declined.",
			});
			return {
				requestId: request.request.id,
				status: "declined",
				stepOrder: approval.stepOrder,
				completed: true,
				via: authorization.via,
			};
		}

		const [decidedStep] = await db
			.update(leaveRequestApprovals)
			.set({
				status: "approved",
				decidedByProfileId: input.profileId,
				decisionReason: input.reason ?? null,
				decidedAt: now,
			})
			.where(
				and(
					eq(leaveRequestApprovals.id, approval.id),
					inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
				),
			)
			.returning({ id: leaveRequestApprovals.id });
		if (!decidedStep) {
			throw new ConflictError("This approval step is no longer open");
		}

		const [next] = await db
			.select()
			.from(leaveRequestApprovals)
			.where(
				and(
					eq(leaveRequestApprovals.requestId, request.request.id),
					gt(leaveRequestApprovals.stepOrder, approval.stepOrder),
					inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
				),
			)
			.orderBy(asc(leaveRequestApprovals.stepOrder))
			.limit(1);

		if (next) {
			const dueAt =
				next.escalateAfterHours && next.escalateAfterHours > 0
					? new Date(now.getTime() + next.escalateAfterHours * 3_600_000)
					: null;
			await db
				.update(leaveRequestApprovals)
				.set({ dueAt })
				.where(eq(leaveRequestApprovals.id, next.id));
			await db
				.update(timeOffRequests)
				.set({ currentStep: next.stepOrder, updatedAt: now })
				.where(eq(timeOffRequests.id, request.request.id));
			await notifyApprovalStep({
				workplaceId: input.workplaceId,
				step: next,
			});
			return {
				requestId: request.request.id,
				status: "pending",
				stepOrder: next.stepOrder,
				completed: false,
				via: authorization.via,
			};
		}

		await finalizeApprovedRequest({
			workplaceId: input.workplaceId,
			request: request.request,
			profileId: input.profileId,
			decisionReason: input.reason ?? null,
		});
		return {
			requestId: request.request.id,
			status: "approved",
			stepOrder: approval.stepOrder,
			completed: true,
			via: authorization.via,
		};
	});
}

/**
 * Marks the request approved and debits the balance through the ledger. The
 * caller must already hold the request row lock.
 */
export async function finalizeApprovedRequest(input: {
	workplaceId: string;
	request: typeof timeOffRequests.$inferSelect;
	profileId: string;
	decisionReason: string | null;
}): Promise<void> {
	const now = new Date();
	const [updated] = await db
		.update(timeOffRequests)
		.set({
			status: "approved",
			decidedBy: input.profileId,
			decisionReason: input.decisionReason,
			decidedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(timeOffRequests.id, input.request.id),
				eq(timeOffRequests.status, "pending"),
			),
		)
		.returning();
	if (!updated) {
		throw new ConflictError("This request has already been decided");
	}

	if (!updated.leaveTypeId) {
		await notifyEmployments([updated.employmentId], {
			kind: "time_off_approved",
			title: "Time off approved",
			body: input.decisionReason?.trim() || "Your time off was approved.",
		});
		return;
	}

	const context = await loadEmploymentLeaveContext({
		workplaceId: input.workplaceId,
		employmentId: updated.employmentId,
		leaveTypeId: updated.leaveTypeId,
	});
	const chargeMinutes =
		updated.chargeMinutes ??
		describeLeaveWindow(updated.startsAt, updated.endsAt, context.timeZone)
			.chargeMinutes;

	const applied = await applyLeaveLedger({
		workplaceId: input.workplaceId,
		employmentId: updated.employmentId,
		leaveTypeId: updated.leaveTypeId,
		kind: "usage",
		minutes: -Math.abs(chargeMinutes),
		effectiveDate: describeLeaveWindow(
			updated.startsAt,
			updated.endsAt,
			context.timeZone,
		).startDate,
		leaveYearStartMonthDay: context.policy?.leaveYearStartMonthDay ?? "01-01",
		allowNegative: context.policy?.allowNegative ?? false,
		maxNegativeMinutes: context.policy?.maxNegativeMinutes ?? 0,
		requestId: updated.id,
		createdByProfileId: input.profileId,
		idempotencyKey: `usage:${updated.id}`,
		note: "Approved time off",
	});
	if (applied.appliedMinutes !== 0) {
		await db
			.update(timeOffRequests)
			.set({ deductedMinutes: -applied.appliedMinutes })
			.where(eq(timeOffRequests.id, updated.id));
	}

	await notifyEmployments([updated.employmentId], {
		kind: "time_off_approved",
		title: "Time off approved",
		body: input.decisionReason?.trim() || "Your time off was approved.",
	});
}

/** Restores a previously deducted request (cancel or delete). */
export async function restoreApprovedRequestUsage(input: {
	workplaceId: string;
	request: typeof timeOffRequests.$inferSelect;
	profileId: string | null;
	note: string;
}): Promise<void> {
	if (input.request.status !== "approved" || !input.request.leaveTypeId) return;
	const context = await loadEmploymentLeaveContext({
		workplaceId: input.workplaceId,
		employmentId: input.request.employmentId,
		leaveTypeId: input.request.leaveTypeId,
	});
	const fallback = describeLeaveWindow(
		input.request.startsAt,
		input.request.endsAt,
		context.timeZone,
	).chargeMinutes;
	const minutes = input.request.deductedMinutes ?? fallback;
	if (minutes <= 0) return;
	await applyLeaveLedger({
		workplaceId: input.workplaceId,
		employmentId: input.request.employmentId,
		leaveTypeId: input.request.leaveTypeId,
		kind: "restoration",
		minutes,
		effectiveDate: describeLeaveWindow(
			input.request.startsAt,
			input.request.endsAt,
			context.timeZone,
		).startDate,
		leaveYearStartMonthDay: context.policy?.leaveYearStartMonthDay ?? "01-01",
		requestId: input.request.id,
		createdByProfileId: input.profileId,
		idempotencyKey: `restore:${input.request.id}`,
		note: input.note,
	});
}

/**
 * Skips the remaining steps for an emergency and approves immediately. The
 * override is recorded against every skipped step.
 */
export async function expediteLeaveRequest(input: {
	workplaceId: string;
	requestId: string;
	profileId: string;
	reason: string;
}): Promise<DecideApprovalResult> {
	return db.transaction(async () => {
		const [request] = await db
			.select({
				request: timeOffRequests,
				workplaceId: employments.workplaceId,
			})
			.from(timeOffRequests)
			.innerJoin(employments, eq(employments.id, timeOffRequests.employmentId))
			.where(eq(timeOffRequests.id, input.requestId))
			.limit(1)
			.for("update", { of: timeOffRequests });
		if (!request || request.workplaceId !== input.workplaceId) {
			throw new NotFoundError("Time-off request not found");
		}
		if (request.request.status !== "pending") {
			throw new ConflictError("This request has already been decided");
		}
		const now = new Date();
		await db
			.update(leaveRequestApprovals)
			.set({
				status: "skipped",
				decidedByProfileId: input.profileId,
				decisionReason: `Emergency override: ${input.reason}`,
				decidedAt: now,
			})
			.where(
				and(
					eq(leaveRequestApprovals.requestId, request.request.id),
					inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
				),
			);
		await finalizeApprovedRequest({
			workplaceId: input.workplaceId,
			request: request.request,
			profileId: input.profileId,
			decisionReason: `Emergency: ${input.reason}`,
		});
		return {
			requestId: request.request.id,
			status: "approved",
			stepOrder: request.request.currentStep,
			completed: true,
			via: "direct",
		};
	});
}

/**
 * Escalates overdue pending steps to the next step, or to workplace managers
 * when the chain is exhausted. Safe to run repeatedly: each overdue row is
 * claimed with a conditional status update.
 */
export async function escalateOverdueLeaveApprovals(
	limit = 50,
): Promise<{ escalated: number }> {
	const overdue = await db
		.select({
			approval: leaveRequestApprovals,
			request: timeOffRequests,
			workplaceId: employments.workplaceId,
		})
		.from(leaveRequestApprovals)
		.innerJoin(
			timeOffRequests,
			eq(timeOffRequests.id, leaveRequestApprovals.requestId),
		)
		.innerJoin(employments, eq(employments.id, timeOffRequests.employmentId))
		.where(
			and(
				eq(leaveRequestApprovals.status, "pending"),
				lte(leaveRequestApprovals.dueAt, new Date()),
				eq(timeOffRequests.status, "pending"),
			),
		)
		.limit(limit);

	let escalated = 0;
	for (const row of overdue) {
		const now = new Date();
		const [claimed] = await db
			.update(leaveRequestApprovals)
			.set({ status: "escalated", escalatedAt: now })
			.where(
				and(
					eq(leaveRequestApprovals.id, row.approval.id),
					eq(leaveRequestApprovals.status, "pending"),
				),
			)
			.returning({ id: leaveRequestApprovals.id });
		if (!claimed) continue;

		const [next] = await db
			.select()
			.from(leaveRequestApprovals)
			.where(
				and(
					eq(leaveRequestApprovals.requestId, row.approval.requestId),
					gt(leaveRequestApprovals.stepOrder, row.approval.stepOrder),
					inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
				),
			)
			.orderBy(asc(leaveRequestApprovals.stepOrder))
			.limit(1);

		if (next) {
			await db
				.update(leaveRequestApprovals)
				.set({ dueAt: null })
				.where(eq(leaveRequestApprovals.id, next.id));
			await db
				.update(timeOffRequests)
				.set({ currentStep: next.stepOrder, updatedAt: now })
				.where(eq(timeOffRequests.id, row.request.id));
			await notifyApprovalStep({
				workplaceId: row.workplaceId,
				step: next,
			});
			escalated += 1;
			continue;
		}

		const escalationKind =
			row.approval.escalationKind ?? ("workplace_managers" as const);
		const [extra] = await db
			.insert(leaveRequestApprovals)
			.values({
				requestId: row.request.id,
				stepOrder: row.approval.stepOrder + 1,
				approverKind: escalationKind,
				approverEmploymentId: row.approval.escalationEmploymentId,
				approverPrivilege: null,
				dueAt: new Date(now.getTime() + 24 * 3_600_000),
			})
			.returning();
		if (extra) {
			await db
				.update(timeOffRequests)
				.set({ currentStep: extra.stepOrder, updatedAt: now })
				.where(eq(timeOffRequests.id, row.request.id));
			await notifyApprovalStep({
				workplaceId: row.workplaceId,
				step: extra,
			});
			const managers = await managerEmploymentIds(row.workplaceId);
			await notifyEmployments(managers, {
				kind: "leave_escalated",
				title: "Leave request escalated",
				body: "A time-off request was not decided in time and needs attention.",
			});
		}
		escalated += 1;
	}
	return { escalated };
}

/** Current pending step for a request, if any. */
export async function pendingApprovalForRequest(requestId: string) {
	const [row] = await db
		.select()
		.from(leaveRequestApprovals)
		.where(
			and(
				eq(leaveRequestApprovals.requestId, requestId),
				inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
			),
		)
		.orderBy(asc(leaveRequestApprovals.stepOrder))
		.limit(1);
	return row ?? null;
}
