import { Badge } from "@SchedulesManager/ui/components/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	type ListFilter,
	type ListSort,
	ListToolbar,
	useListView,
} from "@/components/list-view";
import { QueryFeedback } from "@/components/query-feedback";
import { api } from "@/lib/api";
import { hasCoverageItems } from "@/lib/coverage-logic";
import {
	type SwapDetailDto,
	useCoverageSwaps,
	useSwapDecision,
} from "@/lib/queries";
import {
	formatClockTime,
	formatDay,
	formatDurationMs,
	isSameWorkplaceDay,
} from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

interface CoverageResponse {
	releases: {
		id: string;
		workerName: string;
		workerEmail: string;
		positionName: string;
		startsAt: string;
		endsAt: string;
		reason: string | null;
		status: "pending" | "approved" | "declined";
		timezone: string;
	}[];
	pickups: {
		id: string;
		workerName: string;
		workerEmail: string;
		positionName: string;
		startsAt: string | null;
		endsAt: string | null;
		status: "pending" | "approved" | "declined";
		timezone: string;
	}[];
}

export const Route = createFileRoute("/dashboard/coverage")({
	component: CoveragePage,
});

type ReleaseRow = CoverageResponse["releases"][number];
type PickupRow = CoverageResponse["pickups"][number];

const STATUS_OPTIONS = [
	{ label: "Pending", value: "pending" },
	{ label: "Approved", value: "approved" },
	{ label: "Declined", value: "declined" },
];

const RELEASE_FILTERS: ListFilter<ReleaseRow>[] = [
	{
		id: "status",
		label: "Status",
		options: STATUS_OPTIONS,
		value: (row) => row.status,
	},
];
const PICKUP_FILTERS: ListFilter<PickupRow>[] = [
	{
		id: "status",
		label: "Status",
		options: STATUS_OPTIONS,
		value: (row) => row.status,
	},
];

const RELEASE_SORTS: ListSort<ReleaseRow>[] = [
	{
		id: "shift",
		label: "Shift",
		compare: (a, b) => a.startsAt.localeCompare(b.startsAt),
	},
	{
		id: "workerName",
		label: "Worker",
		compare: (a, b) => a.workerName.localeCompare(b.workerName),
	},
];
const PICKUP_SORTS: ListSort<PickupRow>[] = [
	{
		id: "startsAt",
		label: "Shift",
		compare: (a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""),
	},
	{
		id: "workerName",
		label: "Worker",
		compare: (a, b) => a.workerName.localeCompare(b.workerName),
	},
];
const SWAP_SORTS: ListSort<SwapDetailDto>[] = [
	{
		id: "workers",
		label: "Requester",
		compare: (a, b) => a.requester.name.localeCompare(b.requester.name),
	},
	{
		id: "exchange",
		label: "Shift",
		compare: (a, b) =>
			a.requesterShift.startsAt.localeCompare(b.requesterShift.startsAt),
	},
];

const searchCoverageRow = (row: ReleaseRow | PickupRow) => [
	row.workerName,
	row.positionName,
];
const searchSwap = (row: SwapDetailDto) => [
	row.requester.name,
	row.counterpart.name,
];
const rowId = (row: { id: string }) => row.id;

/** A shift window on its Location's wall clock. */
function formatShiftWindow(
	startsAt: string,
	endsAt: string | null | undefined,
	timeZone: string,
) {
	const day = (iso: string) => formatDay(iso, timeZone);
	const time = (iso: string) => formatClockTime(iso, "12h", timeZone);
	if (!endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
		return `${day(startsAt)} · ${time(startsAt)}`;
	}
	const duration = formatDurationMs(
		new Date(endsAt).getTime() - new Date(startsAt).getTime(),
	);
	return isSameWorkplaceDay(startsAt, endsAt, timeZone)
		? `${day(startsAt)} · ${time(startsAt)} – ${time(endsAt)} · ${duration}`
		: `${day(startsAt)} ${time(startsAt)} → ${day(endsAt)} ${time(endsAt)} · ${duration}`;
}

const releaseHelper = createDataColumnHelper<ReleaseRow>();
const pickupHelper = createDataColumnHelper<PickupRow>();
const swapHelper = createDataColumnHelper<SwapDetailDto>();

