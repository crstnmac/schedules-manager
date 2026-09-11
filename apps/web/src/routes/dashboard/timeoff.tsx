import { env } from "@SchedulesManager/env/web";
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
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
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
import { CalendarOffIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { LeaveForecastTable } from "@/components/leave-forecast-table";
import { LeaveImportSheet } from "@/components/leave-import-sheet";
import { LeaveLedgerList } from "@/components/leave-ledger-list";
import {
	LeaveWindowFields,
	leaveChargeMinutes,
} from "@/components/leave-window-fields";
import { LeaveTypesCard } from "@/components/settings-surface-cards";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { api } from "@/lib/api";
import {
	formatLeaveHours,
	hoursToMinutes,
	leaveStatusLabel,
	minutesToHoursInput,
	todayIsoDate,
} from "@/lib/leave";
import { hasCapability } from "@/lib/privileges";
import {
	type LeaveBalanceDto,
	type LeaveDelegationDto,
	type LeaveDocumentDto,
	type LeaveEncashmentDto,
	type LeaveTypeDto,
	type PendingApprovalDto,
	type PendingUnavailabilityDto,
	type TimeOffRequestDto,
	useCreateLeaveDelegation,
	useLeaveBalances,
	useLeaveDelegations,
	useLeaveEncashments,
	useLeaveForecast,
	useLeaveLedger,
	useLeaveTypes,
	useLocations,
	useMyPendingApprovals,
	useRevokeLeaveDelegation,
	useTimeOffBoard,
	useWorkers,
	useWorkplacePto,
} from "@/lib/queries";
import { formatDay, shiftDays, WEEKDAY_NAMES } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/timeoff")({
	component: TimeOffPage,
});

type Decision = "approved" | "declined";
type LeaveTab =
	| "decision"
	| "approvals"
	| "availability"
	| "out"
	| "history"
	| "balances"
	| "encashments"
	| "forecast"
	| "types";

const historyHelper = createDataColumnHelper<TimeOffRequestDto>();

type TeamMember = {
	employmentId: string;
	name: string;
	kind: "manager" | "worker" | "viewer";
};

type LeaveTypeOption = { id: string; name: string; paid: boolean };

