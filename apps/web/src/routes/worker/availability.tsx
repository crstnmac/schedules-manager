import { env } from "@SchedulesManager/env/web";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
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
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CopyIcon, PaperclipIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppPage, AppPageBody, AppPageHeader } from "@/components/app-page";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { DatePicker } from "@/components/date-picker";
import { FormSheet } from "@/components/form-sheet";
import { LeaveForecastTable } from "@/components/leave-forecast-table";
import {
	LeaveWindowFields,
	leaveChargeMinutes,
} from "@/components/leave-window-fields";
import {
	TableFilter,
	TablePagination,
	TableSearch,
	TableToolbar,
	useTablePagination,
} from "@/components/table-toolbar";
import { TimePicker } from "@/components/time-picker";
import { UnsavedChangesGuard } from "@/components/unsaved-changes";
import { api } from "@/lib/api";
import { formatLeaveHours, hoursToMinutes, todayIsoDate } from "@/lib/leave";
import {
	type LeavePolicyDto,
	useCalendarTokens,
	useCreateMyCalendarToken,
	useLeaveForecast,
	useLeaveTypes,
	useMe,
	useMyConstraints,
	usePtoBalances,
	useRevokeCalendarToken,
	type WorkerConstraints,
} from "@/lib/queries";
import { formatDay, WEEKDAY_NAMES } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

const WEEKDAY_ITEMS = WEEKDAY_NAMES.map((name, index) => ({
	label: name,
	value: String(index),
}));

const RECURRENCE_ITEMS = [
	{ label: "Weekly", value: "weekly" },
	{ label: "Every 2 weeks", value: "biweekly" },
	{ label: "Monthly", value: "monthly" },
] as const;

export const Route = createFileRoute("/worker/availability")({
	component: AvailabilityPage,
});

interface RecurringWindow {
	id: string;
	weekday: number;
	startMinute: number;
	endMinute: number;
	note?: string;
	status?: "pending" | "approved";
}

interface DateWindow {
	id: string;
	date: string;
	startMinute: number;
	endMinute: number;
	note?: string;
	status?: "pending" | "approved";
}

type ServerUnavailability = WorkerConstraints["unavailability"][number] & {
	status?: "pending" | "approved";
};

type UnavailabilityRow = {
	id: string;
	kind: "weekly" | "date";
	window: string;
	status: "pending" | "approved";
	note: string | null;
};

type LeaveRequestMode = "single" | "multiple" | "recurring";

type LeaveRecurrenceFrequency = "weekly" | "biweekly" | "monthly";

type LeaveWindowRow = {
	id: string;
	startDate: string;
	endDate: string;
};

const unavailabilityHelper = createDataColumnHelper<UnavailabilityRow>();
const timeOffHelper =
	createDataColumnHelper<WorkerConstraints["timeOff"][number]>();

function windowId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFileSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function leavePolicySummary(policy: LeavePolicyDto): string[] {
	const chips: string[] = [];
	if (policy.accrualMethod === "per_hour_worked") {
		chips.push(
			`Accrues ${formatLeaveHours(policy.accrualMinutes)} per ${policy.accrualPerHoursWorked}h worked`,
		);
	} else if (policy.accrualMethod !== "none") {
		const period =
			policy.accrualMethod === "weekly"
				? "weekly"
				: policy.accrualMethod === "biweekly"
					? "every 2 weeks"
					: policy.accrualMethod === "semimonthly"
						? "twice a month"
						: policy.accrualMethod === "monthly"
							? "monthly"
							: "yearly";
		chips.push(`Accrues ${formatLeaveHours(policy.accrualMinutes)} ${period}`);
	}
	if (policy.maxBalanceMinutes != null) {
		chips.push(`Caps at ${formatLeaveHours(policy.maxBalanceMinutes)}`);
	}
	if (policy.carryForwardEnabled) {
		chips.push(
			policy.maxCarryForwardMinutes != null
				? `Carries up to ${formatLeaveHours(policy.maxCarryForwardMinutes)}`
				: "Carry-over enabled",
		);
	}
	if (policy.encashmentEnabled) chips.push("Encashable");
	return chips;
}

