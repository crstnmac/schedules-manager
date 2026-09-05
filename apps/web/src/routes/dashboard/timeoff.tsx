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
import { Input } from "@SchedulesManager/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@SchedulesManager/ui/components/sheet";
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { usePostHog } from "@posthog/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarOffIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
	AppPage,
	AppPageBody,
	AppPageHeader,
} from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	LeaveWindowFields,
	leaveChargeMinutes,
} from "@/components/leave-window-fields";
import { LeaveTypesCard } from "@/components/settings-surface-cards";
import { api } from "@/lib/api";
import {
	formatLeaveHours,
	hoursToMinutes,
	leaveStatusLabel,
	minutesToHoursInput,
	todayIsoDate,
} from "@/lib/leave";
import {
	type TimeOffRequestDto,
	useLeaveTypes,
	useLocations,
	useTimeOff,
	useWorkers,
	useWorkplacePto,
} from "@/lib/queries";
import { shiftDays } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/timeoff")({
	component: TimeOffPage,
});

type Decision = "approved" | "declined";
type LeaveTab = "decision" | "out" | "history" | "balances" | "types";

const historyHelper = createDataColumnHelper<TimeOffRequestDto>();

type TeamMember = {
	employmentId: string;
	name: string;
	kind: "manager" | "worker";
};

