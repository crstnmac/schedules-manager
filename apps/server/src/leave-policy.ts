import {
	db,
	employmentLocations,
	employments,
	holidays,
	type LeavePolicy,
	leavePolicies,
	leaveTypes,
	locations,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { BadRequestError } from "./errors";
import {
	chargeLeaveMinutes,
	daysBetween,
	holidayDatesInRange,
	type LeaveChargeContext,
} from "./leave";

export interface LeavePolicyContext {
	policy: LeavePolicy | null;
	weekendDays: number[];
	timeZone: string;
	employment: {
		id: string;
		workplaceId: string;
		profileId: string;
		joinedAt: Date;
		hourlyWageCents: number | null;
	};
	leaveType: {
		id: string;
		name: string;
		paid: boolean;
		classification: string;
		active: boolean;
	};
}

export interface LeaveChargeDetails extends LeaveChargeContext {
	policyEnabled: boolean;
	noticeDays: number;
	minServiceDays: number;
	maxConsecutiveDays: number | null;
	documentRequiredAfterDays: number | null;
	allowPartialDays: boolean;
}

export async function loadEmploymentLeaveContext(input: {
	workplaceId: string;
	employmentId: string;
	leaveTypeId: string;
	startDate?: string;
	endDate?: string;
}): Promise<LeavePolicyContext & { charge: LeaveChargeDetails }> {
	const [row] = await db
		.select({
			employment: {
				id: employments.id,
				workplaceId: employments.workplaceId,
				profileId: employments.profileId,
				joinedAt: employments.joinedAt,
				createdAt: employments.createdAt,
				hourlyWageCents: employments.hourlyWageCents,
			},
			leaveType: {
				id: leaveTypes.id,
				name: leaveTypes.name,
				paid: leaveTypes.paid,
				classification: leaveTypes.classification,
				active: leaveTypes.active,
			},
			policy: leavePolicies,
			weekendDays: workplaces.weekendDays,
		})
		.from(employments)
		.innerJoin(leaveTypes, eq(leaveTypes.id, input.leaveTypeId))
		.innerJoin(workplaces, eq(workplaces.id, employments.workplaceId))
		.leftJoin(leavePolicies, eq(leavePolicies.leaveTypeId, leaveTypes.id))
		.where(
			and(
				eq(employments.id, input.employmentId),
				eq(employments.workplaceId, input.workplaceId),
				eq(leaveTypes.workplaceId, input.workplaceId),
			),
		)
		.limit(1);
	if (!row) throw new BadRequestError("Leave type not found");

	const timeZone = await employmentTimeZone(
		input.employmentId,
		input.workplaceId,
	);
	const policy = row.policy;
	const charge: LeaveChargeDetails = {
		workingDaysOnly: policy?.chargeWorkingDaysOnly ?? false,
		weekendDays: row.weekendDays,
		holidayDates:
			policy?.chargeWorkingDaysOnly && input.startDate && input.endDate
				? await holidayDatesForEmployment({
						workplaceId: input.workplaceId,
						employmentId: input.employmentId,
						startDate: input.startDate,
						endDate: input.endDate,
					})
				: new Set<string>(),
		policyEnabled: Boolean(policy),
		noticeDays: policy?.noticeDays ?? 0,
		minServiceDays: policy?.minServiceDays ?? 0,
		maxConsecutiveDays: policy?.maxConsecutiveDays ?? null,
		documentRequiredAfterDays: policy?.documentRequiredAfterDays ?? null,
		allowPartialDays: policy?.allowPartialDays ?? true,
	};

	return {
		policy,
		weekendDays: row.weekendDays,
		timeZone,
		leaveType: row.leaveType,
		employment: {
			id: row.employment.id,
			workplaceId: row.employment.workplaceId,
			profileId: row.employment.profileId,
			joinedAt: row.employment.joinedAt
				? new Date(`${row.employment.joinedAt}T12:00:00Z`)
				: row.employment.createdAt,
			hourlyWageCents: row.employment.hourlyWageCents,
		},
		charge,
	};
}

export async function employmentTimeZone(
	employmentId: string,
	workplaceId: string,
): Promise<string> {
	const [scoped] = await db
		.select({ timezone: locations.timezone })
		.from(employmentLocations)
		.innerJoin(locations, eq(locations.id, employmentLocations.locationId))
		.where(eq(employmentLocations.employmentId, employmentId))
		.limit(1);
	if (scoped?.timezone) return scoped.timezone;
	const [any] = await db
		.select({ timezone: locations.timezone })
		.from(locations)
		.where(eq(locations.workplaceId, workplaceId))
		.limit(1);
	return any?.timezone ?? "America/Chicago";
}

export async function holidayDatesForEmployment(input: {
	workplaceId: string;
	employmentId: string;
	startDate: string;
	endDate: string;
}): Promise<Set<string>> {
	const locationRows = await db
		.select({ locationId: employmentLocations.locationId })
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, input.employmentId));
	const locationIds = locationRows.map((row) => row.locationId);

	const rows = await db
		.select({ date: holidays.date, recurring: holidays.recurring })
		.from(holidays)
		.where(
			and(
				eq(holidays.workplaceId, input.workplaceId),
				locationIds.length > 0
					? or(
							isNull(holidays.locationId),
							inArray(holidays.locationId, locationIds),
						)
					: isNull(holidays.locationId),
			),
		);
	return holidayDatesInRange(rows, input.startDate, input.endDate);
}

