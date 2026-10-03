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

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	type ListFilter,
	type ListSort,
	ListToolbar,
	useListView,
} from "@/components/list-view";
import {
	type OpenShiftDto,
	useOpenShifts,
	useRequestPickup,
} from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";
import { useStablePrefs } from "./-shared/use-stable-prefs";

export const Route = createFileRoute("/worker/openshifts")({
	component: OpenShiftsPage,
});

const columnHelper = createDataColumnHelper<OpenShiftDto>();

const SORTS: ListSort<OpenShiftDto>[] = [
	{
		id: "when",
		label: "Start time",
		compare: (a, b) => a.startsAt.localeCompare(b.startsAt),
	},
	{
		id: "positionName",
		label: "Position",
		compare: (a, b) => a.positionName.localeCompare(b.positionName),
	},
];

function facet(
	shifts: OpenShiftDto[],
	id: string,
	label: string,
	value: (shift: OpenShiftDto) => string,
): ListFilter<OpenShiftDto>[] {
	const names = Array.from(new Set(shifts.map(value))).sort();
	return names.length > 1
		? [
				{
					id,
					label,
					options: names.map((name) => ({ label: name, value: name })),
					value,
				},
			]
		: [];
}

const searchShift = (shift: OpenShiftDto) => [
	shift.positionName,
	shift.locationName,
];
const shiftId = (shift: OpenShiftDto) => shift.id;
const NO_SHIFTS: OpenShiftDto[] = [];
const DEFAULT_SORT = { id: "when", direction: "asc" } as const;

function OpenShiftsPage() {
	const { workplace } = useWorkplace();
	const { formatShiftRange } = useStablePrefs();
	const openShifts = useOpenShifts(workplace?.id);
	const requestPickup = useRequestPickup();
	const shifts = openShifts.data?.openShifts ?? NO_SHIFTS;
	const requestPickupMutate = requestPickup.mutate;
	const requestPickupPending = requestPickup.isPending;
	const requestPickupVariables = requestPickup.variables;

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
				columnHelper.accessor("positionName", {
					header: "Position",
					cell: ({ row }) => (
						<div className="flex flex-col">
							<span>{row.original.positionName}</span>
							<span className="text-muted-foreground text-xs">
								{row.original.locationName}
							</span>
						</div>
					),
				}),
				columnHelper.display({
					id: "actions",
					header: () => <span className="block text-right">Actions</span>,
					enableSorting: false,
					cell: ({ row }) => {
						const shift = row.original;
						if (shift.myPickupStatus === "pending") {
							return (
								<div className="flex justify-end">
									<Badge variant="secondary">Waiting on manager</Badge>
								</div>
							);
						}
						if (shift.myPickupStatus === "approved") {
							return (
								<div className="flex justify-end">
									<Badge>Assigned to you</Badge>
								</div>
							);
						}
						if (shift.myPickupStatus === "declined") {
							return (
								<div className="flex justify-end">
									<Badge variant="destructive">Declined</Badge>
								</div>
							);
						}
						const pendingThis =
							requestPickupPending && requestPickupVariables === shift.id;
						return (
							<div className="flex justify-end">
								<Button
									size="sm"
									disabled={requestPickupPending}
									onClick={() =>
										requestPickupMutate(shift.id, {
											onSuccess: () =>
												toast.success(
													"Pickup requested. Your manager will decide.",
												),
											onError: (error) => toast.error((error as Error).message),
										})
									}
								>
									{pendingThis ? <Spinner data-icon="inline-start" /> : null}
									Request pickup
								</Button>
							</div>
						);
					},
				}),
			]),
		[
			formatShiftRange,
			requestPickupMutate,
			requestPickupPending,
			requestPickupVariables,
		],
	);

	const filters = useMemo(
		() => [
			...facet(shifts, "position", "Position", (shift) => shift.positionName),
			...facet(shifts, "location", "Location", (shift) => shift.locationName),
		],
		[shifts],
	);
	const list = useListView<OpenShiftDto>({
		rows: shifts,
		getRowId: shiftId,
		search: searchShift,
		filters,
		sorts: SORTS,
		defaultSort: DEFAULT_SORT,
	});

	return (
		<AppPage>
			<AppPageHeader
				title="Open shifts"
				description="Request pickup on an open shift. A manager makes the assignment."
			/>
			<AppPageBody scroll={false}>
				<ListToolbar
					list={list}
					searchPlaceholder="Search position or location"
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					{openShifts.isLoading ? (
						<div className="flex flex-col gap-3 p-4" role="status">
							<span className="sr-only">Loading</span>
							<Skeleton className="h-20" />
							<Skeleton className="h-20" />
						</div>
					) : (
						<DataTable
							fill={false}
							stacked
							query={openShifts}
							columns={columns}
							list={list}
							data={list.pagination.pageRows}
							getRowId={shiftId}
							empty={
								<div className="p-4">
									<Empty className="border border-dashed">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<CalendarPlusIcon />
											</EmptyMedia>
											<EmptyTitle>
												{shifts.length === 0
													? "No open shifts right now"
													: "No matches"}
											</EmptyTitle>
											<EmptyDescription>
												{shifts.length === 0
													? "When a coworker requests a release or a manager opens a shift, it will show up here if you are eligible."
													: "Try a different search or position."}
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								</div>
							}
						/>
					)}
				</div>
			</AppPageBody>
		</AppPage>
	);
}
