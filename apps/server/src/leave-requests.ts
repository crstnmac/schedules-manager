import {
	db,
	employments,
	type LeavePolicy,
	locations,
	timeOffRequests,
} from "@SchedulesManager/db";
import { and, eq, inArray } from "drizzle-orm";

import { BadRequestError, ConflictError, NotFoundError } from "./errors";
import {
	chargeLeaveMinutes,
	describeLeaveWindow,
	resolveLeaveWindow,
} from "./leave";
import {
	createRequestApprovalSteps,
	recordAutoApprovedStep,
} from "./leave-approvals";
import { applyLeaveLedger } from "./leave-ledger";
import {
	assertLeaveRequestAllowed,
	computeLeaveCharge,
	employmentTimeZone,
	type LeaveChargeDetails,
	loadEmploymentLeaveContext,
} from "./leave-policy";
import { shiftDays } from "./time";

export interface LeaveWindowInput {
	startsAt?: string;
	endsAt?: string;
	startDate?: string;
	endDate?: string;
	allDay?: boolean;
	startMinute?: number;
	endMinute?: number;
	reason?: string;
	leaveTypeId?: string;
}

export interface ResolvedLeaveWindow {
	startsAt: Date;
	endsAt: Date;
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number | null;
	endMinute: number | null;
	chargeMinutes: number;
}

export function resolveLeaveBody(
	body: LeaveWindowInput,
	timeZone: string,
): ResolvedLeaveWindow {
	if (body.startDate) {
		return resolveLeaveWindow({
			startDate: body.startDate,
			endDate: body.endDate ?? body.startDate,
			allDay: body.allDay ?? true,
			startMinute: body.startMinute,
			endMinute: body.endMinute,
			timeZone,
		});
	}
	if (!body.startsAt || !body.endsAt) {
		throw new BadRequestError("Choose a start date");
	}
	const startsAt = new Date(body.startsAt);
	const endsAt = new Date(body.endsAt);
	if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
		throw new BadRequestError("Invalid date or time");
	}
	if (startsAt >= endsAt) {
		throw new BadRequestError("Start must be before end");
	}
	return {
		startsAt,
		endsAt,
		...describeLeaveWindow(startsAt, endsAt, timeZone),
	};
}

export async function workplaceTimeZone(workplaceId: string): Promise<string> {
	const [location] = await db
		.select({ timezone: locations.timezone })
		.from(locations)
		.where(eq(locations.workplaceId, workplaceId))
		.limit(1);
	return location?.timezone ?? "America/Chicago";
}

export type LeaveRecurrenceFrequency = "weekly" | "biweekly" | "monthly";

export interface LeaveRecurrence {
	frequency: LeaveRecurrenceFrequency;
	count: number;
}

/** Expands the first window into a recurring series. */
export function expandRecurrence(
	windows: LeaveWindowInput[],
	recurrence: LeaveRecurrence | undefined,
): LeaveWindowInput[] {
	if (!recurrence || recurrence.count <= 1) return windows;
	const count = Math.min(Math.max(recurrence.count, 1), 52);
	const result: LeaveWindowInput[] = [];
	for (const window of windows) {
		for (let index = 0; index < count; index += 1) {
			if (!window.startDate) {
				throw new BadRequestError(
					"Recurring requests need a start and end date",
				);
			}
			const startDate = addFrequency(
				window.startDate,
				recurrence.frequency,
				index,
			);
			const endDate = addFrequency(
				window.endDate ?? window.startDate,
				recurrence.frequency,
				index,
			);
			result.push({ ...window, startDate, endDate });
		}
	}
	return result.slice(0, 120);
}

