import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { usePostHog } from "@posthog/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { api } from "@/lib/api";
import { useTimesheets } from "@/lib/queries";
import { formatClockTime, formatDay, formatDurationMs } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/timesheets")({
	component: TimesheetsPage,
});

function formatClockWindow(inIso: string, outIso: string | null) {
	if (!outIso) {
		return `On the clock since ${formatDay(inIso)} · ${formatClockTime(inIso)}`;
	}
	const sameDay =
		new Date(inIso).toDateString() === new Date(outIso).toDateString();
	return sameDay
		? `${formatDay(inIso)} · ${formatClockTime(inIso)} – ${formatClockTime(outIso)}`
		: `${formatDay(inIso)} ${formatClockTime(inIso)} → ${formatDay(outIso)} ${formatClockTime(outIso)}`;
}

type TimesheetRow = {
	id: string;
	worker: string;
	clockedInAt: string;
	clockedOutAt: string | null;
	autoClosedAt: string | null;
	approvalStatus: string;
};

const columnHelper = createDataColumnHelper<TimesheetRow>();

const STATUS_FILTERS = [
	{ label: "All statuses", value: "all" },
	{ label: "Pending", value: "pending" },
	{ label: "Approved", value: "approved" },
	{ label: "Declined", value: "declined" },
];

