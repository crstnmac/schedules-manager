import {
	DEFAULT_NOTIFICATION_PREFERENCES,
	db,
	type NotificationPreferences,
	type Profile,
	type Workplace,
	workplaces,
} from "@SchedulesManager/db";
import { eq } from "drizzle-orm";

import { ForbiddenError, NotFoundError } from "./errors";

export type WorkplaceSettingsPayload = {
	id: string;
	name: string;
	noticeWindowHours: number;
	weekStartDay: number;
	payPeriodType: Workplace["payPeriodType"];
	payPeriodAnchor: string | null;
	earlyClockInMinutes: number;
	clockRoundMinutes: number;
	autoClockOutGraceMinutes: number;
	overtimeWeeklyMinutes: number;
	overtimeDailyMinutes: number;
	laborCostPercentGoal: number | null;
	managersCanViewLaborCost: boolean;
	messagingEnabled: boolean;
	announcementsEnabled: boolean;
	tasksEnabled: boolean;
	contactDetailsVisible: boolean;
	workerScheduleVisibility: Workplace["workerScheduleVisibility"];
	workerTimeOffVisibility: boolean;
	breaksEnabled: boolean;
	shiftExchangesEnabled: boolean;
	unavailabilityRequiresApproval: boolean;
	clopeningMinutes: number;
	maxConsecutiveWorkDays: number;
	geofenceRequired: boolean;
	lateArrivalGraceMinutes: number;
	timesheetNotesEnabled: boolean;
	leaveCapReset: Workplace["leaveCapReset"];
	leaveCapResetMonthDay: string | null;
	workersCanRequestTimeOff: boolean;
};

export type WorkplaceWorkerPolicies = {
	messagingEnabled: boolean;
	announcementsEnabled: boolean;
	tasksEnabled: boolean;
	contactDetailsVisible: boolean;
	workerScheduleVisibility: Workplace["workerScheduleVisibility"];
	workerTimeOffVisibility: boolean;
	breaksEnabled: boolean;
	shiftExchangesEnabled: boolean;
	workersCanRequestTimeOff: boolean;
	geofenceRequired: boolean;
	timesheetNotesEnabled: boolean;
	unavailabilityRequiresApproval: boolean;
};

const MONTH_DAY = /^(\d{2})-(\d{2})$/;

export function workplaceSettingsPayload(
	workplace: Workplace,
): WorkplaceSettingsPayload {
	return {
		id: workplace.id,
		name: workplace.name,
		noticeWindowHours: workplace.noticeWindowHours,
		weekStartDay: workplace.weekStartDay,
		payPeriodType: workplace.payPeriodType,
		payPeriodAnchor: workplace.payPeriodAnchor,
		earlyClockInMinutes: workplace.earlyClockInMinutes,
		clockRoundMinutes: workplace.clockRoundMinutes,
		autoClockOutGraceMinutes: workplace.autoClockOutGraceMinutes,
		overtimeWeeklyMinutes: workplace.overtimeWeeklyMinutes,
		overtimeDailyMinutes: workplace.overtimeDailyMinutes,
		laborCostPercentGoal: workplace.laborCostPercentGoal,
		managersCanViewLaborCost: workplace.managersCanViewLaborCost,
		messagingEnabled: workplace.messagingEnabled,
		announcementsEnabled: workplace.announcementsEnabled,
		tasksEnabled: workplace.tasksEnabled,
		contactDetailsVisible: workplace.contactDetailsVisible,
		workerScheduleVisibility: workplace.workerScheduleVisibility,
		workerTimeOffVisibility: workplace.workerTimeOffVisibility,
		breaksEnabled: workplace.breaksEnabled,
		shiftExchangesEnabled: workplace.shiftExchangesEnabled,
		unavailabilityRequiresApproval: workplace.unavailabilityRequiresApproval,
		clopeningMinutes: workplace.clopeningMinutes,
		maxConsecutiveWorkDays: workplace.maxConsecutiveWorkDays,
		geofenceRequired: workplace.geofenceRequired,
		lateArrivalGraceMinutes: workplace.lateArrivalGraceMinutes,
		timesheetNotesEnabled: workplace.timesheetNotesEnabled,
		leaveCapReset: workplace.leaveCapReset,
		leaveCapResetMonthDay: workplace.leaveCapResetMonthDay,
		workersCanRequestTimeOff: workplace.workersCanRequestTimeOff,
	};
}

export function workplaceWorkerPolicies(
	workplace: Workplace,
): WorkplaceWorkerPolicies {
	return {
		messagingEnabled: workplace.messagingEnabled,
		announcementsEnabled: workplace.announcementsEnabled,
		tasksEnabled: workplace.tasksEnabled,
		contactDetailsVisible: workplace.contactDetailsVisible,
		workerScheduleVisibility: workplace.workerScheduleVisibility,
		workerTimeOffVisibility: workplace.workerTimeOffVisibility,
		breaksEnabled: workplace.breaksEnabled,
		shiftExchangesEnabled: workplace.shiftExchangesEnabled,
		workersCanRequestTimeOff: workplace.workersCanRequestTimeOff,
		geofenceRequired: workplace.geofenceRequired,
		timesheetNotesEnabled: workplace.timesheetNotesEnabled,
		unavailabilityRequiresApproval: workplace.unavailabilityRequiresApproval,
	};
}

export async function loadWorkplace(workplaceId: string): Promise<Workplace> {
	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.id, workplaceId))
		.limit(1);
	if (!workplace) throw new NotFoundError("Workplace not found");
	return workplace;
}

export async function assertWorkplaceEnabled(
	workplaceId: string,
	flag:
		| "messagingEnabled"
		| "announcementsEnabled"
		| "tasksEnabled"
		| "breaksEnabled"
		| "shiftExchangesEnabled"
		| "workersCanRequestTimeOff",
	message: string,
): Promise<Workplace> {
	const workplace = await loadWorkplace(workplaceId);
	if (!workplace[flag]) throw new ForbiddenError(message);
	return workplace;
}

export function normalizeMonthDay(
	value: string | null | undefined,
): string | null {
	if (value == null || value.trim() === "") return null;
	const match = MONTH_DAY.exec(value.trim());
	if (!match) return null;
	const month = Number(match[1]);
	const day = Number(match[2]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	return `${match[1]}-${match[2]}`;
}

export function normalizeNotificationPreferences(
	value: unknown,
): NotificationPreferences {
	const record =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	return {
		schedule: record.schedule !== false,
		messages: record.messages !== false,
		timeOff: record.timeOff !== false,
		timeClock: record.timeClock !== false,
	};
}

export function mergeNotificationPreferences(
	current: unknown,
	patch?: Partial<NotificationPreferences>,
): NotificationPreferences {
	const base = normalizeNotificationPreferences(
		current ?? DEFAULT_NOTIFICATION_PREFERENCES,
	);
	if (!patch) return base;
	return {
		schedule: patch.schedule ?? base.schedule,
		messages: patch.messages ?? base.messages,
		timeOff: patch.timeOff ?? base.timeOff,
		timeClock: patch.timeClock ?? base.timeClock,
	};
}

export function profilePreferencesPayload(profile: Profile) {
	return {
		id: profile.id,
		email: profile.email,
		fullName: profile.fullName,
		timeFormat: profile.timeFormat,
		nameFormat: profile.nameFormat,
		notificationPreferences: normalizeNotificationPreferences(
			profile.notificationPreferences,
		),
	};
}
