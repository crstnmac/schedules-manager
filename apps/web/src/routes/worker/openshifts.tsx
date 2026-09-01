import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
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
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { useOpenShifts, useRequestPickup } from "@/lib/queries";
import { formatDay, formatShiftRange } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/openshifts")({
	component: OpenShiftsPage,
});

function OpenShiftsPage() {
	const { workplace } = useWorkplace();
	const openShifts = useOpenShifts(workplace?.id);
	const requestPickup = useRequestPickup();
	const shifts = openShifts.data?.openShifts ?? [];

	return (
		<section className="flex flex-col gap-4">
			<PageHeader
				title="Open shifts"
				description="Request pickup on an open shift. A manager makes the assignment. Pickup never silently reassigns a published shift."
			/>

			{openShifts.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-20" />
					<Skeleton className="h-20" />
				</div>
			) : null}

			{!openShifts.isLoading && shifts.length === 0 ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CalendarPlusIcon />
						</EmptyMedia>
						<EmptyTitle>No open shifts right now</EmptyTitle>
						<EmptyDescription>
							When a coworker requests a release or a manager opens a shift, it
							will show up here if you are eligible.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			{shifts.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Available to pick up</CardTitle>
						<CardDescription>
							Only eligible workers can request these.
						</CardDescription>
					</CardHeader>
					<div className="px-4 pb-4">
						<ItemGroup>
							{shifts.map((shift) => (
								<Item key={shift.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>
											{formatDay(shift.startsAt)} ·{" "}
											{formatShiftRange(
												shift.startMinute,
												shift.endMinute,
												shift.overnight,
											)}
										</ItemTitle>
										<ItemDescription>
											{shift.positionName} · {shift.locationName}
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										{shift.myPickupStatus === "pending" ? (
											<Badge variant="secondary">Waiting on manager</Badge>
										) : shift.myPickupStatus === "approved" ? (
											<Badge>Assigned to you</Badge>
										) : shift.myPickupStatus === "declined" ? (
											<Badge variant="destructive">Declined</Badge>
										) : (
											<Button
												size="sm"
												disabled={requestPickup.isPending}
												onClick={() =>
													requestPickup.mutate(shift.id, {
														onSuccess: () =>
															toast.success(
																"Pickup requested. Your manager will decide.",
															),
														onError: (error) =>
															toast.error((error as Error).message),
													})
												}
											>
												{requestPickup.isPending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												Request pickup
											</Button>
										)}
									</ItemActions>
								</Item>
							))}
						</ItemGroup>
					</div>
				</Card>
			) : null}
		</section>
	);
}
