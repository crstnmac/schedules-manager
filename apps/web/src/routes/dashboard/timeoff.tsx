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
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOffIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
	AppPage,
	AppPageBody,
	AppPageHeader,
} from "@/components/app-page";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { api } from "@/lib/api";
import { type TimeOffRequestDto, useTimeOff } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/timeoff")({
	component: TimeOffPage,
});

type Decision = "approved" | "declined";

const columnHelper = createDataColumnHelper<TimeOffRequestDto>();

function TimeOffPage() {
	const { workplace } = useWorkplace();
	const timeOff = useTimeOff(workplace?.id);
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<"pending" | "all">("pending");
	const [declineId, setDeclineId] = useState<string | null>(null);
	const [declineReason, setDeclineReason] = useState("");

	const decide = useMutation({
		mutationFn: (input: {
			requestId: string;
			decision: Decision;
			reason?: string;
		}) =>
			api(
				`/v1/workplaces/${workplace?.id}/time-off/${input.requestId}/decision`,
				{
					method: "POST",
					body: {
						decision: input.decision,
						...(input.decision === "declined" && input.reason
							? { reason: input.reason }
							: {}),
					},
				},
			),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["workplaces", workplace?.id, "time-off"],
			});
			queryClient.invalidateQueries({ queryKey: ["schedule"] });
			setDeclineId(null);
			setDeclineReason("");
			toast.success("Decision saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const requests = (timeOff.data ?? []).filter((request) =>
		filter === "pending" ? request.status === "pending" : true,
	);

	const columns = useMemo(
		() =>
			columnHelper.columns([
				columnHelper.accessor(
					(row) => row.worker.fullName ?? row.worker.email,
					{
						id: "worker",
						header: "Worker",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				columnHelper.accessor(
					(row) =>
						`${new Date(row.startsAt).toLocaleString()} → ${new Date(row.endsAt).toLocaleString()}`,
					{
						id: "window",
						header: "Dates",
						cell: ({ getValue }) => (
							<span className="tabular-nums text-muted-foreground">
								{getValue()}
							</span>
						),
					},
				),
				columnHelper.accessor((row) => row.leaveTypeName ?? "", {
					id: "leaveType",
					header: "Leave type",
					cell: ({ getValue }) => getValue() || "—",
				}),
				columnHelper.accessor((row) => row.reason ?? "", {
					id: "reason",
					header: "Reason",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue() || "—"}</span>
					),
				}),
				columnHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => {
						const status = getValue();
						return (
							<Badge
								className="capitalize"
								variant={
									status === "declined"
										? "destructive"
										: status === "approved"
											? "default"
											: "secondary"
								}
							>
								{status}
							</Badge>
						);
					},
				}),
				columnHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const request = row.original;
						if (request.status !== "pending") return null;
						return (
							<div className="flex flex-wrap items-center justify-end gap-2">
								<Button
									size="sm"
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate({
											requestId: request.id,
											decision: "approved",
										})
									}
								>
									{decide.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Approve
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={decide.isPending}
									onClick={() => {
										setDeclineReason("");
										setDeclineId(request.id);
									}}
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
				title={filter === "pending" ? "Pending requests" : "All requests"}
				badge={<Badge variant="secondary">{requests.length}</Badge>}
				actions={
					<Tabs
						className="w-full sm:w-auto"
						value={filter}
						onValueChange={(value) => setFilter(value as "pending" | "all")}
					>
						<TabsList className="grid w-full grid-cols-2 sm:w-auto">
							<TabsTrigger value="pending">Pending</TabsTrigger>
							<TabsTrigger value="all">All</TabsTrigger>
						</TabsList>
					</Tabs>
				}
			/>
			<AppPageBody scroll={false}>
				{timeOff.isLoading ? (
					<div className="flex flex-col gap-3 p-4">
						<Skeleton className="h-16" />
						<Skeleton className="h-16" />
					</div>
				) : (
					<DataTable
						columns={columns}
						data={requests}
						getRowId={(row) => row.id}
						empty={
							<Empty>
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<CalendarOffIcon />
									</EmptyMedia>
									<EmptyTitle>
										{filter === "pending"
											? "No pending requests"
											: "No time-off requests yet"}
									</EmptyTitle>
									<EmptyDescription>
										{filter === "pending"
											? "You're caught up. Switch to All to review past decisions."
											: "When workers request time off, those requests will appear here."}
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						}
					/>
				)}
			</AppPageBody>

			<AlertDialog
				open={declineId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeclineId(null);
						setDeclineReason("");
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Decline this request?</AlertDialogTitle>
						<AlertDialogDescription>
							The worker will see this decision. A reason is optional.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="decline-reason">Reason</FieldLabel>
							<Input
								id="decline-reason"
								value={declineReason}
								onChange={(event) => setDeclineReason(event.target.value)}
								placeholder="Optional"
							/>
						</Field>
					</FieldGroup>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={decide.isPending}
							onClick={() => {
								if (!declineId) return;
								decide.mutate({
									requestId: declineId,
									decision: "declined",
									reason: declineReason.trim() || undefined,
								});
							}}
						>
							{decide.isPending ? <Spinner data-icon="inline-start" /> : null}
							Decline
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</AppPage>
	);
}
