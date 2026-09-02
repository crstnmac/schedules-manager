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
		status: "open" | "closed" | null;
		clockedInAt: string | null;
		workedMinutes: number | null;
	}[];
	shifts: ScheduleShiftDto[];
	staff: {
		employmentId: string;
		name: string;
		email: string;
		kind: "manager" | "worker";
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
				};
			}>(`/v1/workplaces/${workplaceId}`).then((data) => data.workplace),
		enabled: Boolean(workplaceId),
	});
}

export interface SwapDetailDto {
	id: string;
	status: string;
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
		mutationFn: (versionShiftId: string) =>
			api<{ timeEntry: { id: string; clockedInAt: string } }>(
				`/v1/my/shifts/${versionShiftId}/clock-in`,
				{ method: "POST" },
			),
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