function addFrequency(
	dateKey: string,
	frequency: LeaveRecurrenceFrequency,
	steps: number,
): string {
	if (frequency === "weekly") return shiftDays(dateKey, 7 * steps);
	if (frequency === "biweekly") return shiftDays(dateKey, 14 * steps);
	const year = Number(dateKey.slice(0, 4));
	const month = Number(dateKey.slice(5, 7));
	const day = Number(dateKey.slice(8, 10));
	const targetMonthIndex = month - 1 + steps;
	const targetYear = year + Math.floor(targetMonthIndex / 12);
	const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
	const lastDay = new Date(
		Date.UTC(targetYear, targetMonth + 1, 0),
	).getUTCDate();
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`;
}

export interface PreparedLeaveRequest {
	window: ResolvedLeaveWindow;
	reason: string | null;
	leaveTypeId: string | null;
	chargeMinutes: number;
	details: LeaveChargeDetails;
	policy: LeavePolicy | null;
	batchId: string | null;
	isEmergency: boolean;
}

export async function prepareLeaveRequests(input: {
	workplaceId: string;
	employmentId: string;
	windows: LeaveWindowInput[];
	recurrence?: LeaveRecurrence;
	isEmergency?: boolean;
	batchId?: string | null;
	/** Manager-recorded leave skips notice checks. */
	autoApprove?: boolean;
	/** Override the default overlap check (on unless autoApprove). */
	checkOverlaps?: boolean;
	/** Bypass the notice-period rule (manager-recorded and imported leave). */
	skipNotice?: boolean;
}): Promise<PreparedLeaveRequest[]> {
	const timeZone = await employmentTimeZone(
		input.employmentId,
		input.workplaceId,
	);
	const expanded = expandRecurrence(input.windows, input.recurrence);
	if (expanded.length === 0) {
		throw new BadRequestError("Add at least one leave window");
	}
	const isEmergency = input.isEmergency ?? false;
	const prepared: PreparedLeaveRequest[] = [];

	const existing = await db
		.select({
			startsAt: timeOffRequests.startsAt,
			endsAt: timeOffRequests.endsAt,
		})
		.from(timeOffRequests)
		.where(
			and(
				eq(timeOffRequests.employmentId, input.employmentId),
				inArray(timeOffRequests.status, ["pending", "approved"]),
			),
		);

	for (const body of expanded) {
		const window = resolveLeaveBody(body, timeZone);
		const leaveTypeId = body.leaveTypeId ?? null;
		let chargeMinutes = window.chargeMinutes;
		let details: LeaveChargeDetails | null = null;
		let policy: LeavePolicy | null = null;

		if (leaveTypeId) {
			const context = await loadEmploymentLeaveContext({
				workplaceId: input.workplaceId,
				employmentId: input.employmentId,
				leaveTypeId,
				startDate: window.startDate,
				endDate: window.endDate,
			});
			if (!context.leaveType.active) {
				throw new BadRequestError("This Leave Type is no longer available");
			}
			details = context.charge;
			policy = context.policy;
			chargeMinutes = chargeLeaveMinutes(
				{
					allDay: window.allDay,
					startDate: window.startDate,
					endDate: window.endDate,
					startsAt: window.startsAt,
					endsAt: window.endsAt,
				},
				{
					workingDaysOnly: details.workingDaysOnly,
					weekendDays: details.weekendDays,
					holidayDates: details.holidayDates,
				},
			);
			assertLeaveRequestAllowed({
				workplaceId: input.workplaceId,
				employmentId: input.employmentId,
				leaveTypeId,
				allDay: window.allDay,
				startDate: window.startDate,
				endDate: window.endDate,
				chargeMinutes,
				details,
				joinedAt: context.employment.joinedAt,
				isEmergency,
				skipNotice: input.skipNotice ?? input.autoApprove ?? false,
			});
		}

		if (input.checkOverlaps ?? !input.autoApprove) {
			for (const request of existing) {
				if (
					window.startsAt < request.endsAt &&
					window.endsAt > request.startsAt
				) {
					throw new ConflictError(
						"You already have leave on those dates. Edit the existing request instead.",
					);
				}
			}
		}

		prepared.push({
			window,
			reason: body.reason?.trim() || null,
			leaveTypeId,
			chargeMinutes,
			details: details ?? emptyChargeDetails(),
			policy,
			batchId: input.batchId ?? null,
			isEmergency,
		});
	}

	return prepared;
}

function emptyChargeDetails(): LeaveChargeDetails {
	return {
		workingDaysOnly: false,
		weekendDays: [0, 6],
		holidayDates: new Set<string>(),
		policyEnabled: false,
		noticeDays: 0,
		minServiceDays: 0,
		maxConsecutiveDays: null,
		documentRequiredAfterDays: null,
		allowPartialDays: true,
	};
}

export interface CreatedLeaveRequest {
	id: string;
	status: "pending" | "approved";
	window: ResolvedLeaveWindow;
	chargeMinutes: number;
	leaveTypeId: string | null;
	batchId: string | null;
	isEmergency: boolean;
}

/**
 * Inserts prepared requests. Pending requests get their approval chain built;
 * auto-approved requests debit the ledger immediately and record a step.
 */
export async function insertLeaveRequests(input: {
	workplaceId: string;
	employmentId: string;
	profileId: string;
	prepared: PreparedLeaveRequest[];
	autoApprove: boolean;
}): Promise<CreatedLeaveRequest[]> {
	const created: CreatedLeaveRequest[] = [];
	for (const item of input.prepared) {
		const [request] = await db
			.insert(timeOffRequests)
			.values({
				employmentId: input.employmentId,
				startsAt: item.window.startsAt,
				endsAt: item.window.endsAt,
				reason: item.reason,
				leaveTypeId: item.leaveTypeId,
				chargeMinutes: item.chargeMinutes,
				batchId: item.batchId,
				isEmergency: item.isEmergency,
				status: input.autoApprove ? "approved" : "pending",
				decidedBy: input.autoApprove ? input.profileId : null,
				decidedAt: input.autoApprove ? new Date() : null,
			})
			.returning();
		if (!request) throw new Error("Failed to create leave request");

		if (input.autoApprove) {
			await recordAutoApprovedStep({
				requestId: request.id,
				profileId: input.profileId,
				reason: "Recorded by a manager",
			});
			if (item.leaveTypeId) {
				const applied = await applyLeaveLedger({
					workplaceId: input.workplaceId,
					employmentId: input.employmentId,
					leaveTypeId: item.leaveTypeId,
					kind: "usage",
					minutes: -Math.abs(item.chargeMinutes),
					effectiveDate: item.window.startDate,
					leaveYearStartMonthDay:
						item.policy?.leaveYearStartMonthDay ?? "01-01",
					allowNegative: item.policy?.allowNegative ?? false,
					maxNegativeMinutes: item.policy?.maxNegativeMinutes ?? 0,
					requestId: request.id,
					createdByProfileId: input.profileId,
					idempotencyKey: `usage:${request.id}`,
					note: "Recorded time off",
				});
				await db
					.update(timeOffRequests)
					.set({ deductedMinutes: -applied.appliedMinutes })
					.where(eq(timeOffRequests.id, request.id));
			}
		} else {
			await createRequestApprovalSteps({
				requestId: request.id,
				workplaceId: input.workplaceId,
				leaveTypeId: item.leaveTypeId,
			});
		}

		created.push({
			id: request.id,
			status: input.autoApprove ? "approved" : "pending",
			window: item.window,
			chargeMinutes: item.chargeMinutes,
			leaveTypeId: item.leaveTypeId,
			batchId: item.batchId,
			isEmergency: item.isEmergency,
		});
	}
	return created;
}

export async function assertEmploymentInWorkplace(
	workplaceId: string,
	employmentId: string,
): Promise<void> {
	const [member] = await db
		.select({ id: employments.id, status: employments.status })
		.from(employments)
		.where(
			and(
				eq(employments.id, employmentId),
				eq(employments.workplaceId, workplaceId),
			),
		)
		.limit(1);
	if (member?.status !== "active") {
		throw new NotFoundError("Employment not found");
	}
}

export { computeLeaveCharge };