async function uploadLeaveDocumentFile(
	workplaceId: string,
	requestId: string,
	file: File,
) {
	const formData = new FormData();
	formData.append("file", file);
	const response = await fetch(
		`${env.VITE_SERVER_URL}/v1/workplaces/${workplaceId}/time-off/${requestId}/documents`,
		{
			method: "POST",
			credentials: "include",
			body: formData,
		},
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
	return (await response.json()) as {
		document: {
			id: string;
			fileName: string;
			mimeType: string;
			sizeBytes: number;
		};
	};
}

async function deleteLeaveDocumentFile(
	workplaceId: string,
	documentId: string,
) {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/v1/workplaces/${workplaceId}/leave-documents/${documentId}`,
		{ method: "DELETE", credentials: "include" },
	);
	if (!response.ok) {
		let message = `Couldn’t remove the document (${response.status}).`;
		try {
			const payload = (await response.json()) as { message?: string };
			if (payload.message) message = payload.message;
		} catch {
			// keep default message
		}
		throw new Error(message);
	}
}

async function openLeaveDocumentFile(documentId: string) {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/v1/leave-documents/${documentId}`,
		{ credentials: "include" },
	);
	if (!response.ok) {
		throw new Error(`Couldn’t open the document (${response.status}).`);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	window.open(url, "_blank", "noopener,noreferrer");
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function AvailabilityPage() {
	const { workplace, employmentId: membershipEmploymentId } = useWorkplace();
	const { formatMinute, formatLeaveRange } = useDisplayPrefs();
	const canRequestTimeOff =
		workplace?.policies.workersCanRequestTimeOff ?? true;
	const constraints = useMyConstraints(workplace?.id);
	const me = useMe();
	const leaveTypes = useLeaveTypes(workplace?.id);
	const workerEmploymentId = me.data?.employments.find(
		(employment) =>
			employment.kind === "worker" && employment.workplace.id === workplace?.id,
	)?.id;
	const employmentId =
		workerEmploymentId ?? membershipEmploymentId ?? undefined;
	const pto = usePtoBalances(workplace?.id, employmentId);
	const queryClient = useQueryClient();

	const [recurring, setRecurring] = useState<RecurringWindow[]>([]);
	const [dates, setDates] = useState<DateWindow[]>([]);
	const [preference, setPreference] = useState("");
	const [weekday, setWeekday] = useState(0);
	const [recurringStart, setRecurringStart] = useState(8 * 60);
	const [recurringEnd, setRecurringEnd] = useState(14 * 60);
	const [recurringNote, setRecurringNote] = useState("");
	const [timeOffSearch, setTimeOffSearch] = useState("");
	const [timeOffStatus, setTimeOffStatus] = useState("all");
	const [unavailabilitySearch, setUnavailabilitySearch] = useState("");
	const [date, setDate] = useState("");
	const [dateStart, setDateStart] = useState(8 * 60);
	const [dateEnd, setDateEnd] = useState(14 * 60);
	const [dateNote, setDateNote] = useState("");
	const [offStartDate, setOffStartDate] = useState(todayIsoDate);
	const [offEndDate, setOffEndDate] = useState(todayIsoDate);
	const [offAllDay, setOffAllDay] = useState(true);
	const [offStart, setOffStart] = useState(9 * 60);
	const [offEnd, setOffEnd] = useState(17 * 60);
	const [offReason, setOffReason] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [requestMode, setRequestMode] = useState<LeaveRequestMode>("single");
	const [extraWindows, setExtraWindows] = useState<LeaveWindowRow[]>([]);
	const [recurrenceFrequency, setRecurrenceFrequency] =
		useState<LeaveRecurrenceFrequency>("weekly");
	const [recurrenceCount, setRecurrenceCount] = useState(4);
	const [offEmergency, setOffEmergency] = useState(false);
	const [encashOpen, setEncashOpen] = useState(false);
	const [encashLeaveTypeId, setEncashLeaveTypeId] = useState("");
	const [encashHours, setEncashHours] = useState("");
	const [encashNote, setEncashNote] = useState("");
	const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
	const [forecastMonths, setForecastMonths] = useState(6);
	const [editing, setEditing] = useState<
		WorkerConstraints["timeOff"][number] | null
	>(null);
	const [requestOpen, setRequestOpen] = useState(false);

	const forecast = useLeaveForecast(
		workplace?.id,
		employmentId,
		forecastMonths,
	);
	const calendarTokens = useCalendarTokens(workplace?.id);
	const createCalendarToken = useCreateMyCalendarToken(workplace?.id);
	const revokeCalendarToken = useRevokeCalendarToken(workplace?.id);

	const savedSnapshot = useRef<string | null>(null);

	useEffect(() => {
		const data = constraints.data;
		if (!data) return;
		const windows = data.unavailability as ServerUnavailability[];
		const nextRecurring = windows
			.filter((row) => row.kind === "recurring")
			.map((row) => ({
				id: row.id,
				weekday: row.weekday ?? 0,
				startMinute: row.startMinute,
				endMinute: row.endMinute,
				note: row.note ?? undefined,
				status: row.status,
			}));
		const nextDates = windows
			.filter((row) => row.kind === "date")
			.map((row) => ({
				id: row.id,
				date: row.date ?? "",
				startMinute: row.startMinute,
				endMinute: row.endMinute,
				note: row.note ?? undefined,
				status: row.status,
			}));
		const nextPreference = data.preference ?? "";
		setRecurring(nextRecurring);
		setDates(nextDates);
		setPreference(nextPreference);
		savedSnapshot.current = JSON.stringify({
			recurring: nextRecurring,
			dates: nextDates,
			preference: nextPreference,
		});
	}, [constraints.data]);

	function invalidate() {
		queryClient.invalidateQueries({
			queryKey: ["constraints", workplace?.id],
		});
	}

	const saveUnavailability = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/my/unavailability`, {
				method: "PUT",
				body: {
					recurring: recurring.map(
						({ weekday, startMinute, endMinute, note }) => ({
							weekday,
							startMinute,
							endMinute,
							note,
						}),
					),
					dates: dates.map(({ date, startMinute, endMinute, note }) => ({
						date,
						startMinute,
						endMinute,
						note,
					})),
				},
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Unavailability saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const savePreference = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/my/preference`, {
				method: "PUT",
				body: { note: preference.trim() === "" ? null : preference.trim() },
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Preference saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const unavailabilityDirty =
		savedSnapshot.current !== null &&
		JSON.stringify({ recurring, dates, preference }) !== savedSnapshot.current;

	const requestTimeOff = useMutation({
		mutationFn: () => {
			const baseWindow = {
				startDate: offStartDate,
				endDate: offEndDate || offStartDate,
				allDay: offAllDay,
				...(offAllDay ? {} : { startMinute: offStart, endMinute: offEnd }),
				reason: offReason.trim() || undefined,
				leaveTypeId,
			};
			if (requestMode === "multiple") {
				const windows = [
					{
						id: "primary",
						startDate: offStartDate,
						endDate: offEndDate || offStartDate,
					},
					...extraWindows,
				];
				if (windows.some((row) => !row.startDate)) {
					throw new Error("Choose a start date for every window.");
				}
				return api<{ requests: { id: string }[] }>(
					`/v1/workplaces/${workplace?.id}/my/time-off`,
					{
						method: "POST",
						body: {
							windows: windows.map((row) => ({
								...baseWindow,
								startDate: row.startDate,
								endDate: row.endDate || row.startDate,
							})),
							isEmergency: offEmergency,
						},
					},
				);
			}
			if (requestMode === "recurring") {
				return api<{ requests: { id: string }[] }>(
					`/v1/workplaces/${workplace?.id}/my/time-off`,
					{
						method: "POST",
						body: {
							windows: [baseWindow],
							recurrence: {
								frequency: recurrenceFrequency,
								count: recurrenceCount,
							},
							isEmergency: offEmergency,
						},
					},
				);
			}
			if (!offStartDate) {
				throw new Error("Choose a start date.");
			}
			return api<{ requests: { id: string }[] }>(
				`/v1/workplaces/${workplace?.id}/my/time-off`,
				{
					method: "POST",
					body: { ...baseWindow, isEmergency: offEmergency },
				},
			);
		},
		onSuccess: (result) => {
			const count = result.requests?.length ?? 1;
			setOffStartDate(todayIsoDate());
			setOffEndDate(todayIsoDate());
			setOffReason("");
			setExtraWindows([]);
			setOffEmergency(false);
			invalidate();
			toast.success(
				count > 1
					? `${count} time-off requests submitted. Your manager will review them.`
					: "Time off requested. Your manager will review it.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const cancelTimeOff = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/workplaces/${workplace?.id}/my/time-off/${id}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Request cancelled.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const cancelApprovedTimeOff = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/workplaces/${workplace?.id}/my/time-off/${id}/cancel`, {
				method: "POST",
			}),
		onSuccess: () => {
			invalidate();
			toast.success("Request cancelled. Any charged balance was restored.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const uploadDocument = useMutation({
		mutationFn: (input: { requestId: string; file: File }) =>
			uploadLeaveDocumentFile(workplace?.id ?? "", input.requestId, input.file),
		onSuccess: () => {
			invalidate();
			toast.success("Document attached.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const deleteDocument = useMutation({
		mutationFn: (documentId: string) =>
			deleteLeaveDocumentFile(workplace?.id ?? "", documentId),
		onSuccess: () => {
			invalidate();
			toast.success("Document removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const requestEncashment = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplace?.id}/my/leave-encashments`, {
				method: "POST",
				body: {
					leaveTypeId: encashLeaveTypeId,
					minutes: hoursToMinutes(encashHours),
					note: encashNote.trim() || undefined,
				},
			}),
		onSuccess: () => {
			setEncashOpen(false);
			setEncashLeaveTypeId("");
			setEncashHours("");
			setEncashNote("");
			queryClient.invalidateQueries({ queryKey: ["pto", workplace?.id] });
			queryClient.invalidateQueries({
				queryKey: ["constraints", workplace?.id],
			});
			toast.success("Encashment requested. A manager will review it.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const selectedLeaveType = leaveTypes.data?.leaveTypes.find(
		(type) => type.id === leaveTypeId,
	);
	const encashableBalances = useMemo(
		() =>
			(pto.data?.balances ?? []).flatMap((balance) => {
				const type = leaveTypes.data?.leaveTypes.find(
					(entry) => entry.id === balance.leaveTypeId,
				);
				if (!type?.policy?.encashmentEnabled || balance.minutes <= 0) {
					return [];
				}
				return [{ balance, type }];
			}),
		[leaveTypes.data?.leaveTypes, pto.data?.balances],
	);

	const myCalendarTokens = (calendarTokens.data ?? []).filter(
		(token) =>
			token.employmentId === membershipEmploymentId && !token.revokedAt,
	);
	const activeCalendarToken = myCalendarTokens[0] ?? null;

	async function copyCalendarLink() {
		if (!calendarUrl) return;
		try {
			await navigator.clipboard.writeText(
				`${env.VITE_SERVER_URL}${calendarUrl}`,
			);
			toast.success("Calendar link copied.");
		} catch {
			toast.error("Couldn’t copy the calendar link.");
		}
	}

	function addWindowRow() {
		setExtraWindows((current) => [
			...current,
			{
				id: windowId(),
				startDate: todayIsoDate(),
				endDate: todayIsoDate(),
			},
		]);
	}

	function removeWindowRow(id: string) {
		setExtraWindows((current) => current.filter((row) => row.id !== id));
	}

	function updateWindowRow(id: string, patch: Partial<LeaveWindowRow>) {
		setExtraWindows((current) =>
			current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
		);
	}

	const unavailabilityRows = useMemo(
		() => [
			...recurring.map((item) => ({
				id: item.id,
				kind: "weekly" as const,
				window: `Every ${WEEKDAY_NAMES[item.weekday]} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`,
				status: item.status ?? ("pending" as const),
				note: item.note ?? null,
			})),
			...dates.map((item) => ({
				id: item.id,
				kind: "date" as const,
				window: `${formatDay(item.date)} · ${formatMinute(item.startMinute)}–${formatMinute(item.endMinute)}`,
				status: item.status ?? ("pending" as const),
				note: item.note ?? null,
			})),
		],
		[dates, formatMinute, recurring],
	);
	const unavailabilityColumns = useMemo(
		() =>
			unavailabilityHelper.columns([
				unavailabilityHelper.accessor("kind", {
					header: "Kind",
					cell: ({ getValue }) => (getValue() === "weekly" ? "Weekly" : "Date"),
				}),
				unavailabilityHelper.accessor("window", {
					header: "Window",
					cell: ({ getValue }) => (
						<span className="font-medium">{getValue()}</span>
					),
				}),
				unavailabilityHelper.accessor("status", {
					header: "Status",
					cell: ({ getValue }) => {
						const status = getValue();
						return (
							<Badge
								className="uppercase"
								variant={status === "approved" ? "default" : "secondary"}
							>
								{status}
							</Badge>
						);
					},
				}),
				unavailabilityHelper.accessor("note", {
					header: "Note",
					cell: ({ getValue }) => (
						<span className="text-muted-foreground">{getValue() || "—"}</span>
					),
				}),
				unavailabilityHelper.display({
					id: "actions",
					header: "Actions",
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex justify-end">
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									if (row.original.kind === "weekly") {
										setRecurring((current) =>
											current.filter((other) => other.id !== row.original.id),
										);
										return;
									}
									setDates((current) =>
										current.filter((other) => other.id !== row.original.id),
									);
								}}
							>
								Remove
							</Button>
						</div>
					),
				}),
			]),
		[],
	);
	const timeOffColumns = useMemo(
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
							leaveTypes.data?.leaveTypes.find(
								(type) => type.id === row.leaveTypeId,
							)?.name,
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
												<button
													type="button"
													className="max-w-40 truncate underline underline-offset-2"
													onClick={() =>
														void openLeaveDocumentFile(document.id).catch(
															(error) => toast.error((error as Error).message),
														)
													}
												>
													{document.fileName}
												</button>
												<span className="text-muted-foreground tabular-nums">
													{formatFileSize(document.sizeBytes)}
												</span>
												<button
													type="button"
													aria-label={`Delete ${document.fileName}`}
													className="text-muted-foreground hover:text-destructive"
													disabled={deleteDocument.isPending}
													onClick={() => deleteDocument.mutate(document.id)}
												>
													<XIcon className="size-3" />
												</button>
											</span>
										))}
									</div>
								) : (
									<span className="text-muted-foreground text-xs">
										No documents
									</span>
								)}
								{attachable ? (
									<label className="inline-flex w-fit cursor-pointer items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
										<PaperclipIcon className="size-3" />
										<span>
											{uploadDocument.isPending ? "Uploading…" : "Attach"}
										</span>
										<input
											type="file"
											accept=".pdf,image/*"
											className="sr-only"
											disabled={uploadDocument.isPending}
											onChange={(event) => {
												const file = event.target.files?.[0];
												event.target.value = "";
												if (!file) return;
												uploadDocument.mutate({
													requestId: request.id,
													file,
												});
											}}
										/>
									</label>
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
										disabled={cancelTimeOff.isPending}
										onConfirm={() => cancelTimeOff.mutate(request.id)}
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
										disabled={cancelApprovedTimeOff.isPending}
										onConfirm={() => cancelApprovedTimeOff.mutate(request.id)}
									/>
								</div>
							);
						}
						return null;
					},
				}),
			]),
		[
			cancelApprovedTimeOff,
			cancelTimeOff,
			deleteDocument,
			formatLeaveRange,
			leaveTypes.data?.leaveTypes,
			uploadDocument,
		],
	);

	function addRecurring() {
		if (recurringStart >= recurringEnd) {
			toast.error("Choose a valid time range.");
			return;
		}
		setRecurring([
			...recurring,
			{
				id: windowId(),
				weekday,
				startMinute: recurringStart,
				endMinute: recurringEnd,
				note: recurringNote.trim() || undefined,
				status: "pending",
			},
		]);
		setRecurringNote("");
	}

	function addDate() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			toast.error("Choose a date.");
			return;
		}
		if (dateStart >= dateEnd) {
			toast.error("Choose a valid time range.");
			return;
		}
		setDates([
			...dates,
			{
				id: windowId(),
				date,
				startMinute: dateStart,
				endMinute: dateEnd,
				note: dateNote.trim() || undefined,
				status: "pending",
			},
		]);
		setDate("");
		setDateNote("");
	}

	const remainingForType = pto.data?.balances.find(
		(balance) => balance.leaveTypeId === leaveTypeId,
	)?.minutes;

	const primaryCharge = leaveChargeMinutes({
		startDate: offStartDate,
		endDate: offEndDate || offStartDate,
		allDay: offAllDay,
		startMinute: offStart,
		endMinute: offEnd,
		timeZone: constraints.data?.timezone,
	});

	const timeOffRows = constraints.data?.timeOff ?? [];
	const filteredTimeOff = useMemo(() => {
		const term = timeOffSearch.trim().toLowerCase();
		return timeOffRows.filter((row) => {
			if (timeOffStatus !== "all" && row.status !== timeOffStatus) return false;
			if (!term) return true;
			const type = leaveTypes.data?.leaveTypes.find(
				(entry) => entry.id === row.leaveTypeId,
			)?.name;
			return `${formatLeaveRange(row)} ${type ?? ""} ${row.reason ?? ""} ${
				row.decisionReason ?? ""
			}`
				.toLowerCase()
				.includes(term);
		});
	}, [
		timeOffRows,
		timeOffSearch,
		timeOffStatus,
		formatLeaveRange,
		leaveTypes.data,
	]);
	const timeOffPagination = useTablePagination(filteredTimeOff, {
		resetKey: `${timeOffSearch}|${timeOffStatus}`,
	});

	const filteredUnavailability = useMemo(() => {
		const term = unavailabilitySearch.trim().toLowerCase();
		if (!term) return unavailabilityRows;
		return unavailabilityRows.filter((row) =>
			`${row.kind} ${row.window} ${row.status} ${row.note ?? ""}`
				.toLowerCase()
				.includes(term),
		);
	}, [unavailabilityRows, unavailabilitySearch]);
	const unavailabilityPagination = useTablePagination(filteredUnavailability, {
		resetKey: unavailabilitySearch,
	});

	return (
		<AppPage>
			<UnsavedChangesGuard when={unavailabilityDirty} />
			<AppPageHeader
				title="Time off & availability"
				description="Request days off, set when you can't work, and add preferences."
				actions={
					canRequestTimeOff ? (
						<Button size="sm" onClick={() => setRequestOpen(true)}>
							<PlusIcon data-icon="inline-start" />
							Request time off
						</Button>
					) : null
				}
			/>
			<AppPageBody scroll={false} className="gap-0">
				{constraints.isLoading ? (
					<div className="min-h-0 flex-1 overflow-y-auto p-4">
						<Skeleton className="h-40" />
					</div>
				) : (
					<Tabs
						defaultValue="time-off"
						className="min-h-0 flex-1 flex-col gap-0"
					>
						<div className="shrink-0 border-b px-4">
							<TabsList variant="line">
								<TabsTrigger value="time-off">Time off</TabsTrigger>
								<TabsTrigger value="forecast">Forecast</TabsTrigger>
								<TabsTrigger value="unavailable">When I can't work</TabsTrigger>
								<TabsTrigger value="preferences">Preferences</TabsTrigger>
							</TabsList>
						</div>

						<div className="card-inset min-h-0 flex-1 overflow-y-auto">
							<TabsContent value="time-off" className="flex flex-col gap-4">
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
										{(pto.data?.balances.length ?? 0) > 0 ? (
											<div className="flex flex-wrap items-start gap-3">
												{pto.data?.balances.map((balance) => {
													const type = leaveTypes.data?.leaveTypes.find(
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
																{balance.name}:{" "}
																{formatLeaveHours(balance.minutes)}
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
														onClick={() => {
															const first = encashableBalances[0];
															if (first && !encashLeaveTypeId) {
																setEncashLeaveTypeId(first.balance.leaveTypeId);
															}
															setEncashOpen(true);
														}}
													>
														Encash
													</Button>
												) : null}
											</div>
										) : null}
										<TableToolbar
											embedded
											left={
												<>
													<TableSearch
														value={timeOffSearch}
														onValueChange={setTimeOffSearch}
														placeholder="Search requests"
													/>
													<TableFilter
														value={timeOffStatus}
														onValueChange={setTimeOffStatus}
														ariaLabel="Filter by status"
														items={[
															{ label: "All statuses", value: "all" },
															{ label: "Pending", value: "pending" },
															{ label: "Approved", value: "approved" },
															{ label: "Declined", value: "declined" },
														]}
													/>
												</>
											}
											right={<TablePagination {...timeOffPagination} />}
										/>
										<DataTable
											stacked
											bounded
											fill={false}
											columns={timeOffColumns}
											data={timeOffPagination.pageRows}
											getRowId={(row) => row.id}
											empty={
												<p className="text-muted-foreground text-sm">
													{timeOffRows.length === 0
														? "No time-off requests yet."
														: "No requests match your search or filter."}
												</p>
											}
										/>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>Calendar sync</CardTitle>
										<CardDescription>
											Subscribe to your published schedule and approved leave in
											a calendar app.
										</CardDescription>
									</CardHeader>
									<CardContent className="flex flex-col gap-3">
										{activeCalendarToken ? (
											<>
												<div className="flex flex-wrap items-center gap-2 text-sm">
													<Badge variant="secondary">Active</Badge>
													<span className="text-muted-foreground text-xs">
														Created {formatDay(activeCalendarToken.createdAt)}
													</span>
												</div>
												{calendarUrl ? (
													<div className="flex items-center gap-2">
														<code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1 text-xs">
															{`${env.VITE_SERVER_URL}${calendarUrl}`}
														</code>
														<Button
															size="sm"
															variant="outline"
															onClick={() => void copyCalendarLink()}
														>
															<CopyIcon data-icon="inline-start" />
															Copy
														</Button>
													</div>
												) : (
													<p className="text-muted-foreground text-xs">
														Create a new link to copy its URL again.
													</p>
												)}
												<ConfirmAction
													trigger="Revoke link"
													triggerVariant="outline"
													title="Revoke this calendar link?"
													description="Calendar apps using this link will stop updating. You can create a new link later."
													confirmLabel="Revoke"
													destructive
													disabled={revokeCalendarToken.isPending}
													onConfirm={() =>
														revokeCalendarToken.mutate(activeCalendarToken.id, {
															onSuccess: () => {
																setCalendarUrl(null);
																toast.success("Calendar link revoked.");
															},
															onError: (error) =>
																toast.error((error as Error).message),
														})
													}
												/>
											</>
										) : (
											<>
												<p className="text-muted-foreground text-sm">
													No personal calendar link yet. Create one to add your
													published schedule and approved leave to a calendar
													app.
												</p>
												<Button
													className="self-start"
													disabled={createCalendarToken.isPending}
													onClick={() =>
														createCalendarToken.mutate(undefined, {
															onSuccess: (result) => {
																setCalendarUrl(result.token.url ?? null);
																toast.success("Calendar link created.");
															},
															onError: (error) =>
																toast.error((error as Error).message),
														})
													}
												>
													{createCalendarToken.isPending ? (
														<Spinner data-icon="inline-start" />
													) : null}
													Create calendar link
												</Button>
											</>
										)}
									</CardContent>
								</Card>
							</TabsContent>

							<TabsContent value="forecast">
								<Card>
									<CardHeader className="flex flex-row items-start justify-between gap-3">
										<div className="grid gap-1.5">
											<CardTitle>Leave forecast</CardTitle>
											<CardDescription>
												Projected accrual and approved usage for your leave
												types.
											</CardDescription>
										</div>
										<ToggleGroup
											aria-label="Forecast horizon"
											value={[String(forecastMonths)]}
											variant="outline"
											size="sm"
											spacing={0}
											onValueChange={(value) => {
												const next = value[0];
												if (next === "6" || next === "12") {
													setForecastMonths(Number(next));
												}
											}}
										>
											<ToggleGroupItem value="6">6 months</ToggleGroupItem>
											<ToggleGroupItem value="12">12 months</ToggleGroupItem>
										</ToggleGroup>
									</CardHeader>
									<CardContent>
										<LeaveForecastTable
											forecast={forecast.data}
											isLoading={forecast.isLoading}
										/>
									</CardContent>
								</Card>
							</TabsContent>

							<TabsContent value="unavailable">
								<Card>
									<CardHeader>
										<CardTitle>When you can't work</CardTitle>
										<CardDescription>
											A hard constraint. Your manager should not schedule you
											during these times unless they record an override.
										</CardDescription>
									</CardHeader>
									<CardContent className="flex flex-col gap-4">
										<TableToolbar
											embedded
											left={
												<TableSearch
													value={unavailabilitySearch}
													onValueChange={setUnavailabilitySearch}
													placeholder="Search windows"
												/>
											}
											right={<TablePagination {...unavailabilityPagination} />}
										/>
										<DataTable
											stacked
											bounded
											fill={false}
											columns={unavailabilityColumns}
											data={unavailabilityPagination.pageRows}
											getRowId={(row) => `${row.kind}-${row.id}`}
											empty={
												<p className="text-muted-foreground text-sm">
													{unavailabilityRows.length === 0
														? "No unavailability added."
														: "No windows match your search."}
												</p>
											}
										/>
										<FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
											<Field>
												<FieldLabel htmlFor="weekly-day">Every</FieldLabel>
												<Select
													items={WEEKDAY_ITEMS}
													value={String(weekday)}
													onValueChange={(value) => {
														if (value == null) return;
														setWeekday(Number(value));
													}}
												>
													<SelectTrigger id="weekly-day" className="w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent alignItemWithTrigger={false}>
														<SelectGroup>
															{WEEKDAY_ITEMS.map((item) => (
																<SelectItem key={item.value} value={item.value}>
																	{item.label}
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
											</Field>
											<Field>
												<FieldLabel htmlFor="weekly-start">From</FieldLabel>
												<TimePicker
													id="weekly-start"
													value={recurringStart}
													onValueChange={setRecurringStart}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="weekly-end">Until</FieldLabel>
												<TimePicker
													id="weekly-end"
													value={recurringEnd}
													onValueChange={setRecurringEnd}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="weekly-note">Note</FieldLabel>
												<Input
													id="weekly-note"
													value={recurringNote}
													onChange={(event) =>
														setRecurringNote(event.target.value)
													}
													placeholder="Optional"
												/>
											</Field>
											<Button
												type="button"
												variant="outline"
												onClick={addRecurring}
											>
												Add weekly window
											</Button>
										</FieldGroup>
										<FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
											<Field>
												<FieldLabel htmlFor="date-exception">Date</FieldLabel>
												<DatePicker
													id="date-exception"
													value={date}
													onValueChange={setDate}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="date-start">From</FieldLabel>
												<TimePicker
													id="date-start"
													value={dateStart}
													onValueChange={setDateStart}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="date-end">Until</FieldLabel>
												<TimePicker
													id="date-end"
													value={dateEnd}
													onValueChange={setDateEnd}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="date-note">Note</FieldLabel>
												<Input
													id="date-note"
													value={dateNote}
													onChange={(event) => setDateNote(event.target.value)}
													placeholder="Optional"
												/>
											</Field>
											<Button type="button" variant="outline" onClick={addDate}>
												Add date exception
											</Button>
										</FieldGroup>
									</CardContent>
									<CardFooter>
										<div className="flex items-center gap-2">
											<Button
												disabled={
													saveUnavailability.isPending || !unavailabilityDirty
												}
												onClick={() => saveUnavailability.mutate()}
											>
												{saveUnavailability.isPending ? (
													<Spinner data-icon="inline-start" />
												) : null}
												Save unavailability
											</Button>
											{unavailabilityDirty ? (
												<Badge variant="secondary">Unsaved changes</Badge>
											) : null}
										</div>
									</CardFooter>
								</Card>
							</TabsContent>

							<TabsContent value="preferences">
								<Card>
									<CardHeader>
										<CardTitle>Preferences</CardTitle>
										<CardDescription>
											A note for your manager. Preferences never block
											scheduling.
										</CardDescription>
									</CardHeader>
									<CardContent>
										<Field>
											<FieldLabel htmlFor="preference">
												What you prefer
											</FieldLabel>
											<Textarea
												id="preference"
												value={preference}
												onChange={(event) => setPreference(event.target.value)}
												placeholder="I prefer mornings and Sundays."
											/>
										</Field>
									</CardContent>
									<CardFooter>
										<Button
											disabled={savePreference.isPending}
											onClick={() => savePreference.mutate()}
										>
											{savePreference.isPending ? (
												<Spinner data-icon="inline-start" />
											) : null}
											Save preference
										</Button>
									</CardFooter>
								</Card>
							</TabsContent>
						</div>
					</Tabs>
				)}
				<FormSheet
					open={requestOpen}
					onOpenChange={setRequestOpen}
					title="Request time off"
					description="All-day by default. Your manager reviews every request before it blocks the schedule."
					footer={
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button variant="outline" onClick={() => setRequestOpen(false)}>
								Cancel
							</Button>
							<Button
								disabled={
									requestTimeOff.isPending ||
									!leaveTypeId ||
									(requestMode === "recurring" &&
										(recurrenceCount < 2 || recurrenceCount > 26))
								}
								onClick={() =>
									requestTimeOff.mutate(undefined, {
										onSuccess: () => setRequestOpen(false),
									})
								}
							>
								{requestTimeOff.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Request time off
							</Button>
						</div>
					}
				>
					<div className="flex flex-col gap-2">
						<span className="font-medium text-sm">Request type</span>
						<ToggleGroup
							aria-label="Request type"
							value={[requestMode]}
							variant="outline"
							size="sm"
							spacing={0}
							onValueChange={(value) => {
								const next = value[0];
								if (
									next === "single" ||
									next === "multiple" ||
									next === "recurring"
								) {
									setRequestMode(next);
								}
							}}
						>
							<ToggleGroupItem value="single">Single</ToggleGroupItem>
							<ToggleGroupItem value="multiple">Multiple days</ToggleGroupItem>
							<ToggleGroupItem value="recurring">Recurring</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<LeaveWindowFields
						idPrefix="off"
						leaveTypes={leaveTypes.data?.leaveTypes ?? []}
						leaveTypeId={leaveTypeId}
						onLeaveTypeIdChange={setLeaveTypeId}
						startDate={offStartDate}
						endDate={offEndDate}
						onStartDateChange={setOffStartDate}
						onEndDateChange={setOffEndDate}
						allDay={offAllDay}
						onAllDayChange={setOffAllDay}
						startMinute={offStart}
						endMinute={offEnd}
						onStartMinuteChange={setOffStart}
						onEndMinuteChange={setOffEnd}
						reason={offReason}
						onReasonChange={setOffReason}
						remainingMinutes={remainingForType}
						timeZone={constraints.data?.timezone}
						isEmergency={offEmergency}
						onIsEmergencyChange={setOffEmergency}
						documentsRequired={Boolean(
							selectedLeaveType?.policy?.documentRequiredAfterDays,
						)}
						chargeWorkingDaysOnly={
							selectedLeaveType?.policy?.chargeWorkingDaysOnly ?? false
						}
					/>
					{requestMode === "multiple" ? (
						<FieldGroup className="gap-3">
							<div className="grid gap-1">
								<FieldLabel>Additional date ranges</FieldLabel>
								<FieldDescription>
									The window above plus these ranges are submitted together.
								</FieldDescription>
							</div>
							{extraWindows.map((row) => (
								<div
									key={row.id}
									className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
								>
									<DatePicker
										value={row.startDate}
										onValueChange={(value) =>
											updateWindowRow(row.id, {
												startDate: value,
												endDate:
													row.endDate && row.endDate >= value
														? row.endDate
														: value,
											})
										}
									/>
									<DatePicker
										value={row.endDate}
										onValueChange={(value) =>
											updateWindowRow(row.id, { endDate: value })
										}
										disabled={(date) =>
											Boolean(row.startDate) &&
											date < new Date(`${row.startDate}T00:00:00`)
										}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Remove date range"
										onClick={() => removeWindowRow(row.id)}
									>
										<XIcon />
									</Button>
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								className="self-start"
								onClick={addWindowRow}
							>
								<PlusIcon data-icon="inline-start" />
								Add date range
							</Button>
						</FieldGroup>
					) : null}
					{requestMode === "recurring" ? (
						<FieldGroup className="gap-3">
							<div className="grid gap-1">
								<FieldLabel>Repeats</FieldLabel>
								<FieldDescription>
									Repeats the window above from its start date. Up to 26
									occurrences.
								</FieldDescription>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="recurrence-frequency">
										Frequency
									</FieldLabel>
									<Select
										items={[...RECURRENCE_ITEMS]}
										value={recurrenceFrequency}
										onValueChange={(value) => {
											if (
												value === "weekly" ||
												value === "biweekly" ||
												value === "monthly"
											) {
												setRecurrenceFrequency(value);
											}
										}}
									>
										<SelectTrigger id="recurrence-frequency" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{RECURRENCE_ITEMS.map((item) => (
													<SelectItem key={item.value} value={item.value}>
														{item.label}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="recurrence-count">
										Occurrences
									</FieldLabel>
									<Input
										id="recurrence-count"
										type="number"
										min={2}
										max={26}
										value={recurrenceCount}
										onChange={(event) =>
											setRecurrenceCount(Number(event.target.value))
										}
									/>
								</Field>
							</div>
							{primaryCharge > 0 && recurrenceCount >= 2 ? (
								<FieldDescription>
									About {formatLeaveHours(primaryCharge * recurrenceCount)}{" "}
									across {recurrenceCount} windows.
								</FieldDescription>
							) : null}
						</FieldGroup>
					) : null}
				</FormSheet>
				<FormSheet
					open={encashOpen}
					onOpenChange={setEncashOpen}
					title="Encash leave"
					description="Ask to convert unused leave minutes into pay. A manager must approve."
					footer={
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button variant="outline" onClick={() => setEncashOpen(false)}>
								Cancel
							</Button>
							<Button
								disabled={
									requestEncashment.isPending ||
									!encashLeaveTypeId ||
									hoursToMinutes(encashHours) <= 0
								}
								onClick={() => requestEncashment.mutate()}
							>
								{requestEncashment.isPending ? (
									<Spinner data-icon="inline-start" />
								) : null}
								Request encashment
							</Button>
						</div>
					}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="encash-type">Leave type</FieldLabel>
							<Select
								items={encashableBalances.map(({ balance, type }) => ({
									label: `${type.name} · ${formatLeaveHours(balance.minutes)} available`,
									value: balance.leaveTypeId,
								}))}
								value={encashLeaveTypeId}
								onValueChange={(value) => value && setEncashLeaveTypeId(value)}
							>
								<SelectTrigger id="encash-type" className="w-full">
									<SelectValue placeholder="Choose a leave type" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{encashableBalances.map(({ balance, type }) => (
											<SelectItem
												key={balance.leaveTypeId}
												value={balance.leaveTypeId}
											>
												{type.name} · {formatLeaveHours(balance.minutes)}{" "}
												available
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="encash-hours">Hours to encash</FieldLabel>
							<Input
								id="encash-hours"
								type="number"
								min={0.5}
								step="0.5"
								value={encashHours}
								onChange={(event) => setEncashHours(event.target.value)}
								placeholder="8"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="encash-note">Note (optional)</FieldLabel>
							<Input
								id="encash-note"
								value={encashNote}
								onChange={(event) => setEncashNote(event.target.value)}
								placeholder="Optional"
							/>
						</Field>
					</FieldGroup>
				</FormSheet>
				{editing ? (
					<WorkerEditLeaveSheet
						key={editing.id}
						request={editing}
						workplaceId={workplace?.id}
						timeZone={constraints.data?.timezone}
						leaveTypes={leaveTypes.data?.leaveTypes ?? []}
						balances={pto.data?.balances ?? []}
						onOpenChange={(open) => {
							if (!open) setEditing(null);
						}}
						onSaved={() => {
							setEditing(null);
							invalidate();
						}}
					/>
				) : null}
			</AppPageBody>
		</AppPage>
	);
}

function WorkerEditLeaveSheet({
	request,
	workplaceId,
	timeZone,
	leaveTypes,
	balances,
	onOpenChange,
	onSaved,
}: {
	request: WorkerConstraints["timeOff"][number];
	workplaceId: string | undefined;
	timeZone?: string;
	leaveTypes: { id: string; name: string; paid: boolean }[];
	balances: { leaveTypeId: string; minutes: number }[];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [leaveTypeId, setLeaveTypeId] = useState(request.leaveTypeId ?? "");
	const [startDate, setStartDate] = useState(request.startDate);
	const [endDate, setEndDate] = useState(request.endDate);
	const [allDay, setAllDay] = useState(request.allDay);
	const [startMinute, setStartMinute] = useState(request.startMinute ?? 9 * 60);
	const [endMinute, setEndMinute] = useState(request.endMinute ?? 17 * 60);
	const [reason, setReason] = useState(request.reason ?? "");
	const remainingMinutes = balances.find(
		(balance) => balance.leaveTypeId === leaveTypeId,
	)?.minutes;
	const charge = leaveChargeMinutes({
		startDate,
		endDate,
		allDay,
		startMinute,
		endMinute,
		timeZone,
	});
	const save = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/time-off/${request.id}`, {
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
			toast.success("Request updated.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Edit request</SheetTitle>
					<SheetDescription>
						Pending until your manager reviews it.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 overflow-y-auto px-6">
					<LeaveWindowFields
						idPrefix="edit-off"
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
						remainingMinutes={remainingMinutes}
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
