import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";

import { api, publicApi } from "./api";

export interface MeProfile {
	id: string;
	email: string;
	fullName: string | null;
}

export interface MeEmployment {
	id: string;
	kind: "manager" | "worker";
	workplace: {
		id: string;
		name: string;
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
	kind: "manager" | "worker";
	status: "active" | "deactivated";
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
	kind: "worker" | "manager";
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
	});
}

export interface InvitationPreview {
	email: string;
	kind: "worker" | "manager";
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
		kind: "worker" | "manager";
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
					kind: "manager" | "worker";
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
	});
}

export interface TimeOffRequestDto {
	id: string;
	worker: { email: string; fullName: string | null };
	startsAt: string;
	endsAt: string;
	reason: string | null;
	status: "pending" | "approved" | "declined";
	decisionReason: string | null;
	createdAt: string;
	leaveTypeId: string | null;
	leaveTypeName: string | null;
}

export function useTimeOff(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplaces", workplaceId, "time-off"],
		queryFn: () =>
			api<{ requests: TimeOffRequestDto[] }>(
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

export interface ScheduleResponse {
	schedule: {
		id: string;
		locationId: string;
		weekStartDate: string;
		timezone: string;
		weekStartDay: number;
	};
	publication: {
		latestVersionNumber: number | null;
		publishedAt: string | null;
		hasUnpublishedChanges: boolean;
	};
	timeclock: {
		shiftId: string;
		versionShiftId: string;
		status: "open" | "closed" | null;
		clockedInAt: string | null;
		clockedOutAt: string | null;
		workedMinutes: number | null;
		attendance: "late" | "no_show" | "sick" | null;
	}[];
	labor: {
		scheduledCents: number;
		overtimeCents: number;
		salesCents: number;
		laborPercent: number | null;
		byDate: { date: string; amountCents: number }[];
	};
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

export function scheduleQueryOptions(locationId: string, weekStart: string) {
	return queryOptions({
		queryKey: ["schedule", locationId, weekStart] as const,
		queryFn: () =>
			api<ScheduleResponse>(
				`/v1/locations/${locationId}/schedules/${weekStart}`,
			),
		staleTime: SCHEDULE_STALE_TIME,
		gcTime: SCHEDULE_CACHE_TIME,
		refetchOnMount: false,
	});
}

export function useSchedule(
	locationId: string | undefined,
	weekStart: string | undefined,
) {
	return useQuery({
		...scheduleQueryOptions(locationId ?? "", weekStart ?? ""),
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
) {
	return useQuery({
		queryKey: ["schedule-calendar", locationId, monthStart] as const,
		queryFn: () =>
			api<ScheduleCalendarResponse>(
				`/v1/locations/${locationId}/calendar/${monthStart}`,
			),
		enabled: Boolean(locationId && monthStart) && enabled,
		staleTime: SCHEDULE_STALE_TIME,
		gcTime: SCHEDULE_CACHE_TIME,
		placeholderData: keepPreviousData,
	});
}

export interface PublicationResponse {
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
}

export function usePublication(scheduleId: string | undefined) {
	return useQuery({
		queryKey: ["publication", scheduleId],
		queryFn: () =>
			api<PublicationResponse>(`/v1/schedules/${scheduleId}/publication`),
		enabled: Boolean(scheduleId),
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

export function useWorkplaceSettings(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["workplace-settings", workplaceId],
		queryFn: () =>
			api<{
				workplace: {
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
				};
			}>(`/v1/workplaces/${workplaceId}`).then((data) => data.workplace),
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
	};
	deliveryStatus: "sent" | "delivered" | "acknowledged" | null;
	shifts: {
		id: string;
		positionName: string;
		startsAt: string;
		endsAt: string;
		date: string;
		startMinute: number;
		endMinute: number;
		overnight: boolean;
		note: string | null;
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

export function useMySchedule(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["my-schedule", workplaceId],
		queryFn: () =>
			api<MyScheduleResponse>(`/v1/workplaces/${workplaceId}/my/schedule`),
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
		mutationFn: (versionShiftId: string) =>
			api<{ timeEntry: { id: string; clockedOutAt: string | null } }>(
				`/v1/my/shifts/${versionShiftId}/clock-out`,
				{ method: "POST" },
			),
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
		reason: string | null;
		status: "pending" | "approved" | "declined";
		decisionReason: string | null;
		leaveTypeId: string | null;
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
		mutationFn: (input: { weekStart: string; name: string }) =>
			api(
				`/v1/locations/${locationId}/schedules/${input.weekStart}/templates`,
				{
					method: "POST",
					body: { name: input.name },
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
		mutationFn: (input: { weekStart: string; templateId: string }) =>
			api(
				`/v1/locations/${locationId}/schedules/${input.weekStart}/templates/${input.templateId}/apply`,
				{ method: "POST" },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
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

export function useLeaveTypes(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["leave-types", workplaceId],
		queryFn: () =>
			api<{ leaveTypes: { id: string; name: string; paid: boolean }[] }>(
				`/v1/workplaces/${workplaceId}/leave-types`,
			),
		enabled: Boolean(workplaceId),
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

export function useMessages(conversationId: string | undefined) {
	return useQuery({
		queryKey: ["messages", conversationId],
		queryFn: () =>
			api<{ messages: ConversationMessageDto[] }>(
				`/v1/conversations/${conversationId}/messages`,
			),
		enabled: Boolean(conversationId),
	});
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
