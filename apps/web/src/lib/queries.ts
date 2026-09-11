import {
	type InfiniteData,
	keepPreviousData,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { api, publicApi } from "./api";

export interface MeProfile {
	id: string;
	email: string;
	fullName: string | null;
	timeFormat: "12h" | "24h";
	nameFormat: "full" | "first_last_initial" | "first";
	notificationPreferences: {
		schedule: boolean;
		messages: boolean;
		timeOff: boolean;
		timeClock: boolean;
	};
}

export interface WorkplaceWorkerPolicies {
	messagingEnabled: boolean;
	announcementsEnabled: boolean;
	tasksEnabled: boolean;
	contactDetailsVisible: boolean;
	workerScheduleVisibility: "own" | "full";
	workerTimeOffVisibility: boolean;
	plannedShiftsVisibility: "never" | "always" | "within_days";
	plannedShiftLeadDays: number;
	breaksEnabled: boolean;
	shiftExchangesEnabled: boolean;
	workersCanRequestTimeOff: boolean;
	geofenceRequired: boolean;
	timesheetNotesEnabled: boolean;
	unavailabilityRequiresApproval: boolean;
}

export interface MeEmployment {
	id: string;
	kind: "manager" | "worker" | "viewer";
	privileges: string[];
	capabilities: {
		scheduling: boolean;
		operations: boolean;
	};
	workplace: {
		id: string;
		name: string;
		policies: WorkplaceWorkerPolicies;
	};
}

export interface MeResponse {
	profile: MeProfile;
	employments: MeEmployment[];
}

export interface LocationDto {
	id: string;
	name: string;
	timezone: string;
	addressLine: string | null;
	latitude?: string | null;
	longitude?: string | null;
	geofenceRadiusMeters?: number | null;
	openMinute?: number | null;
	closeMinute?: number | null;
	kioskEnabled?: boolean;
}

export interface PlaceDto {
	osmId: string;
	name: string;
	addressLine: string;
	latitude: string;
	longitude: string;
	timezone: string | null;
	city: string | null;
	state: string | null;
}

export interface PositionDto {
	id: string;
	name: string;
}

export interface WorkerDto {
	employmentId: string;
	kind: "manager" | "worker" | "viewer";
	status: "active" | "deactivated";
	privileges: string[];
	joinedAt: string;
	hourlyWageCents: number | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	kioskEnabled: boolean;
	profile: {
		id: string;
		email: string;
		fullName: string | null;
	};
	locationIds: string[];
	positionIds: string[];
}

export interface InvitationDto {
	id: string;
	email: string;
	kind: "worker" | "manager" | "viewer";
	status: "pending" | "accepted" | "revoked";
	createdAt: string;
	expiresAt: string;
	token: string | null;
}

export interface WorkersResponse {
	workers: WorkerDto[];
	invitations: InvitationDto[];
}

export function useMe(enabled = true) {
	return useQuery({
		queryKey: ["me"],
		queryFn: () => api<MeResponse>("/v1/me"),
		enabled,
		// Identity and memberships change rarely; native already does this.
		staleTime: 60_000,
	});
}

export interface InvitationPreview {
	email: string;
	kind: "worker" | "manager" | "viewer";
	workplaceName: string;
	status: "pending" | "accepted" | "revoked" | "expired";
	expiresAt: string;
}

export function useInvitationPreview(token: string | undefined) {
	return useQuery({
		queryKey: ["invitation-preview", token],
		queryFn: () => publicApi<InvitationPreview>(`/v1/invitations/${token}`),
		enabled: Boolean(token),
		retry: false,
	});
}

export interface PendingInvitationsResponse {
	invitations: {
		id: string;
		token: string;
		kind: "worker" | "manager" | "viewer";
		workplaceName: string;
		expiresAt: string;
	}[];
}

export function usePendingInvitations(enabled = true) {
	return useQuery({
		queryKey: ["invitations", "pending"],
		queryFn: () => api<PendingInvitationsResponse>("/v1/invitations/pending"),
		enabled,
	});
}

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (token: string) =>
			api<{
				employment: {
					id: string;
					kind: "manager" | "worker" | "viewer";
					workplace: { id: string; name: string };
				};
			}>("/v1/invitations/accept", {
				method: "POST",
				body: { token },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["me"] });
			queryClient.invalidateQueries({ queryKey: ["invitation-preview"] });
			queryClient.invalidateQueries({ queryKey: ["invitations"] });
		},
	});
}

export function useLocations(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplaces", workplaceId, "locations"],
		queryFn: () =>
			api<{ locations: LocationDto[] }>(
				`/v1/workplaces/${workplaceId}/locations`,
			).then((data) => data.locations),
		enabled: Boolean(workplaceId),
		// Catalog data: cheap to keep, expensive to refetch on every focus.
		staleTime: 60_000,
	});
}

export function usePlaceSearch(query: string, enabled: boolean) {
	const q = query.trim();
	return useQuery({
		queryKey: ["places", "search", q],
		queryFn: () =>
			api<{ places: PlaceDto[] }>(`/v1/places?q=${encodeURIComponent(q)}`).then(
				(data) => data.places,
			),
		enabled: enabled && q.length >= 3,
		staleTime: 5 * 60_000,
	});
}

