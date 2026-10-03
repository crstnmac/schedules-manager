import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Label } from "@SchedulesManager/ui/components/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PaperclipIcon, XIcon } from "lucide-react";
import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable } from "@/components/data-table";
import { ListToolbar, useListView } from "@/components/list-view";
import { api } from "@/lib/api";
import { formatLeaveHours } from "@/lib/leave";
import type { LeaveTypeDto, WorkerConstraints } from "@/lib/queries";
import { useStablePrefs } from "../-shared/use-stable-prefs";
import {
	deleteLeaveDocumentFile,
	formatFileSize,
	leavePolicySummary,
	openLeaveDocumentFile,
	TIME_OFF_FILTERS,
	TIME_OFF_SORTS,
	type TimeOffRow,
	timeOffHelper,
	timeOffId,
	uploadLeaveDocumentFile,
} from "./shared";

const loadEditSheet = () => import("./edit-leave-sheet");
const WorkerEditLeaveSheet = lazy(loadEditSheet);
const loadEncashSheet = () => import("./encash-sheet");
const EncashSheet = lazy(loadEncashSheet);

const NO_TIME_OFF: TimeOffRow[] = [];
const NO_LEAVE_TYPES: LeaveTypeDto[] = [];
const NO_BALANCES: { leaveTypeId: string; name: string; minutes: number }[] =
	[];
const TIME_OFF_DEFAULT_SORT = { id: "when", direction: "desc" } as const;

/**
 * Cancelling flips the row to "cancelled" straight away and rolls back if the
 * server refuses, so the table responds instantly.
 */
function useCancelRequest({
	workplaceId,
	path,
	method,
	successMessage,
}: {
	workplaceId: string | undefined;
	path: (id: string) => string;
	method: "DELETE" | "POST";
	successMessage: string;
}) {
	const queryClient = useQueryClient();
	const key = useMemo(() => ["constraints", workplaceId], [workplaceId]);
	return useMutation({
		mutationFn: (id: string) => api(path(id), { method }),
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<WorkerConstraints>(key);
			if (previous) {
				queryClient.setQueryData<WorkerConstraints>(key, {
					...previous,
					timeOff: previous.timeOff.map((row) =>
						row.id === id ? { ...row, status: "cancelled" } : row,
					),
				});
			}
			return { previous };
		},
		onSuccess: () => {
			toast.success(successMessage);
		},
		onError: (error, _id, context) => {
			if (context?.previous) queryClient.setQueryData(key, context.previous);
			toast.error((error as Error).message);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: key });
		},
	});
}

