import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@SchedulesManager/ui/components/dropdown-menu";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	ArrowDownWideNarrowIcon,
	ArrowUpNarrowWideIcon,
	ListFilterIcon,
	XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
	TablePagination,
	type TablePaginationState,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";

/** A facet a list can be narrowed by; rows match any of its chosen values. */
export interface ListFilter<T> {
	id: string;
	label: string;
	options: { value: string; label: string }[];
	/** The row's value(s) for this facet. */
	value: (row: T) => string | readonly string[] | null | undefined;
}

/** A sort order, keyed by the table column it sorts when one exists. */
export interface ListSort<T> {
	id: string;
	label: string;
	compare: (a: T, b: T) => number;
}

export type SortDirection = "asc" | "desc";

export interface ListSortState {
	id: string;
	direction: SortDirection;
}

/** Row selection for bulk actions; only `selectable` rows can be chosen. */
export interface ListSelection<T> {
	count: number;
	selectedRows: T[];
	/** Selectable rows across every page of the current filter. */
	selectableCount: number;
	isSelected: (row: T) => boolean;
	canSelect: (row: T) => boolean;
	setSelected: (rows: T[], selected: boolean) => void;
	selectAllMatching: () => void;
	clear: () => void;
}

export interface ListView<T> {
	/** Filtered and sorted rows across all pages. */
	rows: T[];
	total: number;
	/** Whether the list has searchable text (search is hidden otherwise). */
	searchable: boolean;
	search: string;
	setSearch: (value: string) => void;
	filters: ListFilter<T>[];
	filterValues: Readonly<Record<string, readonly string[]>>;
	setFilterValues: (id: string, values: readonly string[]) => void;
	sorts: ListSort<T>[];
	sort: ListSortState | null;
	setSort: (sort: ListSortState | null) => void;
	/** Header click: ascending, then descending, then back to the default. */
	toggleSort: (id: string) => void;
	isFiltered: boolean;
	clearAll: () => void;
	pagination: TablePaginationState<T>;
	selection: ListSelection<T> | null;
}

/**
 * Filters and sorts rows the way a list view does: a row must match the
 * search term and, for each active filter, any of its chosen values.
 */
export function applyListView<T>(
	rows: T[],
	{
		search,
		searchText,
		filters,
		filterValues,
		sort,
		sorts,
	}: {
		search: string;
		searchText?: (row: T) => (string | null | undefined)[];
		filters: ListFilter<T>[];
		filterValues: Readonly<Record<string, readonly string[]>>;
		sort: ListSortState | null;
		sorts: ListSort<T>[];
	},
): T[] {
	const term = search.trim().toLowerCase();
	const active = filters.filter(
		(filter) => (filterValues[filter.id] ?? []).length > 0,
	);
	const matches = rows.filter((row) => {
		for (const filter of active) {
			const wanted = filterValues[filter.id] ?? [];
			const raw = filter.value(row);
			const values = raw == null ? [] : typeof raw === "string" ? [raw] : raw;
			if (!values.some((value) => wanted.includes(value))) return false;
		}
		if (!term || !searchText) return true;
		return searchText(row).some((text) => text?.toLowerCase().includes(term));
	});
	const order = sort && sorts.find((candidate) => candidate.id === sort.id);
	if (!order) return matches;
	const sign = sort?.direction === "desc" ? -1 : 1;
	return [...matches].sort((a, b) => sign * order.compare(a, b));
}

/**
 * Search, faceted filters, sorting, pagination, and bulk selection for a
 * client-side list, so every list page behaves the same way. Sorting and
 * filtering run over all rows before pagination.
 */