function CoveragePage() {
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
	const decideSwap = useSwapDecision(workplace?.id);
	const data = coverage.data;
	const hasItems = hasCoverageItems(data, swaps);

	const [tab, setTab] = useState<"releases" | "swaps" | "pickups">("releases");

	const releases = useMemo(() => data?.releases ?? [], [data?.releases]);
	const pickups = useMemo(() => data?.pickups ?? [], [data?.pickups]);
	const swapItems = useMemo(() => swaps.data ?? [], [swaps.data]);

	const releaseColumns = useMemo(
		() =>
			releaseHelper.columns([
				releaseHelper.accessor("workerName", {
					header: "Worker",
					cell: ({ row }) => (
						<div className="flex flex-col">
							<span className="font-medium">{row.original.workerName}</span>
							<span className="text-muted-foreground text-xs">
								{row.original.positionName}
							</span>
						</div>
					),
				}),
				releaseHelper.accessor(
					(row) => formatShiftWindow(row.startsAt, row.endsAt, row.timezone),
					{
						id: "shift",
						header: "Shift",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground tabular-nums">
								{getValue()}
							</span>
						),
					},
				),
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
					header: () => <span className="block text-right">Actions</span>,
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
					cell: ({ row }) => (
						<div className="flex flex-col">
							<span className="font-medium">{row.original.workerName}</span>
							<span className="text-muted-foreground text-xs">
								{row.original.positionName}
							</span>
						</div>
					),
				}),
				pickupHelper.accessor(
					(row) =>
						row.startsAt
							? formatShiftWindow(row.startsAt, row.endsAt, row.timezone)
							: "",
					{
						id: "startsAt",
						header: "Shift",
						cell: ({ getValue }) =>
							getValue() ? (
								<span className="text-muted-foreground tabular-nums">
									{getValue()}
								</span>
							) : (
								"—"
							),
					},
				),
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
					header: () => <span className="block text-right">Actions</span>,
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

	const swapColumns = useMemo(
		() =>
			swapHelper.columns([
				swapHelper.accessor(
					(row) => `${row.requester.name} ⇄ ${row.counterpart.name}`,
					{
						id: "workers",
						header: "Workers",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				swapHelper.accessor(
					(row) =>
						`${row.requester.name} gives ${formatShiftWindow(row.requesterShift.startsAt, row.requesterShift.endsAt, row.requesterShift.timezone)} (${row.requesterShift.positionName}) · takes ${formatShiftWindow(row.counterpartShift.startsAt, row.counterpartShift.endsAt, row.counterpartShift.timezone)} (${row.counterpartShift.positionName})`,
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
					header: () => <span className="block text-right">Actions</span>,
					enableSorting: false,
					cell: ({ row }) => {
						const swap = row.original;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<ConfirmAction
									trigger="Approve & publish"
									disabled={decideSwap.isPending}
									title="Approve swap and publish?"
									description="This exchanges both assignments and may publish a new schedule version immediately."
									confirmLabel="Approve & publish"
									onConfirm={() =>
										decideSwap.mutate(
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
									disabled={decideSwap.isPending}
									title="Decline this swap?"
									description="Both workers will keep their current assignments."
									confirmLabel="Decline swap"
									destructive
									onConfirm={() =>
										decideSwap.mutate(
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
		[decideSwap],
	);

	const releaseList = useListView<ReleaseRow>({
		rows: releases,
		getRowId: rowId,
		search: searchCoverageRow,
		filters: RELEASE_FILTERS,
		sorts: RELEASE_SORTS,
		defaultSort: { id: "shift", direction: "asc" },
	});
	const pickupList = useListView<PickupRow>({
		rows: pickups,
		getRowId: rowId,
		search: searchCoverageRow,
		filters: PICKUP_FILTERS,
		sorts: PICKUP_SORTS,
		defaultSort: { id: "startsAt", direction: "asc" },
	});
	const swapList = useListView<SwapDetailDto>({
		rows: swapItems,
		getRowId: rowId,
		search: searchSwap,
		sorts: SWAP_SORTS,
	});

	const pendingCount =
		releases.filter((row) => row.status === "pending").length +
		pickups.filter((row) => row.status === "pending").length +
		swapItems.length;

	if (coverage.isError)
		return <QueryFeedback query={coverage} label="coverage requests" />;

	return (
		<AppPage>
			<AppPageHeader
				title="Coverage"
				badge={
					pendingCount > 0 ? (
						<Badge variant="secondary">{pendingCount} pending</Badge>
					) : null
				}
				description="Release, swap, and pickup requests from workers."
			/>
			<AppPageBody scroll={false}>
				{coverage.isLoading ? (
					<div className="flex flex-col gap-3 p-4" role="status">
						<span className="sr-only">Loading</span>
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
									Release, swap, and pickup requests from workers will show up
									here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				) : null}

				{!coverage.isLoading && hasItems ? (
					<Tabs
						value={tab}
						onValueChange={(value) =>
							setTab(value as "releases" | "swaps" | "pickups")
						}
						className="min-h-0 flex-1 gap-0"
					>
						<div className="shrink-0 border-b px-4 py-2">
							<TabsList variant="line">
								<TabsTrigger value="releases">
									Releases
									<Badge variant="secondary">{releases.length}</Badge>
								</TabsTrigger>
								<TabsTrigger value="swaps">
									Swaps
									<Badge variant="secondary">{swapItems.length}</Badge>
								</TabsTrigger>
								<TabsTrigger value="pickups">
									Pickups
									<Badge variant="secondary">{pickups.length}</Badge>
								</TabsTrigger>
							</TabsList>
						</div>

						<TabsContent
							value="releases"
							className="flex min-h-0 flex-1 flex-col"
						>
							<ListToolbar
								list={releaseList}
								searchPlaceholder="Search worker or position"
							/>
							<div className="min-h-0 flex-1 overflow-auto">
								<DataTable
									fill={false}
									stacked
									columns={releaseColumns}
									list={releaseList}
									data={releaseList.pagination.pageRows}
									getRowId={rowId}
									empty={
										<div className="p-4">
											<Empty className="border border-dashed">
												<EmptyHeader>
													<EmptyTitle>
														{releases.length === 0
															? "No release requests"
															: "No matches"}
													</EmptyTitle>
													<EmptyDescription>
														{releases.length === 0
															? "Workers asking to give up a shift will appear here."
															: "Try a different search or status."}
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										</div>
									}
								/>
							</div>
						</TabsContent>

						<TabsContent value="swaps" className="flex min-h-0 flex-1 flex-col">
							<ListToolbar list={swapList} searchPlaceholder="Search workers" />
							<div className="min-h-0 flex-1 overflow-auto">
								<DataTable
									fill={false}
									stacked
									columns={swapColumns}
									list={swapList}
									data={swapList.pagination.pageRows}
									getRowId={rowId}
									empty={
										<div className="p-4">
											<Empty className="border border-dashed">
												<EmptyHeader>
													<EmptyTitle>No swap requests</EmptyTitle>
													<EmptyDescription>
														Worker-to-worker swaps appear here once both agree.
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										</div>
									}
								/>
							</div>
						</TabsContent>

						<TabsContent
							value="pickups"
							className="flex min-h-0 flex-1 flex-col"
						>
							<ListToolbar
								list={pickupList}
								searchPlaceholder="Search worker or position"
							/>
							<div className="min-h-0 flex-1 overflow-auto">
								<DataTable
									fill={false}
									stacked
									columns={pickupColumns}
									list={pickupList}
									data={pickupList.pagination.pageRows}
									getRowId={rowId}
									empty={
										<div className="p-4">
											<Empty className="border border-dashed">
												<EmptyHeader>
													<EmptyTitle>
														{pickups.length === 0
															? "No pickup requests"
															: "No matches"}
													</EmptyTitle>
													<EmptyDescription>
														{pickups.length === 0
															? "Workers asking to take an open shift will appear here."
															: "Try a different search or status."}
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										</div>
									}
								/>
							</div>
						</TabsContent>
					</Tabs>
				) : null}
			</AppPageBody>
		</AppPage>
	);
}

function statusVariant(status: "pending" | "approved" | "declined") {
	if (status === "declined") return "destructive" as const;
	if (status === "approved") return "default" as const;
	return "secondary" as const;
}