export function reversePlace(lat: number, lon: number) {
	return api<{ place: PlaceDto | null }>(
		`/v1/places/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
	).then((data) => data.place);
}

export function usePositions(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplaces", workplaceId, "positions"],
		queryFn: () =>
			api<{ positions: PositionDto[] }>(
				`/v1/workplaces/${workplaceId}/positions`,
			).then((data) => data.positions),
		enabled: Boolean(workplaceId),
		staleTime: 60_000,
	});
}

export interface LeaveRequestApprovalDto {
	id: string;
	stepOrder: number;
	approverKind: "workplace_managers" | "specific_employment" | "privilege";
	approverEmploymentId: string | null;
	approverPrivilege?: string | null;
	status: "pending" | "approved" | "declined" | "skipped" | "escalated";
	decisionReason: string | null;
	decidedAt: string | null;
	dueAt: string | null;
	escalatedAt: string | null;
}

export interface LeaveDocumentDto {
	id: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: string;
	uploadedByProfileId: string | null;
}

export interface TimeOffRequestDto {
	id: string;
	employmentId: string;
	kind: "manager" | "worker";
	worker: { email: string; fullName: string | null };
	startsAt: string;
	endsAt: string;
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number | null;
	endMinute: number | null;
	chargeMinutes: number;
	reason: string | null;
	status: "pending" | "approved" | "declined" | "cancelled";
	decisionReason: string | null;
	decidedAt: string | null;
	cancelledAt?: string | null;
	createdAt: string;
	leaveTypeId: string | null;
	leaveTypeName: string | null;
	leaveTypePaid: boolean | null;
	remainingMinutes: number;
	deductedMinutes?: number | null;
	batchId?: string | null;
	isEmergency?: boolean;
	currentStep?: number;
	approvals?: LeaveRequestApprovalDto[];
	documents?: LeaveDocumentDto[];
	canDecide?: boolean;
}

export function useTimeOff(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplaces", workplaceId, "time-off"],
		queryFn: () =>
			api<{ requests: TimeOffRequestDto[]; timezone: string }>(
				`/v1/workplaces/${workplaceId}/time-off`,
			).then((data) => data.requests),
		enabled: Boolean(workplaceId),
	});
}

export interface ScheduleShiftDto {
	id: string;
	employmentId: string | null;
	workerName: string | null;
	workerEmail: string | null;
	positionId: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	date: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	note: string | null;
	unavailabilityOverrideReason: string | null;
	tagIds: string[];
	taskCount: number;
	conflicts: {
		shiftId: string;
		type:
			| "overlap"
			| "unavailability"
			| "time_off"
			| "position_access"
			| "location_access";
		message: string;
	}[];
}

export interface ScheduleTimeclockEntry {
	shiftId: string;
	versionShiftId: string;
	status: "open" | "closed" | null;
	clockedInAt: string | null;
	clockedOutAt: string | null;
	workedMinutes: number | null;
	attendance: "late" | "no_show" | "sick" | null;
}

export interface ScheduleLabor {
	scheduledCents: number;
	overtimeCents: number;
	salesCents: number;
	laborPercent: number | null;
	byDate: { date: string; amountCents: number }[];
}

export interface ScheduleResponse {
	schedule: {
		id: string;
		locationId: string;
		weekStartDate: string;
		policyGroupId: string | null;
		teamId: string | null;
		teamName: string | null;
		timezone: string;
		weekStartDay: number;
	};
	publication: {
		latestVersionNumber: number | null;
		publishedAt: string | null;
		hasUnpublishedChanges: boolean;
		versions: {
			id: string;
			versionNumber: number;
			publishedAt: string;
			workers: {
				employmentId: string;
				name: string;
				email: string;
				status: "sent" | "delivered" | "acknowledged";
				acknowledgedAt: string | null;
			}[];
		}[];
	};
	/** Omitted when the query requests exclude=timeclock. */
	timeclock: ScheduleTimeclockEntry[];
	/** null when the query requests exclude=labor. */
	labor: ScheduleLabor | null;
	shifts: ScheduleShiftDto[];
	staff: {
		employmentId: string;
		name: string;
		email: string;
		kind: "manager" | "worker";
		hourlyWageCents: number | null;
		groupIds: string[];
		positionIds: string[];
		preference: string | null;
		unavailability: {
			kind: "recurring" | "date";
			weekday: number | null;
			date: string | null;
			startMinute: number;
			endMinute: number;
			note: string | null;
		}[];
		timeOff: {
			startsAt: string;
			endsAt: string;
			reason: string | null;
			status: "pending" | "approved" | "declined";
		}[];
	}[];
	hours: {
		employmentId: string;
		name: string;
		minutes: number;
		byPosition: {
			positionId: string;
			positionName: string;
			minutes: number;
		}[];
	}[];
	positions: PositionDto[];
}

const SCHEDULE_STALE_TIME = 2 * 60 * 1000;
const SCHEDULE_CACHE_TIME = 30 * 60 * 1000;

export interface ScheduleTeamDto {
	id: string;
	name: string;
	color: string | null;
	locationId: string;
}

export function useScheduleTeams(locationId: string | undefined) {
	return useQuery({
		queryKey: ["schedule-teams", locationId],
		queryFn: () =>
			api<{ teams: ScheduleTeamDto[] }>(
				`/v1/locations/${locationId}/schedule-teams`,
			).then((data) => data.teams),
		enabled: Boolean(locationId),
	});
}

export function useCreateScheduleTeam(locationId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { name: string; color?: string | null }) =>
			api<{ team: ScheduleTeamDto }>(
				`/v1/locations/${locationId}/schedule-teams`,
				{ method: "POST", body: input },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["schedule-teams", locationId],
			});
		},
	});
}

export function useUpdateScheduleTeam(locationId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			teamId: string;
			name?: string;
			color?: string | null;
		}) => {
			const { teamId, ...body } = input;
			return api<{ team: ScheduleTeamDto }>(
				`/v1/locations/${locationId}/schedule-teams/${teamId}`,
				{ method: "PATCH", body },
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["schedule-teams", locationId],
			});
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
		},
	});
}

export function useDeleteScheduleTeam(locationId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (teamId: string) =>
			api<{ ok: true }>(
				`/v1/locations/${locationId}/schedule-teams/${teamId}`,
				{ method: "DELETE" },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["schedule-teams", locationId],
			});
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
		},
	});
}

function teamQueryParam(teamId: string | null | undefined): string {
	return teamId ? `teamId=${teamId}` : "";
}

export function scheduleQueryOptions(
	locationId: string,
	weekStart: string,
	teamId?: string | null,
) {
	const team = teamQueryParam(teamId);
	return queryOptions({
		queryKey: ["schedule", locationId, weekStart, teamId ?? null] as const,
		queryFn: () =>
			api<ScheduleResponse>(
				`/v1/locations/${locationId}/schedules/${weekStart}?exclude=labor,timeclock${team ? `&${team}` : ""}`,
			),
		staleTime: SCHEDULE_STALE_TIME,
		gcTime: SCHEDULE_CACHE_TIME,
		refetchOnMount: false,
	});
}

export function useScheduleTimeclock(
	locationId: string | undefined,
	weekStart: string | undefined,
	teamId?: string | null,
) {
	const team = teamQueryParam(teamId);
	return useQuery({
		queryKey: [
			"schedule-timeclock",
			locationId,
			weekStart,
			teamId ?? null,
		] as const,
		queryFn: () =>
			api<{ timeclock: ScheduleTimeclockEntry[] }>(
				`/v1/locations/${locationId}/schedules/${weekStart}/timeclock${team ? `?${team}` : ""}`,
			).then((data) => data.timeclock),
		enabled: Boolean(locationId && weekStart),
		staleTime: SCHEDULE_STALE_TIME,
		gcTime: SCHEDULE_CACHE_TIME,
		refetchOnMount: false,
	});
}

export function useScheduleLabor(
	locationId: string | undefined,
	weekStart: string | undefined,
	teamId?: string | null,
) {
	const team = teamQueryParam(teamId);
	return useQuery({
		queryKey: [
			"schedule-labor",
			locationId,
			weekStart,
			teamId ?? null,
		] as const,
		queryFn: () =>
			api<{ labor: ScheduleLabor }>(
				`/v1/locations/${locationId}/schedules/${weekStart}/labor${team ? `?${team}` : ""}`,
			).then((data) => data.labor),
		enabled: Boolean(locationId && weekStart),
		staleTime: SCHEDULE_STALE_TIME,
		gcTime: SCHEDULE_CACHE_TIME,
		refetchOnMount: false,
	});
}

export function useSchedule(
	locationId: string | undefined,
	weekStart: string | undefined,
	teamId?: string | null,
) {
	return useQuery({
		...scheduleQueryOptions(locationId ?? "", weekStart ?? "", teamId),
		enabled: Boolean(locationId && weekStart),
		placeholderData: keepPreviousData,
	});
}

export interface ScheduleCalendarResponse {
	monthStart: string;
	shifts: ScheduleShiftDto[];
	timeclock: ScheduleResponse["timeclock"];
}

export function useScheduleCalendar(
	locationId: string | undefined,
	monthStart: string | undefined,
	enabled = true,
	teamId?: string | null,
) {
	const team = teamQueryParam(teamId);
	return useQuery({
		queryKey: [
			"schedule-calendar",
			locationId,
			monthStart,
			teamId ?? null,
		] as const,
		queryFn: () =>
			api<ScheduleCalendarResponse>(
				`/v1/locations/${locationId}/calendar/${monthStart}${team ? `?${team}` : ""}`,
			),
		enabled: Boolean(locationId && monthStart) && enabled,
		staleTime: SCHEDULE_STALE_TIME,
		gcTime: SCHEDULE_CACHE_TIME,
		placeholderData: keepPreviousData,
	});
}

export interface ChangePreviewResponse {
	hasPublishedVersion: boolean;
	noticeWindowHours: number;
	changes: {
		kind: "added" | "removed" | "time_changed" | "note_changed";
		material: boolean;
		employmentId: string | null;
		summary: string;
	}[];
	materialCount: number;
	wouldRequireAcceptance: number;
}

export function useChangePreview(
	scheduleId: string | undefined,
	enabled: boolean,
) {
	return useQuery({
		queryKey: ["change-preview", scheduleId],
		queryFn: () =>
			api<ChangePreviewResponse>(`/v1/schedules/${scheduleId}/change-preview`),
		enabled: Boolean(scheduleId) && enabled,
	});
}

export interface AcceptancesResponse {
	acceptances: {
		id: string;
		versionNumber: number;
		workerName: string;
		workerEmail: string;
		status: "pending" | "accepted" | "declined";
		changeSummary: string;
		shiftStartsAt: string;
		respondedAt: string | null;
	}[];
}

export function useAcceptances(scheduleId: string | undefined) {
	return useQuery({
		queryKey: ["acceptances", scheduleId],
		queryFn: () =>
			api<AcceptancesResponse>(`/v1/schedules/${scheduleId}/acceptances`),
		enabled: Boolean(scheduleId),
	});
}

export interface WorkplaceSettings {
	id: string;
	name: string;
	noticeWindowHours: number;
	weekStartDay: number;
	payPeriodType: "weekly" | "biweekly" | "semimonthly" | "monthly";
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
	workerScheduleVisibility: "own" | "full";
	workerTimeOffVisibility: boolean;
	plannedShiftsVisibility: "never" | "always" | "within_days";
	plannedShiftLeadDays: number;
	breaksEnabled: boolean;
	shiftExchangesEnabled: boolean;
	unavailabilityRequiresApproval: boolean;
	autoAcceptShiftPickups: boolean;
	autoAcceptShiftSwaps: boolean;
	autoAcceptShiftReleases: boolean;
	autoAcceptLateChanges: boolean;
	clopeningMinutes: number;
	maxConsecutiveWorkDays: number;
	geofenceRequired: boolean;
	lateArrivalGraceMinutes: number;
	timesheetNotesEnabled: boolean;
	leaveCapReset: "none" | "calendar_year" | "hire_date" | "custom_date";
	leaveCapResetMonthDay: string | null;
	weekendDays: number[];
	workersCanRequestTimeOff: boolean;
}

/**
 * Weekdays that do not count as working days, 0 = Sunday, matching the
 * server-side default. Used when a cached response predates the field.
 */
export const DEFAULT_WEEKEND_DAYS = [0, 6];

export function useWorkplaceSettings(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplace-settings", workplaceId],
		queryFn: () =>
			api<{ workplace: WorkplaceSettings }>(
				`/v1/workplaces/${workplaceId}`,
			).then((data) => ({
				...data.workplace,
				weekendDays: data.workplace.weekendDays ?? DEFAULT_WEEKEND_DAYS,
			})),
		enabled: Boolean(workplaceId),
	});
}

export interface BillingSummary {
	subscription: {
		plan: "schedule" | "operations";
		billingInterval: "month" | "year";
		status: string;
		locationCount: number;
		currentPeriodEnd: string | null;
		cancelAtPeriodEnd: boolean;
		canManage: boolean;
	} | null;
	locationCount: number;
	capabilities: {
		scheduling: boolean;
		operations: boolean;
	};
	catalog: Record<"schedule" | "operations", Record<"month" | "year", number>>;
}

export function useBilling(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["billing", workplaceId],
		queryFn: () => api<BillingSummary>(`/v1/workplaces/${workplaceId}/billing`),
		enabled: Boolean(workplaceId),
	});
}

export interface SwapDetailDto {
	id: string;
	status:
		| "pending_counterpart"
		| "pending_manager"
		| "approved"
		| "declined_by_counterpart"
		| "declined_by_manager"
		| "cancelled";
	requestedAt: string;
	requester: { employmentId: string; name: string };
	counterpart: { employmentId: string; name: string };
	requesterShift: {
		id: string;
		positionName: string;
		startsAt: string;
		endsAt: string;
	};
	counterpartShift: {
		id: string;
		positionName: string;
		startsAt: string;
		endsAt: string;
	};
}

export function useMySwaps(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["swaps", workplaceId],
		queryFn: () =>
			api<{
				swaps: { direction: "outgoing" | "incoming"; swap: SwapDetailDto }[];
			}>(`/v1/workplaces/${workplaceId}/my/swaps`),
		enabled: Boolean(workplaceId),
	});
}

export function useRespondToSwap() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { swapId: string; decision: "accept" | "decline" }) =>
			api(`/v1/my/swaps/${input.swapId}/respond`, {
				method: "POST",
				body: { decision: input.decision },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["swaps"] });
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
			queryClient.invalidateQueries({ queryKey: ["coverage-swaps"] });
		},
	});
}

export function useCancelSwap() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (swapId: string) =>
			api(`/v1/my/swaps/${swapId}/cancel`, { method: "POST" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["swaps"] });
			queryClient.invalidateQueries({ queryKey: ["coverage-swaps"] });
		},
	});
}

export function useCoverageSwaps(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["coverage-swaps", workplaceId],
		queryFn: () =>
			api<{ swaps: SwapDetailDto[] }>(
				`/v1/workplaces/${workplaceId}/coverage/swaps`,
			).then((data) => data.swaps),
		enabled: Boolean(workplaceId),
	});
}

export function useSwapDecision(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			swapId: string;
			decision: "approved" | "declined";
		}) =>
			api(`/v1/workplaces/${workplaceId}/swaps/${input.swapId}/decision`, {
				method: "POST",
				body: { decision: input.decision },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["coverage-swaps"] });
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
		},
	});
}

export function useWorkers(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplaces", workplaceId, "workers"],
		queryFn: () =>
			api<WorkersResponse>(`/v1/workplaces/${workplaceId}/workers`),
		enabled: Boolean(workplaceId),
	});
}

export interface PublishedWeek {
	weekStart: string;
	locationId: string;
	timezone: string;
	version: {
		id: string;
		versionNumber: number;
		publishedAt: string;
	} | null;
	deliveryStatus: "sent" | "delivered" | "acknowledged" | null;
	shifts: {
		id: string;
		employmentId: string | null;
		workerName: string | null;
		isMine: boolean;
		positionName: string;
		startsAt: string;
		endsAt: string;
		date: string;
		startMinute: number;
		endMinute: number;
		overnight: boolean;
		note: string | null;
		planned?: boolean;
		releaseStatus: "pending" | null;
		timeEntry: {
			clockedInAt: string;
			clockedOutAt: string | null;
		} | null;
	}[];
}

export interface MyScheduleResponse {
	weekStartDay: number;
	currentWeek: PublishedWeek | null;
	nextWeek: PublishedWeek | null;
	nextShift: {
		id: string;
		positionName: string;
		startsAt: string;
		endsAt: string;
		date: string;
		startMinute: number;
		endMinute: number;
		overnight: boolean;
		planned: boolean;
		timeEntry: {
			clockedInAt: string;
			clockedOutAt: string | null;
		} | null;
	} | null;
	currentChanges: string[];
	pendingAcceptances: {
		id: string;
		changeSummary: string;
		positionName: string;
		date: string;
		startMinute: number;
	}[];
	history: {
		versionId: string;
		versionNumber: number;
		weekStart: string;
		publishedAt: string;
	}[];
}

export function useMySchedule(
	workplaceId: string | undefined,
	scope: "home" | "full" = "full",
) {
	return useQuery({
		queryKey: ["my-schedule", workplaceId, scope],
		queryFn: () =>
			api<MyScheduleResponse>(
				`/v1/workplaces/${workplaceId}/my/schedule${scope === "home" ? "?scope=home" : ""}`,
			),
		enabled: Boolean(workplaceId),
	});
}

export interface DayRosterEntry {
	versionShiftId: string;
	employmentId: string | null;
	workerName: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	mine: boolean;
}

export function useDayRoster(
	workplaceId: string | undefined,
	date: string | undefined,
) {
	return useQuery({
		queryKey: ["day-roster", workplaceId, date],
		queryFn: () =>
			api<{ roster: DayRosterEntry[] }>(
				`/v1/workplaces/${workplaceId}/my/day-roster?date=${date}`,
			),
		enabled: Boolean(workplaceId && date),
	});
}

export function useProposeSwap() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			requesterShiftId: string;
			counterpartEmploymentId: string;
			counterpartShiftId: string;
		}) =>
			api<{ swap: SwapDetailDto }>("/v1/my/swaps", {
				method: "POST",
				body: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["swaps"] });
			queryClient.invalidateQueries({ queryKey: ["coverage-swaps"] });
		},
	});
}

export function useAcknowledge() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (versionId: string) =>
			api(`/v1/my/deliveries/${versionId}/acknowledge`, { method: "POST" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
		},
	});
}

export function useClockIn() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (versionShiftId: string) => {
			const { currentCoords } = await import("./coords");
			const coords = await currentCoords();
			return api<{ timeEntry: { id: string; clockedInAt: string } }>(
				`/v1/my/shifts/${versionShiftId}/clock-in`,
				{ method: "POST", body: coords },
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
			queryClient.invalidateQueries({ queryKey: ["timecard"] });
		},
	});
}

export function useClockOut() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (
			input: string | { versionShiftId: string; workerNote?: string },
		) => {
			const versionShiftId =
				typeof input === "string" ? input : input.versionShiftId;
			const workerNote =
				typeof input === "string" ? undefined : input.workerNote;
			return api<{
				timeEntry: {
					id: string;
					clockedOutAt: string | null;
					workerNote: string | null;
				};
			}>(`/v1/my/shifts/${versionShiftId}/clock-out`, {
				method: "POST",
				body: workerNote ? { workerNote } : undefined,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
			queryClient.invalidateQueries({ queryKey: ["timecard"] });
		},
	});
}

export interface TimecardEntry {
	id: string;
	versionShiftId: string;
	positionName: string;
	shiftStartsAt: string;
	shiftEndsAt: string;
	clockedInAt: string;
	clockedOutAt: string | null;
	workerNote: string | null;
	openBreakStartedAt: string | null;
}

export function useMyTimeEntries(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["timecard", workplaceId],
		queryFn: () =>
			api<{ timeEntries: TimecardEntry[] }>(
				`/v1/workplaces/${workplaceId}/my/time-entries`,
			),
		enabled: Boolean(workplaceId),
	});
}

export function useRespondToAcceptance() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			acceptanceId: string;
			decision: "accept" | "decline";
		}) =>
			api(`/v1/my/shift-acceptances/${input.acceptanceId}/${input.decision}`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
		},
	});
}

export interface OpenShiftDto {
	id: string;
	locationName: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	date: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	myPickupStatus: "pending" | "approved" | "declined" | null;
}

export function useOpenShifts(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["open-shifts", workplaceId],
		queryFn: () =>
			api<{ openShifts: OpenShiftDto[] }>(
				`/v1/workplaces/${workplaceId}/open-shifts`,
			),
		enabled: Boolean(workplaceId),
	});
}

export function useRequestRelease() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (versionShiftId: string) =>
			api("/v1/my/releases", {
				method: "POST",
				body: { versionShiftId },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
		},
	});
}

export function useRequestPickup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (openShiftId: string) =>
			api(`/v1/open-shifts/${openShiftId}/pickups`, { method: "POST" }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["open-shifts"] });
		},
	});
}

export interface WorkerConstraints {
	timezone: string;
	unavailability: {
		id: string;
		kind: "recurring" | "date";
		weekday: number | null;
		date: string | null;
		startMinute: number;
		endMinute: number;
		note: string | null;
	}[];
	preference: string | null;
	timeOff: {
		id: string;
		startsAt: string;
		endsAt: string;
		startDate: string;
		endDate: string;
		allDay: boolean;
		startMinute: number | null;
		endMinute: number | null;
		chargeMinutes: number;
		reason: string | null;
		status: "pending" | "approved" | "declined" | "cancelled";
		decisionReason: string | null;
		leaveTypeId: string | null;
		batchId?: string | null;
		isEmergency?: boolean;
		currentStep?: number;
		createdAt?: string;
		cancelledAt?: string | null;
		approvals?: LeaveRequestApprovalDto[];
		documents?: LeaveDocumentDto[];
	}[];
}

export function useMyConstraints(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["constraints", workplaceId],
		queryFn: () =>
			api<WorkerConstraints>(`/v1/workplaces/${workplaceId}/my/constraints`),
		enabled: Boolean(workplaceId),
	});
}

export function usePublishedVersion(versionId: string | undefined) {
	return useQuery({
		queryKey: ["published-version", versionId],
		queryFn: () => api<PublishedWeek>(`/v1/my/versions/${versionId}`),
		enabled: Boolean(versionId),
	});
}

export interface InboxNotification {
	id: string;
	kind: string;
	title: string;
	body: string;
	readAt: string | null;
	createdAt: string;
}

export interface NotificationsResponse {
	unreadCount: number;
	notifications: InboxNotification[];
}

export function useNotifications(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["notifications", workplaceId],
		queryFn: () =>
			api<NotificationsResponse>(
				`/v1/workplaces/${workplaceId}/my/notifications`,
			),
		enabled: Boolean(workplaceId),
	});
}

export function useMarkNotificationRead(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (notificationId: string) =>
			api(
				`/v1/workplaces/${workplaceId}/my/notifications/${notificationId}/read`,
				{
					method: "POST",
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		},
	});
}

export function useMarkAllNotificationsRead(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/notifications/read-all`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		},
	});
}

