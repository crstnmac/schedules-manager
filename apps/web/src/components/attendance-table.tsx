import { Button } from "@SchedulesManager/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@SchedulesManager/ui/components/table";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	createColumnHelper,
	createSortedRowModel,
	flexRender,
	rowSortingFeature,
	sortFns,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";

import type { AttendanceReport, AttendanceStatus } from "@/lib/queries";

type AttendanceWorker = AttendanceReport["workers"][number];

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns,
});

const columnHelper = createColumnHelper<typeof features, AttendanceWorker>();

export function AttendanceTable({
	workers,
	dates,
	dayLabel,
	renderStatus,
}: {
	workers: AttendanceWorker[];
	dates: string[];
	dayLabel: (date: string) => string;
	renderStatus: (status: AttendanceStatus | undefined) => ReactNode;
}) {
	const columns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.accessor("name", {
					id: "worker",
					header: "Worker",
				}),
				columnHelper.accessor((worker) => worker.positions.join(", "), {
					id: "position",
					header: "Position",
				}),
				...dates.map((date) =>
					columnHelper.accessor((worker) => worker.days[date], {
						id: date,
						header: dayLabel(date),
						enableSorting: false,
						cell: ({ getValue }) => renderStatus(getValue()),
					}),
				),
			]),
		[dates, dayLabel, renderStatus],
	);

	const table = useTable({
		features,
		columns,
		data: workers,
		getRowId: (worker) => worker.employmentId,
	});

	return (
		<div className="schedule-grid-scroll overflow-x-auto">
			<Table className="w-max min-w-full border-collapse">
				<TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="hover:bg-transparent">
							{headerGroup.headers.map((header) => {
								const canSort = header.column.getCanSort();
								const sorted = header.column.getIsSorted();
								return (
									<TableHead
										key={header.id}
										aria-sort={
											sorted === "asc"
												? "ascending"
												: sorted === "desc"
													? "descending"
													: canSort
														? "none"
														: undefined
										}
										className={cn(
											"border-r px-2 text-center text-xs",
											header.column.id === "worker" &&
												"sticky left-0 z-20 min-w-52 bg-muted px-3 text-left",
											header.column.id === "position" &&
												"min-w-36 px-3 text-left",
											header.column.id !== "worker" &&
												header.column.id !== "position" &&
												"min-w-16",
										)}
									>
										{header.isPlaceholder ? null : canSort ? (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="-ml-2 h-auto px-2 font-medium"
												onClick={header.column.getToggleSortingHandler()}
											>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
												{sorted === "asc" ? (
													<ArrowUpIcon data-icon="inline-end" />
												) : sorted === "desc" ? (
													<ArrowDownIcon data-icon="inline-end" />
												) : (
													<ChevronsUpDownIcon
														data-icon="inline-end"
														className="opacity-50"
													/>
												)}
											</Button>
										) : (
											flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)
										)}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.map((row) => (
						<TableRow key={row.id}>
							{row.getAllCells().map((cell) => (
								<TableCell
									key={cell.id}
									className={cn(
										"border-r px-2 py-2 text-center",
										cell.column.id === "worker" &&
											"sticky left-0 z-10 bg-card px-3 py-2.5 text-left font-medium",
										cell.column.id === "position" &&
											"max-w-44 truncate px-3 py-2.5 text-left text-muted-foreground",
									)}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
