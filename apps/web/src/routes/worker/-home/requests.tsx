import { Badge } from "@SchedulesManager/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { memo, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable } from "@/components/data-table";
import { ListToolbar, useListView } from "@/components/list-view";
import {
	useCancelSwap,
	useMyPickups,
	useMyReleases,
	useMySwaps,
	useRespondToSwap,
	useWithdrawRelease,
} from "@/lib/queries";
import { formatSwapExchange } from "@/lib/swaps";
import { formatDay } from "@/lib/time";
import { useStablePrefs } from "../-shared/use-stable-prefs";
import { SWAP_FILTERS, type SwapRow, swapHelper, swapRowId } from "./shared";

const SWAP_STATUS_LABELS = {
	pending_counterpart: "Waiting for coworker",
	pending_manager: "Awaiting manager approval",
	approved: "Approved",
	declined_by_counterpart: "Declined by coworker",
	declined_by_manager: "Declined by manager",
	cancelled: "Cancelled",
} as const;

type WorkerRequestItem = {
	key: string;
	kind: "release" | "pickup" | "swap";
	title: string;
	detail: string;
	statusLabel: string;
	group: "pending" | "decided" | "cancelled";
	tone: "default" | "secondary" | "destructive" | "outline";
	releaseId?: string;
};

const REQUEST_GROUPS: { key: WorkerRequestItem["group"]; label: string }[] = [
	{ key: "pending", label: "Pending" },
	{ key: "decided", label: "Decided" },
	{ key: "cancelled", label: "Cancelled" },
];

