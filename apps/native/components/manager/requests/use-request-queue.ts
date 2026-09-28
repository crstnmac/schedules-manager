import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import { todayIsoDate } from "@/lib/leave";
import {
	type LeaveEncashmentDto,
	type ManagerTimeOffResponse,
	type PendingApprovalDto,
	type SwapDetail,
	useCoverageSwaps,
	useLeaveEncashments,
	useManagerTimeOff,
	useMyPendingApprovals,
} from "@/lib/queries";

export type TimeOffRequest = ManagerTimeOffResponse["requests"][number];

export interface CoverageRelease {
	id: string;
	workerName: string;
	workerEmail: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	reason: string | null;
	status: "pending" | "approved" | "declined";
	timezone?: string;
}

export interface CoveragePickup {
	id: string;
	workerName: string;
	workerEmail: string;
	positionName: string;
	startsAt: string | null;
	endsAt: string | null;
	status: "pending" | "approved" | "declined";
	timezone?: string;
}

interface CoverageResponse {
	releases: CoverageRelease[];
	pickups: CoveragePickup[];
}

export function useManagerCoverage(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["manager", workplaceId, "coverage"],
		queryFn: () =>
			api<CoverageResponse>(`/v1/workplaces/${workplaceId}/coverage`),
		enabled: Boolean(workplaceId),
	});
}

/**
 * Release decisions open the Shift for pickup; pickup decisions assign the
 * worker and publish a successor Schedule Version atomically.
 */
export function useCoverageDecisions(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	function invalidate() {
		void queryClient.invalidateQueries({
			queryKey: ["manager", workplaceId, "coverage"],
		});
		void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
		void queryClient.invalidateQueries({ queryKey: ["open-shifts"] });
	}
	const decideRelease = useMutation({
		mutationFn: (input: {
			releaseId: string;
			decision: "approved" | "declined";
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/releases/${input.releaseId}/decision`,
				{ method: "POST", body: { decision: input.decision } },
			),
		onSuccess: invalidate,
	});
	const decidePickup = useMutation({
		mutationFn: (input: {
			pickupId: string;
			decision: "approved" | "declined";
		}) =>
			api(`/v1/workplaces/${workplaceId}/pickups/${input.pickupId}/decision`, {
				method: "POST",
				body: { decision: input.decision },
			}),
		onSuccess: invalidate,
	});
	return { decideRelease, decidePickup };
}

export type QueueCategory = "timeOff" | "shifts" | "pay";

export type QueueItem =
	| {
			kind: "step";
			id: string;
			category: "timeOff";
			sortKey: string;
			emergency: boolean;
			step: PendingApprovalDto;
			request?: TimeOffRequest;
	  }
	| {
			kind: "timeOff";
			id: string;
			category: "timeOff";
			sortKey: string;
			emergency: boolean;
			request: TimeOffRequest;
	  }
	| {
			kind: "release";
			id: string;
			category: "shifts";
			sortKey: string;
			emergency: false;
			release: CoverageRelease;
	  }
	| {
			kind: "pickup";
			id: string;
			category: "shifts";
			sortKey: string;
			emergency: false;
			pickup: CoveragePickup;
	  }
	| {
			kind: "swap";
			id: string;
			category: "shifts";
			sortKey: string;
			emergency: false;
			swap: SwapDetail;
	  }
	| {
			kind: "encashment";
			id: string;
			category: "pay";
			sortKey: string;
			emergency: false;
			encashment: LeaveEncashmentDto;
	  };

/**
 * Everything a Manager is asked to decide, as one list: emergencies first,
 * then whatever starts soonest. A request with an approval step waiting on
 * this Manager appears once, as that step.
 */
export function useRequestQueue(workplaceId: string | undefined) {
	const timeOff = useManagerTimeOff(workplaceId);
	const steps = useMyPendingApprovals(workplaceId);
	const coverage = useManagerCoverage(workplaceId);
	const swaps = useCoverageSwaps(workplaceId);
	const encashments = useLeaveEncashments(workplaceId);

	const queue = useMemo(() => {
		const items: QueueItem[] = [];
		const requests = timeOff.data?.requests ?? [];
		const stepRequestIds = new Set<string>();
		for (const step of steps.data ?? []) {
			stepRequestIds.add(step.requestId);
			items.push({
				kind: "step",
				id: `step-${step.approvalId}`,
				category: "timeOff",
				sortKey: step.startsAt ?? `${step.startDate}T12:00:00`,
				emergency: step.isEmergency,
				step,
				request: requests.find((request) => request.id === step.requestId),
			});
		}
		for (const request of requests) {
			if (request.status !== "pending" || stepRequestIds.has(request.id))
				continue;
			items.push({
				kind: "timeOff",
				id: `timeoff-${request.id}`,
				category: "timeOff",
				sortKey: request.startsAt,
				emergency: Boolean(request.isEmergency),
				request,
			});
		}
		for (const release of coverage.data?.releases ?? []) {
			if (release.status !== "pending") continue;
			items.push({
				kind: "release",
				id: `release-${release.id}`,
				category: "shifts",
				sortKey: release.startsAt,
				emergency: false,
				release,
			});
		}
		for (const pickup of coverage.data?.pickups ?? []) {
			if (pickup.status !== "pending") continue;
			items.push({
				kind: "pickup",
				id: `pickup-${pickup.id}`,
				category: "shifts",
				sortKey: pickup.startsAt ?? "9999",
				emergency: false,
				pickup,
			});
		}
		for (const swap of swaps.data ?? []) {
			items.push({
				kind: "swap",
				id: `swap-${swap.id}`,
				category: "shifts",
				sortKey: [
					swap.requesterShift.startsAt,
					swap.counterpartShift.startsAt,
				].sort()[0],
				emergency: false,
				swap,
			});
		}
		for (const encashment of encashments.data ?? []) {
			if (encashment.status !== "requested") continue;
			items.push({
				kind: "encashment",
				id: `encash-${encashment.id}`,
				category: "pay",
				sortKey: encashment.createdAt,
				emergency: false,
				encashment,
			});
		}
		return items.sort((a, b) =>
			a.emergency !== b.emergency
				? a.emergency
					? -1
					: 1
				: a.sortKey.localeCompare(b.sortKey),
		);
	}, [timeOff.data, steps.data, coverage.data, swaps.data, encashments.data]);

	const today = todayIsoDate();
	const whosOut = useMemo(
		() =>
			(timeOff.data?.requests ?? [])
				.filter(
					(request) =>
						request.status === "approved" &&
						(request.endDate ?? request.endsAt.slice(0, 10)) >= today,
				)
				.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
		[timeOff.data, today],
	);
	const payouts = useMemo(
		() => (encashments.data ?? []).filter((item) => item.status === "approved"),
		[encashments.data],
	);

	const queries = [timeOff, steps, coverage, swaps, encashments];
	return {
		queue,
		whosOut,
		payouts,
		timezone: timeOff.data?.timezone,
		isLoading: queries.some((query) => query.isLoading),
		error: queries.find((query) => query.error)?.error ?? null,
		refetch: () => Promise.all(queries.map((query) => query.refetch())),
	};
}
