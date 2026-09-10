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
import { QueryFeedback } from "@/components/query-feedback";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { api } from "@/lib/api";
import { hasCoverageItems } from "@/lib/coverage-logic";
import {
	type SwapDetailDto,
	useCoverageSwaps,
	useSwapDecision,
} from "@/lib/queries";
import { formatClockTime, formatDay, formatDurationMs } from "@/lib/time";
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
	}[];
	pickups: {
		id: string;
		workerName: string;
		workerEmail: string;
		positionName: string;
		startsAt: string | null;
		endsAt: string | null;
		status: "pending" | "approved" | "declined";
	}[];
}

export const Route = createFileRoute("/dashboard/coverage")({
	component: CoveragePage,
});

type ReleaseRow = CoverageResponse["releases"][number];
type PickupRow = CoverageResponse["pickups"][number];

const STATUS_FILTERS = [
	{ label: "All statuses", value: "all" },
	{ label: "Pending", value: "pending" },
	{ label: "Approved", value: "approved" },
	{ label: "Declined", value: "declined" },
];

function formatShiftWindow(startsAt: string, endsAt?: string | null) {
	if (!endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
		return `${formatDay(startsAt)} · ${formatClockTime(startsAt)}`;
	}
	const sameDay =
		new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
	const duration = formatDurationMs(
		new Date(endsAt).getTime() - new Date(startsAt).getTime(),
	);
	return sameDay
		? `${formatDay(startsAt)} · ${formatClockTime(startsAt)} – ${formatClockTime(endsAt)} · ${duration}`
		: `${formatDay(startsAt)} ${formatClockTime(startsAt)} → ${formatDay(endsAt)} ${formatClockTime(endsAt)} · ${duration}`;
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
	const [releaseSearch, setReleaseSearch] = useState("");
	const [releaseStatus, setReleaseStatus] = useState("all");
	const [pickupSearch, setPickupSearch] = useState("");
	const [pickupStatus, setPickupStatus] = useState("all");
	const [swapSearch, setSwapSearch] = useState("");

	const releases = data?.releases ?? [];
	const pickups = data?.pickups ?? [];
	const swapItems = swaps.data ?? [];

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
					(row) => formatShiftWindow(row.startsAt, row.endsAt),
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
						row.startsAt ? formatShiftWindow(row.startsAt, row.endsAt) : "",
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
						`${row.requester.name} gives ${formatShiftWindow(row.requesterShift.startsAt, row.requesterShift.endsAt)} (${row.requesterShift.positionName}) · takes ${formatShiftWindow(row.counterpartShift.startsAt, row.counterpartShift.endsAt)} (${row.counterpartShift.positionName})`,
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

	const releaseRows = useMemo(() => {
		const term = releaseSearch.trim().toLowerCase();
		return releases.filter((row) => {
			if (releaseStatus !== "all" && row.status !== releaseStatus) return false;
			if (!term) return true;
			return `${row.workerName} ${row.positionName}`
				.toLowerCase()
				.includes(term);
		});
	}, [releases, releaseSearch, releaseStatus]);

	const pickupRows = useMemo(() => {
		const term = pickupSearch.trim().toLowerCase();
		return pickups.filter((row) => {
			if (pickupStatus !== "all" && row.status !== pickupStatus) return false;
			if (!term) return true;
			return `${row.workerName} ${row.positionName}`
				.toLowerCase()
				.includes(term);
		});
	}, [pickups, pickupSearch, pickupStatus]);

	const swapRows = useMemo(() => {
		const term = swapSearch.trim().toLowerCase();
		if (!term) return swapItems;
		return swapItems.filter((row) =>
			`${row.requester.name} ${row.counterpart.name}`
				.toLowerCase()
				.includes(term),
		);
	}, [swapItems, swapSearch]);

	const releasePagination = useTablePagination(releaseRows, {
		resetKey: `${releaseSearch}|${releaseStatus}`,
	});
	const pickupPagination = useTablePagination(pickupRows, {
		resetKey: `${pickupSearch}|${pickupStatus}`,
	});
	const swapPagination = useTablePagination(swapRows, { resetKey: swapSearch });

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
							<TableToolbar
								left={
									<>
										<TableSearch
											value={releaseSearch}
											onValueChange={setReleaseSearch}
											placeholder="Search worker or position"
										/>
										<TableFilter
											value={releaseStatus}
											onValueChange={setReleaseStatus}
											items={STATUS_FILTERS}
											ariaLabel="Filter releases by status"
										/>
									</>
								}
								right={<TablePagination {...releasePagination} />}
							/>
							<div className="min-h-0 flex-1 overflow-auto">
								<DataTable
									fill={false}
									stacked
									columns={releaseColumns}
									data={releasePagination.pageRows}
									getRowId={(row) => row.id}
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
							<TableToolbar
								left={
									<TableSearch
										value={swapSearch}
										onValueChange={setSwapSearch}
										placeholder="Search workers"
									/>
								}
								right={<TablePagination {...swapPagination} />}
							/>
							<div className="min-h-0 flex-1 overflow-auto">
								<DataTable
									fill={false}
									stacked
									columns={swapColumns}
									data={swapPagination.pageRows}
									getRowId={(row) => row.id}
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
							<TableToolbar
								left={
									<>
										<TableSearch
											value={pickupSearch}
											onValueChange={setPickupSearch}
											placeholder="Search worker or position"
										/>
										<TableFilter
											value={pickupStatus}
											onValueChange={setPickupStatus}
											items={STATUS_FILTERS}
											ariaLabel="Filter pickups by status"
										/>
									</>
								}
								right={<TablePagination {...pickupPagination} />}
							/>
							<div className="min-h-0 flex-1 overflow-auto">
								<DataTable
									fill={false}
									stacked
									columns={pickupColumns}
									data={pickupPagination.pageRows}
									getRowId={(row) => row.id}
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