export interface AuditEventDto {
	id: string;
	action: string;
	entityType: string;
	entityId: string | null;
	summary: string;
	actorName: string | null;
	createdAt: string;
}

export function useAudit(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["audit", workplaceId],
		queryFn: () =>
			api<{ events: AuditEventDto[] }>(
				`/v1/workplaces/${workplaceId}/audit`,
			).then((data) => data.events),
		enabled: Boolean(workplaceId),
	});
}

export interface PilotStatusResponse {
	counts: {
		locations: number;
		positions: number;
		activeWorkers: number;
		pendingInvitations: number;
		draftShifts: number;
		publishedVersions: number;
		unacknowledgedDeliveries: number;
	};
	feedback: {
		id: string;
		category: "problem" | "idea" | "question";
		message: string;
		page: string | null;
		createdAt: string;
		reporter: string | null;
	}[];
}

export function usePilotStatus(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["pilot-status", workplaceId],
		queryFn: () =>
			api<PilotStatusResponse>(`/v1/workplaces/${workplaceId}/pilot-status`),
		enabled: Boolean(workplaceId),
	});
}

export interface ScheduleTemplateDto {
	id: string;
	locationId: string;
	name: string;
	shiftCount: number;
	updatedAt: string;
}

export function useScheduleTemplates(locationId: string | undefined) {
	return useQuery({
		queryKey: ["schedule-templates", locationId],
		queryFn: () =>
			api<{ templates: ScheduleTemplateDto[] }>(
				`/v1/locations/${locationId}/schedule-templates`,
			).then((data) => data.templates),
		enabled: Boolean(locationId),
	});
}

