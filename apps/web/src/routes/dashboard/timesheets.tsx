import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";

import {
	AppPage,
	AppPageBody,
	AppPageHeader,
} from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { api } from "@/lib/api";
import { useTimesheets } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/timesheets")({
	component: TimesheetsPage,
});

type TimesheetRow = {
	id: string;
	worker: string;
	clockedInAt: string;
	clockedOutAt: string | null;
	approvalStatus: string;
};

const columnHelper = createDataColumnHelper<TimesheetRow>();

function TimesheetsPage() {
	const { workplace } = useWorkplace();
	const sheets = useTimesheets(workplace?.id);
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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["timesheets"] });
			toast.success("Timesheet Approval saved");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const rows = sheets.data?.timesheets ?? [];
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
					(row) =>
						`${new Date(row.clockedInAt).toLocaleString()} → ${
							row.clockedOutAt
								? new Date(row.clockedOutAt).toLocaleString()
								: "still on the clock"
						}`,
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
				columnHelper.accessor("approvalStatus", {
					header: "Status",
					cell: ({ getValue }) => (
						<Badge variant="secondary">{getValue()}</Badge>
					),
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
								<Button
									size="sm"
									variant="outline"
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate({
											timeEntryId: entry.id,
											decision: "declined",
										})
									}
								>
									Decline
								</Button>
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
				<DataTable
					columns={columns}
					data={rows}
					getRowId={(row) => row.id}
					empty={
						<Empty>
							<EmptyHeader>
								<EmptyTitle>No timesheets yet</EmptyTitle>
								<EmptyDescription>
									Completed time entries awaiting approval will appear here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					}
				/>
			</AppPageBody>
		</AppPage>
	);
}