function TimeOffPage() {
	const { workplace, employmentId: myEmploymentId } = useWorkplace();
	const { formatLeaveRange, formatPerson } = useDisplayPrefs();
	const posthog = usePostHog();
	const workplaceId = workplace?.id;
	const timeOff = useTimeOff(workplaceId);
	const leaveTypes = useLeaveTypes(workplaceId);
	const workers = useWorkers(workplaceId);
	const pto = useWorkplacePto(workplaceId);
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<LeaveTab>("decision");
	const [recordOpen, setRecordOpen] = useState(false);
	const [requestMineOpen, setRequestMineOpen] = useState(false);
	const [editing, setEditing] = useState<TimeOffRequestDto | null>(null);
	const [declineId, setDeclineId] = useState<string | null>(null);
	const [declineReason, setDeclineReason] = useState("");

	const requests = timeOff.data ?? [];
	const pending = requests.filter((request) => request.status === "pending");
	const decided = requests.filter((request) => request.status !== "pending");
	const types = leaveTypes.data?.leaveTypes ?? [];
	const team: TeamMember[] =
		workers.data?.workers
			.filter((member) => member.status === "active")
			.map((member) => ({
				employmentId: member.employmentId,
				name: formatPerson(member.profile.fullName, member.profile.email),
				kind: member.kind,
			})) ?? [];

	function invalidateLeave() {
		queryClient.invalidateQueries({
			queryKey: ["workplaces", workplaceId, "time-off"],
		});
		queryClient.invalidateQueries({ queryKey: ["pto", workplaceId] });
		queryClient.invalidateQueries({ queryKey: ["schedule"] });
		queryClient.invalidateQueries({ queryKey: ["leave-types", workplaceId] });
	}

	const decide = useMutation({
		mutationFn: (input: {
			requestId: string;
			decision: Decision;
			reason?: string;
		}) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${input.requestId}/decision`, {
				method: "POST",
				body: {
					decision: input.decision,
					...(input.decision === "declined" && input.reason
						? { reason: input.reason }
						: {}),
				},
			}),
		onSuccess: (_, input) => {
			invalidateLeave();
			setDeclineId(null);
			setDeclineReason("");
			if (input.decision === "approved") {
				posthog?.capture("time_off_approved");
			} else {
				posthog?.capture("time_off_declined", {
					reason_provided: Boolean(input.reason),
				});
			}
			toast.success(
				input.decision === "approved"
					? "Time off approved. It will block the schedule."
					: "Request declined.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const removeLeave = useMutation({
		mutationFn: (requestId: string) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${requestId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			invalidateLeave();
			toast.success("Time off removed. Paid hours were restored if needed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const busy =
		decide.isPending || removeLeave.isPending;

	const historyColumns = useMemo(
		() =>
			historyHelper.columns([
				historyHelper.accessor(
					(row) => formatPerson(row.worker.fullName, row.worker.email),
					{
						id: "person",
						header: "Person",
						cell: ({ row, getValue }) => (
							<span className="font-medium">
								{getValue()}
								{row.original.kind === "manager" ? (
									<span className="font-normal text-muted-foreground">
										{" "}
										· Manager
									</span>
								) : null}
							</span>
						),
					},
				),
				historyHelper.accessor(
					(row) => formatLeaveRange(row),
					{
						id: "when",
						header: "When",
						cell: ({ getValue }) => (
							<span className="tabular-nums">{getValue()}</span>
						),
					},
				),
				historyHelper.accessor((row) => row.leaveTypeName ?? "—", {
					id: "type",
					header: "Type",
				}),
				historyHelper.accessor((row) => formatLeaveHours(row.chargeMinutes), {
					id: "hours",
					header: "Hours",
					cell: ({ getValue }) => (
						<span className="tabular-nums text-muted-foreground">
							{getValue()}
						</span>
					),
				}),
				historyHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => {
						const status = getValue();
						return (
							<Badge
								variant={
									status === "declined"
										? "destructive"
										: status === "approved"
											? "default"
											: "secondary"
								}
							>
								{leaveStatusLabel(status)}
							</Badge>
						);
					},
				}),
				historyHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const request = row.original;
						return (
							<div className="flex flex-wrap justify-end gap-2">
								{request.status !== "declined" ? (
									<Button
										size="sm"
										variant="outline"
										disabled={busy}
										onClick={() => setEditing(request)}
									>
										Edit
									</Button>
								) : null}
								<ConfirmAction
									trigger="Delete"
									triggerVariant="ghost"
									destructive
									title="Delete this time off?"
									description={
										request.status === "approved"
											? "They will no longer be blocked on the schedule. Paid hours will be restored."
											: "This removes the request permanently."
									}
									confirmLabel="Delete"
									disabled={busy}
									onConfirm={() => removeLeave.mutate(request.id)}
								/>
							</div>
						);
					},
				}),
			]),
		[busy, formatLeaveRange, formatPerson, removeLeave],
	);

	return (
		<AppPage>
			<AppPageHeader
				title="Time off"
				description="Decide requests, see who is out, and keep balances current."
				badge={
					pending.length > 0 ? (
						<Badge variant="secondary">{pending.length} need a decision</Badge>
					) : null
				}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setRequestMineOpen(true)}
						>
							Request my leave
						</Button>
						<Button size="sm" onClick={() => setRecordOpen(true)}>
							Record time off
						</Button>
					</div>
				}
			/>
			<AppPageBody>
				<Tabs
					value={tab}
					onValueChange={(value) => setTab(value as LeaveTab)}
					className="min-h-0 flex-1 gap-0"
				>
					<div className="shrink-0 border-b px-4 py-2">
						<TabsList variant="line" className="w-full justify-start sm:w-auto">
							<TabsTrigger value="decision">
								Needs a decision
								{pending.length > 0 ? (
									<Badge variant="secondary">{pending.length}</Badge>
								) : null}
							</TabsTrigger>
							<TabsTrigger value="out">Who’s out</TabsTrigger>
							<TabsTrigger value="history">History</TabsTrigger>
							<TabsTrigger value="balances">Balances</TabsTrigger>
							<TabsTrigger value="types">Leave types</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="decision" className="min-h-0 overflow-y-auto">
						{timeOff.isLoading ? (
							<div className="flex flex-col gap-3 p-4">
								<Skeleton className="h-20" />
								<Skeleton className="h-20" />
							</div>
						) : pending.length === 0 ? (
							<Empty className="border-0">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<CalendarOffIcon />
									</EmptyMedia>
									<EmptyTitle>No requests waiting</EmptyTitle>
									<EmptyDescription>
										Request your own leave, record time off for anyone on the
										team, or wait for a request.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<ul className="divide-y">
								{pending.map((request) => (
									<PendingRequestRow
										key={request.id}
										request={request}
										busy={busy}
										onEdit={() => setEditing(request)}
										onDelete={() => removeLeave.mutate(request.id)}
										onApprove={() =>
											decide.mutate({
												requestId: request.id,
												decision: "approved",
											})
										}
										onDecline={() => {
											setDeclineReason("");
											setDeclineId(request.id);
										}}
									/>
								))}
							</ul>
						)}
					</TabsContent>

					<TabsContent value="out" className="min-h-0 overflow-y-auto">
						<WhoIsOut
							requests={requests}
							loading={timeOff.isLoading}
							busy={busy}
							onEdit={setEditing}
							onDelete={(requestId) => removeLeave.mutate(requestId)}
						/>
					</TabsContent>

					<TabsContent value="history" className="min-h-0 overflow-hidden">
						<DataTable
							columns={historyColumns}
							data={decided}
							getRowId={(row) => row.id}
							empty={
								<Empty>
									<EmptyHeader>
										<EmptyTitle>No decisions yet</EmptyTitle>
										<EmptyDescription>
											Approved and declined requests will stay here.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							}
						/>
					</TabsContent>

					<TabsContent value="balances" className="min-h-0 overflow-y-auto p-4">
						<BalancesPanel
							workplaceId={workplaceId}
							people={team}
							leaveTypes={types}
							balances={pto.data?.balances ?? []}
							onSaved={invalidateLeave}
						/>
					</TabsContent>

					<TabsContent value="types" className="min-h-0 overflow-y-auto p-4">
						<div className="mx-auto w-full max-w-3xl">
							<p className="mb-4 text-muted-foreground text-sm">
								These names appear when anyone requests time off. Paid types
								deduct from the balance when you approve.
							</p>
							<LeaveTypesCard workplaceId={workplaceId} leaveTypes={types} />
							<p className="mt-4 text-muted-foreground text-xs">
								You can also edit these under{" "}
								<Link
									to="/dashboard/settings/leave"
									className="underline underline-offset-2"
								>
									Settings / Leave types
								</Link>
								.
							</p>
						</div>
					</TabsContent>
				</Tabs>
			</AppPageBody>

			<RecordLeaveSheet
				open={recordOpen}
				onOpenChange={setRecordOpen}
				workplaceId={workplaceId}
				people={team}
				leaveTypes={types}
				balances={pto.data?.balances ?? []}
				onSaved={invalidateLeave}
			/>
			<RequestMyLeaveSheet
				open={requestMineOpen}
				onOpenChange={setRequestMineOpen}
				workplaceId={workplaceId}
				employmentId={myEmploymentId}
				leaveTypes={types}
				balances={pto.data?.balances ?? []}
				onSaved={invalidateLeave}
			/>
			{editing ? (
				<EditLeaveSheet
					key={editing.id}
					request={editing}
					onOpenChange={(open) => {
						if (!open) setEditing(null);
					}}
					workplaceId={workplaceId}
					leaveTypes={types}
					balances={pto.data?.balances ?? []}
					onSaved={() => {
						setEditing(null);
						invalidateLeave();
					}}
				/>
			) : null}

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
					<Input
						id="decline-reason"
						value={declineReason}
						onChange={(event) => setDeclineReason(event.target.value)}
						placeholder="Optional reason"
						aria-label="Decline reason"
					/>
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

function PendingRequestRow({
	request,
	busy,
	onEdit,
	onDelete,
	onApprove,
	onDecline,
}: {
	request: TimeOffRequestDto;
	busy: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onApprove: () => void;
	onDecline: () => void;
}) {
	const { formatLeaveRange, formatPerson } = useDisplayPrefs();
	const remainingAfter = request.remainingMinutes - request.chargeMinutes;
	const short = remainingAfter < 0;
	return (
		<li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0">
				<p className="font-medium text-sm">
					{formatPerson(request.worker.fullName, request.worker.email)}
					{request.kind === "manager" ? (
						<span className="font-normal text-muted-foreground">
							{" "}
							· Manager
						</span>
					) : null}
				</p>
				<p className="tabular-nums text-sm">
					{formatLeaveRange(request)}
					{request.leaveTypeName ? ` · ${request.leaveTypeName}` : ""}
					{` · ${formatLeaveHours(request.chargeMinutes)}`}
				</p>
				<p className="text-muted-foreground text-xs">
					{short
						? `Uses ${formatLeaveHours(Math.abs(remainingAfter))} more than the ${formatLeaveHours(request.remainingMinutes)} remaining.`
						: `${formatLeaveHours(request.remainingMinutes)} remaining after this.`}
					{request.reason ? ` ${request.reason}` : ""}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
					Edit
				</Button>
				<ConfirmAction
					trigger="Approve"
					triggerVariant="default"
					title="Approve this time off?"
					description={
						short
							? `This uses ${formatLeaveHours(request.chargeMinutes)} and they only have ${formatLeaveHours(request.remainingMinutes)} left. They will still be blocked on the schedule.`
							: `This uses ${formatLeaveHours(request.chargeMinutes)}${request.leaveTypeName ? ` of ${request.leaveTypeName}` : ""} and blocks the schedule.`
					}
					confirmLabel="Approve"
					disabled={busy}
					onConfirm={onApprove}
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={onDecline}
				>
					Decline
				</Button>
				<ConfirmAction
					trigger="Delete"
					triggerVariant="ghost"
					destructive
					title="Delete this request?"
					description="This removes the request permanently."
					confirmLabel="Delete"
					disabled={busy}
					onConfirm={onDelete}
				/>
			</div>
		</li>
	);
}

function WhoIsOut({
	requests,
	loading,
	busy,
	onEdit,
	onDelete,
}: {
	requests: TimeOffRequestDto[];
	loading: boolean;
	busy: boolean;
	onEdit: (request: TimeOffRequestDto) => void;
	onDelete: (requestId: string) => void;
}) {
	const { formatLeaveRange, formatPerson } = useDisplayPrefs();
	const upcoming = useMemo(() => {
		const start = todayIsoDate();
		const end = shiftDays(start, 20);
		return requests
			.filter(
				(request) =>
					request.status === "approved" &&
					request.endDate >= start &&
					request.startDate <= end,
			)
			.sort((a, b) => a.startDate.localeCompare(b.startDate));
	}, [requests]);

	if (loading) {
		return (
			<div className="flex flex-col gap-3 p-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-16" />
			</div>
		);
	}

	if (upcoming.length === 0) {
		return (
			<Empty className="border-0">
				<EmptyHeader>
					<EmptyTitle>Nobody is out in the next three weeks</EmptyTitle>
					<EmptyDescription>
						Approved time off will show here so you can staff around it.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ul className="divide-y">
			{upcoming.map((request) => (
				<li
					key={request.id}
					className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div className="min-w-0">
						<p className="font-medium text-sm">
							{formatPerson(request.worker.fullName, request.worker.email)}
							{request.kind === "manager" ? (
								<span className="font-normal text-muted-foreground">
									{" "}
									· Manager
								</span>
							) : null}
						</p>
						<p className="tabular-nums text-sm">
							{formatLeaveRange(request)}
							{request.leaveTypeName ? ` · ${request.leaveTypeName}` : ""}
							{` · ${formatLeaveHours(request.chargeMinutes)}`}
						</p>
						{request.reason ? (
							<p className="text-muted-foreground text-xs">{request.reason}</p>
						) : null}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => onEdit(request)}
						>
							Edit
						</Button>
						<ConfirmAction
							trigger="Delete"
							triggerVariant="ghost"
							destructive
							title="Delete this time off?"
							description="They will no longer be blocked on the schedule. Paid hours will be restored."
							confirmLabel="Delete"
							disabled={busy}
							onConfirm={() => onDelete(request.id)}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}

function BalancesPanel({
	workplaceId,
	people,
	leaveTypes,
	balances,
	onSaved,
}: {
	workplaceId: string | undefined;
	people: TeamMember[];
	leaveTypes: { id: string; name: string; paid: boolean }[];
	balances: {
		employmentId: string;
		leaveTypeId: string;
		minutes: number;
	}[];
	onSaved: () => void;
}) {
	const [draft, setDraft] = useState<Record<string, string>>({});
	const save = useMutation({
		mutationFn: (input: {
			employmentId: string;
			leaveTypeId: string;
			minutes: number;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/employments/${input.employmentId}/pto`,
				{
					method: "PUT",
					body: {
						leaveTypeId: input.leaveTypeId,
						minutes: input.minutes,
					},
				},
			),
		onSuccess: () => {
			onSaved();
			toast.success("Balance saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	if (leaveTypes.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Add a leave type first, then set hours here.
			</p>
		);
	}
	if (people.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Invite people before tracking balances.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[36rem] border-collapse text-sm">
				<thead>
					<tr className="border-b text-left">
						<th className="py-2 pr-3 font-medium">Person</th>
						{leaveTypes.map((type) => (
							<th key={type.id} className="px-2 py-2 font-medium">
								{type.name}
								<span className="block font-normal text-muted-foreground text-xs">
									{type.paid ? "Paid · hours" : "Unpaid · hours"}
								</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{people.map((person) => (
						<tr key={person.employmentId} className="border-b">
							<td className="py-2 pr-3 font-medium">
								{person.name}
								{person.kind === "manager" ? (
									<span className="font-normal text-muted-foreground">
										{" "}
										· Manager
									</span>
								) : null}
							</td>
							{leaveTypes.map((type) => {
								const key = `${person.employmentId}:${type.id}`;
								const current =
									balances.find(
										(row) =>
											row.employmentId === person.employmentId &&
											row.leaveTypeId === type.id,
									)?.minutes ?? 0;
								return (
									<td key={type.id} className="px-2 py-2">
										<div className="flex items-center gap-2">
											<Input
												aria-label={`${person.name} ${type.name} hours`}
												type="number"
												min={0}
												step="0.5"
												className="w-20 tabular-nums"
												value={
													draft[key] ?? minutesToHoursInput(current)
												}
												onChange={(event) =>
													setDraft((values) => ({
														...values,
														[key]: event.target.value,
													}))
												}
											/>
											<Button
												size="sm"
												variant="outline"
												disabled={save.isPending}
												onClick={() =>
													save.mutate({
														employmentId: person.employmentId,
														leaveTypeId: type.id,
														minutes: hoursToMinutes(
															draft[key] ?? minutesToHoursInput(current),
														),
													})
												}
											>
												Save
											</Button>
										</div>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function RecordLeaveSheet({
	open,
	onOpenChange,
	workplaceId,
	people,
	leaveTypes,
	balances,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workplaceId: string | undefined;
	people: TeamMember[];
	leaveTypes: { id: string; name: string; paid: boolean }[];
	balances: {
		employmentId: string;
		leaveTypeId: string;
		minutes: number;
	}[];
	onSaved: () => void;
}) {
	const today = todayIsoDate();
	const [employmentId, setEmploymentId] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [startDate, setStartDate] = useState(today);
	const [endDate, setEndDate] = useState(today);
	const [allDay, setAllDay] = useState(true);
	const [startMinute, setStartMinute] = useState(9 * 60);
	const [endMinute, setEndMinute] = useState(17 * 60);
	const [reason, setReason] = useState("");

	const locations = useLocations(workplaceId);
	const timeZone = locations.data?.[0]?.timezone;

	const remaining = balances.find(
		(row) =>
			row.employmentId === employmentId && row.leaveTypeId === leaveTypeId,
	)?.minutes;
	const charge = leaveChargeMinutes({
		startDate,
		endDate,
		allDay,
		startMinute,
		endMinute,
		timeZone,
	});

	const record = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/time-off`, {
				method: "POST",
				body: {
					employmentId,
					leaveTypeId,
					startDate,
					endDate,
					allDay,
					...(allDay ? {} : { startMinute, endMinute }),
					reason: reason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			onSaved();
			onOpenChange(false);
			setReason("");
			toast.success("Time off recorded.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Record time off</SheetTitle>
					<SheetDescription>
						Approved immediately for a worker or manager. Deducts paid hours
						when a leave type is set.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<div className="grid gap-1.5">
						<label className="font-medium text-sm" htmlFor="record-person">
							Person
						</label>
						<Select
							items={people.map((person) => ({
								label:
									person.kind === "manager"
										? `${person.name} · Manager`
										: person.name,
								value: person.employmentId,
							}))}
							value={employmentId}
							onValueChange={(value) => value && setEmploymentId(value)}
						>
							<SelectTrigger id="record-person" className="w-full">
								<SelectValue placeholder="Choose someone" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{people.map((person) => (
										<SelectItem
											key={person.employmentId}
											value={person.employmentId}
										>
											{person.kind === "manager"
												? `${person.name} · Manager`
												: person.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<LeaveWindowFields
						idPrefix="record"
						leaveTypes={leaveTypes}
						leaveTypeId={leaveTypeId}
						onLeaveTypeIdChange={setLeaveTypeId}
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
						allDay={allDay}
						onAllDayChange={setAllDay}
						startMinute={startMinute}
						endMinute={endMinute}
						onStartMinuteChange={setStartMinute}
						onEndMinuteChange={setEndMinute}
						reason={reason}
						onReasonChange={setReason}
						remainingMinutes={remaining}
					/>
				</div>
				<SheetFooter>
					<Button
						disabled={
							record.isPending || !employmentId || !leaveTypeId || charge <= 0
						}
						onClick={() => record.mutate()}
					>
						{record.isPending ? <Spinner data-icon="inline-start" /> : null}
						Record {charge > 0 ? formatLeaveHours(charge) : "time off"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function RequestMyLeaveSheet({
	open,
	onOpenChange,
	workplaceId,
	employmentId,
	leaveTypes,
	balances,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workplaceId: string | undefined;
	employmentId: string | null;
	leaveTypes: { id: string; name: string; paid: boolean }[];
	balances: {
		employmentId: string;
		leaveTypeId: string;
		minutes: number;
	}[];
	onSaved: () => void;
}) {
	const today = todayIsoDate();
	const posthogLeave = usePostHog();
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [startDate, setStartDate] = useState(today);
	const [endDate, setEndDate] = useState(today);
	const [allDay, setAllDay] = useState(true);
	const [startMinute, setStartMinute] = useState(9 * 60);
	const [endMinute, setEndMinute] = useState(17 * 60);
	const [reason, setReason] = useState("");

	const locations = useLocations(workplaceId);
	const timeZone = locations.data?.[0]?.timezone;

	const remaining = balances.find(
		(row) =>
			employmentId != null &&
			row.employmentId === employmentId &&
			row.leaveTypeId === leaveTypeId,
	)?.minutes;
	const charge = leaveChargeMinutes({
		startDate,
		endDate,
		allDay,
		startMinute,
		endMinute,
		timeZone,
	});

	const request = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/time-off`, {
				method: "POST",
				body: {
					leaveTypeId,
					startDate,
					endDate,
					allDay,
					...(allDay ? {} : { startMinute, endMinute }),
					reason: reason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			onSaved();
			onOpenChange(false);
			setReason("");
			posthogLeave?.capture("time_off_requested", {
				all_day: allDay,
				has_leave_type: Boolean(leaveTypeId),
				has_reason: Boolean(reason.trim()),
			});
			toast.success("Leave requested. Another manager can approve it.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Request my leave</SheetTitle>
					<SheetDescription>
						Creates a pending request for this workplace. Record time off
						instead if you want it approved immediately.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					{employmentId ? null : (
						<p className="text-destructive text-sm">
							Your manager employment is missing for this workplace.
						</p>
					)}
					<LeaveWindowFields
						idPrefix="mine"
						leaveTypes={leaveTypes}
						leaveTypeId={leaveTypeId}
						onLeaveTypeIdChange={setLeaveTypeId}
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
						allDay={allDay}
						onAllDayChange={setAllDay}
						startMinute={startMinute}
						endMinute={endMinute}
						onStartMinuteChange={setStartMinute}
						onEndMinuteChange={setEndMinute}
						reason={reason}
						onReasonChange={setReason}
						remainingMinutes={remaining}
					/>
				</div>
				<SheetFooter>
					<Button
						disabled={
							request.isPending ||
							!employmentId ||
							!leaveTypeId ||
							charge <= 0
						}
						onClick={() => request.mutate()}
					>
						{request.isPending ? <Spinner data-icon="inline-start" /> : null}
						Request {charge > 0 ? formatLeaveHours(charge) : "leave"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function EditLeaveSheet({
	request,
	onOpenChange,
	workplaceId,
	leaveTypes,
	balances,
	onSaved,
}: {
	request: TimeOffRequestDto;
	onOpenChange: (open: boolean) => void;
	workplaceId: string | undefined;
	leaveTypes: { id: string; name: string; paid: boolean }[];
	balances: {
		employmentId: string;
		leaveTypeId: string;
		minutes: number;
	}[];
	onSaved: () => void;
}) {
	const { formatPerson } = useDisplayPrefs();
	const [leaveTypeId, setLeaveTypeId] = useState(request.leaveTypeId ?? "");
	const [startDate, setStartDate] = useState(request.startDate);
	const [endDate, setEndDate] = useState(request.endDate);
	const [allDay, setAllDay] = useState(request.allDay);
	const [startMinute, setStartMinute] = useState(
		request.startMinute ?? 9 * 60,
	);
	const [endMinute, setEndMinute] = useState(request.endMinute ?? 17 * 60);
	const [reason, setReason] = useState(request.reason ?? "");

	const remaining = balances.find(
		(row) =>
			row.employmentId === request.employmentId &&
			row.leaveTypeId === leaveTypeId,
	)?.minutes;
	const locations = useLocations(workplaceId);
	const charge = leaveChargeMinutes({
		startDate,
		endDate,
		allDay,
		startMinute,
		endMinute,
		timeZone: locations.data?.[0]?.timezone,
	});

	const save = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/time-off/${request.id}`, {
				method: "PATCH",
				body: {
					leaveTypeId,
					startDate,
					endDate,
					allDay,
					...(allDay ? {} : { startMinute, endMinute }),
					reason: reason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			onSaved();
			toast.success("Time off updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Edit time off</SheetTitle>
					<SheetDescription>
						{formatPerson(request.worker.fullName, request.worker.email)}
						{request.status === "approved"
							? " · Changing dates or type adjusts paid hours."
							: " · Pending until approved."}
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<LeaveWindowFields
						idPrefix="edit"
						leaveTypes={leaveTypes}
						leaveTypeId={leaveTypeId}
						onLeaveTypeIdChange={setLeaveTypeId}
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
						allDay={allDay}
						onAllDayChange={setAllDay}
						startMinute={startMinute}
						endMinute={endMinute}
						onStartMinuteChange={setStartMinute}
						onEndMinuteChange={setEndMinute}
						reason={reason}
						onReasonChange={setReason}
						remainingMinutes={remaining}
					/>
				</div>
				<SheetFooter>
					<Button
						disabled={save.isPending || !leaveTypeId || charge <= 0}
						onClick={() => save.mutate()}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save changes
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
