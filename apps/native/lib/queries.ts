import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
	currentWeek: PublishedWeek | null;
	nextWeek: PublishedWeek | null;
	nextShift: {
		positionName: string;
		startsAt: string;
		endsAt: string;
		date: string;
		startMinute: number;
		endMinute: number;
		overnight: boolean;
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
