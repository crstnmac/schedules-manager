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
	type ColumnDef,
	createColumnHelper,
	createSortedRowModel,
	flexRender,
	type RowData,
	rowSortingFeature,
	sortFns,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ReactNode } from "react";

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns,
});

export function createDataColumnHelper<TData extends RowData>() {
	return createColumnHelper<typeof features, TData>();
}

export function DataTable<TData extends RowData>({
	columns,
	data,
	getRowId,
	empty,
	className,
	bounded = false,
	fill = true,
}: {
	columns: Array<ColumnDef<typeof features, TData, unknown>>;
	data: TData[];
	getRowId?: (originalRow: TData, index: number) => string;
	empty?: ReactNode;
	className?: string;
	bounded?: boolean;
	fill?: boolean;
}) {
	const dataTable = useTable({
		features,
		columns,
		data,
		getRowId,
	});

	if (data.length === 0) {
		return empty ? (
			<div className={cn(fill && "flex min-h-0 flex-1 flex-col", "p-6")}>
				{empty}
			</div>
		) : null;
	}

	return (
		<div
			className={cn(
				"flex min-h-0 flex-col",
				fill && "flex-1",
				bounded && "max-h-[min(28rem,calc(100dvh-12rem))]",
				className,
			)}
		>
			<Table
				containerClassName={cn(
					"schedule-grid-scroll min-h-0 print:max-h-none print:overflow-visible",
					fill && "flex-1",
					bounded && "max-h-[min(28rem,calc(100dvh-12rem))]",
				)}
			>
				<TableHeader>
					{dataTable.getHeaderGroups().map((headerGroup) => (
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
									>
										{header.isPlaceholder ? null : canSort ? (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="-ml-2 h-auto px-2 font-medium text-muted-foreground hover:text-foreground"
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
					{dataTable.getRowModel().rows.map((row) => (
						<TableRow key={row.id}>
							{row.getAllCells().map((cell) => (
								<TableCell key={cell.id}>
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
