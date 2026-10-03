import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@SchedulesManager/ui/components/alert-dialog";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@SchedulesManager/ui/components/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
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
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Separator } from "@SchedulesManager/ui/components/separator";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { usePostHog } from "@posthog/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangleIcon,
	ChevronDownIcon,
	CopyIcon,
	PlusIcon,
	Trash2Icon,
	UserPlusIcon,
	XIcon,
} from "lucide-react";
import { memo, type Ref, useImperativeHandle, useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { formatDayLabel, weekdayShort } from "@/components/schedule/format";
import { PositionApprovalDialog } from "@/components/schedule/position-approval-dialog";
import {
	emptyForm,
	type PositionApproval,
	positionsForWorker,
	type ShiftFormState,
	shiftRangeMinutes,
	staffWindowOverlaps,
	workerNeedsPositionApproval,
} from "@/components/schedule/shift-form";
import { useInvalidateSchedule } from "@/components/schedule/use-schedule-invalidate";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import type {
	ScheduleResponse,
	ScheduleShiftDto,
	ScheduleTimeclockEntry,
} from "@/lib/queries";
import {
	useEditTimeEntry,
	useMarkAttendance,
	useTags,
	useTimeBlocks,
} from "@/lib/queries";
import { addDays } from "@/lib/schedule-calendar";
import { shiftOverlapsTimeOff } from "@/lib/schedule-timeoff";
import { datetimeLocalToIso, isoToDatetimeLocal } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export interface ShiftMoveRequest {
	shift: ScheduleShiftDto;
	employmentId: string | null;
	date: string;
	approvePosition?: boolean;
}

/** Imperative surface other parts of the schedule page use to drive the editor. */
export interface ShiftEditorHandle {
	openEdit: (shift: ScheduleShiftDto) => void;
	openCreate: (date: string) => void;
	openAdd: (member: ScheduleResponse["staff"][number], day: string) => void;
	/** Drops any in-progress draft (used when navigating weeks/locations). */
	reset: () => void;
	requestMoveApproval: (
		approval: Extract<PositionApproval, { kind: "move" }>,
	) => void;
	closeApproval: () => void;
}

/**
 * The shift create/edit dialog and the "add Position to Employment" approval
 * prompt. It owns the draft form, the multi-day/multi-worker picker state, the
 * punch-correction fields and its own mutations, so typing in the form never
 * rerenders the schedule page. Open it through the `ref` handle.
 */
export const ShiftEditorDialog = memo(function ShiftEditorDialog({
	ref,
	data,
	locationId,
	weekStart,
	teamId,
	days,
	canManage,
	timeclockByShiftId,
	movePending,
	onConfirmMove,
}: {
	ref: Ref<ShiftEditorHandle>;
	data: ScheduleResponse | undefined;
	locationId: string | undefined;
	weekStart: string;
	teamId: string | null;
	days: string[];
	canManage: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
	movePending: boolean;
	onConfirmMove: (request: ShiftMoveRequest) => void;
}) {
	const { workplace } = useWorkplace();
	const { formatMinute } = useDisplayPrefs();
	const posthog = usePostHog();
	const queryClient = useQueryClient();
	const invalidate = useInvalidateSchedule(locationId, weekStart, teamId);
	const tags = useTags(workplace?.id);
	const timeBlocks = useTimeBlocks(locationId);
	const markAttendance = useMarkAttendance(workplace?.id);
	const editTimeEntry = useEditTimeEntry(workplace?.id);
	const scheduleTimeZone = data?.schedule.timezone ?? "America/Chicago";

	const [form, setForm] = useState<ShiftFormState | null>(null);
	const [addDates, setAddDates] = useState<string[]>([]);
	const [addEmploymentIds, setAddEmploymentIds] = useState<string[]>([]);
	const [positionApproval, setPositionApproval] =
		useState<PositionApproval | null>(null);
	const [repeatWeeks, setRepeatWeeks] = useState("1");
	const [punchReason, setPunchReason] = useState("");
	const [punchInLocal, setPunchInLocal] = useState("");
	const [punchOutLocal, setPunchOutLocal] = useState("");
	const [punchStillOpen, setPunchStillOpen] = useState(false);

	const createOrUpdate = useMutation({
		mutationFn: async (
			state: ShiftFormState & { approvePosition?: boolean },
		) => {
			if (!locationId) throw new Error("No location selected");
			const approvePosition = state.approvePosition === true;
			if (state.shiftId) {
				await api(`/v1/shifts/${state.shiftId}`, {
					method: "PATCH",
					body: {
						employmentId: state.employmentId || null,
						positionId: state.positionId,
						date: state.date,
						startMinute: state.startMinute,
						endMinute: state.endMinute,
						note: state.note || null,
						unavailabilityOverrideReason:
							state.unavailabilityOverrideReason.trim() || null,
						...(approvePosition ? { approvePosition: true } : {}),
					},
				});
				await api(`/v1/shifts/${state.shiftId}/tags`, {
					method: "POST",
					body: { tagIds: state.tagIds },
				});
				const titles = state.taskTitles
					.split("\n")
					.map((line) => line.trim())
					.filter(Boolean);
				if (titles.length > 0) {
					await api(`/v1/shifts/${state.shiftId}/tasks`, {
						method: "POST",
						body: { titles },
					});
				}
				return { count: 1, approvePosition };
			}
			const dates = addDates.length > 0 ? addDates : [state.date];
			const employmentIds: Array<string | null> =
				addEmploymentIds.length > 0
					? addEmploymentIds
					: [state.employmentId || null];
			await Promise.all(
				employmentIds.flatMap((employmentId) =>
					dates.map((date) =>
						api(`/v1/locations/${locationId}/schedules/${weekStart}/shifts`, {
							method: "POST",
							body: {
								employmentId,
								positionId: state.positionId,
								date,
								startMinute: state.startMinute,
								endMinute: state.endMinute,
								note: state.note || undefined,
								unavailabilityOverrideReason:
									state.unavailabilityOverrideReason.trim() || undefined,
								...(approvePosition ? { approvePosition: true } : {}),
								teamId,
							},
						}),
					),
				),
			);
			return {
				count: employmentIds.length * dates.length,
				approvePosition,
			};
		},
		onSuccess: async (result) => {
			setForm(null);
			setAddDates([]);
			setAddEmploymentIds([]);
			setPositionApproval(null);
			await invalidate();
			if (result.approvePosition) {
				await queryClient.invalidateQueries({
					queryKey: ["workplaces", workplace?.id, "workers"],
				});
			}
			posthog?.capture("shift_created", {
				shift_count: result.count,
				position_approved: result.approvePosition,
				week_start: weekStart,
			});
			toast.success(
				result.count > 1 ? `${result.count} shifts added.` : "Shift saved.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const removeShift = useMutation({
		mutationFn: (shiftId: string) =>
			api(`/v1/shifts/${shiftId}`, { method: "DELETE" }),
		onSuccess: async () => {
			setForm(null);
			await invalidate();
			posthog?.capture("shift_deleted", { week_start: weekStart });
			toast.success("Shift removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const repeatShift = useMutation({
		mutationFn: (input: { shiftId: string; weeks: number }) =>
			api<{ copied: number }>(`/v1/shifts/${input.shiftId}/repeat`, {
				method: "POST",
				body: { weeks: input.weeks },
			}),
		onSuccess: async (result: { copied: number }) => {
			await invalidate();
			toast.success(
				`Copied this Shift onto ${result.copied} later week${result.copied === 1 ? "" : "s"}.`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	function syncPunchFields(shift: ScheduleShiftDto | undefined) {
		const timeclock = shift ? timeclockByShiftId.get(shift.id) : undefined;
		setPunchInLocal(
			isoToDatetimeLocal(
				timeclock?.clockedInAt ?? shift?.startsAt ?? "",
				scheduleTimeZone,
			),
		);
		setPunchOutLocal(
			isoToDatetimeLocal(
				timeclock?.clockedOutAt ?? shift?.endsAt ?? "",
				scheduleTimeZone,
			),
		);
		setPunchStillOpen(timeclock?.status === "open");
		setPunchReason("");
	}

	function openEdit(shift: ScheduleShiftDto) {
		setAddDates([]);
		setAddEmploymentIds([]);
		syncPunchFields(shift);
		setForm({
			shiftId: shift.id,
			employmentId: shift.employmentId ?? "",
			positionId: shift.positionId,
			date: shift.date,
			startMinute: shift.startMinute,
			endMinute: shift.endMinute,
			note: shift.note ?? "",
			unavailabilityOverrideReason: shift.unavailabilityOverrideReason ?? "",
			tagIds: shift.tagIds,
			taskTitles: "",
		});
	}

	function openCreate(date: string) {
		if (!data) return;
		if (data.positions.length === 0) {
			toast.error("Add a position in settings before scheduling.");
			return;
		}
		const draft = emptyForm(date);
		if (data.positions.length === 1) {
			draft.positionId = data.positions[0]?.id ?? "";
		}
		setAddDates([date]);
		setAddEmploymentIds([]);
		syncPunchFields(undefined);
		setForm(draft);
	}

	function openAdd(member: ScheduleResponse["staff"][number], day: string) {
		const draft = emptyForm(day);
		draft.employmentId = member.employmentId;
		const positions = positionsForWorker(data?.positions ?? [], member);
		if (positions.length === 1) draft.positionId = positions[0]?.id ?? "";
		setAddDates([day]);
		setAddEmploymentIds([member.employmentId]);
		syncPunchFields(undefined);
		setForm(draft);
	}

	// No dependency array: the handle always closes over the latest props, and
	// callers keep a stable `ref`, so they never rerender when it refreshes.
	useImperativeHandle(ref, () => ({
		openEdit,
		openCreate,
		openAdd,
		reset: () => setForm(null),
		requestMoveApproval: (approval) => setPositionApproval(approval),
		closeApproval: () => setPositionApproval(null),
	}));

	function createShiftCount(state: ShiftFormState) {
		if (state.shiftId) return 1;
		const dates = addDates.length > 0 ? addDates.length : 1;
		const workers = Math.max(addEmploymentIds.length, 1);
		return workers * dates;
	}

	function queueShiftSave(state: ShiftFormState) {
		const positionName =
			data?.positions.find((position) => position.id === state.positionId)
				?.name ?? "this position";
		if (state.shiftId) {
			const member = data?.staff.find(
				(candidate) => candidate.employmentId === state.employmentId,
			);
			if (workerNeedsPositionApproval(member, state.positionId)) {
				setPositionApproval({
					kind: "save",
					form: state,
					workerName: member?.name ?? "this worker",
					positionName,
					shiftCount: 1,
				});
				return;
			}
			createOrUpdate.mutate(state);
			return;
		}
		const employmentIds =
			addEmploymentIds.length > 0
				? addEmploymentIds
				: state.employmentId
					? [state.employmentId]
					: [];
		const needingApproval = employmentIds
			.map((employmentId) =>
				data?.staff.find(
					(candidate) => candidate.employmentId === employmentId,
				),
			)
			.filter((member): member is NonNullable<typeof member> =>
				Boolean(
					member && workerNeedsPositionApproval(member, state.positionId),
				),
			);
		if (needingApproval.length > 0) {
			const first = needingApproval[0]?.name ?? "this worker";
			const workerName =
				needingApproval.length === 1
					? first
					: `${first} and ${needingApproval.length - 1} other${needingApproval.length === 2 ? "" : "s"}`;
			setPositionApproval({
				kind: "save",
				form: state,
				workerName,
				positionName,
				shiftCount: createShiftCount(state),
			});
			return;
		}
		createOrUpdate.mutate(state);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!form) return;
		if (!canSave) return;
		queueShiftSave(form);
	}

	function toggleAddDate(date: string) {
		setAddDates((current) => {
			const next = current.includes(date)
				? current.filter((candidate) => candidate !== date)
				: [...current, date].sort();
			if (next.length > 0 && form) setForm({ ...form, date: next[0] ?? date });
			return next;
		});
	}

	const selectedCreateEmploymentIds = form?.shiftId
		? form.employmentId
			? [form.employmentId]
			: []
		: addEmploymentIds.length > 0
			? addEmploymentIds
			: form?.employmentId
				? [form.employmentId]
				: [];
	const selectedCreateStaff = selectedCreateEmploymentIds
		.map((employmentId) =>
			data?.staff.find((member) => member.employmentId === employmentId),
		)
		.filter((member): member is NonNullable<typeof member> => Boolean(member));
	const selectedStaff = selectedCreateStaff[0];
	const allowedPositions = positionsForWorker(
		data?.positions ?? [],
		selectedStaff,
	);
	const checkDates =
		form?.shiftId || addDates.length === 0
			? form
				? [form.date]
				: []
			: addDates;
	const overlappingWindows = selectedCreateStaff.flatMap((member) =>
		(member.unavailability ?? []).filter((window) =>
			checkDates.some((date) =>
				form
					? staffWindowOverlaps(window, date, form.startMinute, form.endMinute)
					: false,
			),
		),
	);
	const needsOverride = overlappingWindows.length > 0;
	const positionNeedsApproval = selectedCreateStaff.some((member) =>
		workerNeedsPositionApproval(member, form?.positionId ?? ""),
	);
	const overlappingShift = selectedCreateEmploymentIds.length
		? (data?.shifts ?? []).find((shift) => {
				if (
					!shift.employmentId ||
					!selectedCreateEmploymentIds.includes(shift.employmentId)
				)
					return false;
				if (form?.shiftId && shift.id === form.shiftId) return false;
				if (!form) return false;
				return checkDates.some((date) => {
					const [aStart, aEnd] = shiftRangeMinutes(
						weekStart,
						date,
						form.startMinute,
						form.endMinute,
					);
					const [bStart, bEnd] = shiftRangeMinutes(
						weekStart,
						shift.date,
						shift.startMinute,
						shift.endMinute,
					);
					return aStart < bEnd && bStart < aEnd;
				});
			})
		: undefined;
	const overlappingTimeOff = selectedCreateStaff
		.flatMap((member) => member.timeOff ?? [])
		.find((request) => {
			if (request.status !== "approved" || !form) return false;
			return checkDates.some((date) =>
				shiftOverlapsTimeOff(
					request,
					date,
					form.startMinute,
					form.endMinute,
					scheduleTimeZone,
				),
			);
		});
	const pendingAddCount = form ? createShiftCount(form) : 0;
	const canSave =
		canManage &&
		Boolean(
			form?.positionId &&
				(form.shiftId || addDates.length > 0) &&
				form.startMinute !== form.endMinute &&
				(!needsOverride || form.unavailabilityOverrideReason.trim()),
		);

	const selectedShiftTimeclock = form?.shiftId
		? timeclockByShiftId.get(form.shiftId)
		: undefined;
	const selectedShiftAssigned = Boolean(form?.employmentId);
	const workerItems = [
		{ label: "Open (no worker yet)", value: null },
		...(data?.staff ?? []).map((member) => ({
			label: member.name,
			value: member.employmentId,
		})),
	];
	const positionItems = [
		{ label: "Choose…", value: null },
		...(data?.positions ?? []).map((position) => ({
			label: position.name,
			value: position.id,
		})),
	];
	const otherPositions = (data?.positions ?? []).filter(
		(position) =>
			!allowedPositions.some((allowed) => allowed.id === position.id),
	);
	const showPositionGroups =
		Boolean(selectedStaff) &&
		allowedPositions.length > 0 &&
		otherPositions.length > 0;

	const handleApprovalConfirm = (approval: PositionApproval) => {
		if (approval.kind === "save") {
			createOrUpdate.mutate({ ...approval.form, approvePosition: true });
			return;
		}
		onConfirmMove({
			shift: approval.shift,
			employmentId: approval.employmentId,
			date: approval.date,
			approvePosition: true,
		});
	};

	return (
		<>
			<Dialog
				open={form !== null && data !== undefined}
				onOpenChange={(open) => {
					if (!open) {
						if (positionApproval) return;
						setForm(null);
						setAddDates([]);
						setAddEmploymentIds([]);
					}
				}}
			>
				<DialogContent
					className="flex max-h-[min(40rem,90vh)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
					showCloseButton
				>
					{form && data ? (
						<form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
							<DialogHeader className="border-b px-6 py-4 pr-12">
								<DialogTitle>
									{form.shiftId ? "Edit shift" : "Add shifts"}
								</DialogTitle>
								<DialogDescription>
									Times are in {data.schedule.timezone}.
									{form.shiftId
										? " Leave the worker open if you have not assigned anyone yet."
										: " Add workers and days — leave workers empty for open shifts."}
								</DialogDescription>
							</DialogHeader>
							<div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
								<FieldGroup>
									{(timeBlocks.data?.timeBlocks ?? []).length > 0 ||
									(timeBlocks.data?.shiftTemplates ?? []).length > 0 ? (
										<div className="grid gap-2 sm:grid-cols-2">
											{(timeBlocks.data?.timeBlocks ?? []).length > 0 ? (
												<Select
													items={(timeBlocks.data?.timeBlocks ?? []).map(
														(block) => ({
															label: `${block.name} · ${formatMinute(block.startMinute)}–${formatMinute(block.endMinute)}`,
															value: block.id,
														}),
													)}
													value={null}
													onValueChange={(value) => {
														const block = (
															timeBlocks.data?.timeBlocks ?? []
														).find((row) => row.id === value);
														if (!block) return;
														setForm({
															...form,
															startMinute: block.startMinute,
															endMinute: block.endMinute,
														});
													}}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Apply time block" />
													</SelectTrigger>
													<SelectContent alignItemWithTrigger={false}>
														<SelectGroup>
															{(timeBlocks.data?.timeBlocks ?? []).map(
																(block) => (
																	<SelectItem key={block.id} value={block.id}>
																		{block.name}
																	</SelectItem>
																),
															)}
														</SelectGroup>
													</SelectContent>
												</Select>
											) : null}
											{(timeBlocks.data?.shiftTemplates ?? []).length > 0 ? (
												<Select
													items={(timeBlocks.data?.shiftTemplates ?? []).map(
														(template) => ({
															label: template.name,
															value: template.id,
														}),
													)}
													value={null}
													onValueChange={(value) => {
														const template = (
															timeBlocks.data?.shiftTemplates ?? []
														).find((row) => row.id === value);
														if (!template) return;
														setForm({
															...form,
															positionId: template.positionId,
															startMinute: template.startMinute,
															endMinute: template.endMinute,
															note: template.note ?? form.note,
														});
													}}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Apply shift template" />
													</SelectTrigger>
													<SelectContent alignItemWithTrigger={false}>
														<SelectGroup>
															{(timeBlocks.data?.shiftTemplates ?? []).map(
																(template) => (
																	<SelectItem
																		key={template.id}
																		value={template.id}
																	>
																		{template.name}
																	</SelectItem>
																),
															)}
														</SelectGroup>
													</SelectContent>
												</Select>
											) : null}
										</div>
									) : null}
									<div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-4">
										<span className="pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											{form.shiftId ? "Day" : "Days"}
										</span>
										<div className="min-w-0">
											{form.shiftId ? (
												<DatePicker
													id="shift-date"
													value={form.date}
													onValueChange={(date) => setForm({ ...form, date })}
													disabled={(date) => {
														const key = date.toLocaleDateString("sv-SE");
														return (
															key < weekStart || key > addDays(weekStart, 6)
														);
													}}
												/>
											) : (
												<div
													id="shift-date"
													className="grid grid-cols-4 gap-1.5 sm:grid-cols-7"
												>
													{days.map((date) => {
														const selected = addDates.includes(date);
														return (
															<Button
																key={date}
																type="button"
																variant={selected ? "default" : "outline"}
																className="h-auto min-h-11 flex-col gap-0.5 px-1 py-1.5 tabular-nums"
																aria-pressed={selected}
																onClick={() => toggleAddDate(date)}
															>
																<span
																	className={cn(
																		"text-xs",
																		selected
																			? "text-primary-foreground/80"
																			: "text-muted-foreground",
																	)}
																>
																	{weekdayShort(date)}
																</span>
																<span className="font-medium">
																	{new Date(`${date}T12:00:00`).getDate()}
																</span>
															</Button>
														);
													})}
												</div>
											)}
										</div>

										<span className="pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Time
										</span>
										<div className="flex min-w-0 flex-col gap-1.5">
											<div className="grid grid-cols-2 gap-2">
												<TimePicker
													id="shift-start"
													value={form.startMinute}
													onValueChange={(startMinute) =>
														setForm({ ...form, startMinute })
													}
												/>
												<TimePicker
													id="shift-end"
													value={form.endMinute}
													onValueChange={(endMinute) =>
														setForm({ ...form, endMinute })
													}
													overnightAfterMinute={form.startMinute}
												/>
											</div>
											{form.endMinute <= form.startMinute ? (
												<p className="text-muted-foreground text-xs">
													Continues overnight into the next day.
												</p>
											) : null}
										</div>

										<span className="pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Position
										</span>
										<div className="flex min-w-0 flex-col gap-1.5">
											<Select
												items={positionItems}
												value={form.positionId || null}
												onValueChange={(positionId) =>
													setForm({
														...form,
														positionId: positionId ?? "",
													})
												}
											>
												<SelectTrigger id="shift-position" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent alignItemWithTrigger={false}>
													<SelectGroup>
														<SelectItem value={null}>Choose…</SelectItem>
													</SelectGroup>
													{showPositionGroups ? (
														<>
															<SelectGroup>
																<SelectLabel>
																	Approved for {selectedStaff?.name}
																</SelectLabel>
																{allowedPositions.map((position) => (
																	<SelectItem
																		key={position.id}
																		value={position.id}
																	>
																		{position.name}
																	</SelectItem>
																))}
															</SelectGroup>
															<SelectGroup>
																<SelectLabel>Other positions</SelectLabel>
																{otherPositions.map((position) => (
																	<SelectItem
																		key={position.id}
																		value={position.id}
																	>
																		{position.name}
																	</SelectItem>
																))}
															</SelectGroup>
														</>
													) : (
														<SelectGroup>
															{(data.positions ?? []).map((position) => (
																<SelectItem
																	key={position.id}
																	value={position.id}
																>
																	{position.name}
																</SelectItem>
															))}
														</SelectGroup>
													)}
												</SelectContent>
											</Select>
											{positionNeedsApproval ? (
												<Alert role="status">
													<UserPlusIcon />
													<AlertTitle>
														{selectedCreateStaff.length > 1
															? `${selectedCreateStaff.length} workers aren’t approved`
															: `${selectedStaff?.name ?? "This worker"} isn’t approved`}{" "}
														for{" "}
														{data.positions.find(
															(position) => position.id === form.positionId,
														)?.name ?? "this position"}
													</AlertTitle>
													<AlertDescription>
														You can add this Position to their Employment when
														you save. It will apply to future shifts too.
													</AlertDescription>
												</Alert>
											) : null}
										</div>

										<span className="pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											{form.shiftId ? "Worker" : "Workers"}
										</span>
										<div className="flex min-w-0 flex-col gap-1.5">
											{form.shiftId ? (
												<Select
													items={workerItems}
													value={form.employmentId || null}
													onValueChange={(employmentId) => {
														const nextEmploymentId = employmentId ?? "";
														const member = data.staff.find(
															(candidate) =>
																candidate.employmentId === nextEmploymentId,
														);
														let positionId = form.positionId;
														if (!positionId) {
															const allowed = positionsForWorker(
																data.positions,
																member,
															);
															if (allowed.length === 1) {
																positionId = allowed[0]?.id ?? "";
															}
														}
														setForm({
															...form,
															employmentId: nextEmploymentId,
															positionId,
															unavailabilityOverrideReason: "",
														});
													}}
												>
													<SelectTrigger id="shift-worker" className="w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent alignItemWithTrigger={false}>
														<SelectGroup>
															{workerItems.map((item) => (
																<SelectItem
																	key={item.value ?? "open"}
																	value={item.value}
																>
																	{item.label}
																</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
											) : (
												<>
													<div className="flex flex-wrap items-center gap-1.5">
														{addEmploymentIds.map((employmentId) => {
															const member = data.staff.find(
																(candidate) =>
																	candidate.employmentId === employmentId,
															);
															const name = member?.name ?? "Worker";
															return (
																<Badge
																	key={employmentId}
																	variant="secondary"
																	className="gap-1 pr-1"
																>
																	{name}
																	<Button
																		type="button"
																		variant="ghost"
																		size="icon-sm"
																		aria-label={`Remove ${name}`}
																		onClick={() => {
																			const next = addEmploymentIds.filter(
																				(id) => id !== employmentId,
																			);
																			setAddEmploymentIds(next);
																			setForm({
																				...form,
																				employmentId: next[0] ?? "",
																				unavailabilityOverrideReason: "",
																			});
																		}}
																	>
																		<XIcon />
																	</Button>
																</Badge>
															);
														})}
														{(data.staff ?? []).some(
															(member) =>
																!addEmploymentIds.includes(member.employmentId),
														) ? (
															<Select
																items={(data.staff ?? [])
																	.filter(
																		(member) =>
																			!addEmploymentIds.includes(
																				member.employmentId,
																			),
																	)
																	.map((member) => ({
																		label: member.name,
																		value: member.employmentId,
																	}))}
																value={null}
																onValueChange={(employmentId) => {
																	if (!employmentId) return;
																	if (addEmploymentIds.includes(employmentId))
																		return;
																	const member = data.staff.find(
																		(candidate) =>
																			candidate.employmentId === employmentId,
																	);
																	const next = [
																		...addEmploymentIds,
																		employmentId,
																	];
																	let positionId = form.positionId;
																	if (!positionId) {
																		const allowed = positionsForWorker(
																			data.positions,
																			member,
																		);
																		if (allowed.length === 1) {
																			positionId = allowed[0]?.id ?? "";
																		}
																	}
																	setAddEmploymentIds(next);
																	setForm({
																		...form,
																		employmentId: next[0] ?? "",
																		positionId,
																		unavailabilityOverrideReason: "",
																	});
																}}
															>
																<SelectTrigger
																	aria-label="Add worker"
																	className="h-7 w-auto gap-1 border-dashed px-2"
																>
																	<PlusIcon className="size-3.5" />
																	<SelectValue placeholder="Add worker" />
																</SelectTrigger>
																<SelectContent alignItemWithTrigger={false}>
																	<SelectGroup>
																		{(data.staff ?? [])
																			.filter(
																				(member) =>
																					!addEmploymentIds.includes(
																						member.employmentId,
																					),
																			)
																			.map((member) => (
																				<SelectItem
																					key={member.employmentId}
																					value={member.employmentId}
																				>
																					{member.name}
																				</SelectItem>
																			))}
																	</SelectGroup>
																</SelectContent>
															</Select>
														) : null}
													</div>
													{addEmploymentIds.length === 0 ? (
														<p className="text-muted-foreground text-xs">
															No workers selected — creates open shifts.
														</p>
													) : null}
												</>
											)}
										</div>

										<span className="pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Note
										</span>
										<div className="min-w-0">
											<Input
												id="shift-note"
												value={form.note}
												onChange={(event) =>
													setForm({
														...form,
														note: event.target.value,
													})
												}
												placeholder="Optional"
												maxLength={200}
											/>
										</div>
									</div>
									{form.shiftId ? (
										<Field className="rounded-lg border border-border/70">
											<Collapsible className="group/more">
												<CollapsibleTrigger
													render={
														<Button
															type="button"
															variant="ghost"
															className="h-auto w-full justify-between gap-2 rounded-lg px-3 py-2"
														/>
													}
												>
													More options
													<span className="flex items-center gap-1.5 font-normal text-muted-foreground text-xs">
														<span className="group-data-[open]/more:hidden">
															Tags, tasks, repeat…
														</span>
														<ChevronDownIcon className="size-4 transition-transform group-data-[open]/more:rotate-180" />
													</span>
												</CollapsibleTrigger>
												<CollapsibleContent>
													<Separator />
													<FieldGroup className="gap-4 px-3 py-3">
														{(tags.data?.tags ?? []).length > 0 ? (
															<Field>
																<FieldLabel>Shift Tags</FieldLabel>
																<div className="flex flex-wrap gap-2">
																	{(tags.data?.tags ?? []).map((tag) => (
																		<Button
																			key={tag.id}
																			type="button"
																			size="sm"
																			variant={
																				form.tagIds.includes(tag.id)
																					? "secondary"
																					: "outline"
																			}
																			onClick={() =>
																				setForm({
																					...form,
																					tagIds: form.tagIds.includes(tag.id)
																						? form.tagIds.filter(
																								(id) => id !== tag.id,
																							)
																						: [...form.tagIds, tag.id],
																				})
																			}
																		>
																			{tag.name}
																		</Button>
																	))}
																</div>
															</Field>
														) : null}
														<Field>
															<FieldLabel htmlFor="shift-tasks">
																Shift Tasks
															</FieldLabel>
															<Textarea
																id="shift-tasks"
																value={form.taskTitles}
																onChange={(event) =>
																	setForm({
																		...form,
																		taskTitles: event.target.value,
																	})
																}
																placeholder="One checklist item per line"
															/>
															<FieldDescription>
																Saving replaces the checklist on this Shift.
															</FieldDescription>
														</Field>
														<Field>
															<FieldLabel htmlFor="shift-repeat">
																Repeat into later weeks
															</FieldLabel>
															<div className="flex gap-2">
																<Input
																	id="shift-repeat"
																	type="number"
																	min={1}
																	max={12}
																	value={repeatWeeks}
																	onChange={(event) =>
																		setRepeatWeeks(event.target.value)
																	}
																/>
																<Button
																	type="button"
																	variant="outline"
																	disabled={repeatShift.isPending}
																	onClick={() =>
																		repeatShift.mutate({
																			shiftId: form.shiftId ?? "",
																			weeks: Math.max(
																				1,
																				Math.min(12, Number(repeatWeeks) || 1),
																			),
																		})
																	}
																>
																	Copy forward
																</Button>
															</div>
														</Field>
													</FieldGroup>
												</CollapsibleContent>
											</Collapsible>
										</Field>
									) : null}
									{needsOverride ? (
										<Field>
											<FieldLabel htmlFor="shift-override">
												Unavailability override
											</FieldLabel>
											<Textarea
												id="shift-override"
												required
												value={form.unavailabilityOverrideReason}
												onChange={(event) =>
													setForm({
														...form,
														unavailabilityOverrideReason: event.target.value,
													})
												}
												placeholder="Why this worker is scheduled anyway"
											/>
											<FieldDescription>
												This worker marked unavailability during this time.
												Record a reason to schedule them anyway. Preferences
												never block scheduling.
											</FieldDescription>
										</Field>
									) : null}
									{selectedStaff?.preference ? (
										<p className="text-muted-foreground text-xs">
											Preference (does not block): {selectedStaff.preference}
										</p>
									) : null}
									{overlappingShift ? (
										<Alert variant="destructive">
											<AlertTriangleIcon />
											<AlertTitle>Overlaps another shift</AlertTitle>
											<AlertDescription>
												{overlappingShift.positionName} on{" "}
												{formatDayLabel(overlappingShift.date)}. You can still
												save; it will show as a conflict on the week.
											</AlertDescription>
										</Alert>
									) : null}
									{overlappingTimeOff ? (
										<Alert variant="destructive">
											<AlertTriangleIcon />
											<AlertTitle>During approved time off</AlertTitle>
											<AlertDescription>
												This worker has approved time off covering this window.
												You can still save; it will show as a conflict.
											</AlertDescription>
										</Alert>
									) : null}
									{selectedShiftTimeclock?.versionShiftId &&
									selectedShiftAssigned ? (
										<Field>
											<FieldLabel>Today operations</FieldLabel>
											<FieldDescription>
												These marks stay on the published Shift. They do not
												change the schedule. Punch times use{" "}
												{data.schedule.timezone}.
											</FieldDescription>
											{selectedShiftTimeclock.attendance ? (
												<Badge variant="destructive">
													{selectedShiftTimeclock.attendance === "no_show"
														? "No-show"
														: selectedShiftTimeclock.attendance === "sick"
															? "Sick"
															: "Late"}
												</Badge>
											) : null}
											<div className="flex flex-wrap gap-2">
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={markAttendance.isPending}
													onClick={() =>
														markAttendance.mutate(
															{
																versionShiftId:
																	selectedShiftTimeclock.versionShiftId,
																kind: "late",
															},
															{
																onSuccess: () => {
																	queryClient.invalidateQueries({
																		queryKey: [
																			"schedule-timeclock",
																			locationId,
																			weekStart,
																		],
																	});
																	toast.success("Marked late.");
																},
																onError: (error) =>
																	toast.error((error as Error).message),
															},
														)
													}
												>
													Late
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={markAttendance.isPending}
													onClick={() =>
														markAttendance.mutate(
															{
																versionShiftId:
																	selectedShiftTimeclock.versionShiftId,
																kind: "no_show",
															},
															{
																onSuccess: () => {
																	queryClient.invalidateQueries({
																		queryKey: [
																			"schedule-timeclock",
																			locationId,
																			weekStart,
																		],
																	});
																	toast.success("Marked no-show.");
																},
																onError: (error) =>
																	toast.error((error as Error).message),
															},
														)
													}
												>
													No-show
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={markAttendance.isPending}
													onClick={() =>
														markAttendance.mutate(
															{
																versionShiftId:
																	selectedShiftTimeclock.versionShiftId,
																kind: "sick",
															},
															{
																onSuccess: () => {
																	queryClient.invalidateQueries({
																		queryKey: [
																			"schedule-timeclock",
																			locationId,
																			weekStart,
																		],
																	});
																	toast.success("Marked sick.");
																},
																onError: (error) =>
																	toast.error((error as Error).message),
															},
														)
													}
												>
													Sick
												</Button>
											</div>
											<Field>
												<FieldLabel htmlFor="punch-in">Clock in</FieldLabel>
												<Input
													id="punch-in"
													type="datetime-local"
													step={60}
													className="h-9"
													value={punchInLocal}
													onChange={(event) =>
														setPunchInLocal(event.target.value)
													}
												/>
											</Field>
											<Field>
												<FieldLabel htmlFor="punch-out">Clock out</FieldLabel>
												<Input
													id="punch-out"
													type="datetime-local"
													step={60}
													className="h-9"
													disabled={punchStillOpen}
													value={punchOutLocal}
													onChange={(event) =>
														setPunchOutLocal(event.target.value)
													}
												/>
											</Field>
											<Field orientation="horizontal">
												<Checkbox
													id="punch-open"
													checked={punchStillOpen}
													onCheckedChange={(checked) =>
														setPunchStillOpen(checked === true)
													}
												/>
												<FieldLabel
													htmlFor="punch-open"
													className="font-normal"
												>
													Still on the clock
												</FieldLabel>
											</Field>
											<Input
												aria-label="Time Entry correction reason"
												placeholder="Reason for punch correction"
												value={punchReason}
												onChange={(event) => setPunchReason(event.target.value)}
											/>
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={
													editTimeEntry.isPending ||
													punchReason.trim().length < 3 ||
													!punchInLocal ||
													(!punchStillOpen && !punchOutLocal)
												}
												onClick={() => {
													const timezone = data.schedule.timezone;
													const clockedInAt = datetimeLocalToIso(
														punchInLocal,
														timezone,
													);
													if (!clockedInAt) {
														toast.error("Clock-in time is not valid");
														return;
													}
													const clockedOutAt = punchStillOpen
														? null
														: datetimeLocalToIso(punchOutLocal, timezone);
													if (!punchStillOpen && !clockedOutAt) {
														toast.error("Clock-out time is not valid");
														return;
													}
													editTimeEntry.mutate(
														{
															versionShiftId:
																selectedShiftTimeclock.versionShiftId,
															clockedInAt,
															clockedOutAt,
															reason: punchReason.trim(),
														},
														{
															onSuccess: () => {
																queryClient.invalidateQueries({
																	queryKey: [
																		"schedule-timeclock",
																		locationId,
																		weekStart,
																	],
																});
																setPunchReason("");
																toast.success("Time Entry saved.");
															},
															onError: (error) =>
																toast.error((error as Error).message),
														},
													);
												}}
											>
												{selectedShiftTimeclock.status
													? "Correct Time Entry"
													: "Record missed punch"}
											</Button>
										</Field>
									) : null}
								</FieldGroup>
							</div>
							<DialogFooter className="mx-0 mb-0 rounded-none border-t px-6 py-4">
								<Button
									type="submit"
									size="sm"
									disabled={createOrUpdate.isPending || !canSave}
								>
									{createOrUpdate.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									{form.shiftId
										? "Save"
										: `Add ${pendingAddCount} shift${pendingAddCount === 1 ? "" : "s"}`}
								</Button>
								{form.shiftId ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={createOrUpdate.isPending || !canSave}
										onClick={() => queueShiftSave({ ...form, shiftId: null })}
									>
										<CopyIcon data-icon="inline-start" />
										Save as copy
									</Button>
								) : null}
								{form.shiftId ? (
									<AlertDialog>
										<AlertDialogTrigger
											render={
												<Button type="button" variant="outline" size="sm" />
											}
										>
											<Trash2Icon data-icon="inline-start" />
											Delete
										</AlertDialogTrigger>
										<AlertDialogContent size="sm">
											<AlertDialogHeader>
												<AlertDialogMedia className="bg-destructive/10 text-destructive">
													<Trash2Icon />
												</AlertDialogMedia>
												<AlertDialogTitle>Delete this shift?</AlertDialogTitle>
												<AlertDialogDescription>
													This removes the shift from the current draft.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<AlertDialogAction
													variant="destructive"
													onClick={() => removeShift.mutate(form.shiftId ?? "")}
												>
													Delete
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								) : null}
							</DialogFooter>
						</form>
					) : null}
				</DialogContent>
			</Dialog>
			<PositionApprovalDialog
				approval={positionApproval}
				pending={createOrUpdate.isPending || movePending}
				onConfirm={handleApprovalConfirm}
				onClose={() => setPositionApproval(null)}
			/>
		</>
	);
});
