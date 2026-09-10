import { Button } from "@SchedulesManager/ui/components/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

/** Client-side pagination state plus the current page of rows. */
export interface TablePaginationState<T> {
	page: number;
	pageCount: number;
	pageSize: number;
	total: number;
	rangeStart: number;
	rangeEnd: number;
	pageRows: T[];
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
}

/**
 * Paginates an already-filtered list in memory. Pass everything that should
 * reset the page (search, filters, date) via `resetKey`.
 */
export function useTablePagination<T>(
	rows: T[],
	{
		pageSize: initialPageSize = 10,
		resetKey,
	}: { pageSize?: number; resetKey?: unknown } = {},
): TablePaginationState<T> {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSizeState] = useState(initialPageSize);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resetKey is the trigger
	useEffect(() => {
		setPage(1);
	}, [resetKey]);

	const total = rows.length;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const currentPage = Math.min(page, pageCount);
	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, total);

	return {
		page: currentPage,
		pageCount,
		pageSize,
		total,
		rangeStart: total === 0 ? 0 : startIndex + 1,
		rangeEnd: endIndex,
		pageRows: rows.slice(startIndex, endIndex),
		setPage,
		setPageSize: (size: number) => {
			setPageSizeState(size);
			setPage(1);
		},
	};
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export function TablePagination({
	page,
	pageCount,
	pageSize,
	total,
	rangeStart,
	rangeEnd,
	setPage,
	setPageSize,
}: Omit<TablePaginationState<unknown>, "pageRows">) {
	return (
		<div className="flex items-center gap-2">
			<p className="hidden text-muted-foreground text-xs tabular-nums sm:block">
				{total === 0 ? "0 results" : `${rangeStart}–${rangeEnd} of ${total}`}
			</p>
			<Select
				items={PAGE_SIZE_OPTIONS.map((size) => ({
					label: `${size} / page`,
					value: String(size),
				}))}
				value={String(pageSize)}
				onValueChange={(value) => value && setPageSize(Number(value))}
			>
				<SelectTrigger
					className="h-7 w-[104px] text-xs"
					aria-label="Rows per page"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{PAGE_SIZE_OPTIONS.map((size) => (
							<SelectItem key={size} value={String(size)}>
								{size} / page
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					disabled={page <= 1}
					onClick={() => setPage(page - 1)}
					aria-label="Previous page"
				>
					<ChevronLeftIcon />
				</Button>
				<span className="text-muted-foreground text-xs tabular-nums">
					{page} / {Math.max(pageCount, 1)}
				</span>
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					disabled={page >= pageCount}
					onClick={() => setPage(page + 1)}
					aria-label="Next page"
				>
					<ChevronRightIcon />
				</Button>
			</div>
		</div>
	);
}

/**
 * The action bar that sits directly above a table. Filters and search go on the
 * left, actions and pagination on the right, so controls stay in one place.
 */
export function TableToolbar({
	left,
	right,
	className,
}: {
	left?: ReactNode;
	right?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex shrink-0 flex-wrap items-center gap-2 border-b bg-card/40 px-4 py-2",
				className,
			)}
		>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
				{left}
			</div>
			{right ? (
				<div className="flex flex-wrap items-center gap-2">{right}</div>
			) : null}
		</div>
	);
}

export function TableSearch({
	value,
	onValueChange,
	placeholder = "Search…",
	className,
}: {
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}) {
	return (
		<InputGroup className={cn("h-7 w-full max-w-xs", className)}>
			<InputGroupAddon>
				<SearchIcon />
			</InputGroupAddon>
			<InputGroupInput
				type="search"
				value={value}
				onChange={(event) => onValueChange(event.target.value)}
				placeholder={placeholder}
				aria-label={placeholder}
			/>
			{value ? (
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						size="icon-xs"
						onClick={() => onValueChange("")}
						aria-label="Clear search"
					>
						<XIcon />
					</InputGroupButton>
				</InputGroupAddon>
			) : null}
		</InputGroup>
	);
}

export function TableFilter({
	value,
	onValueChange,
	items,
	ariaLabel,
	className,
}: {
	value: string;
	onValueChange: (value: string) => void;
	items: { label: string; value: string }[];
	ariaLabel: string;
	className?: string;
}) {
	return (
		<Select
			items={items}
			value={value}
			onValueChange={(next) => next && onValueChange(next)}
		>
			<SelectTrigger
				className={cn("h-7 w-auto min-w-[150px] text-xs", className)}
				aria-label={ariaLabel}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
