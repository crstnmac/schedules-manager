import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "./api";
import { useSelectedWorkplaceId } from "./workplace-store";

export interface MeResponse {
	profile: {
		id: string;
		email: string;
		fullName: string | null;
		timeFormat?: "12h" | "24h";
		nameFormat?: "full" | "first_last_initial" | "first";
	};
	employments: {
		id: string;
		kind: "manager" | "worker" | "viewer";
		privileges?: string[];
		workplace: {
			id: string;
			name: string;
			policies?: {
				messagingEnabled: boolean;
				announcementsEnabled: boolean;
				tasksEnabled: boolean;
				workersCanRequestTimeOff: boolean;
				shiftExchangesEnabled: boolean;
				geofenceRequired: boolean;
				timesheetNotesEnabled?: boolean;
			};
		};
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

export interface PublishedWeek {
	weekStart: string;
	locationId: string;
	locationName: string;
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
			queryClient.invalidateQueries({ queryKey: ["pay-period"] });
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
			queryClient.invalidateQueries({ queryKey: ["pay-period"] });
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

export interface MessagesPage {
	messages: WorkplaceMessage[];
	hasMore: boolean;
}

export interface MessagesCursor {
	before: string;
	beforeId?: string;
}

export function useConversationMessages(conversationId: string | undefined) {
	const query = useInfiniteQuery<
		MessagesPage,
		Error,
		InfiniteData<MessagesPage>,
		(string | undefined)[],
		MessagesCursor | undefined
	>({
		queryKey: ["conversation-messages", conversationId],
		queryFn: async ({ pageParam }) => {
			const params = new URLSearchParams();
			if (pageParam) {
				params.set("before", pageParam.before);
				if (pageParam.beforeId) params.set("beforeId", pageParam.beforeId);
			}
			const queryString = params.toString();
			const data = await api<{
				messages: WorkplaceMessage[];
				hasMore: boolean;
			}>(
				`/v1/conversations/${conversationId}/messages${queryString ? `?${queryString}` : ""}`,
			);
			return { messages: data.messages, hasMore: data.hasMore };
		},
		initialPageParam: undefined as MessagesCursor | undefined,
		getNextPageParam: () => undefined,
		getPreviousPageParam: (firstPage) =>
			firstPage.hasMore && firstPage.messages[0]
				? {
						before: firstPage.messages[0].createdAt,
						beforeId: firstPage.messages[0].id,
					}
				: undefined,
		enabled: Boolean(conversationId),
	});
	const messages = useMemo(
		() => (query.data?.pages ?? []).flatMap((page) => page.messages),
		[query.data],
	);
	return {
		...query,
		messages,
		hasMore: query.data?.pages[0]?.hasMore ?? false,
		loadOlder: () => {
			if (
				(query.data?.pages[0]?.hasMore ?? false) &&
				!query.isFetchingPreviousPage
			) {
				void query.fetchPreviousPage();
			}
		},
	};
}

export function useSendConversationMessage(conversationId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: string) =>
			api<{ message: WorkplaceMessage }>(
				`/v1/conversations/${conversationId}/messages`,
				{
					method: "POST",
					body: { body },
				},
			),
		onSuccess: (result) => {
			// Append into the newest page instead of re-downloading the thread.
			queryClient.setQueryData(
				["conversation-messages", conversationId],
				(
					existing:
						| {
								pages: { messages: WorkplaceMessage[] }[];
								pageParams: unknown[];
						  }
						| undefined,
				) =>
					existing
						? {
								pages: existing.pages.map((page, index) =>
									index === existing.pages.length - 1
										? { ...page, messages: [...page.messages, result.message] }
										: page,
								),
								pageParams: existing.pageParams,
							}
						: existing,
			);
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
				const Location = await import("expo-location");
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
	periodTotalMs: number;
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
		kind: "manager" | "worker" | "viewer";
		status: "active" | "inactive";
		profile: { email: string; fullName: string | null };
	}[];
	invitations: {
		id: string;
		email: string;
		kind: "manager" | "worker" | "viewer";
		status: string;
		expiresAt: string;
	}[];
}

export interface LeaveApprovalDto {
	id: string;
	stepOrder: number;
	approverKind: "workplace_managers" | "specific_employment" | "privilege";
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

export interface ManagerTimeOffResponse {
	timezone?: string;
	requests: {
		id: string;
		employmentId?: string;
		kind?: "manager" | "worker" | "viewer";
		worker: { email: string; fullName: string | null };
		startsAt: string;
		endsAt: string;
		startDate?: string;
		endDate?: string;
		allDay?: boolean;
		startMinute?: number | null;
		endMinute?: number | null;
		chargeMinutes?: number;
		deductedMinutes?: number | null;
		remainingMinutes?: number;
		reason: string | null;
		status: "pending" | "approved" | "declined" | "cancelled";
		decisionReason: string | null;
		decidedAt?: string | null;
		cancelledAt?: string | null;
		createdAt?: string;
		leaveTypeId?: string | null;
		leaveTypeName?: string | null;
		leaveTypePaid?: boolean | null;
		batchId?: string | null;
		isEmergency?: boolean;
		currentStep?: number;
		approvals?: LeaveApprovalDto[];
		documents?: LeaveDocumentDto[];
		canDecide?: boolean;
	}[];
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

export function useDecideApprovalStep(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			requestId: string;
			approvalId: string;
			decision: "approved" | "declined";
			reason?: string;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/time-off/${input.requestId}/approvals/${input.approvalId}/decision`,
				{
					method: "POST",
					body: { decision: input.decision, reason: input.reason },
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["my-pending-approvals", workplaceId],
			});
			queryClient.invalidateQueries({
				queryKey: ["manager", workplaceId, "time-off"],
			});
		},
	});
}

export function useExpediteLeaveRequest(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { requestId: string; reason: string }) =>
			api(
				`/v1/workplaces/${workplaceId}/time-off/${input.requestId}/expedite`,
				{
					method: "POST",
					body: { reason: input.reason },
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["my-pending-approvals", workplaceId],
			});
			queryClient.invalidateQueries({
				queryKey: ["manager", workplaceId, "time-off"],
			});
		},
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
	pendingMinutes: number;
	points: LeaveForecastPointDto[];
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

export function useCreateMyLeaveEncashment(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			leaveTypeId: string;
			minutes: number;
			note?: string;
		}) =>
			api(`/v1/workplaces/${workplaceId}/my/leave-encashments`, {
				method: "POST",
				body: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["pto", workplaceId] });
			queryClient.invalidateQueries({ queryKey: ["constraints", workplaceId] });
			queryClient.invalidateQueries({
				queryKey: ["leave-encashments", workplaceId],
			});
		},
	});
}

export function useCreateLeaveEncashment(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			employmentId: string;
			leaveTypeId: string;
			minutes: number;
			note?: string;
		}) =>
			api(`/v1/workplaces/${workplaceId}/leave-encashments`, {
				method: "POST",
				body: input,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-encashments", workplaceId],
			});
		},
	});
}

export function useLeaveEncashmentDecision(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			encashmentId: string;
			decision: "approved" | "declined";
			reason?: string;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/leave-encashments/${input.encashmentId}/decision`,
				{
					method: "POST",
					body: { decision: input.decision, reason: input.reason },
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-encashments", workplaceId],
			});
			queryClient.invalidateQueries({
				queryKey: ["leave-balances", workplaceId],
			});
		},
	});
}