function TimesheetsPage() {
	const { workplace } = useWorkplace();
	const sheets = useTimesheets(workplace?.id);
	const posthog = usePostHog();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const decide = useMutation({
		mutationFn: (input: {
			timeEntryId: string;
			decision: "approved" | "declined";
		}) =>
			api(
				`/v1/workplaces/${workplace?.id}/time-entries/${input.timeEntryId}/approval`,
				{ method: "POST", body: { decision: input.decision } },
			),
		onSuccess: (_, input) => {
			queryClient.invalidateQueries({ queryKey: ["timesheets"] });
			if (input.decision === "approved") {
				posthog?.capture("timesheet_approved");
			}
			toast.success("Timesheet Approval saved");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const approveBatch = useMutation({
		mutationFn: async (ids: string[]) => {
			let failed = 0;
			for (const id of ids) {
				try {
					await api(
						`/v1/workplaces/${workplace?.id}/time-entries/${id}/approval`,
						{ method: "POST", body: { decision: "approved" } },
					);
				} catch {
					failed += 1;
				}
			}
			return { failed, total: ids.length };
		},
		onSuccess: ({ failed, total }) => {
			queryClient.invalidateQueries({ queryKey: ["timesheets"] });
			setSelectedIds(new Set());
			if (failed > 0) {
				toast.error(`${failed} of ${total} entries couldn't be approved.`);
			} else {
				posthog?.capture("timesheet_approved");
				toast.success(`Approved ${total} time entries.`);
			}
		},
	});

	const rows = sheets.data?.timesheets ?? [];
	const eligibleRows = rows.filter(
		(row) => row.approvalStatus === "pending" && row.clockedOutAt,
	);
	const selectedRows = eligibleRows.filter((row) => selectedIds.has(row.id));
	const filteredRows = useMemo(() => {
		const term = search.trim().toLowerCase();
		return rows.filter((row) => {
			if (statusFilter !== "all" && row.approvalStatus !== statusFilter) {
				return false;
			}
			if (!term) return true;
			return row.worker.toLowerCase().includes(term);
		});
	}, [rows, search, statusFilter]);
	const pagination = useTablePagination(filteredRows, {
		resetKey: `${search}|${statusFilter}`,
	});
	const columns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.display({
					id: "select",
					enableSorting: false,
					header: () => (
						<Checkbox
							aria-label="Select all pending entries"
							checked={
								eligibleRows.length > 0 &&
								eligibleRows.every((row) => selectedIds.has(row.id))
							}
							onCheckedChange={(checked) => {
								setSelectedIds(
									checked === true
										? new Set(eligibleRows.map((row) => row.id))
										: new Set(),
								);
							}}
						/>
					),
					cell: ({ row }) => {
						const entry = row.original;
						const selectable =
							entry.approvalStatus === "pending" && entry.clockedOutAt;
						if (!selectable) return null;
						return (
							<Checkbox
								aria-label={`Select entry for ${entry.worker}`}
								checked={selectedIds.has(entry.id)}
								onCheckedChange={(checked) => {
									setSelectedIds((current) => {
										const next = new Set(current);
										if (checked === true) {
											next.add(entry.id);
										} else {
											next.delete(entry.id);
										}
										return next;
									});
								}}
							/>
						);
					},
				}),
				columnHelper.accessor("worker", {
					header: "Worker",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				columnHelper.accessor(
					(row) => formatClockWindow(row.clockedInAt, row.clockedOutAt),
					{
						id: "window",
						header: "Clock window",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground tabular-nums">
								{getValue()}
							</span>
						),
					},
				),
				columnHelper.accessor(
					(row) =>
						row.clockedOutAt
							? new Date(row.clockedOutAt).getTime() -
								new Date(row.clockedInAt).getTime()
							: Number.POSITIVE_INFINITY,
					{
						id: "hours",
						header: "Hours",
						cell: ({ getValue }) => {
							const ms = getValue();
							return (
								<span className="tabular-nums">
									{Number.isFinite(ms) ? formatDurationMs(ms) : "On the clock"}
								</span>
							);
						},
					},
				),
				columnHelper.display({
					id: "status",
					header: "Status",
					cell: ({ row }) => {
						const entry = row.original;
						return (
							<div className="flex flex-wrap items-center gap-1.5">
								<Badge variant="secondary">{entry.approvalStatus}</Badge>
								{entry.autoClosedAt ? (
									<Badge variant="outline">Auto closed</Badge>
								) : null}
							</div>
						);
					},
				}),
				columnHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const entry = row.original;
						if (entry.approvalStatus !== "pending" || !entry.clockedOutAt) {
							return null;
						}
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									size="sm"
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate({
											timeEntryId: entry.id,
											decision: "approved",
										})
									}
								>
									Approve
								</Button>
								<ConfirmAction
									trigger="Decline"
									disabled={decide.isPending}
									title="Decline this time entry?"
									description={`Declining rejects the recorded hours for ${formatClockWindow(entry.clockedInAt, entry.clockedOutAt)}. The worker may need to record it again.`}
									confirmLabel="Decline entry"
									destructive
									onConfirm={() =>
										decide.mutate({
											timeEntryId: entry.id,
											decision: "declined",
										})
									}
								/>
							</div>
						);
					},
				}),
			]),
		[decide, eligibleRows, selectedIds],
	);

	return (
		<AppPage>
			<AppPageHeader
				title="Timesheet approval"
				description="Accept or decline completed time entries."
				actions={
					selectedRows.length > 0 ? (
						<ConfirmAction
							trigger={`Approve selected (${selectedRows.length})`}
							triggerVariant="default"
							title={`Approve ${selectedRows.length} time entries?`}
							description={`Approves the recorded hours for ${selectedRows.length} ${selectedRows.length === 1 ? "entry" : "entries"}. Approved hours count toward the timesheet.`}
							confirmLabel="Approve all"
							disabled={approveBatch.isPending}
							onConfirm={() =>
								approveBatch.mutate(selectedRows.map((row) => row.id))
							}
						/>
					) : null
				}
			/>
			<AppPageBody scroll={false}>
				<TableToolbar
					left={
						<>
							<TableSearch
								value={search}
								onValueChange={setSearch}
								placeholder="Search worker"
							/>
							<TableFilter
								value={statusFilter}
								onValueChange={setStatusFilter}
								items={STATUS_FILTERS}
								ariaLabel="Filter by approval status"
							/>
						</>
					}
					right={<TablePagination {...pagination} />}
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					<DataTable
						fill={false}
						stacked
						query={sheets}
						columns={columns}
						data={pagination.pageRows}
						getRowId={(row) => row.id}
						empty={
							<div className="p-4">
								<Empty className="border border-dashed">
									<EmptyHeader>
										<EmptyTitle>
											{rows.length === 0 ? "No timesheets yet" : "No matches"}
										</EmptyTitle>
										<EmptyDescription>
											{rows.length === 0
												? "Completed time entries awaiting approval will appear here."
												: "Try a different search or status."}
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</div>
						}
					/>
				</div>
			</AppPageBody>
		</AppPage>
	);
}
