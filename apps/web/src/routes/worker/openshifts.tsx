import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlusIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import {
	AppPage,
	AppPageBody,
	AppPageHeader,
} from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { type OpenShiftDto, useOpenShifts, useRequestPickup } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker/openshifts")({
	component: OpenShiftsPage,
});

const columnHelper = createDataColumnHelper<OpenShiftDto>();

function OpenShiftsPage() {
	const { workplace } = useWorkplace();
	const { formatShiftRange } = useDisplayPrefs();
	const openShifts = useOpenShifts(workplace?.id);
	const requestPickup = useRequestPickup();
	const shifts = openShifts.data?.openShifts ?? [];

	const columns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.accessor(
					(row) =>
						`${formatDay(row.startsAt)} · ${formatShiftRange(row.startMinute, row.endMinute, row.overnight)}`,
					{
						id: "when",
						header: "Shift",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				columnHelper.accessor("positionName", { header: "Position" }),
				columnHelper.accessor("locationName", { header: "Location" }),
				columnHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const shift = row.original;
						if (shift.myPickupStatus === "pending") {
							return <Badge variant="secondary">Waiting on manager</Badge>;
						}
						if (shift.myPickupStatus === "approved") {
							return <Badge>Assigned to you</Badge>;
						}
						if (shift.myPickupStatus === "declined") {
							return <Badge variant="destructive">Declined</Badge>;
						}
						return (
							<div className="flex justify-end">
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
							</div>
						);
					},
				}),
			]),
		[formatShiftRange, requestPickup],
	);

	return (
		<AppPage>
			<AppPageHeader
				title="Open shifts"
				description="Request pickup on an open shift. A manager makes the assignment."
			/>
			<AppPageBody scroll={false}>
				{openShifts.isLoading ? (
					<div className="flex flex-col gap-3 p-4">
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
					</div>
				) : (
					<DataTable
						columns={columns}
						data={shifts}
						getRowId={(row) => row.id}
						empty={
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<CalendarPlusIcon />
									</EmptyMedia>
									<EmptyTitle>No open shifts right now</EmptyTitle>
									<EmptyDescription>
										When a coworker requests a release or a manager opens a
										shift, it will show up here if you are eligible.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						}
					/>
				)}
			</AppPageBody>
		</AppPage>
	);
}
