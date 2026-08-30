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
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
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
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
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
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { useTimeOff } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/timeoff")({
	component: TimeOffPage,
});

type Decision = "approved" | "declined";

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
			setDeclineId(null);
			setDeclineReason("");
			toast.success("Decision saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const requests = (timeOff.data ?? []).filter((request) =>
		filter === "pending" ? request.status === "pending" : true,
	);

	return (
		<section className="flex flex-col gap-6">
			<PageHeader
				title="Time-off requests"
				description="Approved time off blocks scheduling in the draft editor and counts as a conflict warning."
				actions={
					<Tabs
						value={filter}
						onValueChange={(value) => setFilter(value as "pending" | "all")}
					>
						<TabsList>
							<TabsTrigger value="pending">Pending</TabsTrigger>
							<TabsTrigger value="all">All</TabsTrigger>
						</TabsList>
					</Tabs>
				}
			/>

			<Card>
				<CardHeader>
					<CardTitle>
						{filter === "pending" ? "Pending requests" : "All requests"}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{timeOff.isLoading ? (
						<div className="flex flex-col gap-3">
							<Skeleton className="h-16" />
							<Skeleton className="h-16" />
						</div>
					) : requests.length === 0 ? (
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
					) : (
						<ItemGroup>
							{requests.map((request) => (
								<Item key={request.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>
											{request.worker.fullName ?? request.worker.email}
											<Badge
												className="uppercase"
												variant={
													request.status === "declined"
														? "destructive"
														: request.status === "approved"
															? "default"
															: "secondary"
												}
											>
												{request.status}
											</Badge>
										</ItemTitle>
										<ItemDescription>
											{new Date(request.startsAt).toLocaleString()} →{" "}
											{new Date(request.endsAt).toLocaleString()}
											{request.reason ? ` · ${request.reason}` : ""}
										</ItemDescription>
									</ItemContent>
									{request.status === "pending" ? (
										<ItemActions>
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
										</ItemActions>
									) : null}
								</Item>
							))}
						</ItemGroup>
					)}
				</CardContent>
			</Card>

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
		</section>
	);
}
