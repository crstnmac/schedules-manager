import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { toast } from "sonner";

import { ProgressiveItemGroup } from "@/components/progressive-item-group";
import { api } from "@/lib/api";
import { useCoverageSwaps, useSwapDecision } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

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

	const data = coverage.data;
	const hasItems =
		(data?.releases.length ?? 0) > 0 || (data?.pickups.length ?? 0) > 0;

	return (
		<section className="grid gap-4 xl:grid-cols-2">
			{coverage.isLoading ? (
				<div className="flex flex-col gap-3 xl:col-span-2">
					<Skeleton className="h-24" />
					<Skeleton className="h-24" />
				</div>
			) : null}

			{!coverage.isLoading && data && !hasItems ? (
				<Empty className="border border-dashed xl:col-span-2">
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
			) : null}

			{data && data.releases.length > 0 ? (
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between gap-2">
							<CardTitle>Release requests</CardTitle>
							<Badge variant="secondary">{data.releases.length}</Badge>
						</div>
						<CardDescription>
							Workers asking to give up an assigned shift.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ProgressiveItemGroup
							items={data.releases}
							renderItem={(release) => (
								<Item key={release.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle className="w-full min-w-0">
											{release.workerName} · {release.positionName}
											{release.status !== "pending" ? (
												<Badge
													className="shrink-0 capitalize"
													variant={statusVariant(release.status)}
												>
													{release.status}
												</Badge>
											) : null}
										</ItemTitle>
										<ItemDescription>
											{new Date(release.startsAt).toLocaleString()}
											{release.reason ? ` · ${release.reason}` : ""}
										</ItemDescription>
									</ItemContent>
									{release.status === "pending" ? (
										<ItemActions className="ml-auto w-full justify-end sm:w-auto">
											<Button
												size="sm"
												disabled={decideRelease.isPending}
												onClick={() =>
													decideRelease.mutate({
														releaseId: release.id,
														decision: "approved",
													})
												}
											>
												{decideRelease.isPending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												Approve
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={decideRelease.isPending}
												onClick={() =>
													decideRelease.mutate({
														releaseId: release.id,
														decision: "declined",
													})
												}
											>
												Decline
											</Button>
										</ItemActions>
									) : null}
								</Item>
							)}
						/>
					</CardContent>
				</Card>
			) : null}

			<SwapsQueueCard />

			{data && data.pickups.length > 0 ? (
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between gap-2">
							<CardTitle>Pickup requests</CardTitle>
							<Badge variant="secondary">{data.pickups.length}</Badge>
						</div>
						<CardDescription>
							Workers asking to take an open shift.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ProgressiveItemGroup
							items={data.pickups}
							renderItem={(pickup) => (
								<Item key={pickup.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle className="w-full min-w-0">
											{pickup.workerName} · {pickup.positionName}
											{pickup.status !== "pending" ? (
												<Badge
													className="shrink-0 capitalize"
													variant={statusVariant(pickup.status)}
												>
													{pickup.status}
												</Badge>
											) : null}
										</ItemTitle>
										<ItemDescription>
											{pickup.startsAt
												? new Date(pickup.startsAt).toLocaleString()
												: ""}
										</ItemDescription>
									</ItemContent>
									{pickup.status === "pending" ? (
										<ItemActions className="ml-auto w-full flex-wrap justify-end sm:w-auto">
											<Button
												size="sm"
												disabled={decidePickup.isPending}
												onClick={() =>
													decidePickup.mutate({
														pickupId: pickup.id,
														decision: "approved",
													})
												}
											>
												{decidePickup.isPending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												Approve &amp; publish
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={decidePickup.isPending}
												onClick={() =>
													decidePickup.mutate({
														pickupId: pickup.id,
														decision: "declined",
													})
												}
											>
												Decline
											</Button>
										</ItemActions>
									) : null}
								</Item>
							)}
						/>
					</CardContent>
				</Card>
			) : null}
		</section>
	);
}

function SwapsQueueCard() {
	const { workplace } = useWorkplace();
	const swaps = useCoverageSwaps(workplace?.id);
	const decide = useSwapDecision(workplace?.id);
	const items = swaps.data ?? [];

	if (swaps.isLoading || items.length === 0) return null;

	return (
		<Card className="xl:col-span-2">
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>Shift swap requests</CardTitle>
					<Badge variant="secondary">{items.length}</Badge>
				</div>
				<CardDescription>
					Both workers agreed to exchange shifts. Approving exchanges the
					assignments and republishes the schedule.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ProgressiveItemGroup
					items={items}
					renderItem={(swap) => (
						<Item key={swap.id} variant="outline" role="listitem">
							<ItemContent>
								<ItemTitle className="w-full min-w-0">
									{swap.requester.name} ⇄ {swap.counterpart.name}
								</ItemTitle>
								<ItemDescription>
									{swap.requester.name} gives{" "}
									{new Date(swap.requesterShift.startsAt).toLocaleString()} (
									{swap.requesterShift.positionName}) · takes{" "}
									{new Date(swap.counterpartShift.startsAt).toLocaleString()} (
									{swap.counterpartShift.positionName})
								</ItemDescription>
							</ItemContent>
							<ItemActions className="ml-auto w-full flex-wrap justify-end sm:w-auto">
								<Button
									size="sm"
									disabled={decide.isPending}
									onClick={() =>
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
								>
									{decide.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Approve &amp; publish
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate(
											{ swapId: swap.id, decision: "declined" },
											{
												onSuccess: () => toast.success("Swap declined."),
											},
										)
									}
								>
									Decline
								</Button>
							</ItemActions>
						</Item>
					)}
				/>
			</CardContent>
		</Card>
	);
}

function statusVariant(status: "pending" | "approved" | "declined") {
	if (status === "declined") return "destructive" as const;
	if (status === "approved") return "default" as const;
	return "secondary" as const;
}