export function useListView<T>({
	rows,
	getRowId,
	search: searchText,
	filters = [],
	sorts = [],
	defaultSort = null,
	initialFilters = {},
	selectable,
	pageSize,
	resetKey,
}: {
	rows: T[];
	getRowId: (row: T) => string;
	/** Text a search term is matched against; omit to hide search. */
	search?: (row: T) => (string | null | undefined)[];
	filters?: ListFilter<T>[];
	sorts?: ListSort<T>[];
	defaultSort?: ListSortState | null;
	initialFilters?: Record<string, readonly string[]>;
	/** Enables bulk selection for rows this returns true for. */
	selectable?: (row: T) => boolean;
	pageSize?: number;
	/** Anything else that should send the list back to page one. */
	resetKey?: unknown;
}): ListView<T> {
	const [search, setSearch] = useState("");
	const [filterValues, setFilterValuesState] =
		useState<Record<string, readonly string[]>>(initialFilters);
	const [sort, setSort] = useState<ListSortState | null>(defaultSort);
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);

	const filtered = useMemo(
		() =>
			applyListView(rows, {
				search,
				searchText,
				filters,
				filterValues,
				sort,
				sorts,
			}),
		[rows, search, searchText, filters, filterValues, sort, sorts],
	);

	const pagination = useTablePagination(filtered, {
		pageSize,
		resetKey: JSON.stringify([search, filterValues, sort, resetKey ?? null]),
	});

	// Drop selections that left the data (decided, deleted, or no longer
	// selectable) so bulk actions never act on stale rows.
	const selectableRows = useMemo(
		() => (selectable ? rows.filter(selectable) : []),
		[rows, selectable],
	);
	const selectedRows = useMemo(
		() => selectableRows.filter((row) => selectedIds.has(getRowId(row))),
		[selectableRows, selectedIds, getRowId],
	);
	useEffect(() => {
		if (selectedRows.length !== selectedIds.size) {
			setSelectedIds(new Set(selectedRows.map(getRowId)));
		}
	}, [selectedRows, selectedIds, getRowId]);

	const filteredSelectable = selectable ? filtered.filter(selectable) : [];
	const selection: ListSelection<T> | null = selectable
		? {
				count: selectedRows.length,
				selectedRows,
				selectableCount: filteredSelectable.length,
				isSelected: (row) => selectedIds.has(getRowId(row)),
				canSelect: selectable,
				setSelected: (targets, selected) =>
					setSelectedIds((current) => {
						const next = new Set(current);
						for (const row of targets) {
							if (!selectable(row)) continue;
							if (selected) next.add(getRowId(row));
							else next.delete(getRowId(row));
						}
						return next;
					}),
				selectAllMatching: () =>
					setSelectedIds(new Set(filteredSelectable.map(getRowId))),
				clear: () => setSelectedIds(new Set()),
			}
		: null;

	const isFiltered =
		search.trim() !== "" ||
		Object.values(filterValues).some((values) => values.length > 0);

	return {
		rows: filtered,
		total: rows.length,
		searchable: Boolean(searchText),
		search,
		setSearch,
		filters,
		filterValues,
		setFilterValues: (id, values) =>
			setFilterValuesState((current) => ({ ...current, [id]: values })),
		sorts,
		sort,
		setSort,
		toggleSort: (id) =>
			setSort((current) => {
				if (current?.id !== id) return { id, direction: "asc" };
				if (current.direction === "asc") return { id, direction: "desc" };
				return defaultSort;
			}),
		isFiltered,
		clearAll: () => {
			setSearch("");
			setFilterValuesState({});
		},
		pagination,
		selection,
	};
}

function FilterOptions<T>({
	list,
	filter,
}: {
	list: ListView<T>;
	filter: ListFilter<T>;
}) {
	const chosen = list.filterValues[filter.id] ?? [];
	return filter.options.map((option) => (
		<DropdownMenuCheckboxItem
			key={option.value}
			checked={chosen.includes(option.value)}
			onCheckedChange={(checked) =>
				list.setFilterValues(
					filter.id,
					checked
						? [...chosen, option.value]
						: chosen.filter((value) => value !== option.value),
				)
			}
		>
			{option.label}
		</DropdownMenuCheckboxItem>
	));
}

/**
 * Search, a Filter menu of faceted checkboxes, removable chips for each
 * active value, and a Sort menu.
 */