export const WorkerRequestsCard = memo(function WorkerRequestsCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const { formatShiftRange, formatClockTime } = useStablePrefs();
	const releases = useMyReleases(workplaceId);
	const pickups = useMyPickups(workplaceId);
	const swaps = useMySwaps(workplaceId);
	const withdraw = useWithdrawRelease();

	const items = useMemo(() => {
		const list: WorkerRequestItem[] = [];
		for (const release of releases.data ?? []) {
			list.push({
				key: `release-${release.id}`,
				kind: "release",
				title: `Release · ${release.positionName}`,
				detail: `${formatDay(release.date)} · ${formatShiftRange(
					release.startMinute,
					release.endMinute,
					release.overnight,
				)}`,
				statusLabel: release.status,
				group: release.status === "pending" ? "pending" : "decided",
				tone:
					release.status === "approved"
						? "default"
						: release.status === "declined"
							? "destructive"
							: "secondary",
				releaseId: release.status === "pending" ? release.id : undefined,
			});
		}
		for (const pickup of pickups.data ?? []) {
			list.push({
				key: `pickup-${pickup.id}`,
				kind: "pickup",
				title: `Pickup · ${pickup.positionName}`,
				detail: pickup.date
					? `${formatDay(pickup.date)} · ${formatShiftRange(
							pickup.startMinute ?? 0,
							pickup.endMinute ?? 0,
							pickup.overnight,
						)} · ${pickup.locationName}`
					: pickup.locationName,
				statusLabel: pickup.status,
				group: pickup.status === "pending" ? "pending" : "decided",
				tone:
					pickup.status === "approved"
						? "default"
						: pickup.status === "declined"
							? "destructive"
							: "secondary",
			});
		}
		for (const { direction, swap } of swaps.data?.swaps ?? []) {
			if (
				swap.status === "pending_counterpart" ||
				swap.status === "pending_manager"
			) {
				continue;
			}
			list.push({
				key: `swap-${swap.id}`,
				kind: "swap",
				title:
					direction === "incoming"
						? `Swap from ${swap.requester.name}`
						: `Swap with ${swap.counterpart.name}`,
				detail: formatSwapExchange(direction, swap, formatClockTime),
				statusLabel: SWAP_STATUS_LABELS[swap.status],
				group: swap.status === "cancelled" ? "cancelled" : "decided",
				tone:
					swap.status === "approved"
						? "default"
						: swap.status.startsWith("declined")
							? "destructive"
							: "outline",
			});
		}
		return list;
	}, [
		formatClockTime,
		formatShiftRange,
		pickups.data,
		releases.data,
		swaps.data,
	]);

	const loading = releases.isLoading || pickups.isLoading || swaps.isLoading;
	if ((loading && items.length === 0) || items.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Requests</CardTitle>
				<CardDescription>
					Your releases, pickups, and swaps — including decisions. You can
					withdraw a release while it is pending.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{REQUEST_GROUPS.map((group) => {
					const groupItems = items.filter((item) => item.group === group.key);
					if (groupItems.length === 0) return null;
					return (
						<div key={group.key} className="flex flex-col gap-2">
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{group.label}
							</p>
							<ul className="divide-y rounded-md border">
								{groupItems.map((item) => (
									<li
										key={item.key}
										className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
									>
										<div className="min-w-0">
											<p className="font-medium text-sm">{item.title}</p>
											<p className="text-muted-foreground text-xs tabular-nums">
												{item.detail}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant={item.tone} className="uppercase">
												{item.statusLabel}
											</Badge>
											{item.releaseId ? (
												<ConfirmAction
													trigger="Withdraw request"
													triggerVariant="ghost"
													title="Withdraw this release request?"
													description="Your manager will no longer see it. You keep the shift."
													confirmLabel="Withdraw request"
													destructive
													disabled={withdraw.isPending}
													onConfirm={() =>
														withdraw.mutate(item.releaseId ?? "", {
															onSuccess: () =>
																toast.success("Release request withdrawn."),
															onError: (error) =>
																toast.error((error as Error).message),
														})
													}
												/>
											) : null}
										</div>
									</li>
								))}
							</ul>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
});

export const WorkerSwapsCard = memo(function WorkerSwapsCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const { formatClockTime } = useStablePrefs();
	const swaps = useMySwaps(workplaceId);
	const respond = useRespondToSwap();
	const cancel = useCancelSwap();
	const items = useMemo(
		() =>
			(swaps.data?.swaps ?? []).filter(
				(item) =>
					item.swap.status === "pending_counterpart" ||
					item.swap.status === "pending_manager",
			),
		[swaps.data],
	);
	const search = useCallback(
		(row: SwapRow) => [
			row.swap.requester.name,
			row.swap.counterpart.name,
			SWAP_STATUS_LABELS[row.swap.status],
			formatSwapExchange(row.direction, row.swap, formatClockTime),
		],
		[formatClockTime],
	);
	const list = useListView<SwapRow>({
		rows: items,
		getRowId: swapRowId,
		search,
		filters: SWAP_FILTERS,
	});

	const respondMutate = respond.mutate;
	const respondPending = respond.isPending;
	const cancelMutate = cancel.mutate;
	const cancelPending = cancel.isPending;
	const columns = useMemo(
		() =>
			swapHelper.columns([
				swapHelper.accessor(
					(row) =>
						row.direction === "incoming" &&
						row.swap.status === "pending_counterpart"
							? `${row.swap.requester.name} proposed a swap`
							: `Swap with ${row.swap.counterpart.name}`,
					{
						id: "title",
						header: "Swap",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				swapHelper.accessor((row) => SWAP_STATUS_LABELS[row.swap.status], {
					id: "status",
					header: "Status",
				}),
				swapHelper.accessor(
					(row) => formatSwapExchange(row.direction, row.swap, formatClockTime),
					{ id: "details", header: "Exchange" },
				),
				swapHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const { direction, swap } = row.original;
						const incoming =
							direction === "incoming" && swap.status === "pending_counterpart";
						const canCancel =
							direction === "outgoing" &&
							(swap.status === "pending_counterpart" ||
								swap.status === "pending_manager");
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								{incoming ? (
									<>
										<ConfirmAction
											trigger="Accept"
											disabled={respondPending}
											title="Accept this swap?"
											description="A manager still has to approve. If they do, you will exchange these shift assignments."
											confirmLabel="Accept swap"
											onConfirm={() =>
												respondMutate(
													{ swapId: swap.id, decision: "accept" },
													{
														onSuccess: () =>
															toast.success(
																"Accepted. A manager can now approve the swap.",
															),
														onError: (error) =>
															toast.error((error as Error).message),
													},
												)
											}
										/>
										<ConfirmAction
											trigger="Decline"
											disabled={respondPending}
											title="Decline this swap?"
											description="You will keep your current shift assignment."
											confirmLabel="Decline swap"
											destructive
											onConfirm={() =>
												respondMutate(
													{ swapId: swap.id, decision: "decline" },
													{
														onSuccess: () => toast.success("Swap declined."),
														onError: (error) =>
															toast.error((error as Error).message),
													},
												)
											}
										/>
									</>
								) : null}
								{canCancel ? (
									<ConfirmAction
										trigger="Cancel"
										disabled={cancelPending}
										title="Cancel this swap?"
										description="Your coworker will be notified. Everyone keeps their current assignment."
										confirmLabel="Cancel swap"
										destructive
										onConfirm={() =>
											cancelMutate(swap.id, {
												onSuccess: () => toast.success("Swap cancelled."),
												onError: (error) =>
													toast.error((error as Error).message),
											})
										}
									/>
								) : null}
							</div>
						);
					},
				}),
			]),
		[
			cancelMutate,
			cancelPending,
			formatClockTime,
			respondMutate,
			respondPending,
		],
	);

	if (swaps.isLoading || items.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Shift swaps</CardTitle>
				<CardDescription>
					A swap only takes effect after your coworker agrees and a manager
					approves. Until then everyone keeps their own shift.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col">
				<ListToolbar embedded list={list} searchPlaceholder="Search swaps" />
				<DataTable
					stacked
					fill={false}
					columns={columns}
					list={list}
					data={list.pagination.pageRows}
					getRowId={swapRowId}
					empty={
						<p className="py-6 text-center text-muted-foreground text-sm">
							No swaps match your search.
						</p>
					}
				/>
			</CardContent>
		</Card>
	);
});
