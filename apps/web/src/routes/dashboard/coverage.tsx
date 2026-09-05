import { Badge } from "@SchedulesManager/ui/components/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import {
	AppPage,
	AppPageBody,
	AppPageHeader,
} from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { api } from "@/lib/api";
import {
	type SwapDetailDto,
	useCoverageSwaps,
	useSwapDecision,
} from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";
import { hasCoverageItems } from "@/lib/coverage-logic";

interface CoverageResponse {
	releases: {
		id: string;
		workerName: string;
		workerEmail: string;
		positionName: string;
		startsAt: string;
		reason: string | null;
		status: "pending" | "approved" | "declined";
	}[];
	pickups: {
		id: string;
		workerName: string;
		workerEmail: string;
		positionName: string;
		startsAt: string | null;
		status: "pending" | "approved" | "declined";
	}[];
}

export const Route = createFileRoute("/dashboard/coverage")({
	component: CoveragePage,
});

type ReleaseRow = CoverageResponse["releases"][number];
type PickupRow = CoverageResponse["pickups"][number];

const releaseHelper = createDataColumnHelper<ReleaseRow>();
const pickupHelper = createDataColumnHelper<PickupRow>();
const swapHelper = createDataColumnHelper<SwapDetailDto>();

export function CoveragePage() {
	const { workplace } = useWorkplace();
	const queryClient = useQueryClient();

	const coverage = useQuery({
		queryKey: ["coverage", workplace?.id],
		queryFn: () =>
			api<CoverageResponse>(`/v1/workplaces/${workplace?.id}/coverage`),
		enabled: Boolean(workplace?.id),
	});

	function invalidate() {
		queryClient.invalidateQueries({
			queryKey: ["coverage", workplace?.id],
		});
		queryClient.invalidateQueries({
			queryKey: ["schedule"],
		});
	}

	const decideRelease = useMutation({
		mutationFn: (input: {
			releaseId: string;
			decision: "approved" | "declined";
		}) =>
			api(
				`/v1/workplaces/${workplace?.id}/releases/${input.releaseId}/decision`,
				{ method: "POST", body: { decision: input.decision } },
			),
		onSuccess: () => {
			invalidate();
			toast.success("Release decided.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const decidePickup = useMutation({
		mutationFn: (input: {
			pickupId: string;
			decision: "approved" | "declined";
		}) =>
			api(
				`/v1/workplaces/${workplace?.id}/pickups/${input.pickupId}/decision`,
				{ method: "POST", body: { decision: input.decision } },
			) as Promise<{ status: string; publishedVersion?: number }>,
		onSuccess: (result) => {
			invalidate();
			toast.success(
				result.publishedVersion
					? `Pickup approved. Version ${result.publishedVersion} published.`
					: "Pickup decided.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const swaps = useCoverageSwaps(workplace?.id);
	const data = coverage.data;
	const hasItems = hasCoverageItems(data, swaps);

	const releaseColumns = useMemo(
		() =>
			releaseHelper.columns([
				releaseHelper.accessor("workerName", {
					header: "Worker",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				releaseHelper.accessor("positionName", { header: "Position" }),
				releaseHelper.accessor("startsAt", {
					header: "Shift",
					cell: ({ getValue }) => (
						<span className="tabular-nums text-muted-foreground">
							{new Date(getValue()).toLocaleString()}
						</span>
					),
				}),
				releaseHelper.accessor((row) => row.reason ?? "", {
					id: "reason",
					header: "Reason",
					cell: ({ getValue }) => getValue() || "—",
				}),
				releaseHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => (
						<Badge className="capitalize" variant={statusVariant(getValue())}>
							{getValue()}
						</Badge>
					),
				}),
				releaseHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const release = row.original;
						if (release.status !== "pending") return null;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<ConfirmAction
									trigger="Approve"
									disabled={decideRelease.isPending}
									title="Approve this release?"
									description={`${release.workerName} remains responsible until this approval is recorded.`}
									confirmLabel="Approve release"
									onConfirm={() =>
										decideRelease.mutate({
											releaseId: release.id,
											decision: "approved",
										})
									}
								/>
								<ConfirmAction
									trigger="Decline"
									disabled={decideRelease.isPending}
									title="Decline this release?"
									description={`${release.workerName} will remain assigned to this shift.`}
									confirmLabel="Decline release"
									destructive
									onConfirm={() =>
										decideRelease.mutate({
											releaseId: release.id,
											decision: "declined",
										})
									}
								/>
							</div>
						);
					},
				}),
			]),
		[decideRelease],
	);

	const pickupColumns = useMemo(
		() =>
			pickupHelper.columns([
				pickupHelper.accessor("workerName", {
					header: "Worker",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				pickupHelper.accessor("positionName", { header: "Position" }),
				pickupHelper.accessor((row) => row.startsAt ?? "", {
					id: "startsAt",
					header: "Shift",
					cell: ({ getValue }) =>
						getValue() ? (
							<span className="tabular-nums text-muted-foreground">
								{new Date(getValue()).toLocaleString()}
							</span>
						) : (
							"—"
						),
				}),
				pickupHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => (
						<Badge className="capitalize" variant={statusVariant(getValue())}>
							{getValue()}
						</Badge>
					),
				}),
				pickupHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const pickup = row.original;
						if (pickup.status !== "pending") return null;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<ConfirmAction
									trigger="Approve & publish"
									disabled={decidePickup.isPending}
									title="Approve pickup and publish?"
									description={`${pickup.workerName} will be assigned and a new schedule version may be published immediately.`}
									confirmLabel="Approve & publish"
									onConfirm={() =>
										decidePickup.mutate({
											pickupId: pickup.id,
											decision: "approved",
										})
									}
								/>
								<ConfirmAction
									trigger="Decline"
									disabled={decidePickup.isPending}
									title="Decline this pickup?"
									description={`${pickup.workerName} will not be assigned to this open shift.`}
									confirmLabel="Decline pickup"
									destructive
									onConfirm={() =>
										decidePickup.mutate({
											pickupId: pickup.id,
											decision: "declined",
										})
									}
								/>
							</div>
						);
					},
				}),
			]),
		[decidePickup],
	);

	return (
		<AppPage>
			{coverage.isLoading ? (
				<div className="flex flex-col gap-3 p-4">
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
				</div>
			) : null}

			{!coverage.isLoading && data && !hasItems ? (
				<div className="p-6">
					<Empty className="border border-dashed">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<InboxIcon />
							</EmptyMedia>
							<EmptyTitle>No coverage requests</EmptyTitle>
							<EmptyDescription>
								Release and pickup requests from workers will show up here.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			) : null}

			{!coverage.isLoading ? (
				<AppPageBody>
					{data && data.releases.length > 0 ? (
						<section className="border-b">
							<AppPageHeader
								title="Release requests"
								description="Workers asking to give up an assigned shift."
								badge={
									<Badge variant="secondary">{data.releases.length}</Badge>
								}
							/>
							<DataTable
								fill={false}
								columns={releaseColumns}
								data={data.releases}
								getRowId={(row) => row.id}
							/>
						</section>
					) : null}

					<SwapsQueueCard />

					{data && data.pickups.length > 0 ? (
						<section>
							<AppPageHeader
								title="Pickup requests"
								description="Workers asking to take an open shift."
								badge={
									<Badge variant="secondary">{data.pickups.length}</Badge>
								}
							/>
							<DataTable
								fill={false}
								columns={pickupColumns}
								data={data.pickups}
								getRowId={(row) => row.id}
							/>
						</section>
					) : null}
				</AppPageBody>
			) : null}
		</AppPage>
	);
}

