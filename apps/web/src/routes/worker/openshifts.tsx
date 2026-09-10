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
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import {
	type OpenShiftDto,
	useOpenShifts,
	useRequestPickup,
} from "@/lib/queries";
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
	const [search, setSearch] = useState("");
	const [positionFilter, setPositionFilter] = useState("all");

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
							requestPickup.isPending && requestPickup.variables === shift.id;
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
		[formatShiftRange, requestPickup],
	);

	const positionItems = useMemo(() => {
		const names = Array.from(
			new Set(shifts.map((shift) => shift.positionName)),
		).sort();
		return [
			{ label: "All positions", value: "all" },
			...names.map((name) => ({ label: name, value: name })),
		];
	}, [shifts]);

	const filteredRows = useMemo(() => {
		const term = search.trim().toLowerCase();
		return shifts.filter((shift) => {
			if (positionFilter !== "all" && shift.positionName !== positionFilter) {
				return false;
			}
			if (!term) return true;
			return `${shift.positionName} ${shift.locationName}`
				.toLowerCase()
				.includes(term);
		});
	}, [positionFilter, search, shifts]);
	const pagination = useTablePagination(filteredRows, {
		resetKey: `${search}|${positionFilter}`,
	});

	return (
		<AppPage>
			<AppPageHeader
				title="Open shifts"
				description="Request pickup on an open shift. A manager makes the assignment."
			/>
			<AppPageBody scroll={false}>
				<TableToolbar
					left={
						<>
							<TableSearch
								value={search}
								onValueChange={setSearch}
								placeholder="Search position or location"
							/>
							{positionItems.length > 1 ? (
								<TableFilter
									value={positionFilter}
									onValueChange={setPositionFilter}
									items={positionItems}
									ariaLabel="Filter by position"
								/>
							) : null}
						</>
					}
					right={<TablePagination {...pagination} />}
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					{openShifts.isLoading ? (
						<div className="flex flex-col gap-3 p-4">
							<Skeleton className="h-20" />
							<Skeleton className="h-20" />
						</div>
					) : (
						<DataTable
							fill={false}
							stacked
							query={openShifts}
							columns={columns}
							data={pagination.pageRows}
							getRowId={(row) => row.id}
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