export function useSaveScheduleTemplate(locationId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			weekStart: string;
			name: string;
			teamId?: string | null;
		}) =>
			api(
				`/v1/locations/${locationId}/schedules/${input.weekStart}/templates`,
				{
					method: "POST",
					body: { name: input.name, teamId: input.teamId ?? null },
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["schedule-templates"] });
		},
	});
}

export function useApplyScheduleTemplate(locationId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			weekStart: string;
			templateId: string;
			teamId?: string | null;
		}) =>
			api(
				`/v1/locations/${locationId}/schedules/${input.weekStart}/templates/${input.templateId}/apply`,
				{ method: "POST", body: { teamId: input.teamId ?? null } },
			),
		onSuccess: (_result, input) => {
			// The template only touches the week it was applied to.
			queryClient.invalidateQueries({
				queryKey: [
					"schedule",
					locationId,
					input.weekStart,
					input.teamId ?? null,
				],
			});
		},
	});
}

export function useMarkAttendance(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			versionShiftId: string;
			kind: "late" | "no_show" | "sick";
			note?: string;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/version-shifts/${input.versionShiftId}/attendance`,
				{
					method: "POST",
					body: { kind: input.kind, note: input.note },
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
		},
	});
}

export function useEditTimeEntry(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			versionShiftId: string;
			clockedInAt: string;
			clockedOutAt: string | null;
			reason: string;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/version-shifts/${input.versionShiftId}/time-entry`,
				{
					method: "PUT",
					body: {
						clockedInAt: input.clockedInAt,
						clockedOutAt: input.clockedOutAt,
						reason: input.reason,
					},
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
			queryClient.invalidateQueries({ queryKey: ["timecard"] });
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
		},
	});
}

