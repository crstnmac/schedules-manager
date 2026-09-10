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

import {
	QueryFeedback,
	type QueryFeedbackState,
} from "@/components/query-feedback";

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
	query,
	stacked = false,
}: {
	columns: Array<ColumnDef<typeof features, TData, unknown>>;
	data: TData[];
	getRowId?: (originalRow: TData, index: number) => string;
	empty?: ReactNode;
	className?: string;
	bounded?: boolean;
	fill?: boolean;
	query?: QueryFeedbackState;
	/**
	 * Renders a stacked card list below the `md` breakpoint so rows stay
	 * readable and tappable on phones, while the table is shown from `md` up.
	 */
	stacked?: boolean;
}) {
	const dataTable = useTable({
		features,
		columns,
		data,
		getRowId,
	});

	if (query && (query.isLoading || query.isError))
		return <QueryFeedback query={query} />;

	if (data.length === 0) {
		return empty ? (
			<div className={cn(fill && "flex min-h-0 flex-1 flex-col", "p-6")}>
				{empty}
			</div>
		) : null;
	}

	const cards = stacked ? (
		<ul className="flex min-h-0 flex-1 flex-col gap-3 md:hidden">
			{dataTable.getRowModel().rows.map((row) => {
				const detailCells = row
					.getAllCells()
					.filter((cell) => cell.column.id !== "actions");
				const actionCells = row
					.getAllCells()
					.filter((cell) => cell.column.id === "actions");
				return (
					<li
						key={row.id}
						className="flex flex-col gap-3 rounded-xl border bg-card p-3"
					>
						<div className="grid gap-1.5">
							{detailCells.map((cell) => {
								const header = cell.column.columnDef.header;
								const label = typeof header === "string" ? header : "";
								return (
									<div
										key={cell.id}
										className="flex items-baseline justify-between gap-3"
									>
										{label ? (
											<span className="shrink-0 text-muted-foreground text-xs">
												{label}
											</span>
										) : null}
										<span className={cn(label ? "text-right" : "")}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</span>
									</div>
								);
							})}
						</div>
						{actionCells.length > 0 ? (
							<div className="border-t pt-2">
								{actionCells.map((cell) => (
									<div key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</div>
								))}
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	) : null;

	const tableNode = (
		<div
			className={cn(
				"schedule-grid-scroll min-h-0 print:max-h-none print:overflow-visible",
				fill && "flex-1",
				bounded && "max-h-[min(28rem,calc(100dvh-12rem))]",
			)}
		>
			<Table>
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

	return (
		<div
			className={cn(
				"flex min-h-0 flex-col",
				fill && "flex-1",
				bounded && "max-h-[min(28rem,calc(100dvh-12rem))]",
				className,
			)}
		>
			{stacked ? (
				<div className="hidden md:block md:min-h-0 md:flex-1">{tableNode}</div>
			) : (
				tableNode
			)}
			{cards}
		</div>
	);
}