export const TimeOffCard = memo(function TimeOffCard({
	workplaceId,
	canRequestTimeOff,
	timeOffRows,
	timeZone,
	leaveTypes,
	balances,
}: {
	workplaceId: string | undefined;
	canRequestTimeOff: boolean;
	timeOffRows: TimeOffRow[] | undefined;
	timeZone: string | undefined;
	leaveTypes: LeaveTypeDto[] | undefined;
	balances:
		| { leaveTypeId: string; name: string; minutes: number }[]
		| undefined;
}) {
	const { formatLeaveRange } = useStablePrefs();
	const queryClient = useQueryClient();
	const rows = timeOffRows ?? NO_TIME_OFF;
	const types = leaveTypes ?? NO_LEAVE_TYPES;
	const balanceList = balances ?? NO_BALANCES;
	const [encashOpen, setEncashOpen] = useState(false);
	const [encashMounted, setEncashMounted] = useState(false);
	const [editing, setEditing] = useState<TimeOffRow | null>(null);

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ["constraints", workplaceId] });
	}, [queryClient, workplaceId]);

	const cancelTimeOff = useCancelRequest({
		workplaceId,
		path: (id) => `/v1/workplaces/${workplaceId}/my/time-off/${id}`,
		method: "DELETE",
		successMessage: "Request cancelled.",
	});
	const cancelApprovedTimeOff = useCancelRequest({
		workplaceId,
		path: (id) => `/v1/workplaces/${workplaceId}/my/time-off/${id}/cancel`,
		method: "POST",
		successMessage: "Request cancelled. Any charged balance was restored.",
	});
	const uploadDocument = useMutation({
		mutationFn: (input: { requestId: string; file: File }) =>
			uploadLeaveDocumentFile(workplaceId ?? "", input.requestId, input.file),
		onSuccess: () => {
			invalidate();
			toast.success("Document attached.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const deleteDocument = useMutation({
		mutationFn: (documentId: string) =>
			deleteLeaveDocumentFile(workplaceId ?? "", documentId),
		onSuccess: () => {
			invalidate();
			toast.success("Document removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});
	const cancelMutate = cancelTimeOff.mutate;
	const cancelPending = cancelTimeOff.isPending;
	const cancelApprovedMutate = cancelApprovedTimeOff.mutate;
	const cancelApprovedPending = cancelApprovedTimeOff.isPending;
	const uploadMutate = uploadDocument.mutate;
	const uploadPending = uploadDocument.isPending;
	const deleteMutate = deleteDocument.mutate;
	const deletePending = deleteDocument.isPending;

	const encashableBalances = useMemo(
		() =>
			balanceList.flatMap((balance) => {
				const type = types.find((entry) => entry.id === balance.leaveTypeId);
				if (!type?.policy?.encashmentEnabled || balance.minutes <= 0) {
					return [];
				}
				return [{ balance, type }];
			}),
		[balanceList, types],
	);

	const typeNames = useMemo(
		() => new Map(types.map((type) => [type.id, type.name])),
		[types],
	);
	const search = useCallback(
		(row: TimeOffRow) => [
			formatLeaveRange(row),
			row.leaveTypeId ? typeNames.get(row.leaveTypeId) : undefined,
			row.reason,
			row.decisionReason,
		],
		[formatLeaveRange, typeNames],
	);
	const list = useListView<TimeOffRow>({
		rows,
		getRowId: timeOffId,
		search,
		filters: TIME_OFF_FILTERS,
		sorts: TIME_OFF_SORTS,
		defaultSort: TIME_OFF_DEFAULT_SORT,
	});

	const columns = useMemo(
		() =>
			timeOffHelper.columns([
				timeOffHelper.accessor(
					(row) =>
						`${formatLeaveRange(row)} · ${formatLeaveHours(row.chargeMinutes)}`,
					{
						id: "when",
						header: "When",
						cell: ({ getValue }) => (
							<span className="font-medium">{getValue()}</span>
						),
					},
				),
				timeOffHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => {
						const status = getValue();
						return (
							<Badge
								className="uppercase"
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
				timeOffHelper.accessor(
					(row) =>
						[
							row.leaveTypeId ? typeNames.get(row.leaveTypeId) : undefined,
							row.isEmergency ? "Emergency" : null,
							row.reason,
							row.decisionReason,
						]
							.filter(Boolean)
							.join(" · "),
					{
						id: "details",
						header: "Details",
						cell: ({ getValue }) => (
							<span className="text-muted-foreground">{getValue() || "—"}</span>
						),
					},
				),
				timeOffHelper.display({
					id: "documents",
					header: "Documents",
					enableSorting: false,
					cell: ({ row }) => {
						const request = row.original;
						const documents = request.documents ?? [];
						const attachable =
							request.status === "pending" || request.status === "approved";
						return (
							<div className="flex min-w-36 flex-col gap-1.5">
								{documents.length > 0 ? (
									<div className="flex flex-wrap gap-1">
										{documents.map((document) => (
											<span
												key={document.id}
												className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
											>
												<Button
													type="button"
													variant="link"
													size="sm"
													className="max-w-40 truncate px-0"
													onClick={() =>
														void openLeaveDocumentFile(document.id).catch(
															(error) => toast.error((error as Error).message),
														)
													}
												>
													{document.fileName}
												</Button>
												<span className="text-muted-foreground tabular-nums">
													{formatFileSize(document.sizeBytes)}
												</span>
												<Button
													type="button"
													aria-label={`Delete ${document.fileName}`}
													variant="ghost"
													size="icon-sm"
													disabled={deletePending}
													onClick={() => deleteMutate(document.id)}
												>
													<XIcon />
												</Button>
											</span>
										))}
									</div>
								) : (
									<span className="text-muted-foreground text-xs">
										No documents
									</span>
								)}
								{attachable ? (
									<Label className="w-fit cursor-pointer">
										<PaperclipIcon className="size-3" />
										<span>{uploadPending ? "Uploading…" : "Attach"}</span>
										<input
											type="file"
											accept=".pdf,image/*"
											className="sr-only"
											disabled={uploadPending}
											onChange={(event) => {
												const file = event.target.files?.[0];
												event.target.value = "";
												if (!file) return;
												uploadMutate({
													requestId: request.id,
													file,
												});
											}}
										/>
									</Label>
								) : null}
							</div>
						);
					},
				}),
				timeOffHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => {
						const request = row.original;
						if (request.status === "pending") {
							return (
								<div className="flex flex-wrap items-center justify-end gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={() => setEditing(request)}
									>
										Edit
									</Button>
									<ConfirmAction
										trigger="Cancel request"
										triggerVariant="ghost"
										title="Cancel this time-off request?"
										description="Your manager will no longer review this request. You can submit a new one later."
										confirmLabel="Cancel request"
										destructive
										disabled={cancelPending}
										onConfirm={() => cancelMutate(request.id)}
									/>
								</div>
							);
						}
						if (request.status === "approved") {
							return (
								<div className="flex justify-end">
									<ConfirmAction
										trigger="Cancel request"
										triggerVariant="ghost"
										title="Cancel this approved time off?"
										description="Your manager will see the cancellation and any charged balance will be restored."
										confirmLabel="Cancel request"
										destructive
										disabled={cancelApprovedPending}
										onConfirm={() => cancelApprovedMutate(request.id)}
									/>
								</div>
							);
						}
						return null;
					},
				}),
			]),
		[
			cancelApprovedMutate,
			cancelApprovedPending,
			cancelMutate,
			cancelPending,
			deleteMutate,
			deletePending,
			formatLeaveRange,
			typeNames,
			uploadMutate,
			uploadPending,
		],
	);

	const openEncash = useCallback(() => {
		setEncashMounted(true);
		setEncashOpen(true);
	}, []);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Your requests</CardTitle>
					<CardDescription>
						{canRequestTimeOff
							? "All-day by default. Your manager reviews every request before it blocks the schedule."
							: "This Workplace is not accepting Time-off Requests from workers. Ask a manager to record time off."}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{balanceList.length > 0 ? (
						<div className="flex flex-wrap items-start gap-3">
							{balanceList.map((balance) => {
								const type = types.find(
									(entry) => entry.id === balance.leaveTypeId,
								);
								const chips = type?.policy
									? leavePolicySummary(type.policy)
									: [];
								return (
									<div
										key={balance.leaveTypeId}
										className="flex flex-col gap-1"
									>
										<Badge variant="outline">
											{balance.name}: {formatLeaveHours(balance.minutes)}
										</Badge>
										{chips.length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{chips.map((chip) => (
													<Badge
														key={chip}
														variant="secondary"
														className="font-normal text-xs"
													>
														{chip}
													</Badge>
												))}
											</div>
										) : null}
									</div>
								);
							})}
							{encashableBalances.length > 0 ? (
								<Button
									size="sm"
									variant="outline"
									onClick={openEncash}
									onPointerEnter={() => void loadEncashSheet()}
								>
									Encash
								</Button>
							) : null}
						</div>
					) : null}
					<ListToolbar
						embedded
						list={list}
						searchPlaceholder="Search requests"
					/>
					<DataTable
						stacked
						bounded
						fill={false}
						columns={columns}
						list={list}
						data={list.pagination.pageRows}
						getRowId={timeOffId}
						empty={
							<p className="text-muted-foreground text-sm">
								{rows.length === 0
									? "No time-off requests yet."
									: "No requests match your search or filter."}
							</p>
						}
					/>
				</CardContent>
			</Card>
			{encashMounted ? (
				<Suspense fallback={null}>
					<EncashSheet
						open={encashOpen}
						onOpenChange={setEncashOpen}
						workplaceId={workplaceId}
						encashableBalances={encashableBalances}
					/>
				</Suspense>
			) : null}
			{editing ? (
				<Suspense fallback={null}>
					<WorkerEditLeaveSheet
						key={editing.id}
						request={editing}
						workplaceId={workplaceId}
						timeZone={timeZone}
						leaveTypes={types}
						balances={balanceList}
						onOpenChange={(open) => {
							if (!open) setEditing(null);
						}}
						onSaved={() => {
							setEditing(null);
							invalidate();
						}}
					/>
				</Suspense>
			) : null}
		</>
	);
});