export function useMarkLeaveEncashmentPaid(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { encashmentId: string; note?: string }) =>
			api(
				`/v1/workplaces/${workplaceId}/leave-encashments/${input.encashmentId}/paid`,
				{ method: "POST", body: { note: input.note } },
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["leave-encashments", workplaceId],
			});
		},
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

function hasCapability(
	employment:
		| { kind: "manager" | "worker" | "viewer"; privileges?: string[] }
		| undefined,
	key: string,
): boolean {
	if (!employment) return false;
	if (employment.kind === "viewer") {
		return (employment.privileges ?? []).includes(key);
	}
	if (employment.kind !== "manager") return false;
	const explicit = employment.privileges;
	if (!explicit || explicit.length === 0) return true;
	return explicit.includes(key);
}

export function useCurrentEmployment() {
	const me = useMe();
	const { selected } = useSelectedWorkplaceId();
	const employment =
		me.data?.employments.find((item) => item.workplace.id === selected) ??
		me.data?.employments[0];
	const kind = employment?.kind;
	return {
		me,
		employment,
		workplaceId: employment?.workplace.id,
		// Viewers browse the manager read surfaces but cannot perform writes.
		isManager: kind === "manager" || kind === "viewer",
		canManage: kind === "manager",
		canReview: hasCapability(employment, "approvals.review"),
		canManageSchedule: hasCapability(employment, "schedule.manage"),
		canPublish: hasCapability(employment, "schedule.publish"),
		canManageWorkers: hasCapability(employment, "workers.manage"),
	};
}