export function useGroups(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["groups", workplaceId],
		queryFn: () =>
			api<{
				groups: { id: string; name: string; employmentIds: string[] }[];
			}>(`/v1/workplaces/${workplaceId}/groups`),
		enabled: Boolean(workplaceId),
	});
}

export function useTags(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["tags", workplaceId],
		queryFn: () =>
			api<{ tags: { id: string; name: string }[] }>(
				`/v1/workplaces/${workplaceId}/tags`,
			),
		enabled: Boolean(workplaceId),
	});
}

export interface LeavePolicyDto {
	leaveTypeId: string;
	workplaceId: string;
	accrualMethod:
		| "none"
		| "weekly"
		| "biweekly"
		| "semimonthly"
		| "monthly"
		| "annual"
		| "per_hour_worked";
	accrualMinutes: number;
	accrualDay: number;
	accrualWeekday: number;
	annualAccrualMonthDay: string | null;
	accrualPerHoursWorked: number;
	prorateOnJoin: boolean;
	maxBalanceMinutes: number | null;
	carryForwardEnabled: boolean;
	maxCarryForwardMinutes: number | null;
	carryForwardExpiryMonths: number | null;
	allowNegative: boolean;
	maxNegativeMinutes: number;
	chargeWorkingDaysOnly: boolean;
	minServiceDays: number;
	noticeDays: number;
	maxConsecutiveDays: number | null;
	documentRequiredAfterDays: number | null;
	encashmentEnabled: boolean;
	maxEncashmentMinutesPerYear: number | null;
	allowPartialDays: boolean;
	leaveYearStartMonthDay: string;
	leaveTypeName?: string;
}

export interface LeaveTypeDto {
	id: string;
	name: string;
	paid: boolean;
	code: string | null;
	description: string | null;
	classification: "standard" | "floating_holiday" | "working_away" | "special";
	active: boolean;
	approvalChainId: string | null;
	policy: LeavePolicyDto | null;
}

export function useLeaveTypes(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["leave-types", workplaceId],
		queryFn: () =>
			api<{ leaveTypes: LeaveTypeDto[] }>(
				`/v1/workplaces/${workplaceId}/leave-types`,
			),
		enabled: Boolean(workplaceId),
	});
}

export function useLeavePolicies(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["leave-policies", workplaceId],
		queryFn: () =>
			api<{ policies: LeavePolicyDto[] }>(
				`/v1/workplaces/${workplaceId}/leave-policies`,
			).then((data) => data.policies),
		enabled: Boolean(workplaceId),
	});
}

export function useUpsertLeavePolicy(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { leaveTypeId: string } & Partial<LeavePolicyDto>) => {
			const { leaveTypeId, ...body } = input;
			return api<{ policy: LeavePolicyDto }>(
				`/v1/workplaces/${workplaceId}/leave-types/${leaveTypeId}/policy`,
				{ method: "PUT", body },
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-policies", workplaceId],
			});
			queryClient.invalidateQueries({ queryKey: ["leave-types", workplaceId] });
		},
	});
}

export interface ApprovalChainStepDto {
	id?: string;
	stepOrder?: number;
	approverKind: "workplace_managers" | "specific_employment" | "privilege";
	approverEmploymentId: string | null;
	approverPrivilege: string | null;
	escalateAfterHours: number | null;
	escalationKind:
		| "workplace_managers"
		| "specific_employment"
		| "privilege"
		| null;
	escalationEmploymentId: string | null;
}

export interface ApprovalChainDto {
	id: string;
	workplaceId: string;
	name: string;
	description: string | null;
	isDefault: boolean;
	steps: ApprovalChainStepDto[];
}

export function useApprovalChains(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["leave-approval-chains", workplaceId],
		queryFn: () =>
			api<{ chains: ApprovalChainDto[] }>(
				`/v1/workplaces/${workplaceId}/leave-approval-chains`,
			).then((data) => data.chains),
		enabled: Boolean(workplaceId),
	});
}

export function useSaveApprovalChain(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			id?: string;
			name: string;
			description?: string | null;
			isDefault?: boolean;
			steps: ApprovalChainStepDto[];
		}) => {
			const { id, ...body } = input;
			return api(
				id
					? `/v1/workplaces/${workplaceId}/leave-approval-chains/${id}`
					: `/v1/workplaces/${workplaceId}/leave-approval-chains`,
				{ method: id ? "PUT" : "POST", body },
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-approval-chains", workplaceId],
			});
		},
	});
}