function SwapsQueueCard() {
	const { workplace } = useWorkplace();
	const swaps = useCoverageSwaps(workplace?.id);
	const decide = useSwapDecision(workplace?.id);
	const items = swaps.data ?? [];

	const columns = useMemo(
		() =>
			swapHelper.columns([
				swapHelper.accessor((row) => `${row.requester.name} ⇄ ${row.counterpart.name}`, {
					id: "workers",
					header: "Workers",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				swapHelper.accessor(
					(row) =>
						`${row.requester.name} gives ${new Date(row.requesterShift.startsAt).toLocaleString()} (${row.requesterShift.positionName}) · takes ${new Date(row.counterpartShift.startsAt).toLocaleString()} (${row.counterpartShift.positionName})`,
					{
						id: "exchange",
						header: "Exchange",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground">{getValue()}</span>
						),
					},
				),
				swapHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const swap = row.original;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<ConfirmAction
									trigger="Approve & publish"
									disabled={decide.isPending}
									title="Approve swap and publish?"
									description="This exchanges both assignments and may publish a new schedule version immediately."
									confirmLabel="Approve & publish"
									onConfirm={() =>
										decide.mutate(
											{ swapId: swap.id, decision: "approved" },
											{
												onSuccess: (result) => {
													const published = (
														result as { publishedVersion?: number }
													).publishedVersion;
													toast.success(
														published
															? `Swap approved. Version ${published} published.`
															: "Swap approved.",
													);
												},
											},
										)
									}
								/>
								<ConfirmAction
									trigger="Decline"
									disabled={decide.isPending}
									title="Decline this swap?"
									description="Both workers will keep their current assignments."
									confirmLabel="Decline swap"
									destructive
									onConfirm={() =>
										decide.mutate(
											{ swapId: swap.id, decision: "declined" },
											{
												onSuccess: () => toast.success("Swap declined."),
											},
										)
									}
								/>
							</div>
						);
					},
				}),
			]),
		[decide],
	);

	if (swaps.isLoading || items.length === 0) return null;

	return (
		<section className="border-b">
			<AppPageHeader
				title="Shift swap requests"
				description="Both workers agreed to exchange shifts. Approving exchanges the assignments and republishes the schedule."
				badge={<Badge variant="secondary">{items.length}</Badge>}
			/>
			<DataTable
				fill={false}
				columns={columns}
				data={items}
				getRowId={(row) => row.id}
			/>
		</section>
	);
}

function statusVariant(status: "pending" | "approved" | "declined") {
	if (status === "declined") return "destructive" as const;
	if (status === "approved") return "default" as const;
	return "secondary" as const;
}