export function ListFilterBar<T>({
	list,
	searchPlaceholder = "Search…",
	leading,
	children,
}: {
	list: ListView<T>;
	searchPlaceholder?: string;
	/** Controls that scope the list, shown before search (a date, a week). */
	leading?: ReactNode;
	/** Extra controls that belong with the filters, such as a date picker. */
	children?: ReactNode;
}) {
	const activeCount = Object.values(list.filterValues).reduce(
		(sum, values) => sum + values.length,
		0,
	);
	const chips = list.filters.flatMap((filter) =>
		(list.filterValues[filter.id] ?? []).map((value) => ({
			filter,
			value,
			label:
				filter.options.find((option) => option.value === value)?.label ?? value,
		})),
	);
	const currentSort = list.sort
		? list.sorts.find((sort) => sort.id === list.sort?.id)
		: undefined;

	return (
		<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
			{leading}
			{list.searchable ? (
				<TableSearch
					value={list.search}
					onValueChange={list.setSearch}
					placeholder={searchPlaceholder}
				/>
			) : null}
			{children}
			{list.filters.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button type="button" variant="outline" size="sm">
								<ListFilterIcon data-icon="inline-start" />
								Filter
								{activeCount > 0 ? (
									<Badge variant="secondary" className="ml-0.5 tabular-nums">
										{activeCount}
									</Badge>
								) : null}
							</Button>
						}
					/>
					<DropdownMenuContent align="start" className="min-w-48">
						{list.filters.length === 1 && list.filters[0] ? (
							<DropdownMenuGroup>
								<DropdownMenuLabel>{list.filters[0].label}</DropdownMenuLabel>
								<FilterOptions list={list} filter={list.filters[0]} />
							</DropdownMenuGroup>
						) : (
							list.filters.map((filter) => (
								<DropdownMenuSub key={filter.id}>
									<DropdownMenuSubTrigger>
										{filter.label}
										{(list.filterValues[filter.id] ?? []).length > 0 ? (
											<span className="ml-auto text-muted-foreground text-xs tabular-nums">
												{(list.filterValues[filter.id] ?? []).length}
											</span>
										) : null}
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent className="min-w-44">
										<DropdownMenuGroup>
											<FilterOptions list={list} filter={filter} />
										</DropdownMenuGroup>
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							))
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{list.sorts.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button type="button" variant="outline" size="sm">
								{list.sort?.direction === "desc" ? (
									<ArrowDownWideNarrowIcon data-icon="inline-start" />
								) : (
									<ArrowUpNarrowWideIcon data-icon="inline-start" />
								)}
								{currentSort ? currentSort.label : "Sort"}
							</Button>
						}
					/>
					<DropdownMenuContent align="start" className="min-w-44">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Sort by</DropdownMenuLabel>
							<DropdownMenuRadioGroup
								value={list.sort?.id ?? ""}
								onValueChange={(id) =>
									list.setSort({
										id: String(id),
										direction: list.sort?.direction ?? "asc",
									})
								}
							>
								{list.sorts.map((sort) => (
									<DropdownMenuRadioItem key={sort.id} value={sort.id}>
										{sort.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuGroup>
						{list.sort ? (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuRadioGroup
										value={list.sort.direction}
										onValueChange={(direction) =>
											list.sort &&
											list.setSort({
												id: list.sort.id,
												direction: direction as SortDirection,
											})
										}
									>
										<DropdownMenuRadioItem value="asc">
											Ascending
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="desc">
											Descending
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuGroup>
							</>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			{chips.map((chip) => (
				<Badge
					key={`${chip.filter.id}:${chip.value}`}
					variant="secondary"
					className="h-7 gap-1 pr-1 pl-2.5"
				>
					<span className="text-muted-foreground">{chip.filter.label}:</span>
					{chip.label}
					<button
						type="button"
						className="rounded-full p-0.5 hover:bg-foreground/10"
						aria-label={`Remove ${chip.filter.label} ${chip.label} filter`}
						onClick={() =>
							list.setFilterValues(
								chip.filter.id,
								(list.filterValues[chip.filter.id] ?? []).filter(
									(value) => value !== chip.value,
								),
							)
						}
					>
						<XIcon className="size-3" />
					</button>
				</Badge>
			))}
			{list.isFiltered ? (
				<Button type="button" variant="ghost" size="sm" onClick={list.clearAll}>
					Clear all
				</Button>
			) : null}
		</div>
	);
}

/**
 * Replaces the filters while rows are selected: the count, an offer to extend
 * the selection to every matching row, the page's bulk actions, and Clear.
 */
export function BulkActionBar<T>({
	selection,
	noun = { one: "row", many: "rows" },
	children,
	className,
}: {
	selection: ListSelection<T>;
	noun?: { one: string; many: string };
	children?: ReactNode;
	className?: string;
}) {
	const label = (count: number) =>
		`${count} ${count === 1 ? noun.one : noun.many}`;
	return (
		<div
			className={cn(
				"flex min-w-0 flex-1 flex-wrap items-center gap-2",
				className,
			)}
			role="toolbar"
			aria-label="Bulk actions"
		>
			<span className="font-medium text-sm tabular-nums">
				{label(selection.count)} selected
			</span>
			{selection.count < selection.selectableCount ? (
				<Button
					type="button"
					variant="link"
					size="sm"
					className="px-1"
					onClick={selection.selectAllMatching}
				>
					Select all {label(selection.selectableCount)}
				</Button>
			) : null}
			<div className="flex flex-wrap items-center gap-2">{children}</div>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="ml-auto"
				onClick={selection.clear}
			>
				Clear selection
			</Button>
		</div>
	);
}

/**
 * The standard list toolbar: filters on the left (swapped for bulk actions
 * while rows are selected), pagination and page actions on the right.
 */
export function ListToolbar<T>({
	list,
	searchPlaceholder,
	leading,
	filters,
	bulkActions,
	noun,
	actions,
	pagination = true,
	embedded,
}: {
	list: ListView<T>;
	searchPlaceholder?: string;
	/** Controls that scope the list, shown before search. */
	leading?: ReactNode;
	/** Extra filter controls shown next to search. */
	filters?: ReactNode;
	/** Actions for the selected rows. */
	bulkActions?: (selected: T[]) => ReactNode;
	noun?: { one: string; many: string };
	/** Page actions shown before pagination. */
	actions?: ReactNode;
	pagination?: boolean;
	embedded?: boolean;
}) {
	const bulk = list.selection && list.selection.count > 0;
	return (
		<TableToolbar
			embedded={embedded}
			left={
				bulk && list.selection ? (
					<BulkActionBar selection={list.selection} noun={noun}>
						{bulkActions?.(list.selection.selectedRows)}
					</BulkActionBar>
				) : (
					<ListFilterBar
						list={list}
						searchPlaceholder={searchPlaceholder}
						leading={leading}
					>
						{filters}
					</ListFilterBar>
				)
			}
			right={
				actions || pagination ? (
					<>
						{actions}
						{pagination ? <TablePagination {...list.pagination} /> : null}
					</>
				) : undefined
			}
		/>
	);
}
