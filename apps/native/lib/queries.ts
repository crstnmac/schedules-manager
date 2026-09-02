import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";

import { api } from "./api";
import { useSelectedWorkplaceId } from "./workplace-store";

export interface MeResponse {
	profile: { id: string; email: string; fullName: string | null };
	employments: {
		id: string;
		kind: "manager" | "worker";
		workplace: { id: string; name: string };
	}[];
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

export function useMe(enabled = true) {
	return useQuery({
		queryKey: ["me"],
		queryFn: () => api<MeResponse>("/v1/me"),
		staleTime: 60_000,
		enabled,
	});
}

export function usePendingInvitations(enabled: boolean) {
	return useQuery({
		queryKey: ["invitations", "pending"],
		queryFn: () => api<PendingInvitationsResponse>("/v1/invitations/pending"),
		enabled,
	});
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

export interface PublishedWeek {
	weekStart: string;
	locationId: string;
	locationName: string;
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

export function useMySchedule(workplaceId: string | undefined, enabled = true) {
	return useQuery({
		queryKey: ["my-schedule", workplaceId],
		queryFn: () =>
			api<MyScheduleResponse>(`/v1/workplaces/${workplaceId}/my/schedule`),
		enabled: Boolean(workplaceId) && enabled,
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
			const coordinates = await requestForegroundCoordinates();
			return api<{ timeEntry: { id: string; clockedInAt: string } }>(
				`/v1/my/shifts/${versionShiftId}/clock-in`,
				{ method: "POST", body: coordinates },
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

export function useStartBreak() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (timeEntryId: string) =>
			api(`/v1/my/time-entries/${timeEntryId}/breaks/start`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["timecard"] });
		},
	});
}

export function useEndBreak() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (timeEntryId: string) =>
			api(`/v1/my/time-entries/${timeEntryId}/breaks/end`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["timecard"] });
		},
	});
}

export interface ShiftTask {
	id: string;
	title: string;
	completed: boolean;
}

export function useShiftTasks(versionShiftId: string | undefined) {
	return useQuery({
		queryKey: ["shift-tasks", versionShiftId],
		queryFn: () =>
			api<{ tasks: ShiftTask[] }>(`/v1/my/shifts/${versionShiftId}/tasks`).then(
				(data) => data.tasks,
			),
		enabled: Boolean(versionShiftId),
	});
}

export function useCompleteShiftTask(versionShiftId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (taskId: string) =>
			api(`/v1/my/version-shifts/${versionShiftId}/tasks/${taskId}/complete`, {
				method: "POST",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["shift-tasks", versionShiftId],
			});
		},
	});
}

export interface Announcement {
	id: string;
	title: string;
	body: string;
	author: string;
	createdAt: string;
}

export function useAnnouncements(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["announcements", workplaceId],
		queryFn: () =>
			api<{ announcements: Announcement[] }>(
				`/v1/workplaces/${workplaceId}/announcements`,
			).then((data) => data.announcements),
		enabled: Boolean(workplaceId),
	});
}

export interface WorkplaceConversation {
	id: string;
	kind: "workplace" | "direct";
	title: string;
}

export interface WorkplaceMessage {
	id: string;
	body: string;
	author: string;
	createdAt: string;
}

export function useConversations(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["conversations", workplaceId],
		queryFn: () =>
			api<{ conversations: WorkplaceConversation[] }>(
				`/v1/workplaces/${workplaceId}/conversations`,
			).then((data) => data.conversations),
		enabled: Boolean(workplaceId),
	});
}

export function useConversationMessages(conversationId: string | undefined) {
	return useQuery({
		queryKey: ["conversation-messages", conversationId],
		queryFn: () =>
			api<{ messages: WorkplaceMessage[] }>(
				`/v1/conversations/${conversationId}/messages`,
			).then((data) => data.messages),
		enabled: Boolean(conversationId),
	});
}

export function useSendConversationMessage(conversationId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: string) =>
			api(`/v1/conversations/${conversationId}/messages`, {
				method: "POST",
				body: { body },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["conversation-messages", conversationId],
			});
		},
	});
}

export interface WorkplaceLocation {
	id: string;
	name: string;
	timezone: string;
}

export function useWorkplaceLocations(
	workplaceId: string | undefined,
	enabled = true,
) {
	return useQuery({
		queryKey: ["manager", workplaceId, "locations"],
		queryFn: () =>
			api<{ locations: WorkplaceLocation[] }>(
				`/v1/workplaces/${workplaceId}/locations`,
			).then((data) => data.locations),
		enabled: Boolean(workplaceId) && enabled,
	});
}