const APPROVAL_STATUS_CLASS: Record<string, string> = {
	approved:
		"border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
	declined: "border-transparent bg-destructive/15 text-destructive",
	pending: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400",
	skipped: "border-transparent bg-muted text-muted-foreground",
	escalated:
		"border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

function formatDateTime(value: string): string {
	return new Date(value).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatCents(cents: number): string {
	return (cents / 100).toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
}

function signedHoursToMinutes(value: string): number {
	const hours = Number(value);
	if (!Number.isFinite(hours)) return 0;
	return Math.round(hours * 60);
}

function ApprovalStepChips({
	approvals,
	currentStep,
}: {
	approvals?: TimeOffRequestDto["approvals"];
	currentStep?: number;
}) {
	if (!approvals || approvals.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{approvals.map((approval) => (
				<Badge
					key={approval.id}
					variant="outline"
					title={`Step ${approval.stepOrder + 1}: ${approval.status}`}
					className={APPROVAL_STATUS_CLASS[approval.status]}
				>
					{approval.stepOrder + 1}. {approval.status}
				</Badge>
			))}
			{typeof currentStep === "number" ? (
				<span className="text-muted-foreground text-xs">
					Step {Math.min(currentStep + 1, approvals.length)} of{" "}
					{approvals.length}
				</span>
			) : null}
		</div>
	);
}

function EmergencyBadge() {
	return (
		<Badge variant="destructive" className="uppercase">
			Emergency
		</Badge>
	);
}

function TimeOffPage() {
	const {
		workplace,
		employmentId: myEmploymentId,
		kind,
		privileges,
	} = useWorkplace();
	const { formatLeaveRange, formatPerson } = useDisplayPrefs();
	const posthog = usePostHog();
	const workplaceId = workplace?.id;
	const timeOff = useTimeOffBoard(workplaceId);
	const leaveTypes = useLeaveTypes(workplaceId);
	const workers = useWorkers(workplaceId);
	const pto = useWorkplacePto(workplaceId);
	const myApprovals = useMyPendingApprovals(workplaceId);
	const leaveBalances = useLeaveBalances(workplaceId);
	const leaveEncashments = useLeaveEncashments(workplaceId);
	const leaveDelegations = useLeaveDelegations(workplaceId);
	const createDelegation = useCreateLeaveDelegation(workplaceId);
	const revokeDelegation = useRevokeLeaveDelegation(workplaceId);
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<LeaveTab>("decision");
	const [recordOpen, setRecordOpen] = useState(false);
	const [requestMineOpen, setRequestMineOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [editing, setEditing] = useState<TimeOffRequestDto | null>(null);
	const [declineId, setDeclineId] = useState<string | null>(null);
	const [declineReason, setDeclineReason] = useState("");
	const [approvalDecline, setApprovalDecline] =
		useState<PendingApprovalDto | null>(null);
	const [approvalDeclineReason, setApprovalDeclineReason] = useState("");
	const [bulkDeclineOpen, setBulkDeclineOpen] = useState(false);
	const [bulkDeclineReason, setBulkDeclineReason] = useState("");
	const [expediteId, setExpediteId] = useState<string | null>(null);
	const [expediteReason, setExpediteReason] = useState("");
	const [delegationOpen, setDelegationOpen] = useState(false);
	const [selectedRequestIds, setSelectedRequestIds] = useState<
		ReadonlySet<string>
	>(new Set());
	const [decisionSearch, setDecisionSearch] = useState("");
	const [historySearch, setHistorySearch] = useState("");
	const [historyStatus, setHistoryStatus] = useState("all");

	const canManageSettings = hasCapability(
		kind ? { kind, privileges } : null,
		"settings.manage",
	);

	const bulkDecision = useMutation({
		mutationFn: (input: {
			requestIds: string[];
			decision: Decision;
			reason?: string;
		}) =>
			api<{
				approved: number;
				declined: number;
				pending: number;
				failed: { requestId: string; message: string }[];
			}>(`/v1/workplaces/${workplaceId}/time-off/bulk-decision`, {
				method: "POST",
				body: {
					requestIds: input.requestIds,
					decision: input.decision,
					...(input.decision === "declined" && input.reason
						? { reason: input.reason }
						: {}),
				},
			}),
		onSuccess: (result, input) => {
			invalidateLeave();
			setSelectedRequestIds(new Set());
			setBulkDeclineOpen(false);
			setBulkDeclineReason("");
			const applied = result.approved + result.declined;
			if (input.decision === "approved") {
				posthog?.capture("time_off_approved", {
					batch: true,
					count: result.approved,
				});
			} else {
				posthog?.capture("time_off_declined", {
					batch: true,
					count: result.declined,
					reason_provided: Boolean(input.reason),
				});
			}
			if (result.failed.length > 0) {
				toast.error(
					`${result.failed.length} of ${input.requestIds.length} requests couldn’t be ${input.decision === "approved" ? "approved" : "declined"}.`,
				);
			} else if (result.pending > 0) {
				toast.success(
					`${input.decision === "approved" ? "Approved" : "Declined"} ${applied}. ${result.pending} still waiting on another approver.`,
				);
			} else {
				toast.success(
					`${input.decision === "approved" ? "Approved" : "Declined"} ${applied} time-off requests.`,
				);
			}
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const requests = timeOff.data?.requests ?? [];
	const pendingUnavailability = timeOff.data?.pendingUnavailability ?? [];
	const pending = requests.filter((request) => request.status === "pending");
	const selectedPending = pending.filter((request) =>
		selectedRequestIds.has(request.id),
	);
	const decided = requests.filter((request) => request.status !== "pending");
	const myPendingApprovals = myApprovals.data ?? [];
	const decisionRows = useMemo(() => {
		const term = decisionSearch.trim().toLowerCase();
		if (!term) return pending;
		return pending.filter((request) =>
			formatPerson(request.worker.fullName, request.worker.email)
				.toLowerCase()
				.includes(term),
		);
	}, [decisionSearch, formatPerson, pending]);
	const decisionPagination = useTablePagination(decisionRows, {
		resetKey: decisionSearch,
	});
	const historyRows = useMemo(() => {
		const term = historySearch.trim().toLowerCase();
		return decided.filter((request) => {
			if (historyStatus !== "all" && request.status !== historyStatus) {
				return false;
			}
			if (!term) return true;
			return `${formatPerson(request.worker.fullName, request.worker.email)} ${
				request.leaveTypeName ?? ""
			}`
				.toLowerCase()
				.includes(term);
		});
	}, [decided, formatPerson, historySearch, historyStatus]);
	const historyPagination = useTablePagination(historyRows, {
		resetKey: `${historySearch}|${historyStatus}`,
	});
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
		queryClient.invalidateQueries({
			queryKey: ["workplaces", workplaceId, "time-off-board"],
		});
		queryClient.invalidateQueries({ queryKey: ["pto", workplaceId] });
		queryClient.invalidateQueries({ queryKey: ["schedule"] });
		queryClient.invalidateQueries({ queryKey: ["constraints"] });
		queryClient.invalidateQueries({ queryKey: ["leave-types", workplaceId] });
		queryClient.invalidateQueries({
			queryKey: ["leave-balances", workplaceId],
		});
		queryClient.invalidateQueries({
			queryKey: ["leave-encashments", workplaceId],
		});
		queryClient.invalidateQueries({ queryKey: ["leave-ledger"] });
		queryClient.invalidateQueries({
			queryKey: ["my-pending-approvals", workplaceId],
		});
		queryClient.invalidateQueries({
			queryKey: ["leave-delegations", workplaceId],
		});
	}

	const decideUnavailability = useMutation({
		mutationFn: (input: {
			unavailabilityId: string;
			decision: "approved" | "declined";
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/unavailability/${input.unavailabilityId}/decision`,
				{
					method: "POST",
					body: { decision: input.decision },
				},
			),
		onSuccess: (_, input) => {
			invalidateLeave();
			toast.success(
				input.decision === "approved"
					? "Availability approved. It now blocks scheduling."
					: "Availability request declined.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const decide = useMutation({
		mutationFn: (input: {
			requestId: string;
			decision: Decision;
			reason?: string;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/time-off/${input.requestId}/decision`,
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

	const decideApproval = useMutation({
		mutationFn: (input: {
			requestId: string;
			approvalId: string;
			decision: Decision;
			reason?: string;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/time-off/${input.requestId}/approvals/${input.approvalId}/decision`,
				{
					method: "POST",
					body: {
						decision: input.decision,
						...(input.reason ? { reason: input.reason } : {}),
					},
				},
			),
		onSuccess: (_, input) => {
			invalidateLeave();
			setApprovalDecline(null);
			setApprovalDeclineReason("");
			if (input.decision === "approved") {
				posthog?.capture("time_off_approved", { step: true });
			} else {
				posthog?.capture("time_off_declined", {
					step: true,
					reason_provided: Boolean(input.reason),
				});
			}
			toast.success(
				input.decision === "approved"
					? "Approval recorded."
					: "Request declined.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const expedite = useMutation({
		mutationFn: (input: { requestId: string; reason: string }) =>
			api(
				`/v1/workplaces/${workplaceId}/time-off/${input.requestId}/expedite`,
				{
					method: "POST",
					body: { reason: input.reason },
				},
			),
		onSuccess: () => {
			invalidateLeave();
			setExpediteId(null);
			setExpediteReason("");
			posthog?.capture("time_off_expedited");
			toast.success("Emergency override applied. The request is approved.");
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
		decide.isPending ||
		removeLeave.isPending ||
		bulkDecision.isPending ||
		decideApproval.isPending;

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
				historyHelper.accessor((row) => formatLeaveRange(row), {
					id: "when",
					header: "When",
					cell: ({ getValue }) => (
						<span className="tabular-nums">{getValue()}</span>
					),
				}),
				historyHelper.accessor((row) => row.leaveTypeName ?? "—", {
					id: "type",
					header: "Type",
				}),
				historyHelper.accessor((row) => formatLeaveHours(row.chargeMinutes), {
					id: "hours",
					header: "Hours",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground tabular-nums">
							{getValue()}
						</span>
					),
				}),
				historyHelper.accessor((row) => row.approvals?.length ?? 0, {
					id: "approval",
					header: "Approval",
					enableSorting: false,
					cell: ({ row }) => (
						<ApprovalStepChips
							approvals={row.original.approvals}
							currentStep={row.original.currentStep}
						/>
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
							variant="ghost"
							onClick={() => setImportOpen(true)}
						>
							Import
						</Button>
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
					<div className="shrink-0 overflow-x-auto border-b px-4 py-2">
						<TabsList
							variant="line"
							className="w-max min-w-full justify-start sm:w-auto sm:min-w-0"
						>
							<TabsTrigger value="decision">
								Needs a decision
								{pending.length > 0 ? (
									<Badge variant="secondary">{pending.length}</Badge>
								) : null}
							</TabsTrigger>
							<TabsTrigger value="approvals">
								My approvals
								{myPendingApprovals.length > 0 ? (
									<Badge variant="secondary">{myPendingApprovals.length}</Badge>
								) : null}
							</TabsTrigger>
							<TabsTrigger value="availability">
								Pending availability
								{pendingUnavailability.length > 0 ? (
									<Badge variant="secondary">
										{pendingUnavailability.length}
									</Badge>
								) : null}
							</TabsTrigger>
							<TabsTrigger value="out">Who’s out</TabsTrigger>
							<TabsTrigger value="history">History</TabsTrigger>
							<TabsTrigger value="balances">Balances</TabsTrigger>
							<TabsTrigger value="encashments">Encashments</TabsTrigger>
							<TabsTrigger value="forecast">Forecast</TabsTrigger>
							<TabsTrigger value="types">Leave types</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent
						value="decision"
						className="flex min-h-0 flex-1 flex-col"
					>
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
							<>
								<TableToolbar
									left={
										<TableSearch
											value={decisionSearch}
											onValueChange={setDecisionSearch}
											placeholder="Search person"
										/>
									}
									right={<TablePagination {...decisionPagination} />}
								/>
								{selectedPending.length > 0 ? (
									<div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
										<p className="text-muted-foreground text-xs">
											{selectedPending.length} selected
										</p>
										<div className="flex flex-wrap items-center gap-2">
											<ConfirmAction
												trigger={`Approve selected (${selectedPending.length})`}
												triggerVariant="default"
												title={`Approve ${selectedPending.length} time-off requests?`}
												description={`Approves ${selectedPending
													.slice(0, 3)
													.map((request) =>
														formatPerson(
															request.worker.fullName,
															request.worker.email,
														),
													)
													.join(
														", ",
													)}${selectedPending.length > 3 ? ` and ${selectedPending.length - 3} more` : ""}. Each blocks the schedule.`}
												confirmLabel="Approve all"
												disabled={bulkDecision.isPending}
												onConfirm={() =>
													bulkDecision.mutate({
														requestIds: selectedPending.map(
															(request) => request.id,
														),
														decision: "approved",
													})
												}
											/>
											<Button
												variant="outline"
												size="sm"
												disabled={bulkDecision.isPending}
												onClick={() => {
													setBulkDeclineReason("");
													setBulkDeclineOpen(true);
												}}
											>
												Decline selected ({selectedPending.length})
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setSelectedRequestIds(new Set())}
											>
												Clear
											</Button>
										</div>
									</div>
								) : null}
								<ul className="min-h-0 flex-1 divide-y overflow-y-auto">
									{decisionPagination.pageRows.map((request) => (
										<PendingRequestRow
											key={request.id}
											workplaceId={workplaceId}
											request={request}
											busy={busy}
											selected={selectedRequestIds.has(request.id)}
											onToggleSelect={(checked) => {
												setSelectedRequestIds((current) => {
													const next = new Set(current);
													if (checked) {
														next.add(request.id);
													} else {
														next.delete(request.id);
													}
													return next;
												});
											}}
											onEdit={() => setEditing(request)}
											onDelete={() => removeLeave.mutate(request.id)}
											onChanged={invalidateLeave}
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
											onExpedite={() => {
												setExpediteReason("");
												setExpediteId(request.id);
											}}
										/>
									))}
								</ul>
							</>
						)}
					</TabsContent>

					<TabsContent
						value="approvals"
						className="min-h-0 flex-1 overflow-y-auto"
					>
						<MyApprovalsPanel
							items={myPendingApprovals}
							loading={myApprovals.isLoading}
							busy={decideApproval.isPending}
							onApprove={(item) =>
								decideApproval.mutate({
									requestId: item.requestId,
									approvalId: item.approvalId,
									decision: "approved",
								})
							}
							onDecline={(item) => {
								setApprovalDeclineReason("");
								setApprovalDecline(item);
							}}
						/>
						<DelegationsSection
							workplaceId={workplaceId}
							people={team}
							delegations={leaveDelegations.data ?? []}
							loading={leaveDelegations.isLoading}
							creating={createDelegation.isPending}
							busy={revokeDelegation.isPending}
							open={delegationOpen}
							onOpenChange={setDelegationOpen}
							onCreate={(input) =>
								createDelegation.mutate(input, {
									onSuccess: () => setDelegationOpen(false),
								})
							}
							onRevoke={(delegationId) => revokeDelegation.mutate(delegationId)}
						/>
					</TabsContent>

					<TabsContent value="availability" className="min-h-0 overflow-y-auto">
						<PendingUnavailabilityPanel
							items={pendingUnavailability}
							loading={timeOff.isLoading}
							busy={decideUnavailability.isPending}
							onDecide={(unavailabilityId, decision) =>
								decideUnavailability.mutate({ unavailabilityId, decision })
							}
						/>
					</TabsContent>

					<TabsContent value="out" className="min-h-0 overflow-y-auto">
						<WhoIsOut
							workplaceId={workplaceId}
							requests={requests}
							loading={timeOff.isLoading}
							busy={busy}
							onEdit={setEditing}
							onDelete={(requestId) => removeLeave.mutate(requestId)}
							onChanged={invalidateLeave}
						/>
					</TabsContent>

					<TabsContent value="history" className="flex min-h-0 flex-1 flex-col">
						<TableToolbar
							left={
								<>
									<TableSearch
										value={historySearch}
										onValueChange={setHistorySearch}
										placeholder="Search person or type"
									/>
									<TableFilter
										value={historyStatus}
										onValueChange={setHistoryStatus}
										items={[
											{ label: "All statuses", value: "all" },
											{ label: "Approved", value: "approved" },
											{ label: "Declined", value: "declined" },
											{ label: "Cancelled", value: "cancelled" },
										]}
										ariaLabel="Filter history by status"
									/>
								</>
							}
							right={<TablePagination {...historyPagination} />}
						/>
						<div className="min-h-0 flex-1 overflow-auto">
							<DataTable
								fill={false}
								stacked
								columns={historyColumns}
								data={historyPagination.pageRows}
								getRowId={(row) => row.id}
								empty={
									<div className="p-4">
										<Empty className="border border-dashed">
											<EmptyHeader>
												<EmptyTitle>
													{decided.length === 0
														? "No decisions yet"
														: "No matches"}
												</EmptyTitle>
												<EmptyDescription>
													{decided.length === 0
														? "Approved and declined requests will stay here."
														: "Try a different search or status."}
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</div>
								}
							/>
						</div>
					</TabsContent>

					<TabsContent value="balances" className="min-h-0 overflow-y-auto p-4">
						<BalancesPanel
							workplaceId={workplaceId}
							people={team}
							leaveTypes={types}
							balances={pto.data?.balances ?? []}
							overview={leaveBalances.data ?? []}
							overviewLoading={leaveBalances.isLoading}
							canRunAccruals={canManageSettings}
							onSaved={invalidateLeave}
						/>
					</TabsContent>

					<TabsContent
						value="encashments"
						className="min-h-0 overflow-y-auto p-4"
					>
						<EncashmentsPanel
							workplaceId={workplaceId}
							encashments={leaveEncashments.data ?? []}
							loading={leaveEncashments.isLoading}
							people={team}
							leaveTypes={types}
							onChanged={invalidateLeave}
						/>
					</TabsContent>

					<TabsContent value="forecast" className="min-h-0 overflow-y-auto p-4">
						<ForecastPanel workplaceId={workplaceId} people={team} />
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

			<LeaveImportSheet
				open={importOpen}
				onOpenChange={setImportOpen}
				workplaceId={workplaceId}
				onImported={invalidateLeave}
			/>
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
					request={
						requests.find((request) => request.id === editing.id) ?? editing
					}
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
					onChanged={invalidateLeave}
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
							{(() => {
								const declining = requests.find(
									(request) => request.id === declineId,
								);
								if (!declining) {
									return "The worker will see this decision. A reason is optional.";
								}
								return `Declining ${formatPerson(declining.worker.fullName, declining.worker.email)}’s request for ${formatLeaveRange(declining)}. The worker will see this decision.`;
							})()}
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

			<AlertDialog
				open={approvalDecline !== null}
				onOpenChange={(open) => {
					if (!open) {
						setApprovalDecline(null);
						setApprovalDeclineReason("");
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Decline this approval step?</AlertDialogTitle>
						<AlertDialogDescription>
							{approvalDecline
								? `Declining ${formatPerson(approvalDecline.worker.fullName, approvalDecline.worker.email)}’s request. This ends the approval flow and the worker will see the decision.`
								: "The worker will see this decision. A reason is optional."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Input
						id="approval-decline-reason"
						value={approvalDeclineReason}
						onChange={(event) => setApprovalDeclineReason(event.target.value)}
						placeholder="Optional reason"
						aria-label="Decline reason"
					/>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={decideApproval.isPending}
							onClick={() => {
								if (!approvalDecline) return;
								decideApproval.mutate({
									requestId: approvalDecline.requestId,
									approvalId: approvalDecline.approvalId,
									decision: "declined",
									reason: approvalDeclineReason.trim() || undefined,
								});
							}}
						>
							{decideApproval.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Decline
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={bulkDeclineOpen}
				onOpenChange={(open) => {
					if (!open) {
						setBulkDeclineOpen(false);
						setBulkDeclineReason("");
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Decline {selectedPending.length} requests?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Each affected worker will see the decision. A reason is optional
							and is shared with everyone in this batch.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Input
						id="bulk-decline-reason"
						value={bulkDeclineReason}
						onChange={(event) => setBulkDeclineReason(event.target.value)}
						placeholder="Optional reason"
						aria-label="Decline reason"
					/>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={bulkDecision.isPending}
							onClick={() =>
								bulkDecision.mutate({
									requestIds: selectedPending.map((request) => request.id),
									decision: "declined",
									reason: bulkDeclineReason.trim() || undefined,
								})
							}
						>
							{bulkDecision.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Decline all
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={expediteId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setExpediteId(null);
						setExpediteReason("");
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Expedite this emergency request?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This skips every remaining approval step, approves the request
							immediately, and records your reason against each skipped step.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Input
						id="expedite-reason"
						value={expediteReason}
						onChange={(event) => setExpediteReason(event.target.value)}
						placeholder="Reason for the emergency override"
						aria-label="Expedite reason"
					/>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={
								expedite.isPending || expediteReason.trim().length === 0
							}
							onClick={() => {
								if (!expediteId) return;
								expedite.mutate({
									requestId: expediteId,
									reason: expediteReason.trim(),
								});
							}}
						>
							{expedite.isPending ? <Spinner data-icon="inline-start" /> : null}
							Expedite
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</AppPage>
	);
}

function PendingUnavailabilityPanel({
	items,
	loading,
	busy,
	onDecide,
}: {
	items: PendingUnavailabilityDto[];
	loading: boolean;
	busy: boolean;
	onDecide: (
		unavailabilityId: string,
		decision: "approved" | "declined",
	) => void;
}) {
	const { formatMinute, formatPerson } = useDisplayPrefs();

	if (loading) {
		return (
			<div className="flex flex-col gap-3 p-4">
				<Skeleton className="h-16" />
				<Skeleton className="h-16" />
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<Empty className="border-0">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<CalendarOffIcon />
					</EmptyMedia>
					<EmptyTitle>No availability requests waiting</EmptyTitle>
					<EmptyDescription>
						Worker Unavailability that needs approval will show here.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ul className="divide-y">
			{items.map((item) => {
				const window =
					item.kind === "recurring" && item.weekday !== null
						? `Every ${WEEKDAY_NAMES[item.weekday]} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`
						: `${item.date ? formatDay(item.date) : "Date"} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`;
				return (
					<li
						key={item.id}
						className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div className="min-w-0">
							<p className="font-medium text-sm">
								{formatPerson(item.worker.fullName, item.worker.email)}
							</p>
							<p className="text-sm tabular-nums">{window}</p>
							{item.note ? (
								<p className="text-muted-foreground text-xs">{item.note}</p>
							) : null}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<ConfirmAction
								trigger="Approve"
								triggerVariant="default"
								title="Approve this unavailability?"
								description="It becomes a hard constraint that blocks scheduling during this window."
								confirmLabel="Approve"
								disabled={busy}
								onConfirm={() => onDecide(item.id, "approved")}
							/>
							<ConfirmAction
								trigger="Decline"
								triggerVariant="outline"
								title="Decline this unavailability?"
								description="The window is removed and the worker can be scheduled then."
								confirmLabel="Decline"
								destructive
								disabled={busy}
								onConfirm={() => onDecide(item.id, "declined")}
							/>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

function MyApprovalsPanel({
	items,
	loading,
	busy,
	onApprove,
	onDecline,
}: {
	items: PendingApprovalDto[];
	loading: boolean;
	busy: boolean;
	onApprove: (item: PendingApprovalDto) => void;
	onDecline: (item: PendingApprovalDto) => void;
}) {
	const { formatLeaveRange, formatPerson } = useDisplayPrefs();

	if (loading) {
		return (
			<div className="flex flex-col gap-3 p-4">
				<Skeleton className="h-20" />
				<Skeleton className="h-20" />
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<Empty className="border-0">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<CalendarOffIcon />
					</EmptyMedia>
					<EmptyTitle>No approvals waiting on you</EmptyTitle>
					<EmptyDescription>
						Requests routed to you — directly or through a delegation — will
						show here.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<ul className="divide-y">
			{items.map((item) => {
				const remainingAfter = item.remainingMinutes - item.chargeMinutes;
				const short = remainingAfter < 0;
				return (
					<li
						key={item.approvalId}
						className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div className="min-w-0">
							<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
								{formatPerson(item.worker.fullName, item.worker.email)}
								{item.isEmergency ? <EmergencyBadge /> : null}
								{item.via === "delegation" ? (
									<Badge variant="outline">Delegated to you</Badge>
								) : null}
							</p>
							<p className="text-sm tabular-nums">
								{formatLeaveRange(item)}
								{item.leaveTypeName ? ` · ${item.leaveTypeName}` : ""}
								{` · ${formatLeaveHours(item.chargeMinutes)}`}
							</p>
							<p className="text-muted-foreground text-xs">
								{short
									? `Uses ${formatLeaveHours(Math.abs(remainingAfter))} more than the ${formatLeaveHours(item.remainingMinutes)} remaining.`
									: `${formatLeaveHours(item.remainingMinutes)} remaining after this.`}
								{item.reason ? ` ${item.reason}` : ""}
							</p>
							<p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
								<span>Step {item.stepOrder + 1}</span>
								{item.escalatedAt ? (
									<Badge
										variant="outline"
										className={APPROVAL_STATUS_CLASS.escalated}
									>
										Escalated
									</Badge>
								) : item.dueAt ? (
									<span>Due {formatDateTime(item.dueAt)}</span>
								) : null}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<ConfirmAction
								trigger="Approve"
								triggerVariant="default"
								title="Approve this step?"
								description={`This approves ${formatLeaveHours(item.chargeMinutes)}${item.leaveTypeName ? ` of ${item.leaveTypeName}` : ""}. Later steps still need their approvers unless you expedite.`}
								confirmLabel="Approve"
								disabled={busy}
								onConfirm={() => onApprove(item)}
							/>
							<Button
								size="sm"
								variant="outline"
								disabled={busy}
								onClick={() => onDecline(item)}
							>
								Decline
							</Button>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

function DelegationsSection({
	workplaceId,
	people,
	delegations,
	loading,
	creating,
	busy,
	open,
	onOpenChange,
	onCreate,
	onRevoke,
}: {
	workplaceId: string | undefined;
	people: TeamMember[];
	delegations: LeaveDelegationDto[];
	loading: boolean;
	creating: boolean;
	busy: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (input: {
		delegateEmploymentId: string;
		startsAt: string;
		endsAt: string;
		reason?: string;
	}) => void;
	onRevoke: (delegationId: string) => void;
}) {
	const [delegateEmploymentId, setDelegateEmploymentId] = useState("");
	const [startsAt, setStartsAt] = useState("");
	const [endsAt, setEndsAt] = useState("");
	const [reason, setReason] = useState("");

	function nameFor(employmentId: string) {
		return (
			people.find((person) => person.employmentId === employmentId)?.name ??
			employmentId
		);
	}

	function statusFor(delegation: LeaveDelegationDto) {
		if (delegation.revokedAt) return "Revoked";
		if (new Date(delegation.endsAt).getTime() < Date.now()) return "Expired";
		return "Active";
	}

	function submit() {
		if (!delegateEmploymentId || !startsAt || !endsAt) {
			toast.error("Choose a delegate and both dates.");
			return;
		}
		const startIso = new Date(startsAt).toISOString();
		const endIso = new Date(endsAt).toISOString();
		if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
			toast.error("The delegation end must be after its start.");
			return;
		}
		onCreate({
			delegateEmploymentId,
			startsAt: startIso,
			endsAt: endIso,
			reason: reason.trim() || undefined,
		});
	}

	return (
		<div className="border-t px-4 py-4">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="font-heading font-medium text-sm">Delegations</h2>
					<p className="text-muted-foreground text-xs">
						Ask someone to cover your approval steps for a window of time.
					</p>
				</div>
				<Button size="sm" variant="outline" onClick={() => onOpenChange(true)}>
					Delegate my approvals
				</Button>
			</div>
			{loading ? (
				<Skeleton className="h-12" />
			) : delegations.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No delegations yet. You can delegate your approvals to another manager
					or worker.
				</p>
			) : (
				<ul className="divide-y rounded-lg border">
					{delegations.map((delegation) => {
						const active = statusFor(delegation) === "Active";
						return (
							<li
								key={delegation.id}
								className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="min-w-0">
									<p className="text-sm">
										<span className="font-medium">
											{nameFor(delegation.delegatorEmploymentId)}
										</span>{" "}
										<span className="text-muted-foreground">→</span>{" "}
										{nameFor(delegation.delegateEmploymentId)}
									</p>
									<p className="text-muted-foreground text-xs tabular-nums">
										{formatDateTime(delegation.startsAt)} –{" "}
										{formatDateTime(delegation.endsAt)}
									</p>
									{delegation.reason ? (
										<p className="text-muted-foreground text-xs">
											{delegation.reason}
										</p>
									) : null}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant={active ? "secondary" : "outline"}>
										{statusFor(delegation)}
									</Badge>
									{active ? (
										<ConfirmAction
											trigger="Revoke"
											triggerVariant="ghost"
											destructive
											title="Revoke this delegation?"
											description="Approvals stop routing to the delegate immediately."
											confirmLabel="Revoke"
											disabled={busy}
											onConfirm={() => onRevoke(delegation.id)}
										/>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent side="right" className="w-full sm:max-w-md">
					<SheetHeader>
						<SheetTitle>Delegate my approvals</SheetTitle>
						<SheetDescription>
							During this window, your pending approval steps are also available
							to the delegate.
						</SheetDescription>
					</SheetHeader>
					<div className="flex flex-col gap-4 overflow-y-auto px-6">
						<Field>
							<FieldLabel htmlFor="delegation-person">Delegate</FieldLabel>
							<Select
								items={people.map((person) => ({
									label:
										person.kind === "manager"
											? `${person.name} · Manager`
											: person.name,
									value: person.employmentId,
								}))}
								value={delegateEmploymentId}
								onValueChange={(value) =>
									value && setDelegateEmploymentId(value)
								}
							>
								<SelectTrigger id="delegation-person" className="w-full">
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
						</Field>
						<Field>
							<FieldLabel htmlFor="delegation-start">Starts</FieldLabel>
							<Input
								id="delegation-start"
								type="datetime-local"
								value={startsAt}
								onChange={(event) => setStartsAt(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="delegation-end">Ends</FieldLabel>
							<Input
								id="delegation-end"
								type="datetime-local"
								value={endsAt}
								onChange={(event) => setEndsAt(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="delegation-reason">
								Reason (optional)
							</FieldLabel>
							<Input
								id="delegation-reason"
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								placeholder="Annual leave, off-site…"
							/>
						</Field>
					</div>
					<SheetFooter>
						<Button disabled={creating || !workplaceId} onClick={submit}>
							{creating ? <Spinner data-icon="inline-start" /> : null}
							Delegate
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	);
}

function RequestDocuments({
	workplaceId,
	request,
	onChanged,
}: {
	workplaceId: string | undefined;
	request: TimeOffRequestDto;
	onChanged: () => void;
}) {
	const posthog = usePostHog();
	const documents = request.documents ?? [];

	const upload = useMutation({
		mutationFn: async (file: File) => {
			const form = new FormData();
			form.append("file", file);
			const response = await fetch(
				`${env.VITE_SERVER_URL}/v1/workplaces/${workplaceId}/time-off/${request.id}/documents`,
				{ method: "POST", credentials: "include", body: form },
			);
			if (!response.ok) {
				let message = `Upload failed (${response.status}).`;
				try {
					const payload = (await response.json()) as { message?: string };
					if (payload.message) message = payload.message;
				} catch {
					// keep default message
				}
				throw new Error(message);
			}
		},
		onSuccess: () => {
			posthog?.capture("leave_documents_uploaded");
			onChanged();
			toast.success("Document attached.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const remove = useMutation({
		mutationFn: (documentId: string) =>
			api(`/v1/workplaces/${workplaceId}/leave-documents/${documentId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			onChanged();
			toast.success("Document removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	async function openDocument(document: LeaveDocumentDto) {
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/v1/leave-documents/${document.id}`,
				{ credentials: "include" },
			);
			if (!response.ok) throw new Error("Couldn’t open the document.");
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			window.open(url, "_blank", "noopener,noreferrer");
			window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn’t open the document.",
			);
		}
	}

	return (
		<div className="flex flex-col gap-0.5">
			{documents.map((document) => (
				<div key={document.id} className="flex items-center gap-1">
					<Button
						size="xs"
						variant="link"
						className="h-auto max-w-[16rem] justify-start px-0 py-0"
						onClick={() => void openDocument(document)}
					>
						<PaperclipIcon data-icon="inline-start" />
						<span className="truncate">{document.fileName}</span>
					</Button>
					<Button
						size="icon-xs"
						variant="ghost"
						aria-label={`Delete ${document.fileName}`}
						disabled={remove.isPending}
						onClick={() => remove.mutate(document.id)}
					>
						<Trash2Icon />
					</Button>
				</div>
			))}
			<label className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground">
				{upload.isPending ? (
					<Spinner data-icon="inline-start" />
				) : (
					<PaperclipIcon className="size-3" />
				)}
				{documents.length > 0
					? `Attach another document · ${documents.length} attached`
					: "Attach document"}
				<input
					type="file"
					className="sr-only"
					accept=".pdf,image/*"
					disabled={upload.isPending || !workplaceId}
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) upload.mutate(file);
						event.target.value = "";
					}}
				/>
			</label>
		</div>
	);
}

function PendingRequestRow({
	workplaceId,
	request,
	busy,
	selected,
	onToggleSelect,
	onEdit,
	onDelete,
	onChanged,
	onApprove,
	onDecline,
	onExpedite,
}: {
	workplaceId: string | undefined;
	request: TimeOffRequestDto;
	busy: boolean;
	selected: boolean;
	onToggleSelect: (checked: boolean) => void;
	onEdit: () => void;
	onDelete: () => void;
	onChanged: () => void;
	onApprove: () => void;
	onDecline: () => void;
	onExpedite: () => void;
}) {
	const { formatLeaveRange, formatPerson } = useDisplayPrefs();
	const remainingAfter = request.remainingMinutes - request.chargeMinutes;
	const short = remainingAfter < 0;
	const canDecide = request.canDecide !== false;
	return (
		<li className="flex items-start gap-3 px-4 py-3">
			<Checkbox
				className="mt-1"
				aria-label={`Select ${formatPerson(request.worker.fullName, request.worker.email)}’s request`}
				checked={selected}
				onCheckedChange={(checked) => onToggleSelect(checked === true)}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
						{formatPerson(request.worker.fullName, request.worker.email)}
						{request.kind === "manager" ? (
							<span className="font-normal text-muted-foreground">
								{" "}
								· Manager
							</span>
						) : null}
						{request.isEmergency ? <EmergencyBadge /> : null}
					</p>
					<p className="text-sm tabular-nums">
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
					<div className="mt-1.5">
						<ApprovalStepChips
							approvals={request.approvals}
							currentStep={request.currentStep}
						/>
					</div>
					<div className="mt-1.5">
						<RequestDocuments
							workplaceId={workplaceId}
							request={request}
							onChanged={onChanged}
						/>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
						Edit
					</Button>
					{canDecide ? (
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
					) : (
						<div className="flex flex-col items-end gap-1">
							<Button size="sm" variant="outline" disabled>
								Approve
							</Button>
							<span className="text-muted-foreground text-xs">
								Waiting on another approver
							</span>
						</div>
					)}
					<Button
						size="sm"
						variant="outline"
						disabled={busy || !canDecide}
						onClick={onDecline}
					>
						Decline
					</Button>
					{request.isEmergency ? (
						<Button
							size="sm"
							variant="destructive"
							disabled={busy}
							onClick={onExpedite}
						>
							Expedite (emergency)
						</Button>
					) : null}
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
			</div>
		</li>
	);
}

function WhoIsOut({
	workplaceId,
	requests,
	loading,
	busy,
	onEdit,
	onDelete,
	onChanged,
}: {
	workplaceId: string | undefined;
	requests: TimeOffRequestDto[];
	loading: boolean;
	busy: boolean;
	onEdit: (request: TimeOffRequestDto) => void;
	onDelete: (requestId: string) => void;
	onChanged: () => void;
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
						<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
							{formatPerson(request.worker.fullName, request.worker.email)}
							{request.kind === "manager" ? (
								<span className="font-normal text-muted-foreground">
									{" "}
									· Manager
								</span>
							) : null}
							{request.isEmergency ? <EmergencyBadge /> : null}
						</p>
						<p className="text-sm tabular-nums">
							{formatLeaveRange(request)}
							{request.leaveTypeName ? ` · ${request.leaveTypeName}` : ""}
							{` · ${formatLeaveHours(request.chargeMinutes)}`}
						</p>
						{request.reason ? (
							<p className="text-muted-foreground text-xs">{request.reason}</p>
						) : null}
						<div className="mt-1.5">
							<RequestDocuments
								workplaceId={workplaceId}
								request={request}
								onChanged={onChanged}
							/>
						</div>
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
	overview,
	overviewLoading,
	canRunAccruals,
	onSaved,
}: {
	workplaceId: string | undefined;
	people: TeamMember[];
	leaveTypes: LeaveTypeOption[];
	balances: {
		employmentId: string;
		leaveTypeId: string;
		minutes: number;
	}[];
	overview: LeaveBalanceDto[];
	overviewLoading: boolean;
	canRunAccruals: boolean;
	onSaved: () => void;
}) {
	const [draft, setDraft] = useState<Record<string, string>>({});
	const [history, setHistory] = useState<LeaveBalanceDto | null>(null);
	const [adjust, setAdjust] = useState<LeaveBalanceDto | null>(null);
	const [transfer, setTransfer] = useState<LeaveBalanceDto | null>(null);
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

	const runAccruals = useMutation({
		mutationFn: () =>
			api<{
				accruals: {
					creditedEntries: number;
					creditedMinutes: number;
					cappedMinutes: number;
				};
				carry: { carried: number; expired: number };
			}>(`/v1/workplaces/${workplaceId}/leave-accruals/run`, {
				method: "POST",
				body: {},
			}),
		onSuccess: (result) => {
			onSaved();
			toast.success(
				`Accruals ran: ${result.accruals.creditedEntries} credits (${formatLeaveHours(result.accruals.creditedMinutes)}), ${result.carry.carried} carry-forwards, ${result.carry.expired} expired.`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const workerName = (row: LeaveBalanceDto) =>
		row.employmentName ?? row.employmentEmail;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="font-heading font-medium text-sm">
						Leave balances overview
					</h2>
					<p className="text-muted-foreground text-xs">
						Ledger totals per worker and leave type. Adjust or transfer when
						records need correcting.
					</p>
				</div>
				{canRunAccruals ? (
					<Button
						size="sm"
						variant="outline"
						disabled={runAccruals.isPending}
						onClick={() => runAccruals.mutate()}
					>
						{runAccruals.isPending ? (
							<Spinner data-icon="inline-start" />
						) : null}
						Run accruals
					</Button>
				) : null}
			</div>

			{overviewLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
				</div>
			) : overview.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No ledger activity yet. Set initial hours below or run accruals.
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border">
					<table className="w-full min-w-[56rem] border-collapse text-sm">
						<thead>
							<tr className="border-b text-left">
								<th className="px-3 py-2 font-medium">Worker</th>
								<th className="px-3 py-2 font-medium">Type</th>
								<th className="px-3 py-2 font-medium">Balance</th>
								<th className="px-3 py-2 font-medium">Accrued</th>
								<th className="px-3 py-2 font-medium">Used</th>
								<th className="px-3 py-2 font-medium">Carried</th>
								<th className="px-3 py-2 font-medium">Pending</th>
								<th className="px-3 py-2 font-medium">Encashed</th>
								<th className="px-3 py-2 text-right font-medium">Actions</th>
							</tr>
						</thead>
						<tbody>
							{overview.map((row) => (
								<tr
									key={`${row.employmentId}:${row.leaveTypeId}`}
									className="border-b last:border-b-0"
								>
									<td className="px-3 py-2">
										<span className="font-medium">{workerName(row)}</span>
										{row.employmentKind === "manager" ? (
											<span className="text-muted-foreground"> · Manager</span>
										) : null}
									</td>
									<td className="px-3 py-2">
										{row.leaveTypeName}
										{row.leaveTypePaid ? null : (
											<span className="text-muted-foreground"> · unpaid</span>
										)}
									</td>
									<td className="px-3 py-2 font-medium tabular-nums">
										{formatLeaveHours(row.balanceMinutes)}
									</td>
									<td className="px-3 py-2 text-muted-foreground tabular-nums">
										{formatLeaveHours(row.accruedMinutes)}
									</td>
									<td className="px-3 py-2 text-muted-foreground tabular-nums">
										{formatLeaveHours(row.usedMinutes)}
									</td>
									<td className="px-3 py-2 text-muted-foreground tabular-nums">
										{formatLeaveHours(row.carriedMinutes)}
									</td>
									<td className="px-3 py-2 text-muted-foreground tabular-nums">
										{formatLeaveHours(row.pendingMinutes)}
									</td>
									<td className="px-3 py-2 text-muted-foreground tabular-nums">
										{formatLeaveHours(row.encashedMinutes)}
									</td>
									<td className="px-3 py-2">
										<div className="flex flex-wrap justify-end gap-1.5">
											<Button
												size="sm"
												variant="outline"
												onClick={() => setHistory(row)}
											>
												History
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() => setAdjust(row)}
											>
												Adjust
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() => setTransfer(row)}
											>
												Transfer
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<div>
				<h3 className="mb-2 font-heading font-medium text-sm">
					Quick edit initial balances
				</h3>
				{leaveTypes.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Add a leave type first, then set hours here.
					</p>
				) : people.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Invite people before tracking balances.
					</p>
				) : (
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
															value={draft[key] ?? minutesToHoursInput(current)}
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
				)}
			</div>

			{history ? (
				<LeaveLedgerSheet
					workplaceId={workplaceId}
					row={history}
					onOpenChange={(open) => {
						if (!open) setHistory(null);
					}}
				/>
			) : null}
			{adjust ? (
				<AdjustLeaveSheet
					key={`adjust:${adjust.employmentId}:${adjust.leaveTypeId}`}
					workplaceId={workplaceId}
					row={adjust}
					leaveTypes={leaveTypes}
					onOpenChange={(open) => {
						if (!open) setAdjust(null);
					}}
					onSaved={() => {
						setAdjust(null);
						onSaved();
					}}
				/>
			) : null}
			{transfer ? (
				<TransferLeaveSheet
					key={`transfer:${transfer.employmentId}:${transfer.leaveTypeId}`}
					workplaceId={workplaceId}
					row={transfer}
					leaveTypes={leaveTypes}
					onOpenChange={(open) => {
						if (!open) setTransfer(null);
					}}
					onSaved={() => {
						setTransfer(null);
						onSaved();
					}}
				/>
			) : null}
		</div>
	);
}

function LeaveLedgerSheet({
	workplaceId,
	row,
	onOpenChange,
}: {
	workplaceId: string | undefined;
	row: LeaveBalanceDto;
	onOpenChange: (open: boolean) => void;
}) {
	const ledger = useLeaveLedger(workplaceId, row.employmentId, row.leaveTypeId);
	const workerName = row.employmentName ?? row.employmentEmail;

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>Balance history</SheetTitle>
					<SheetDescription>
						{workerName} · {row.leaveTypeName}
					</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
					<LeaveLedgerList
						entries={ledger.data}
						isLoading={ledger.isLoading}
						emptyLabel="No ledger entries for this balance yet."
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function AdjustLeaveSheet({
	workplaceId,
	row,
	leaveTypes,
	onOpenChange,
	onSaved,
}: {
	workplaceId: string | undefined;
	row: LeaveBalanceDto;
	leaveTypes: LeaveTypeOption[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const posthog = usePostHog();
	const [leaveTypeId, setLeaveTypeId] = useState(row.leaveTypeId);
	const [hours, setHours] = useState("");
	const [effectiveDate, setEffectiveDate] = useState(todayIsoDate());
	const [note, setNote] = useState("");
	const minutes = signedHoursToMinutes(hours);

	const adjust = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/leave-adjustments`, {
				method: "POST",
				body: {
					employmentId: row.employmentId,
					leaveTypeId,
					minutes,
					effectiveDate,
					note: note.trim() || undefined,
				},
			}),
		onSuccess: () => {
			posthog?.capture("leave_adjustment_saved", { minutes });
			onSaved();
			toast.success("Adjustment saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const workerName = row.employmentName ?? row.employmentEmail;

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Adjust balance</SheetTitle>
					<SheetDescription>
						{workerName} · Enter positive hours to add, negative to remove.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<Field>
						<FieldLabel htmlFor="adjust-type">Leave type</FieldLabel>
						<Select
							items={leaveTypes.map((type) => ({
								label: type.name,
								value: type.id,
							}))}
							value={leaveTypeId}
							onValueChange={(value) => value && setLeaveTypeId(value)}
						>
							<SelectTrigger id="adjust-type" className="w-full">
								<SelectValue placeholder="Choose a leave type" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{leaveTypes.map((type) => (
										<SelectItem key={type.id} value={type.id}>
											{type.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="adjust-hours">Hours (±)</FieldLabel>
						<Input
							id="adjust-hours"
							type="number"
							step="0.25"
							className="tabular-nums"
							value={hours}
							onChange={(event) => setHours(event.target.value)}
							placeholder="e.g. 2 or -1.5"
						/>
						<FieldDescription>
							{minutes === 0
								? "Enter a non-zero adjustment."
								: `Adjusts the balance by ${formatLeaveHours(Math.abs(minutes))}.`}
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="adjust-date">Effective date</FieldLabel>
						<Input
							id="adjust-date"
							type="date"
							value={effectiveDate}
							onChange={(event) => setEffectiveDate(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="adjust-note">Note (optional)</FieldLabel>
						<Input
							id="adjust-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Why this adjustment?"
						/>
					</Field>
				</div>
				<SheetFooter>
					<Button
						disabled={adjust.isPending || minutes === 0 || !leaveTypeId}
						onClick={() => adjust.mutate()}
					>
						{adjust.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save adjustment
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function TransferLeaveSheet({
	workplaceId,
	row,
	leaveTypes,
	onOpenChange,
	onSaved,
}: {
	workplaceId: string | undefined;
	row: LeaveBalanceDto;
	leaveTypes: LeaveTypeOption[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const posthog = usePostHog();
	const [fromLeaveTypeId, setFromLeaveTypeId] = useState(row.leaveTypeId);
	const [toLeaveTypeId, setToLeaveTypeId] = useState("");
	const [hours, setHours] = useState("");
	const [reason, setReason] = useState("");
	const minutes = hoursToMinutes(hours);

	const transfer = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/leave-transfers`, {
				method: "POST",
				body: {
					employmentId: row.employmentId,
					fromLeaveTypeId,
					toLeaveTypeId,
					minutes,
					reason: reason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			posthog?.capture("leave_transfer_saved", { minutes });
			onSaved();
			toast.success("Transfer saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const workerName = row.employmentName ?? row.employmentEmail;

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Transfer balance</SheetTitle>
					<SheetDescription>
						{workerName} · Moves hours between two leave types.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<Field>
						<FieldLabel htmlFor="transfer-from">From leave type</FieldLabel>
						<Select
							items={leaveTypes.map((type) => ({
								label: type.name,
								value: type.id,
							}))}
							value={fromLeaveTypeId}
							onValueChange={(value) => value && setFromLeaveTypeId(value)}
						>
							<SelectTrigger id="transfer-from" className="w-full">
								<SelectValue placeholder="Choose a leave type" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{leaveTypes.map((type) => (
										<SelectItem key={type.id} value={type.id}>
											{type.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="transfer-to">To leave type</FieldLabel>
						<Select
							items={leaveTypes.map((type) => ({
								label: type.name,
								value: type.id,
							}))}
							value={toLeaveTypeId}
							onValueChange={(value) => value && setToLeaveTypeId(value)}
						>
							<SelectTrigger id="transfer-to" className="w-full">
								<SelectValue placeholder="Choose a leave type" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{leaveTypes.map((type) => (
										<SelectItem key={type.id} value={type.id}>
											{type.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="transfer-hours">Hours</FieldLabel>
						<Input
							id="transfer-hours"
							type="number"
							min={0}
							step="0.25"
							className="tabular-nums"
							value={hours}
							onChange={(event) => setHours(event.target.value)}
							placeholder="e.g. 4"
						/>
						<FieldDescription>
							{minutes > 0
								? `Transfers ${formatLeaveHours(minutes)}.`
								: "Enter the positive hours to move."}
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="transfer-reason">Reason (optional)</FieldLabel>
						<Input
							id="transfer-reason"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Why is this transfer needed?"
						/>
					</Field>
				</div>
				<SheetFooter>
					<Button
						disabled={
							transfer.isPending ||
							minutes <= 0 ||
							!fromLeaveTypeId ||
							!toLeaveTypeId ||
							fromLeaveTypeId === toLeaveTypeId
						}
						onClick={() => transfer.mutate()}
					>
						{transfer.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save transfer
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function EncashmentsPanel({
	workplaceId,
	encashments,
	loading,
	people,
	leaveTypes,
	onChanged,
}: {
	workplaceId: string | undefined;
	encashments: LeaveEncashmentDto[];
	loading: boolean;
	people: TeamMember[];
	leaveTypes: LeaveTypeDto[];
	onChanged: () => void;
}) {
	const posthog = usePostHog();
	const [status, setStatus] = useState("all");
	const [declineTarget, setDeclineTarget] = useState<LeaveEncashmentDto | null>(
		null,
	);
	const [declineReason, setDeclineReason] = useState("");
	const [createOpen, setCreateOpen] = useState(false);

	const decide = useMutation({
		mutationFn: (input: {
			encashmentId: string;
			decision: Decision;
			reason?: string;
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/leave-encashments/${input.encashmentId}/decision`,
				{
					method: "POST",
					body: {
						decision: input.decision,
						...(input.reason ? { reason: input.reason } : {}),
					},
				},
			),
		onSuccess: (_, input) => {
			onChanged();
			setDeclineTarget(null);
			setDeclineReason("");
			posthog?.capture(
				input.decision === "approved"
					? "leave_encashment_approved"
					: "leave_encashment_declined",
				{ reason_provided: Boolean(input.reason) },
			);
			toast.success(
				input.decision === "approved"
					? "Encashment approved."
					: "Encashment declined.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const markPaid = useMutation({
		mutationFn: (encashmentId: string) =>
			api(
				`/v1/workplaces/${workplaceId}/leave-encashments/${encashmentId}/paid`,
				{ method: "POST", body: {} },
			),
		onSuccess: () => {
			onChanged();
			toast.success("Encashment marked paid.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const create = useMutation({
		mutationFn: (input: {
			employmentId: string;
			leaveTypeId: string;
			minutes: number;
			note?: string;
		}) =>
			api(`/v1/workplaces/${workplaceId}/leave-encashments`, {
				method: "POST",
				body: input,
			}),
		onSuccess: () => {
			onChanged();
			setCreateOpen(false);
			toast.success("Encashment requested.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const rows = useMemo(() => {
		if (status === "all") return encashments;
		return encashments.filter((row) => row.status === status);
	}, [encashments, status]);

	const busy = decide.isPending || markPaid.isPending;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="font-heading font-medium text-sm">
						Leave encashments
					</h2>
					<p className="text-muted-foreground text-xs">
						Approve requests to convert leave minutes into pay, then mark them
						paid.
					</p>
				</div>
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					Request encashment
				</Button>
			</div>

			<TableToolbar
				embedded
				left={
					<TableFilter
						value={status}
						onValueChange={setStatus}
						items={[
							{ label: "All statuses", value: "all" },
							{ label: "Requested", value: "requested" },
							{ label: "Approved", value: "approved" },
							{ label: "Declined", value: "declined" },
							{ label: "Paid", value: "paid" },
							{ label: "Cancelled", value: "cancelled" },
						]}
						ariaLabel="Filter encashments by status"
					/>
				}
			/>

			{loading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-16" />
					<Skeleton className="h-16" />
				</div>
			) : rows.length === 0 ? (
				<Empty className="border-0">
					<EmptyHeader>
						<EmptyTitle>No encashments</EmptyTitle>
						<EmptyDescription>
							Requests from workers, or ones you create, will show here.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ul className="divide-y rounded-lg border">
					{rows.map((encashment) => (
						<li
							key={encashment.id}
							className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="min-w-0">
								<p className="flex flex-wrap items-center gap-2 text-sm">
									<span className="font-medium">
										{encashment.employmentName ??
											encashment.employmentEmail ??
											"Worker"}
									</span>
									<Badge
										variant={
											encashment.status === "declined"
												? "destructive"
												: encashment.status === "paid"
													? "outline"
													: encashment.status === "approved"
														? "default"
														: "secondary"
										}
									>
										{encashment.status}
									</Badge>
								</p>
								<p className="text-sm tabular-nums">
									{encashment.leaveTypeName ?? "Leave"} ·{" "}
									{formatLeaveHours(encashment.minutes)} ·{" "}
									{formatCents(encashment.amountCents)}
								</p>
								<p className="text-muted-foreground text-xs tabular-nums">
									Requested {formatDateTime(encashment.createdAt)}
									{encashment.decidedAt
										? ` · Decided ${formatDateTime(encashment.decidedAt)}`
										: ""}
									{encashment.note ? ` · ${encashment.note}` : ""}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{encashment.status === "requested" ? (
									<>
										<ConfirmAction
											trigger="Approve"
											triggerVariant="default"
											title="Approve this encashment?"
											description={`This encashes ${formatLeaveHours(encashment.minutes)} of ${encashment.leaveTypeName ?? "leave"}.`}
											confirmLabel="Approve"
											disabled={busy}
											onConfirm={() =>
												decide.mutate({
													encashmentId: encashment.id,
													decision: "approved",
												})
											}
										/>
										<Button
											size="sm"
											variant="outline"
											disabled={busy}
											onClick={() => {
												setDeclineReason("");
												setDeclineTarget(encashment);
											}}
										>
											Decline
										</Button>
									</>
								) : null}
								{encashment.status === "approved" ? (
									<ConfirmAction
										trigger="Mark paid"
										triggerVariant="default"
										title="Mark this encashment paid?"
										description="Use this after the payout has been processed."
										confirmLabel="Mark paid"
										disabled={busy}
										onConfirm={() => markPaid.mutate(encashment.id)}
									/>
								) : null}
							</div>
						</li>
					))}
				</ul>
			)}

			<AlertDialog
				open={declineTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeclineTarget(null);
						setDeclineReason("");
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Decline this encashment?</AlertDialogTitle>
						<AlertDialogDescription>
							{declineTarget
								? `${declineTarget.employmentName ?? declineTarget.employmentEmail ?? "The worker"} will see this decision. A reason is optional.`
								: "The worker will see this decision. A reason is optional."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Input
						id="encashment-decline-reason"
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
								if (!declineTarget) return;
								decide.mutate({
									encashmentId: declineTarget.id,
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

			<EncashmentRequestSheet
				open={createOpen}
				onOpenChange={setCreateOpen}
				people={people}
				leaveTypes={leaveTypes}
				creating={create.isPending}
				onSubmit={(input) => create.mutate(input)}
			/>
		</div>
	);
}

function EncashmentRequestSheet({
	open,
	onOpenChange,
	people,
	leaveTypes,
	creating,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	people: TeamMember[];
	leaveTypes: LeaveTypeDto[];
	creating: boolean;
	onSubmit: (input: {
		employmentId: string;
		leaveTypeId: string;
		minutes: number;
		note?: string;
	}) => void;
}) {
	const [employmentId, setEmploymentId] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [hours, setHours] = useState("");
	const [note, setNote] = useState("");
	const eligible = leaveTypes.filter((type) => type.policy?.encashmentEnabled);
	const minutes = hoursToMinutes(hours);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Request encashment</SheetTitle>
					<SheetDescription>
						Creates a requested encashment for a worker. It deducts minutes when
						approved.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<Field>
						<FieldLabel htmlFor="encash-person">Worker</FieldLabel>
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
							<SelectTrigger id="encash-person" className="w-full">
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
					</Field>
					<Field>
						<FieldLabel htmlFor="encash-type">Leave type</FieldLabel>
						{eligible.length === 0 ? (
							<FieldDescription>
								No leave type has encashment enabled. Turn it on in leave policy
								settings first.
							</FieldDescription>
						) : (
							<Select
								items={eligible.map((type) => ({
									label: type.name,
									value: type.id,
								}))}
								value={leaveTypeId}
								onValueChange={(value) => value && setLeaveTypeId(value)}
							>
								<SelectTrigger id="encash-type" className="w-full">
									<SelectValue placeholder="Choose a leave type" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{eligible.map((type) => (
											<SelectItem key={type.id} value={type.id}>
												{type.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						)}
					</Field>
					<Field>
						<FieldLabel htmlFor="encash-hours">Hours</FieldLabel>
						<Input
							id="encash-hours"
							type="number"
							min={0}
							step="0.25"
							className="tabular-nums"
							value={hours}
							onChange={(event) => setHours(event.target.value)}
							placeholder="e.g. 8"
						/>
						<FieldDescription>
							{minutes > 0
								? `Encashes ${formatLeaveHours(minutes)}.`
								: "Enter the hours to encash."}
						</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="encash-note">Note (optional)</FieldLabel>
						<Input
							id="encash-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
							placeholder="Payroll note…"
						/>
					</Field>
				</div>
				<SheetFooter>
					<Button
						disabled={
							creating ||
							!employmentId ||
							!leaveTypeId ||
							minutes <= 0 ||
							eligible.length === 0
						}
						onClick={() =>
							onSubmit({
								employmentId,
								leaveTypeId,
								minutes,
								note: note.trim() || undefined,
							})
						}
					>
						{creating ? <Spinner data-icon="inline-start" /> : null}
						Request encashment
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function ForecastPanel({
	workplaceId,
	people,
}: {
	workplaceId: string | undefined;
	people: TeamMember[];
}) {
	const [employmentId, setEmploymentId] = useState("");
	const [months, setMonths] = useState(12);
	const forecast = useLeaveForecast(
		workplaceId,
		employmentId || undefined,
		months,
	);

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h2 className="font-heading font-medium text-sm">Leave forecast</h2>
				<p className="text-muted-foreground text-xs">
					Projected balance by month, including accruals and planned approved
					usage.
				</p>
			</div>
			<div className="flex flex-wrap items-end gap-3">
				<Field className="w-64">
					<FieldLabel htmlFor="forecast-person">Worker</FieldLabel>
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
						<SelectTrigger id="forecast-person" className="w-full">
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
				</Field>
				<Field className="w-40">
					<FieldLabel htmlFor="forecast-months">Horizon</FieldLabel>
					<Select
						items={[
							{ label: "6 months", value: "6" },
							{ label: "12 months", value: "12" },
							{ label: "24 months", value: "24" },
						]}
						value={String(months)}
						onValueChange={(value) => value && setMonths(Number(value))}
					>
						<SelectTrigger id="forecast-months" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="6">6 months</SelectItem>
								<SelectItem value="12">12 months</SelectItem>
								<SelectItem value="24">24 months</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
			</div>

			{!employmentId ? (
				<p className="text-muted-foreground text-sm">
					Choose a worker to see their leave forecast.
				</p>
			) : (
				<LeaveForecastTable
					forecast={forecast.data}
					isLoading={forecast.isLoading}
				/>
			)}
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
	leaveTypes: LeaveTypeOption[];
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
	const [isEmergency, setIsEmergency] = useState(false);

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
					isEmergency,
				},
			}),
		onSuccess: () => {
			onSaved();
			onOpenChange(false);
			setReason("");
			setIsEmergency(false);
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
						isEmergency={isEmergency}
						onIsEmergencyChange={setIsEmergency}
					/>
					<FieldDescription>
						Supporting documents can be attached from the request list after
						recording.
					</FieldDescription>
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
	leaveTypes: LeaveTypeOption[];
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
	const [isEmergency, setIsEmergency] = useState(false);

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
					isEmergency,
				},
			}),
		onSuccess: () => {
			onSaved();
			onOpenChange(false);
			setReason("");
			setIsEmergency(false);
			posthogLeave?.capture("time_off_requested", {
				all_day: allDay,
				has_leave_type: Boolean(leaveTypeId),
				has_reason: Boolean(reason.trim()),
				is_emergency: isEmergency,
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
						isEmergency={isEmergency}
						onIsEmergencyChange={setIsEmergency}
					/>
				</div>
				<SheetFooter>
					<Button
						disabled={
							request.isPending || !employmentId || !leaveTypeId || charge <= 0
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
	onChanged,
}: {
	request: TimeOffRequestDto;
	onOpenChange: (open: boolean) => void;
	workplaceId: string | undefined;
	leaveTypes: LeaveTypeOption[];
	balances: {
		employmentId: string;
		leaveTypeId: string;
		minutes: number;
	}[];
	onSaved: () => void;
	onChanged: () => void;
}) {
	const { formatPerson } = useDisplayPrefs();
	const [leaveTypeId, setLeaveTypeId] = useState(request.leaveTypeId ?? "");
	const [startDate, setStartDate] = useState(request.startDate);
	const [endDate, setEndDate] = useState(request.endDate);
	const [allDay, setAllDay] = useState(request.allDay);
	const [startMinute, setStartMinute] = useState(request.startMinute ?? 9 * 60);
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
					<RequestDocuments
						workplaceId={workplaceId}
						request={request}
						onChanged={onChanged}
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
