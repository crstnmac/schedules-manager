import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
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
import { type ReactNode, useMemo } from "react";

import type { ListView } from "@/components/list-view";

import {
	QueryFeedback,
	type QueryFeedbackState,
} from "@/components/query-feedback";

const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns,
});

export type DataTableColumn<TData extends RowData> = ColumnDef<
	typeof features,
	TData,
	unknown
>;

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
	stickyHeader = false,
	list,
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
	/**
	 * Makes the table body the scroll region and pins the column headings, so
	 * the surrounding card header and toolbar stay visible while rows scroll.
	 */
	stickyHeader?: boolean;
	/**
	 * Connects the table to a list view: adds the selection checkbox column
	 * when the list is selectable, and sorts by the list's sort orders (across
	 * every page) when a column id matches one.
	 */
	list?: ListView<TData>;
}) {
	const selection = list?.selection ?? null;
	const tableColumns = useMemo(() => {
		if (!selection) return columns;
		const helper = createColumnHelper<typeof features, TData>();
		const selectable = data.filter((row) => selection.canSelect(row));
		const selectedOnPage = selectable.filter((row) =>
			selection.isSelected(row),
		);
		const select = helper.display({
			id: "select",
			enableSorting: false,
			header: () =>
				selectable.length > 0 ? (
					<Checkbox
						aria-label="Select all on this page"
						checked={selectedOnPage.length === selectable.length}
						indeterminate={
							selectedOnPage.length > 0 &&
							selectedOnPage.length < selectable.length
						}
						onCheckedChange={(checked) =>
							selection.setSelected(selectable, checked === true)
						}
					/>
				) : null,
			cell: ({ row }) =>
				selection.canSelect(row.original) ? (
					<Checkbox
						aria-label="Select row"
						checked={selection.isSelected(row.original)}
						onCheckedChange={(checked) =>
							selection.setSelected([row.original], checked === true)
						}
					/>
				) : null,
		});
		return [select, ...columns] as typeof columns;
	}, [columns, data, selection]);
	const listSorts = list && list.sorts.length > 0 ? list : null;
	const dataTable = useTable({
		features,
		columns: tableColumns,
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
		<ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:hidden">
			{dataTable.getRowModel().rows.map((row) => {
				const detailCells = row
					.getAllCells()
					.filter(
						(cell) =>
							cell.column.id !== "actions" && cell.column.id !== "select",
					);
				const selectCell = row
					.getAllCells()
					.find((cell) => cell.column.id === "select");
				const actionCells = row
					.getAllCells()
					.filter((cell) => cell.column.id === "actions");
				return (
					<li
						key={row.id}
						className={cn(
							"flex flex-col gap-3 rounded-xl border bg-card p-3",
							selection?.isSelected(row.original) &&
								"border-primary/50 bg-muted",
						)}
					>
						{selectCell && selection?.canSelect(row.original) ? (
							<div className="flex">
								{flexRender(
									selectCell.column.columnDef.cell,
									selectCell.getContext(),
								)}
							</div>
						) : null}
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
				stickyHeader &&
					"overflow-y-auto overscroll-contain [&_[data-slot=table-container]]:overflow-visible [&_[data-slot=table-header]]:sticky [&_[data-slot=table-header]]:top-0 [&_[data-slot=table-header]]:z-10 [&_[data-slot=table-header]]:bg-card",
			)}
		>
			<Table>
				<TableHeader>
					{dataTable.getHeaderGroups().map((headerGroup) => (
						<TableRow
							key={headerGroup.id}
							className="[@media(hover:hover)]:hover:bg-transparent"
						>
							{headerGroup.headers.map((header) => {
								const listSort = listSorts?.sorts.some(
									(sort) => sort.id === header.column.id,
								);
								const canSort = listSorts
									? Boolean(listSort)
									: header.column.getCanSort();
								const sorted = listSorts
									? listSorts.sort?.id === header.column.id &&
										listSorts.sort.direction
									: header.column.getIsSorted();
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
												className="-ml-2 h-auto px-2 font-medium text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
												onClick={
													listSorts
														? () => listSorts.toggleSort(header.column.id)
														: header.column.getToggleSortingHandler()
												}
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
						<TableRow
							key={row.id}
							data-state={
								selection?.isSelected(row.original) ? "selected" : undefined
							}
						>
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
				<div className="hidden min-h-0 flex-1 flex-col md:flex">
					{tableNode}
				</div>
			) : (
				tableNode
			)}
			{cards}
		</div>
	);
}
