import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { usePostHog } from "@posthog/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";

import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	type ListFilter,
	type ListSort,
	ListToolbar,
	useListView,
} from "@/components/list-view";
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

const FILTERS: ListFilter<TimesheetRow>[] = [
	{
		id: "status",
		label: "Status",
		options: [
			{ label: "Pending", value: "pending" },
			{ label: "Approved", value: "approved" },
			{ label: "Declined", value: "declined" },
		],
		value: (row) => row.approvalStatus,
	},
];

function workedMs(row: TimesheetRow) {
	return row.clockedOutAt
		? new Date(row.clockedOutAt).getTime() - new Date(row.clockedInAt).getTime()
		: Number.POSITIVE_INFINITY;
}

const SORTS: ListSort<TimesheetRow>[] = [
	{
		id: "worker",
		label: "Worker",
		compare: (a, b) => a.worker.localeCompare(b.worker),
	},
	{
		id: "window",
		label: "Clock-in time",
		compare: (a, b) => a.clockedInAt.localeCompare(b.clockedInAt),
	},
	{ id: "hours", label: "Hours", compare: (a, b) => workedMs(a) - workedMs(b) },
];

const searchWorker = (row: TimesheetRow) => [row.worker];
const rowId = (row: TimesheetRow) => row.id;
const canDecide = (row: TimesheetRow) =>
	row.approvalStatus === "pending" && Boolean(row.clockedOutAt);

function TimesheetsPage() {
	const { workplace } = useWorkplace();
	const sheets = useTimesheets(workplace?.id);
	const posthog = usePostHog();
	const queryClient = useQueryClient();
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

	const decideBatch = useMutation({
		mutationFn: async (input: {
			ids: string[];
			decision: "approved" | "declined";
		}) => {
			let failed = 0;
			for (const id of input.ids) {
				try {
					await api(
						`/v1/workplaces/${workplace?.id}/time-entries/${id}/approval`,
						{ method: "POST", body: { decision: input.decision } },
					);
				} catch {
					failed += 1;
				}
			}
			return { failed, total: input.ids.length, decision: input.decision };
		},
		onSuccess: ({ failed, total, decision }) => {
			queryClient.invalidateQueries({ queryKey: ["timesheets"] });
			list.selection?.clear();
			const verb = decision === "approved" ? "approved" : "declined";
			if (failed > 0) {
				toast.error(`${failed} of ${total} entries couldn't be ${verb}.`);
			} else {
				if (decision === "approved") posthog?.capture("timesheet_approved");
				toast.success(
					`${decision === "approved" ? "Approved" : "Declined"} ${total} time ${total === 1 ? "entry" : "entries"}.`,
				);
			}
		},
	});

	const rows = sheets.data?.timesheets ?? [];
	const list = useListView<TimesheetRow>({
		rows,
		getRowId: rowId,
		search: searchWorker,
		filters: FILTERS,
		sorts: SORTS,
		selectable: canDecide,
	});
	const columns = useMemo(
		() =>
			columnHelper.columns([
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
				columnHelper.accessor(workedMs, {
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
				}),
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
		[decide],
	);

	return (
		<AppPage>
			<AppPageHeader
				title="Timesheet approval"
				description="Accept or decline completed time entries."
			/>
			<AppPageBody scroll={false}>
				<ListToolbar
					list={list}
					searchPlaceholder="Search worker"
					noun={{ one: "entry", many: "entries" }}
					bulkActions={(selected) => {
						const count = selected.length;
						const entries = `${count} ${count === 1 ? "entry" : "entries"}`;
						const ids = selected.map((row) => row.id);
						return (
							<>
								<ConfirmAction
									trigger="Approve"
									triggerVariant="default"
									title={`Approve ${entries}?`}
									description={`Approves the recorded hours for ${entries}. Approved hours count toward the timesheet.`}
									confirmLabel="Approve"
									disabled={decideBatch.isPending}
									onConfirm={() =>
										decideBatch.mutate({ ids, decision: "approved" })
									}
								/>
								<ConfirmAction
									trigger="Decline"
									title={`Decline ${entries}?`}
									description={`Declining rejects the recorded hours for ${entries}. Workers may need to record them again.`}
									confirmLabel="Decline"
									destructive
									disabled={decideBatch.isPending}
									onConfirm={() =>
										decideBatch.mutate({ ids, decision: "declined" })
									}
								/>
							</>
						);
					}}
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					<DataTable
						fill={false}
						stacked
						query={sheets}
						columns={columns}
						list={list}
						data={list.pagination.pageRows}
						getRowId={rowId}
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