export function useDeleteApprovalChain(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (chainId: string) =>
			api(`/v1/workplaces/${workplaceId}/leave-approval-chains/${chainId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-approval-chains", workplaceId],
			});
		},
	});
}

export interface LeaveLedgerEntryDto {
	id: string;
	employmentId: string;
	leaveTypeId: string;
	leaveTypeName: string;
	kind:
		| "initial"
		| "accrual"
		| "usage"
		| "adjustment"
		| "carry_forward"
		| "expiry"
		| "encashment"
		| "transfer_in"
		| "transfer_out"
		| "restoration";
	minutes: number;
	metaMinutes: number | null;
	balanceAfter: number;
	effectiveDate: string;
	leaveYear: number;
	requestId: string | null;
	note: string | null;
	createdAt: string;
}

export function useLeaveLedger(
	workplaceId: string | undefined,
	employmentId: string | undefined,
	leaveTypeId?: string | undefined,
) {
	return useQuery({
		queryKey: ["leave-ledger", workplaceId, employmentId, leaveTypeId ?? "all"],
		queryFn: () => {
			const params = new URLSearchParams();
			if (employmentId) params.set("employmentId", employmentId);
			if (leaveTypeId) params.set("leaveTypeId", leaveTypeId);
			params.set("limit", "200");
			return api<{ entries: LeaveLedgerEntryDto[] }>(
				`/v1/workplaces/${workplaceId}/leave-ledger?${params.toString()}`,
			).then((data) => data.entries);
		},
		enabled: Boolean(workplaceId),
	});
}

export interface LeaveBalanceDto {
	employmentId: string;
	employmentName: string | null;
	employmentEmail: string;
	employmentKind: "manager" | "worker" | "viewer";
	leaveTypeId: string;
	leaveTypeName: string;
	leaveTypePaid: boolean;
	balanceMinutes: number;
	accruedMinutes: number;
	usedMinutes: number;
	carriedMinutes: number;
	encashedMinutes: number;
	adjustedMinutes: number;
	expiredMinutes: number;
	pendingMinutes: number;
}

export function useLeaveBalances(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["leave-balances", workplaceId],
		queryFn: () =>
			api<{ balances: LeaveBalanceDto[] }>(
				`/v1/workplaces/${workplaceId}/leave-balances`,
			).then((data) => data.balances),
		enabled: Boolean(workplaceId),
	});
}

export interface LeaveEncashmentDto {
	id: string;
	workplaceId: string;
	employmentId: string;
	leaveTypeId: string;
	minutes: number;
	hourlyWageCentsSnapshot: number | null;
	amountCents: number;
	status: "requested" | "approved" | "declined" | "paid" | "cancelled";
	requestedByProfileId: string | null;
	decidedByProfileId: string | null;
	decisionReason: string | null;
	decidedAt: string | null;
	paidAt: string | null;
	note: string | null;
	createdAt: string;
	updatedAt: string;
	employmentName?: string | null;
	employmentEmail?: string;
	leaveTypeName?: string;
}

export function useLeaveEncashments(
	workplaceId: string | undefined,
	status?: string,
) {
	return useQuery({
		queryKey: ["leave-encashments", workplaceId, status ?? "all"],
		queryFn: () =>
			api<{ encashments: LeaveEncashmentDto[] }>(
				`/v1/workplaces/${workplaceId}/leave-encashments${
					status ? `?status=${status}` : ""
				}`,
			).then((data) => data.encashments),
		enabled: Boolean(workplaceId),
	});
}

export interface LeaveForecastPointDto {
	month: string;
	accruedMinutes: number;
	plannedUsageMinutes: number;
	balanceMinutes: number;
}

export interface LeaveForecastDto {
	leaveTypeId: string;
	leaveTypeName: string;
	startingMinutes: number;
	points: LeaveForecastPointDto[];
	pendingMinutes: number;
}

export function useLeaveForecast(
	workplaceId: string | undefined,
	employmentId: string | undefined,
	months = 12,
) {
	return useQuery({
		queryKey: ["leave-forecast", workplaceId, employmentId, months],
		queryFn: () =>
			api<{ forecast: LeaveForecastDto[] }>(
				`/v1/workplaces/${workplaceId}/employments/${employmentId}/leave-forecast?months=${months}`,
			).then((data) => data.forecast),
		enabled: Boolean(workplaceId && employmentId),
	});
}

export interface CalendarTokenDto {
	id: string;
	employmentId: string | null;
	label: string | null;
	revokedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
	url?: string;
}

export function useCalendarTokens(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["calendar-tokens", workplaceId],
		queryFn: () =>
			api<{ tokens: CalendarTokenDto[] }>(
				`/v1/workplaces/${workplaceId}/calendar-tokens`,
			).then((data) => data.tokens),
		enabled: Boolean(workplaceId),
	});
}

export function useCreateMyCalendarToken(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api<{ token: CalendarTokenDto }>(
				`/v1/workplaces/${workplaceId}/my/calendar-token`,
				{ method: "POST" },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["calendar-tokens", workplaceId],
			});
		},
	});
}

export function useRevokeCalendarToken(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (tokenId: string) =>
			api(`/v1/workplaces/${workplaceId}/calendar-tokens/${tokenId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["calendar-tokens", workplaceId],
			});
		},
	});
}

export interface LeaveDelegationDto {
	id: string;
	delegatorEmploymentId: string;
	delegateEmploymentId: string;
	delegatorName: string | null;
	delegatorEmail: string;
	startsAt: string;
	endsAt: string;
	reason: string | null;
	revokedAt: string | null;
}

export function useLeaveDelegations(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["leave-delegations", workplaceId],
		queryFn: () =>
			api<{ delegations: LeaveDelegationDto[] }>(
				`/v1/workplaces/${workplaceId}/leave-delegations`,
			).then((data) => data.delegations),
		enabled: Boolean(workplaceId),
	});
}

export function useCreateLeaveDelegation(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			delegatorEmploymentId?: string;
			delegateEmploymentId: string;
			startsAt: string;
			endsAt: string;
			reason?: string;
		}) =>
			api(`/v1/workplaces/${workplaceId}/leave-delegations`, {
				method: "POST",
				body: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-delegations", workplaceId],
			});
		},
	});
}

export function useRevokeLeaveDelegation(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (delegationId: string) =>
			api(`/v1/workplaces/${workplaceId}/leave-delegations/${delegationId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-delegations", workplaceId],
			});
		},
	});
}

export interface PendingApprovalDto {
	requestId: string;
	approvalId: string;
	stepOrder: number;
	dueAt: string | null;
	escalatedAt: string | null;
	via: "direct" | "delegation";
	worker: { email: string; fullName: string | null };
	leaveTypeName: string | null;
	remainingMinutes: number;
	chargeMinutes: number;
	isEmergency: boolean;
	reason: string | null;
	startsAt: string;
	endsAt: string;
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number | null;
	endMinute: number | null;
}

export function useMyPendingApprovals(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["my-pending-approvals", workplaceId],
		queryFn: () =>
			api<{ pending: PendingApprovalDto[] }>(
				`/v1/workplaces/${workplaceId}/my/pending-approvals`,
			).then((data) => data.pending),
		enabled: Boolean(workplaceId),
	});
}

export interface HolidayDto {
	id: string;
	name: string;
	date: string;
	recurring: boolean;
	locationId: string | null;
}

export function useHolidays(
	workplaceId: string | undefined,
	range?: { from?: string; to?: string; locationId?: string | null },
) {
	const params = new URLSearchParams();
	if (range?.from) params.set("from", range.from);
	if (range?.to) params.set("to", range.to);
	if (range?.locationId) params.set("locationId", range.locationId);
	const query = params.toString();
	return useQuery({
		queryKey: ["holidays", workplaceId, query],
		queryFn: () =>
			api<{ holidays: HolidayDto[] }>(
				`/v1/workplaces/${workplaceId}/holidays${query ? `?${query}` : ""}`,
			),
		enabled: Boolean(workplaceId),
	});
}

export function useCreateHoliday(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			name: string;
			date: string;
			recurring?: boolean;
			locationId?: string | null;
		}) =>
			api<{ holiday: HolidayDto }>(`/v1/workplaces/${workplaceId}/holidays`, {
				method: "POST",
				body: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["holidays", workplaceId] });
		},
	});
}

export function useUpdateHoliday(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			holidayId: string;
			name?: string;
			date?: string;
			recurring?: boolean;
			locationId?: string | null;
		}) => {
			const { holidayId, ...body } = input;
			return api<{ holiday: HolidayDto }>(
				`/v1/workplaces/${workplaceId}/holidays/${holidayId}`,
				{ method: "PATCH", body },
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["holidays", workplaceId] });
		},
	});
}

export function useDeleteHoliday(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (holidayId: string) =>
			api<{ ok: true }>(`/v1/workplaces/${workplaceId}/holidays/${holidayId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["holidays", workplaceId] });
		},
	});
}