export async function requestForegroundCoordinates(): Promise<{
	latitude?: number;
	longitude?: number;
}> {
	try {
		const result = await Promise.race([
			(async () => {
				const permission = await Location.requestForegroundPermissionsAsync();
				if (permission.status !== "granted") return {};
				const position = await Location.getCurrentPositionAsync({
					accuracy: Location.Accuracy.Balanced,
				});
				return {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				};
			})(),
			new Promise<Record<string, never>>((resolve) =>
				setTimeout(() => resolve({}), 5_000),
			),
		]);
		return result;
	} catch {
		return {};
	}
}

export interface SwapDetail {
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
				swaps: { direction: "outgoing" | "incoming"; swap: SwapDetail }[];
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
			api<{ swaps: SwapDetail[] }>(
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
			queryClient.invalidateQueries({ queryKey: ["swaps"] });
		},
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
			api<{ swap: SwapDetail }>("/v1/my/swaps", {
				method: "POST",
				body: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["swaps"] });
		},
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

export interface PayPeriodInfo {
	type: "weekly" | "biweekly" | "semimonthly" | "monthly";
	startsAt: string;
	endsAt: string;
	weekStartDay: number;
}

export function usePayPeriod(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["pay-period", workplaceId],
		queryFn: () =>
			api<{ payPeriod: PayPeriodInfo }>(
				`/v1/workplaces/${workplaceId}/my/pay-period`,
			).then((data) => data.payPeriod),
		enabled: Boolean(workplaceId),
		staleTime: 5 * 60_000,
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

export interface OpenShiftsResponse {
	openShifts: {
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
	}[];
}

export function useOpenShifts(workplaceId: string | undefined, enabled = true) {
	return useQuery({
		queryKey: ["open-shifts", workplaceId],
		queryFn: () =>
			api<OpenShiftsResponse>(`/v1/workplaces/${workplaceId}/open-shifts`),
		enabled: Boolean(workplaceId) && enabled,
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

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (token: string) =>
			api<{ employment: { id: string; workplace: { name: string } } }>(
				"/v1/invitations/accept",
				{ method: "POST", body: { token } },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["me"] });
			queryClient.invalidateQueries({ queryKey: ["invitations"] });
		},
	});
}

export function usePublishedVersion(versionId: string | null) {
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

export function useNotifications(
	workplaceId: string | undefined,
	enabled = true,
) {
	return useQuery({
		queryKey: ["notifications", workplaceId],
		queryFn: () =>
			api<{ unreadCount: number; notifications: InboxNotification[] }>(
				`/v1/workplaces/${workplaceId}/my/notifications`,
			),
		enabled: Boolean(workplaceId) && enabled,
	});
}

export function useMarkNotificationRead(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (notificationId: string) =>
			api(
				`/v1/workplaces/${workplaceId}/my/notifications/${notificationId}/read`,
				{ method: "POST" },
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

export interface ManagerWorkersResponse {
	workers: {
		employmentId: string;
		kind: "manager" | "worker";
		status: "active" | "inactive";
		profile: { email: string; fullName: string | null };
	}[];
	invitations: {
		id: string;
		email: string;
		kind: "manager" | "worker";
		status: string;
		expiresAt: string;
	}[];
}

export interface ManagerTimeOffResponse {
	requests: {
		id: string;
		worker: { email: string; fullName: string | null };
		startsAt: string;
		endsAt: string;
		reason: string | null;
		status: "pending" | "approved" | "declined";
		decisionReason: string | null;
	}[];
}

export function useManagerWorkers(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["manager", workplaceId, "workers"],
		queryFn: () =>
			api<ManagerWorkersResponse>(`/v1/workplaces/${workplaceId}/workers`),
		enabled: Boolean(workplaceId),
	});
}

export function useManagerTimeOff(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["manager", workplaceId, "time-off"],
		queryFn: () =>
			api<ManagerTimeOffResponse>(`/v1/workplaces/${workplaceId}/time-off`),
		enabled: Boolean(workplaceId),
	});
}

export function useMarkAttendance(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			versionShiftId: string;
			kind: "late" | "no_show" | "sick";
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/version-shifts/${input.versionShiftId}/attendance`,
				{
					method: "POST",
					body: { kind: input.kind },
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
		},
	});
}

export function useCurrentEmployment() {
	const me = useMe();
	const { selected } = useSelectedWorkplaceId();
	const employment =
		me.data?.employments.find((item) => item.workplace.id === selected) ??
		me.data?.employments[0];
	return {
		me,
		employment,
		workplaceId: employment?.workplace.id,
		isManager: employment?.kind === "manager",
	};
}
