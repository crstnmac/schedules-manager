import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@SchedulesManager/ui/components/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import type { RowData } from "@tanstack/react-table";
import {
	EllipsisIcon,
	PencilIcon,
	PlusIcon,
	SearchIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import {
	createDataColumnHelper,
	DataTable,
	type DataTableColumn,
} from "@/components/data-table";
import { SettingsSection } from "@/components/settings/page";

export { FormSheet as SettingsFormSheet } from "@/components/form-sheet";

export type SettingsCrudRowActions<TData> = {
	onEdit?: (row: TData) => void;
	onDelete?: (row: TData) => void;
	deleteTitle: string;
	deleteDescription: string | ((row: TData) => string);
	deleteDisabled?: boolean;
};

/**
 * Settings list card: header with count and add action, optional toolbar and
 * search, sortable table, and per-row edit/delete menu with a confirm dialog.
 */
export function SettingsCrudCard<TData extends RowData>({
	title,
	description,
	count,
	data,
	columns,
	getRowId,
	getSearchText,
	searchPlaceholder = "Search…",
	toolbar,
	isLoading = false,
	entityLabel,
	emptyIcon,
	emptyTitle,
	emptyDescription,
	headerAction,
	addLabel,
	onAdd,
	rowActions,
}: {
	title: string;
	description?: string;
	count: number;
	data: TData[];
	columns: DataTableColumn<TData>[];
	getRowId: (row: TData, index: number) => string;
	getSearchText?: (row: TData) => string;
	searchPlaceholder?: string;
	toolbar?: ReactNode;
	isLoading?: boolean;
	entityLabel: string;
	emptyIcon?: ReactNode;
	emptyTitle: string;
	emptyDescription: string;
	headerAction?: ReactNode;
	addLabel: string;
	onAdd?: () => void;
	rowActions?: SettingsCrudRowActions<TData>;
}) {
	const [search, setSearch] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<TData | null>(null);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!getSearchText || !term) return data;
		return data.filter((row) =>
			getSearchText(row).toLowerCase().includes(term),
		);
	}, [data, getSearchText, search]);

	const isFiltering = Boolean(getSearchText && search.trim());

	const helper = useMemo(() => createDataColumnHelper<TData>(), []);

	const tableColumns = useMemo<DataTableColumn<TData>[]>(() => {
		if (!rowActions || (!rowActions.onEdit && !rowActions.onDelete)) {
			return columns;
		}
		return [
			...columns,
			helper.display({
				id: "actions",
				header: () => <span className="block text-right">Actions</span>,
				enableSorting: false,
				cell: ({ row }) => (
					<div className="flex justify-end">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={<Button variant="ghost" size="icon-sm" />}
							>
								<EllipsisIcon />
								<span className="sr-only">Actions for this {entityLabel}</span>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{rowActions.onEdit ? (
									<DropdownMenuItem
										onClick={() => rowActions.onEdit?.(row.original)}
									>
										<PencilIcon />
										Edit
									</DropdownMenuItem>
								) : null}
								{rowActions.onDelete ? (
									<>
										{rowActions.onEdit ? <DropdownMenuSeparator /> : null}
										<DropdownMenuItem
											variant="destructive"
											onClick={() => setDeleteTarget(row.original)}
										>
											<Trash2Icon />
											Delete
										</DropdownMenuItem>
									</>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				),
			}),
		];
	}, [columns, entityLabel, helper, rowActions]);

	const emptyNode = isFiltering ? (
		<Empty className="border border-dashed">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SearchIcon />
				</EmptyMedia>
				<EmptyTitle>No matches</EmptyTitle>
				<EmptyDescription>
					Nothing matches “{search.trim()}”. Try a different search.
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button variant="outline" size="sm" onClick={() => setSearch("")}>
					Clear search
				</Button>
			</EmptyContent>
		</Empty>
	) : (
		<Empty className="border border-dashed">
			<EmptyHeader>
				{emptyIcon ? <EmptyMedia variant="icon">{emptyIcon}</EmptyMedia> : null}
				<EmptyTitle>{emptyTitle}</EmptyTitle>
				<EmptyDescription>{emptyDescription}</EmptyDescription>
			</EmptyHeader>
			{onAdd ? (
				<EmptyContent>
					<Button size="sm" onClick={onAdd}>
						<PlusIcon data-icon="inline-start" />
						{addLabel}
					</Button>
				</EmptyContent>
			) : null}
		</Empty>
	);

	return (
		<>
			<SettingsSection
				title={title}
				description={description}
				count={count}
				action={
					headerAction || onAdd ? (
						<div className="flex items-center gap-2">
							{headerAction}
							{onAdd ? (
								<Button size="sm" onClick={onAdd}>
									<PlusIcon data-icon="inline-start" />
									{addLabel}
								</Button>
							) : null}
						</div>
					) : undefined
				}
			>
				{isLoading ? (
					<div className="grid gap-2">
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{toolbar}
						{getSearchText && data.length > 0 ? (
							<InputGroup className="max-w-xs">
								<InputGroupAddon>
									<SearchIcon />
								</InputGroupAddon>
								<InputGroupInput
									type="search"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder={searchPlaceholder}
									aria-label={searchPlaceholder}
								/>
								{search ? (
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											size="icon-xs"
											onClick={() => setSearch("")}
											aria-label="Clear search"
										>
											<XIcon />
										</InputGroupButton>
									</InputGroupAddon>
								) : null}
							</InputGroup>
						) : null}
						<DataTable
							bounded
							columns={tableColumns}
							data={filtered}
							getRowId={getRowId}
							empty={emptyNode}
						/>
					</div>
				)}
			</SettingsSection>

			{rowActions?.onDelete ? (
				<AlertDialog
					open={deleteTarget !== null}
					onOpenChange={(open) => {
						if (!open) setDeleteTarget(null);
					}}
				>
					<AlertDialogContent size="sm">
						<AlertDialogHeader>
							<AlertDialogTitle>{rowActions.deleteTitle}</AlertDialogTitle>
							<AlertDialogDescription>
								{deleteTarget
									? typeof rowActions.deleteDescription === "function"
										? rowActions.deleteDescription(deleteTarget)
										: rowActions.deleteDescription
									: null}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								disabled={rowActions.deleteDisabled}
								onClick={() => {
									if (deleteTarget) rowActions.onDelete?.(deleteTarget);
									setDeleteTarget(null);
								}}
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			) : null}
		</>
	);
}