export async function computeLeaveCharge(input: {
	workplaceId: string;
	employmentId: string;
	leaveTypeId: string;
	allDay: boolean;
	startDate: string;
	endDate: string;
	startsAt: Date;
	endsAt: Date;
}): Promise<{
	minutes: number;
	details: LeaveChargeDetails;
	timeZone: string;
}> {
	const context = await loadEmploymentLeaveContext(input);
	const minutes = chargeLeaveMinutes(
		{
			allDay: input.allDay,
			startDate: input.startDate,
			endDate: input.endDate,
			startsAt: input.startsAt,
			endsAt: input.endsAt,
		},
		{
			workingDaysOnly: context.charge.workingDaysOnly,
			weekendDays: context.charge.weekendDays,
			holidayDates: context.charge.holidayDates,
		},
	);
	return { minutes, details: context.charge, timeZone: context.timeZone };
}

export interface LeaveRequestValidationInput {
	workplaceId: string;
	employmentId: string;
	leaveTypeId: string;
	allDay: boolean;
	startDate: string;
	endDate: string;
	chargeMinutes: number;
	details: LeaveChargeDetails;
	joinedAt: Date;
	isEmergency: boolean;
	/** Manager-recorded or imported leave does not need worker notice. */
	skipNotice?: boolean;
	now?: Date;
}

/** Enforces policy rules; throws BadRequestError on the first violation. */
export function assertLeaveRequestAllowed(
	input: LeaveRequestValidationInput,
): void {
	if (!input.details.policyEnabled) return;
	const now = input.now ?? new Date();
	const todayKey = now.toISOString().slice(0, 10);

	if (input.details.minServiceDays > 0) {
		const served = daysBetween(
			input.joinedAt.toISOString().slice(0, 10),
			todayKey,
		);
		if (served < input.details.minServiceDays) {
			throw new BadRequestError(
				"This Leave Type is available after " +
					`${input.details.minServiceDays} days of service`,
			);
		}
	}

	if (!input.isEmergency && !input.skipNotice && input.details.noticeDays > 0) {
		const notice = daysBetween(todayKey, input.startDate);
		if (notice < input.details.noticeDays) {
			throw new BadRequestError(
				`This Leave Type needs ${input.details.noticeDays} days notice. Mark the request as emergency to override.`,
			);
		}
	}

	if (!input.allDay && !input.details.allowPartialDays) {
		throw new BadRequestError("This Leave Type must be taken in full days");
	}

	if (
		input.details.maxConsecutiveDays != null &&
		input.details.maxConsecutiveDays > 0
	) {
		const span = daysBetween(input.startDate, input.endDate) + 1;
		if (span > input.details.maxConsecutiveDays) {
			throw new BadRequestError(
				`This Leave Type allows at most ${input.details.maxConsecutiveDays} consecutive days`,
			);
		}
	}

	if (input.chargeMinutes <= 0) {
		throw new BadRequestError(
			"This window has no chargeable working days. Choose different dates.",
		);
	}
}

export function requiresDocumentForWindow(
	details: LeaveChargeDetails,
	startDate: string,
	endDate: string,
): boolean {
	if (details.documentRequiredAfterDays == null) return false;
	const span = daysBetween(startDate, endDate) + 1;
	return span > details.documentRequiredAfterDays;
}