export function useTimeBlocks(locationId: string | undefined) {
	return useQuery({
		queryKey: ["time-blocks", locationId],
		queryFn: () =>
			api<{
				timeBlocks: {
					id: string;
					name: string;
					startMinute: number;
					endMinute: number;
				}[];
				dayParts: {
					id: string;
					name: string;
					startMinute: number;
					endMinute: number;
				}[];
				shiftTemplates: {
					id: string;
					name: string;
					positionId: string;
					startMinute: number;
					endMinute: number;
					note: string | null;
				}[];
			}>(`/v1/locations/${locationId}/time-blocks`),
		enabled: Boolean(locationId),
	});
}

export function useAnnouncements(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["announcements", workplaceId],
		queryFn: () =>
			api<{
				announcements: {
					id: string;
					title: string;
					body: string;
					author: string;
					createdAt: string;
				}[];
			}>(`/v1/workplaces/${workplaceId}/announcements`),
		enabled: Boolean(workplaceId),
	});
}

export type ConversationDto = {
	id: string;
	kind: "workplace" | "direct";
	title: string;
	subtitle: string;
	counterpart: {
		employmentId: string;
		name: string;
		email: string;
	} | null;
	lastMessage: {
		id: string;
		body: string;
		authorEmploymentId: string;
		author: string;
		createdAt: string;
		mine: boolean;
	} | null;
};

export type ConversationMessageDto = {
	id: string;
	body: string;
	author: string;
	authorEmploymentId: string;
	createdAt: string;
};

export function useConversations(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["conversations", workplaceId],
		queryFn: () =>
			api<{ conversations: ConversationDto[] }>(
				`/v1/workplaces/${workplaceId}/conversations`,
			),
		enabled: Boolean(workplaceId),
	});
}

export interface MessagesPage {
	messages: ConversationMessageDto[];
	hasMore: boolean;
}

/** Backwards-paging cursor: timestamp plus id tie-breaker. */
export interface MessagesCursor {
	before: string;
	beforeId?: string;
}

export function messagesCursorQuery(cursor: MessagesCursor | undefined) {
	if (!cursor) return "";
	const params = new URLSearchParams({ before: cursor.before });
	if (cursor.beforeId) params.set("beforeId", cursor.beforeId);
	return `?${params.toString()}`;
}

/** Newest-first pages behind the scenes; `useMessagesData` stitches asc order. */
export function useMessagesInfinite(conversationId: string | undefined) {
	return useInfiniteQuery<
		MessagesPage,
		Error,
		InfiniteData<MessagesPage>,
		(string | undefined)[],
		MessagesCursor | undefined
	>({
		queryKey: ["messages", conversationId],
		queryFn: ({ pageParam }) =>
			api<MessagesPage>(
				`/v1/conversations/${conversationId}/messages${messagesCursorQuery(pageParam)}`,
			),
		initialPageParam: undefined as MessagesCursor | undefined,
		// Only paging backwards through history.
		getNextPageParam: () => undefined,
		getPreviousPageParam: (firstPage) =>
			firstPage.hasMore && firstPage.messages[0]
				? {
						before: firstPage.messages[0].createdAt,
						beforeId: firstPage.messages[0].id,
					}
				: undefined,
		enabled: Boolean(conversationId),
		staleTime: 30_000,
	});
}

/** Oldest→newest across all loaded pages, for thread rendering. */
export function useMessages(conversationId: string | undefined) {
	const query = useMessagesInfinite(conversationId);
	const messages = useMemo(
		() => (query.data?.pages ?? []).flatMap((page) => page.messages),
		[query.data],
	);
	const hasMore = query.data?.pages[0]?.hasMore ?? false;
	return {
		...query,
		messages,
		hasMore,
		loadOlder: () => {
			if (hasMore && !query.isFetchingPreviousPage) {
				void query.fetchPreviousPage();
			}
		},
		isLoadingOlder: query.isFetchingPreviousPage,
	};
}

export function useTimesheets(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["timesheets", workplaceId],
		queryFn: () =>
			api<{
				timesheets: {
					id: string;
					worker: string;
					clockedInAt: string;
					clockedOutAt: string | null;
					autoClosedAt: string | null;
					approvalStatus: "pending" | "approved" | "declined";
				}[];
			}>(`/v1/workplaces/${workplaceId}/timesheets`),
		enabled: Boolean(workplaceId),
	});
}

export function usePtoBalances(
	workplaceId: string | undefined,
	employmentId: string | undefined,
) {
	return useQuery({
		queryKey: ["pto", workplaceId, employmentId],
		queryFn: () =>
			api<{
				balances: { leaveTypeId: string; name: string; minutes: number }[];
			}>(`/v1/workplaces/${workplaceId}/employments/${employmentId}/pto`),
		enabled: Boolean(workplaceId && employmentId),
	});
}

export function useWorkplacePto(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["pto", workplaceId],
		queryFn: () =>
			api<{
				balances: {
					employmentId: string;
					leaveTypeId: string;
					name: string;
					minutes: number;
				}[];
			}>(`/v1/workplaces/${workplaceId}/pto`),
		enabled: Boolean(workplaceId),
	});
}

export function useShiftTasks(versionShiftId: string | undefined) {
	return useQuery({
		queryKey: ["shift-tasks", versionShiftId],
		queryFn: () =>
			api<{ tasks: { id: string; title: string; completed: boolean }[] }>(
				`/v1/my/shifts/${versionShiftId}/tasks`,
			),
		enabled: Boolean(versionShiftId),
	});
}

export interface ReportSummary {
	range: { from: string; to: string };
	totals: {
		workedMinutes: number;
		laborCents: number;
		salesCents: number;
		laborPercent: number | null;
		timeEntryCount: number;
	};
	byDate: {
		date: string;
		workedMinutes: number;
		laborCents: number;
		salesCents: number;
		laborPercent: number | null;
	}[];
	byWorker: {
		employmentId: string;
		name: string;
		workedMinutes: number;
		laborCents: number;
	}[];
	byPosition: {
		positionId: string;
		name: string;
		workedMinutes: number;
	}[];
}

export function useReportSummary(
	workplaceId: string | undefined,
	from: string,
	to: string,
	enabled = true,
) {
	return useQuery({
		queryKey: ["report-summary", workplaceId, from, to] as const,
		queryFn: () =>
			api<ReportSummary>(
				`/v1/workplaces/${workplaceId}/reports/summary?from=${from}&to=${to}`,
			),
		enabled: Boolean(workplaceId) && enabled && from <= to,
	});
}

export interface CoverageMetrics {
	scheduledShifts: number;
	assignedShifts: number;
	openShifts: number;
	fillRate: number;
	scheduledMinutes: number;
	assignedMinutes: number;
	utilization: number;
}

export interface CoverageReport {
	range: { from: string; to: string };
	totals: CoverageMetrics;
	byDate: ({ date: string } & CoverageMetrics)[];
	byLocation: ({ locationId: string; name: string } & CoverageMetrics)[];
}

export type RequestType =
	| "time_off"
	| "shift_release"
	| "shift_pickup"
	| "shift_swap";

export interface RequestTypeMetrics {
	type: RequestType;
	total: number;
	approved: number;
	declined: number;
	pending: number;
	approvalRate: number;
	averageDecisionHours: number;
}

export interface RequestAnalytics {
	range: { from: string; to: string };
	requests: RequestTypeMetrics[];
}

export function useCoverageReport(
	workplaceId: string | undefined,
	from: string,
	to: string,
	enabled = true,
	locationId?: string,
) {
	return useQuery({
		queryKey: ["report-coverage", workplaceId, from, to, locationId] as const,
		queryFn: () =>
			api<CoverageReport>(
				`/v1/workplaces/${workplaceId}/reports/coverage?from=${from}&to=${to}${
					locationId ? `&locationId=${locationId}` : ""
				}`,
			),
		enabled: Boolean(workplaceId) && enabled && from <= to,
	});
}

export function useRequestAnalytics(
	workplaceId: string | undefined,
	from: string,
	to: string,
	enabled = true,
) {
	return useQuery({
		queryKey: ["report-requests", workplaceId, from, to] as const,
		queryFn: () =>
			api<RequestAnalytics>(
				`/v1/workplaces/${workplaceId}/reports/requests?from=${from}&to=${to}`,
			),
		enabled: Boolean(workplaceId) && enabled && from <= to,
	});
}

export interface AuditFilters {
	from?: string;
	to?: string;
	action?: string;
	actorProfileId?: string;
	limit?: number;
	offset?: number;
}

export interface AuditResponse {
	events: AuditEventDto[];
	total?: number;
	limit?: number;
	offset?: number;
}

export function useAuditEvents(
	workplaceId: string | undefined,
	filters: AuditFilters = {},
) {
	const params = new URLSearchParams();
	if (filters.from) params.set("from", filters.from);
	if (filters.to) params.set("to", filters.to);
	if (filters.action) params.set("action", filters.action);
	if (filters.actorProfileId)
		params.set("actorProfileId", filters.actorProfileId);
	if (filters.limit !== undefined) params.set("limit", String(filters.limit));
	if (filters.offset !== undefined)
		params.set("offset", String(filters.offset));
	const queryString = params.toString();

	return useQuery({
		queryKey: [
			"audit",
			workplaceId,
			filters.from ?? "",
			filters.to ?? "",
			filters.action ?? "",
			filters.actorProfileId ?? "",
			filters.limit ?? null,
			filters.offset ?? null,
		] as const,
		queryFn: () =>
			api<AuditResponse>(
				`/v1/workplaces/${workplaceId}/audit${
					queryString ? `?${queryString}` : ""
				}`,
			),
		enabled: Boolean(workplaceId),
		placeholderData: keepPreviousData,
	});
}

export interface ShiftPatternDto {
	id: string;
	name: string;
	description: string | null;
	locationId: string | null;
	cycleWeeks: number;
	shiftCount: number;
	memberCount: number;
	updatedAt: string;
}

export function useShiftPatterns(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["shift-patterns", workplaceId],
		queryFn: () =>
			api<{ patterns: ShiftPatternDto[] }>(
				`/v1/workplaces/${workplaceId}/shift-patterns`,
			).then((data) => data.patterns),
		enabled: Boolean(workplaceId),
	});
}

export type ApprovalRequestType =
	| "time_off"
	| "unavailability"
	| "shift_release"
	| "shift_pickup"
	| "shift_swap";

export interface ApprovalPolicyGroupDto {
	id: string;
	name: string;
	description: string | null;
	rules: { requestType: ApprovalRequestType; requiresApproval: boolean }[];
}

export function useApprovalPolicyGroups(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["approval-policy-groups", workplaceId],
		queryFn: () =>
			api<{ groups: ApprovalPolicyGroupDto[] }>(
				`/v1/workplaces/${workplaceId}/approval-policy-groups`,
			),
		enabled: Boolean(workplaceId),
	});
}

export function useSetSchedulePolicyGroup(
	locationId: string | undefined,
	weekStart: string | undefined,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (policyGroupId: string | null) =>
			api<{ ok: true }>(
				`/v1/locations/${locationId}/schedules/${weekStart}/policy-group`,
				{ method: "PATCH", body: { policyGroupId } },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["schedule", locationId, weekStart],
			});
		},
	});
}

export interface MyReleaseDto {
	id: string;
	versionShiftId: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	date: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	status: "pending" | "approved" | "declined";
	reason: string | null;
	decidedAt: string | null;
	createdAt: string;
}

export function useMyReleases(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["my-releases", workplaceId],
		queryFn: () =>
			api<{ releases: MyReleaseDto[] }>(
				`/v1/workplaces/${workplaceId}/my/releases`,
			).then((data) => data.releases),
		enabled: Boolean(workplaceId),
	});
}

export interface MyPickupDto {
	id: string;
	openShiftId: string;
	openShiftStatus: "open" | "filled" | "closed";
	locationName: string;
	positionName: string;
	startsAt: string | null;
	endsAt: string | null;
	date: string | null;
	startMinute: number | null;
	endMinute: number | null;
	overnight: boolean;
	status: "pending" | "approved" | "declined";
	requestedAt: string;
	decidedAt: string | null;
}

export function useMyPickups(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["my-pickups", workplaceId],
		queryFn: () =>
			api<{ pickups: MyPickupDto[] }>(
				`/v1/workplaces/${workplaceId}/my/pickups`,
			).then((data) => data.pickups),
		enabled: Boolean(workplaceId),
	});
}

export function useWithdrawRelease() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (releaseId: string) =>
			api<{ ok: true }>(`/v1/my/releases/${releaseId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-releases"] });
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
		},
	});
}

export interface PendingUnavailabilityDto {
	id: string;
	employmentId: string;
	worker: { email: string; fullName: string | null };
	kind: "recurring" | "date";
	weekday: number | null;
	date: string | null;
	startMinute: number;
	endMinute: number;
	note: string | null;
	status: "pending";
}

export interface TimeOffBoardResponse {
	timezone: string;
	pendingUnavailability: PendingUnavailabilityDto[];
	requests: TimeOffRequestDto[];
}

export function useTimeOffBoard(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplaces", workplaceId, "time-off-board"],
		queryFn: () =>
			api<TimeOffBoardResponse>(`/v1/workplaces/${workplaceId}/time-off`),
		enabled: Boolean(workplaceId),
	});
}

export interface MyCalendarShift {
	id: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	date: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	note: string | null;
	planned?: boolean;
}

export interface MyCalendarResponse {
	monthStart: string;
	weekStartDay: number;
	shifts: MyCalendarShift[];
}

export function useMyCalendar(
	workplaceId: string | undefined,
	monthStart: string | undefined,
) {
	return useQuery({
		queryKey: ["my-calendar", workplaceId, monthStart] as const,
		queryFn: () =>
			api<MyCalendarResponse>(
				`/v1/workplaces/${workplaceId}/my/calendar/${monthStart}`,
			),
		enabled: Boolean(workplaceId && monthStart),
		placeholderData: keepPreviousData,
	});
}
