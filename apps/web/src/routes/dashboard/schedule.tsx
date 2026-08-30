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
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import { Separator } from "@SchedulesManager/ui/components/separator";
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
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangleIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CopyIcon,
	MapPinIcon,
	PlusIcon,
	TagsIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/date-picker";
import { PageHeader } from "@/components/page-header";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import type {
	ChangePreviewResponse,
	ScheduleResponse,
	ScheduleShiftDto,
} from "@/lib/queries";
import {
	useAcceptances,
	useLocations,
	usePublication,
	useSchedule,
} from "@/lib/queries";
import { formatMinute, formatShiftRange, WEEKDAY_NAMES } from "@/lib/time";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/schedule")({
	component: SchedulePage,
});

const DAY_HEADERS = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

function mondayOf(date: Date): string {
	const result = new Date(date);
	const day = result.getDay();
	const diff = (day === 0 ? -6 : 1) - day;
	result.setDate(result.getDate() + diff);
	return result.toLocaleDateString("sv-SE");
}

function addDays(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T12:00:00`);
	date.setDate(date.getDate() + days);
	return date.toLocaleDateString("sv-SE");
}

function formatDayLabel(dateKey: string): string {
	return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

function formatWeekLabel(weekStart: string): string {
	return `${formatDayLabel(weekStart)} – ${formatDayLabel(addDays(weekStart, 6))}`;
}

interface ShiftFormState {
	shiftId: string | null;
	employmentId: string;
	positionId: string;
	date: string;
	startMinute: number;
	endMinute: number;
	note: string;
	unavailabilityOverrideReason: string;
}

function emptyForm(date: string): ShiftFormState {
	return {
		shiftId: null,
		employmentId: "",
		positionId: "",
		date,
		startMinute: 9 * 60,
		endMinute: 17 * 60,
		note: "",
		unavailabilityOverrideReason: "",
	};
}

function staffWindowOverlaps(
	window: {
		kind: "recurring" | "date";
		weekday: number | null;
		date: string | null;
		startMinute: number;
		endMinute: number;
	},
	date: string,
	startMinute: number,
	endMinute: number,
): boolean {
	const overnight = endMinute <= startMinute;
	const dates = overnight ? [date, addDays(date, 1)] : [date];
	const shiftStartAbs = startMinute;
	const shiftEndAbs = overnight ? endMinute + 1440 : endMinute;

	for (const key of dates) {
		if (window.kind === "recurring" && window.weekday !== null) {
			if (new Date(`${key}T12:00:00`).getDay() !== window.weekday) continue;
		} else if (window.kind === "date" && window.date) {
			if (window.date !== key) continue;
		} else {
			continue;
		}
		const offset = key === date ? 0 : 1440;
		const winStart = window.startMinute + offset;
		const winEnd = window.endMinute + offset;
		if (shiftStartAbs < winEnd && winStart < shiftEndAbs) return true;
	}
	return false;
}

function dayOffset(weekStart: string, date: string): number {
	const start = new Date(`${weekStart}T12:00:00`).getTime();
	const day = new Date(`${date}T12:00:00`).getTime();
	return Math.round((day - start) / 86_400_000);
}

function shiftRangeMinutes(
	weekStart: string,
	date: string,
	startMinute: number,
	endMinute: number,
): [number, number] {
	const start = dayOffset(weekStart, date) * 1440 + startMinute;
	const overnight = endMinute <= startMinute;
	const endDate = overnight ? addDays(date, 1) : date;
	const end = dayOffset(weekStart, endDate) * 1440 + endMinute;
	return [start, end];
}

function defaultAddDate(weekStart: string): string {
	const today = new Date().toLocaleDateString("sv-SE");
	const last = addDays(weekStart, 6);
	if (today >= weekStart && today <= last) return today;
	return weekStart;
}

function positionsForWorker(
	positions: ScheduleResponse["positions"],
	member: ScheduleResponse["staff"][number] | undefined,
) {
	if (!member || member.positionIds.length === 0) return positions;
	return positions.filter((position) =>
		member.positionIds.includes(position.id),
	);
}

function SchedulePage() {
	const { workplace } = useWorkplace();
	const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
	const locations = useLocations(workplace?.id);
	const [locationId, setLocationId] = useState<string | undefined>(undefined);

	const activeLocationId = locationId ?? locations.data?.[0]?.id;
	const schedule = useSchedule(activeLocationId, weekStart);
	const publication = usePublication(schedule.data?.schedule.id);
	const acceptances = useAcceptances(schedule.data?.schedule.id);
	const queryClient = useQueryClient();
	const [form, setForm] = useState<ShiftFormState | null>(null);
	const [publishPreview, setPublishPreview] =
		useState<ChangePreviewResponse | null>(null);

	async function invalidate() {
		await queryClient.invalidateQueries({ queryKey: ["schedule"] });
		await queryClient.refetchQueries({
			queryKey: ["schedule", activeLocationId, weekStart],
		});
	}

	const createOrUpdate = useMutation({
		mutationFn: async (state: ShiftFormState) => {
			if (!activeLocationId) throw new Error("No location selected");
			if (state.shiftId) {
				return api(`/v1/shifts/${state.shiftId}`, {
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
					},
				});
			}
			return api(
				`/v1/locations/${activeLocationId}/schedules/${weekStart}/shifts`,
				{
					method: "POST",
					body: {
						employmentId: state.employmentId || null,
						positionId: state.positionId,
						date: state.date,
						startMinute: state.startMinute,
						endMinute: state.endMinute,
						note: state.note || undefined,
						unavailabilityOverrideReason:
							state.unavailabilityOverrideReason.trim() || undefined,
					},
				},
			);
		},
		onSuccess: async () => {
			setForm(null);
			await invalidate();
			toast.success("Shift saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const removeShift = useMutation({
		mutationFn: (shiftId: string) =>
			api(`/v1/shifts/${shiftId}`, { method: "DELETE" }),
		onSuccess: async () => {
			setForm(null);
			await invalidate();
			toast.success("Shift removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const copyPrevious = useMutation({
		mutationFn: () =>
			api(
				`/v1/locations/${activeLocationId}/schedules/${weekStart}/copy-previous`,
				{ method: "POST" },
			),
		onSuccess: async () => {
			await invalidate();
			toast.success("Previous week copied.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const previewPublish = useMutation({
		mutationFn: async () => {
			const scheduleId = schedule.data?.schedule.id;
			if (!scheduleId) throw new Error("No schedule loaded");
			return api<ChangePreviewResponse>(
				`/v1/schedules/${scheduleId}/change-preview`,
			);
		},
		onSuccess: (preview) => setPublishPreview(preview),
		onError: (error) => toast.error((error as Error).message),
	});

	const publish = useMutation({
		mutationFn: async () => {
			const scheduleId = schedule.data?.schedule.id;
			if (!scheduleId) throw new Error("No schedule loaded");
			return api<{
				version: { versionNumber: number; workers: number };
				changes: {
					total: number;
					material: number;
					acceptancesRequired: number;
				};
			}>(`/v1/schedules/${scheduleId}/publish`, { method: "POST" });
		},
		onSuccess: async (result) => {
			setPublishPreview(null);
			await invalidate();
			await queryClient.invalidateQueries({
				queryKey: ["publication", schedule.data?.schedule.id],
			});
			await queryClient.invalidateQueries({
				queryKey: ["acceptances", schedule.data?.schedule.id],
			});
			await queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
			await queryClient.invalidateQueries({ queryKey: ["notifications"] });
			const acceptanceNote =
				result.changes.acceptancesRequired > 0
					? ` ${result.changes.acceptancesRequired} late change(s) need worker acceptance.`
					: "";
			toast.success(
				`Published version ${result.version.versionNumber} to ${result.version.workers} worker(s).${acceptanceNote}`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const data = schedule.data;
	const publicationState = data?.publication;
	const conflictCount =
		data?.shifts.reduce((sum, shift) => sum + shift.conflicts.length, 0) ?? 0;
	const openShiftCount =
		data?.shifts.filter((shift) => shift.employmentId === null).length ?? 0;
	const totalHours =
		data?.hours.reduce((sum, entry) => sum + entry.minutes, 0) ?? 0;

	const days = Array.from({ length: 7 }, (_, index) =>
		addDays(weekStart, index),
	);

	function openEdit(shift: ScheduleShiftDto) {
		setForm({
			shiftId: shift.id,
			employmentId: shift.employmentId ?? "",
			positionId: shift.positionId,
			date: shift.date,
			startMinute: shift.startMinute,
			endMinute: shift.endMinute,
			note: shift.note ?? "",
			unavailabilityOverrideReason: shift.unavailabilityOverrideReason ?? "",
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
		setForm(draft);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!form) return;
		if (!canSave) return;
		createOrUpdate.mutate(form);
	}

	const selectedStaff = data?.staff.find(
		(member) => member.employmentId === form?.employmentId,
	);
	const allowedPositions = positionsForWorker(
		data?.positions ?? [],
		selectedStaff,
	);
	const overlappingWindows = selectedStaff
		? (selectedStaff.unavailability ?? []).filter((window) =>
				form
					? staffWindowOverlaps(
							window,
							form.date,
							form.startMinute,
							form.endMinute,
						)
					: false,
			)
		: [];
	const needsOverride = overlappingWindows.length > 0;
	const positionBlocked = Boolean(
		form?.positionId &&
			selectedStaff &&
			selectedStaff.positionIds.length > 0 &&
			!selectedStaff.positionIds.includes(form.positionId),
	);
	const overlappingShift = form?.employmentId
		? (data?.shifts ?? []).find((shift) => {
				if (shift.employmentId !== form.employmentId) return false;
				if (form.shiftId && shift.id === form.shiftId) return false;
				const [aStart, aEnd] = shiftRangeMinutes(
					weekStart,
					form.date,
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
			})
		: undefined;
	const overlappingTimeOff = form?.employmentId
		? (selectedStaff?.timeOff ?? []).find((request) => {
				if (request.status !== "approved") return false;
				const overnight = form.endMinute <= form.startMinute;
				const [year, month, day] = form.date.split("-").map(Number);
				const start = new Date(
					year ?? 0,
					(month ?? 1) - 1,
					day ?? 1,
					Math.floor(form.startMinute / 60),
					form.startMinute % 60,
				);
				const endDate = overnight ? addDays(form.date, 1) : form.date;
				const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
				const end = new Date(
					endYear ?? 0,
					(endMonth ?? 1) - 1,
					endDay ?? 1,
					Math.floor(form.endMinute / 60),
					form.endMinute % 60,
				);
				return (
					start < new Date(request.endsAt) && new Date(request.startsAt) < end
				);
			})
		: undefined;
	const canSave = Boolean(
		form?.positionId &&
			form.startMinute !== form.endMinute &&
			!positionBlocked &&
			(!needsOverride || form.unavailabilityOverrideReason.trim()),
	);

	const locationItems = (locations.data ?? []).map((location) => ({
		label: location.name,
		value: location.id,
	}));
	const workerItems = [
		{ label: "Open (no worker yet)", value: null },
		...(data?.staff ?? []).map((member) => ({
			label: member.name,
			value: member.employmentId,
		})),
	];
	const positionSource =
		positionBlocked && form?.positionId
			? (data?.positions ?? []).filter(
					(position) =>
						position.id === form.positionId ||
						allowedPositions.some((allowed) => allowed.id === position.id),
				)
			: allowedPositions;
	const positionItems = [
		{ label: "Choose…", value: null },
		...positionSource.map((position) => ({
			label: position.name,
			value: position.id,
		})),
	];
	return (
		<section className="flex flex-col gap-6">
			<PageHeader
				title="Schedule"
				description="Build the week by worker, resolve conflicts, then publish one clear schedule."
				actions={
					<>
						<Button
							variant="outline"
							disabled={
								previewPublish.isPending ||
								!schedule.data ||
								(publicationState?.latestVersionNumber != null &&
									!publicationState.hasUnpublishedChanges)
							}
							onClick={() => previewPublish.mutate()}
						>
							{previewPublish.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Review & publish
						</Button>
						<Button
							size="sm"
							disabled={!data || data.positions.length === 0}
							onClick={() => openCreate(defaultAddDate(weekStart))}
						>
							<PlusIcon data-icon="inline-start" />
							Add shift
						</Button>
					</>
				}
			/>

			<Card size="sm">
				<CardContent className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<Select
								items={locationItems}
								value={activeLocationId ?? null}
								onValueChange={(value) => {
									if (!value) return;
									setLocationId(value);
									setForm(null);
								}}
							>
								<SelectTrigger aria-label="Location" className="min-w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									<SelectGroup>
										{locationItems.map((item) => (
											<SelectItem key={item.value} value={item.value}>
												{item.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							<div className="flex items-center rounded-4xl border bg-background p-0.5">
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => {
										setWeekStart((current) => addDays(current, -7));
										setForm(null);
									}}
								>
									<ChevronLeftIcon />
									<span className="sr-only">Previous week</span>
								</Button>
								<span className="min-w-52 px-2 text-center font-medium text-sm tabular-nums">
									{formatWeekLabel(weekStart)}
								</span>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => {
										setWeekStart((current) => addDays(current, 7));
										setForm(null);
									}}
								>
									<ChevronRightIcon />
									<span className="sr-only">Next week</span>
								</Button>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setWeekStart(mondayOf(new Date()));
									setForm(null);
								}}
							>
								Today
							</Button>
						</div>
						<Button
							variant="ghost"
							size="sm"
							disabled={copyPrevious.isPending || !activeLocationId}
							onClick={() => copyPrevious.mutate()}
						>
							{copyPrevious.isPending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<CopyIcon data-icon="inline-start" />
							)}
							Copy last week
						</Button>
					</div>
					<Separator />
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
						{publicationState?.latestVersionNumber == null ? (
							<Badge variant="outline">Draft · not published</Badge>
						) : publicationState.hasUnpublishedChanges ? (
							<Badge variant="secondary">
								Draft changes · published v
								{publicationState.latestVersionNumber}
							</Badge>
						) : (
							<Badge>Published v{publicationState.latestVersionNumber}</Badge>
						)}
						<span>
							<strong className="font-semibold tabular-nums">
								{data?.shifts.length ?? 0}
							</strong>{" "}
							shifts
						</span>
						<span>
							<strong className="font-semibold tabular-nums">
								{(totalHours / 60).toFixed(1)}
							</strong>{" "}
							scheduled hours
						</span>
						<span
							className={cn(openShiftCount > 0 && "font-medium text-primary")}
						>
							<strong className="tabular-nums">{openShiftCount}</strong> open
						</span>
						<span
							className={cn(
								conflictCount > 0 && "font-medium text-destructive",
							)}
						>
							<strong className="tabular-nums">{conflictCount}</strong>{" "}
							conflicts
						</span>
						<span className="ml-auto text-muted-foreground text-xs">
							{data?.schedule.timezone ?? "Loading timezone…"}
						</span>
					</div>
				</CardContent>
			</Card>

			{locations.isLoading ? <Skeleton className="h-48" /> : null}
			{schedule.isError ? (
				<Alert variant="destructive">
					<AlertTriangleIcon />
					<AlertTitle>We couldn’t load this schedule</AlertTitle>
					<AlertDescription className="flex flex-col items-start gap-3">
						<span>{(schedule.error as Error).message}</span>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void schedule.refetch()}
						>
							Try again
						</Button>
					</AlertDescription>
				</Alert>
			) : null}

			{!locations.isLoading && (locations.data?.length ?? 0) === 0 ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MapPinIcon />
						</EmptyMedia>
						<EmptyTitle>Add a location to start scheduling</EmptyTitle>
						<EmptyDescription>
							Schedules are drafted per location and workweek. Add the first
							restaurant location, then you can place shifts here.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button
							nativeButton={false}
							render={<Link to="/dashboard/settings" />}
						>
							Go to settings
						</Button>
					</EmptyContent>
				</Empty>
			) : null}

			{!locations.isLoading &&
			(locations.data?.length ?? 0) > 0 &&
			data &&
			data.positions.length === 0 ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<TagsIcon />
						</EmptyMedia>
						<EmptyTitle>Add a position before placing shifts</EmptyTitle>
						<EmptyDescription>
							Every shift needs a position such as server, cook, or bartender.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button
							nativeButton={false}
							render={<Link to="/dashboard/settings" />}
						>
							Go to settings
						</Button>
					</EmptyContent>
				</Empty>
			) : null}

			{conflictCount > 0 ? (
				<Alert variant="destructive">
					<AlertTriangleIcon />
					<AlertTitle>
						{conflictCount} scheduling conflict{conflictCount === 1 ? "" : "s"}
					</AlertTitle>
					<AlertDescription>
						You can still publish, but workers will be notified of the current
						draft including these conflicts.
					</AlertDescription>
				</Alert>
			) : null}

			<Sheet
				open={form !== null && data !== undefined}
				onOpenChange={(open) => {
					if (!open) setForm(null);
				}}
			>
				<SheetContent
					side="right"
					className="w-full sm:max-w-lg"
					showCloseButton
				>
					{form && data ? (
						<form onSubmit={submit} className="flex h-full flex-col">
							<SheetHeader>
								<SheetTitle>
									{form.shiftId ? "Edit shift" : "Add shift"}
								</SheetTitle>
								<SheetDescription>
									Times are in {data.schedule.timezone}. Leave the worker open
									if you have not assigned anyone yet.
								</SheetDescription>
							</SheetHeader>
							<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="shift-worker">Worker</FieldLabel>
										<Select
											items={workerItems}
											value={form.employmentId || null}
											onValueChange={(employmentId) => {
												const nextEmploymentId = employmentId ?? "";
												const member = data.staff.find(
													(candidate) =>
														candidate.employmentId === nextEmploymentId,
												);
												const allowed = positionsForWorker(
													data.positions,
													member,
												);
												let positionId = form.positionId;
												if (allowed.length === 1) {
													positionId = allowed[0]?.id ?? "";
												} else if (
													positionId &&
													allowed.length > 0 &&
													!allowed.some(
														(position) => position.id === positionId,
													)
												) {
													positionId = "";
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
									</Field>
									<Field data-invalid={positionBlocked || undefined}>
										<FieldLabel htmlFor="shift-position">Position</FieldLabel>
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
											<SelectTrigger
												id="shift-position"
												className="w-full"
												aria-invalid={positionBlocked || undefined}
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent alignItemWithTrigger={false}>
												<SelectGroup>
													{positionItems.map((item) => (
														<SelectItem
															key={item.value ?? "choose"}
															value={item.value}
														>
															{item.label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
										{positionBlocked ? (
											<FieldError>
												This worker is not approved for that position.
											</FieldError>
										) : allowedPositions.length === 0 && form.employmentId ? (
											<FieldDescription>
												This worker has no approved positions.
											</FieldDescription>
										) : null}
									</Field>
									<Field>
										<FieldLabel htmlFor="shift-date">Day</FieldLabel>
										<DatePicker
											id="shift-date"
											value={form.date}
											onValueChange={(date) => setForm({ ...form, date })}
											disabled={(date) => {
												const key = date.toLocaleDateString("sv-SE");
												return key < weekStart || key > addDays(weekStart, 6);
											}}
										/>
									</Field>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field>
											<FieldLabel htmlFor="shift-start">Start</FieldLabel>
											<TimePicker
												id="shift-start"
												value={form.startMinute}
												onValueChange={(startMinute) =>
													setForm({ ...form, startMinute })
												}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="shift-end">End</FieldLabel>
											<TimePicker
												id="shift-end"
												value={form.endMinute}
												onValueChange={(endMinute) =>
													setForm({ ...form, endMinute })
												}
												overnightAfterMinute={form.startMinute}
											/>
											{form.endMinute <= form.startMinute ? (
												<FieldDescription>
													This shift continues overnight into the next day.
												</FieldDescription>
											) : null}
										</Field>
									</div>
									<Field>
										<FieldLabel htmlFor="shift-note">Note</FieldLabel>
										<Input
											id="shift-note"
											value={form.note}
											onChange={(event) =>
												setForm({ ...form, note: event.target.value })
											}
											placeholder="Optional"
											maxLength={200}
										/>
									</Field>
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
								</FieldGroup>
							</div>
							<SheetFooter className="flex-row flex-wrap">
								<Button
									type="submit"
									size="sm"
									disabled={createOrUpdate.isPending || !canSave}
								>
									{createOrUpdate.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									{form.shiftId ? "Save" : "Add shift"}
								</Button>
								{form.shiftId ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={createOrUpdate.isPending || !canSave}
										onClick={() =>
											createOrUpdate.mutate({ ...form, shiftId: null })
										}
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
							</SheetFooter>
						</form>
					) : null}
				</SheetContent>
			</Sheet>

			<div className="overflow-x-auto rounded-4xl bg-card shadow-md ring-1 ring-foreground/5">
				<div className="grid min-w-[1120px] grid-cols-[180px_repeat(7,minmax(132px,1fr))]">
					<div className="sticky left-0 z-20 border-r border-b bg-muted/90 p-3 backdrop-blur">
						<span className="font-semibold text-sm">Worker</span>
					</div>
					{days.map((day, index) => (
						<div
							key={day}
							className={cn(
								"border-b p-3 text-center",
								index < 6 && "border-r",
								day === new Date().toLocaleDateString("sv-SE") &&
									"bg-primary/8",
							)}
						>
							<p className="font-semibold text-sm">
								{DAY_HEADERS[index]?.slice(0, 3)}
							</p>
							<p className="text-muted-foreground text-xs tabular-nums">
								{formatDayLabel(day).replace(/^\w+,?\s*/, "")}
							</p>
						</div>
					))}
					{(data?.staff ?? []).map((member) => (
						<div key={member.employmentId} className="contents">
							<div className="sticky left-0 z-10 flex min-h-24 flex-col justify-between border-r border-b bg-card p-3">
								<div>
									<p className="truncate font-medium text-sm">{member.name}</p>
									<p className="truncate text-muted-foreground text-xs">
										{member.positionIds.length} position
										{member.positionIds.length === 1 ? "" : "s"}
									</p>
								</div>
								<p className="font-medium text-muted-foreground text-xs tabular-nums">
									{(
										(data?.hours.find(
											(entry) => entry.employmentId === member.employmentId,
										)?.minutes ?? 0) / 60
									).toFixed(1)}
									h
								</p>
							</div>
							{days.map((day, dayIndex) => {
								const workerShifts = (data?.shifts ?? []).filter(
									(shift) =>
										shift.date === day &&
										shift.employmentId === member.employmentId,
								);
								return (
									<div
										key={day}
										className={cn(
											"group min-h-24 border-b p-1.5",
											dayIndex < 6 && "border-r",
											day === new Date().toLocaleDateString("sv-SE") &&
												"bg-primary/5",
										)}
									>
										{workerShifts.map((shift) => (
											<Button
												key={shift.id}
												type="button"
												onClick={() => openEdit(shift)}
												variant={
													shift.conflicts.length > 0
														? "destructive"
														: "secondary"
												}
												size="sm"
												className={cn(
													"mb-1.5 h-auto w-full justify-start whitespace-normal py-2 text-left",
													shift.conflicts.length > 0 &&
														"ring-1 ring-destructive/30",
												)}
											>
												<span className="grid min-w-0 flex-1 gap-0.5">
													<span className="font-semibold text-xs tabular-nums">
														{formatShiftRange(
															shift.startMinute,
															shift.endMinute,
															shift.overnight,
														)}
													</span>
													<span className="truncate text-xs opacity-70">
														{shift.positionName}
													</span>
													{shift.conflicts.length > 0 ? (
														<span className="mt-0.5 flex items-center gap-1 text-xs">
															<AlertTriangleIcon /> Conflict
														</span>
													) : null}
												</span>
											</Button>
										))}
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
											disabled={!data || data.positions.length === 0}
											onClick={() => {
												const draft = emptyForm(day);
												draft.employmentId = member.employmentId;
												const positions = positionsForWorker(
													data?.positions ?? [],
													member,
												);
												if (positions.length === 1)
													draft.positionId = positions[0]?.id ?? "";
												setForm(draft);
											}}
										>
											<PlusIcon />
											<span className="sr-only">
												Add {member.name} on {DAY_HEADERS[dayIndex]}
											</span>
										</Button>
									</div>
								);
							})}
						</div>
					))}
					{openShiftCount > 0 ? (
						<>
							<div className="sticky left-0 z-10 border-r bg-muted p-3">
								<p className="font-semibold text-sm">Open shifts</p>
								<p className="text-muted-foreground text-xs">Needs a worker</p>
							</div>
							{days.map((day, dayIndex) => (
								<div
									key={day}
									className={cn(
										"min-h-20 bg-muted/50 p-1.5",
										dayIndex < 6 && "border-r",
									)}
								>
									{(data?.shifts ?? [])
										.filter(
											(shift) =>
												shift.date === day && shift.employmentId === null,
										)
										.map((shift) => (
											<Button
												key={shift.id}
												type="button"
												onClick={() => openEdit(shift)}
												variant="secondary"
												size="sm"
												className="mb-1.5 h-auto w-full justify-start whitespace-normal py-2 text-left"
											>
												<span className="grid min-w-0 flex-1 gap-0.5">
													<span className="font-semibold text-xs tabular-nums">
														{formatShiftRange(
															shift.startMinute,
															shift.endMinute,
															shift.overnight,
														)}
													</span>
													<span className="truncate text-xs opacity-70">
														{shift.positionName}
													</span>
												</span>
											</Button>
										))}
								</div>
							))}
						</>
					) : null}
				</div>
			</div>

			{data?.staff.some(
				(member) =>
					(member.unavailability?.length ?? 0) > 0 ||
					member.preference ||
					(member.timeOff?.length ?? 0) > 0,
			) ? (
				<Card>
					<CardHeader>
						<CardTitle>Worker constraints</CardTitle>
						<CardDescription>
							Unavailability and approved time off block scheduling unless you
							record an override. Preferences are guidance only.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ItemGroup className="grid gap-2 lg:grid-cols-2">
							{data.staff
								.filter(
									(member) =>
										(member.unavailability?.length ?? 0) > 0 ||
										member.preference ||
										(member.timeOff?.length ?? 0) > 0,
								)
								.map((member) => (
									<Item
										key={member.employmentId}
										variant="outline"
										role="listitem"
									>
										<ItemContent>
											<ItemTitle>{member.name}</ItemTitle>
											<ItemDescription>
												{(member.unavailability?.length ?? 0) > 0
													? (member.unavailability ?? [])
															.map((window) =>
																window.kind === "recurring"
																	? `Can't work ${WEEKDAY_NAMES[window.weekday ?? 0]} ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`
																	: `Can't work ${window.date} ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`,
															)
															.join(" · ")
													: null}
												{member.preference
													? `${(member.unavailability?.length ?? 0) > 0 ? " · " : ""}Prefers: ${member.preference}`
													: ""}
												{(member.timeOff?.length ?? 0) > 0
													? `${(member.unavailability?.length ?? 0) > 0 || member.preference ? " · " : ""}${(
															member.timeOff ?? []
														)
															.map(
																(request) =>
																	`${request.status} time off ${new Date(request.startsAt).toLocaleDateString()}–${new Date(request.endsAt).toLocaleDateString()}`,
															)
															.join(" · ")}`
													: ""}
											</ItemDescription>
										</ItemContent>
									</Item>
								))}
						</ItemGroup>
					</CardContent>
				</Card>
			) : null}

			{data && data.hours.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Hours by worker</CardTitle>
						<CardDescription>
							Totals for the draft week, split by position.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ItemGroup className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{data.hours.map((entry) => (
								<Item
									key={entry.employmentId}
									variant="outline"
									role="listitem"
								>
									<ItemContent>
										<ItemTitle>{entry.name}</ItemTitle>
										<ItemDescription>
											{(entry.minutes / 60).toFixed(1)}h ·{" "}
											{entry.byPosition
												.map(
													(byPosition) =>
														`${byPosition.positionName} ${(byPosition.minutes / 60).toFixed(1)}h`,
												)
												.join(", ")}
										</ItemDescription>
									</ItemContent>
								</Item>
							))}
						</ItemGroup>
					</CardContent>
				</Card>
			) : null}

			{acceptances.data && acceptances.data.acceptances.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Shift acceptances</CardTitle>
						<CardDescription>
							Late material changes require the worker's explicit acceptance.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ItemGroup>
							{acceptances.data.acceptances.map((acceptance) => (
								<Item key={acceptance.id} variant="outline" role="listitem">
									<ItemContent>
										<ItemTitle>
											{acceptance.workerName} · v{acceptance.versionNumber}
										</ItemTitle>
										<ItemDescription>
											{acceptance.changeSummary}
										</ItemDescription>
									</ItemContent>
									<Badge
										className="uppercase"
										variant={
											acceptance.status === "declined"
												? "destructive"
												: acceptance.status === "accepted"
													? "default"
													: "secondary"
										}
									>
										{acceptance.status}
									</Badge>
								</Item>
							))}
						</ItemGroup>
					</CardContent>
				</Card>
			) : null}

			{publication.data && publication.data.versions.length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>Publication &amp; acknowledgements</CardTitle>
						<CardDescription>
							Acknowledgement means a worker saw the schedule. It does not mean
							they accepted the shifts.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ItemGroup>
							{publication.data.versions.slice(0, 3).map((version) => {
								const acknowledged = version.workers.filter(
									(worker) => worker.status === "acknowledged",
								).length;
								return (
									<Item key={version.id} variant="outline" role="listitem">
										<ItemContent>
											<ItemTitle>
												Version {version.versionNumber} ·{" "}
												{new Date(version.publishedAt).toLocaleString()}
											</ItemTitle>
											<ItemDescription>
												{acknowledged}/{version.workers.length} acknowledged
											</ItemDescription>
											<div className="mt-2 flex flex-wrap gap-1.5">
												{version.workers.map((worker) => (
													<Badge
														key={worker.employmentId}
														title={`${worker.name} · ${worker.status}`}
														variant={
															worker.status === "acknowledged"
																? "default"
																: "secondary"
														}
													>
														{worker.name} ·{" "}
														{worker.status === "acknowledged"
															? "Seen"
															: worker.status === "delivered"
																? "Delivered"
																: "Sent"}
													</Badge>
												))}
											</div>
										</ItemContent>
									</Item>
								);
							})}
						</ItemGroup>
					</CardContent>
				</Card>
			) : null}

			<AlertDialog
				open={publishPreview !== null}
				onOpenChange={(open) => {
					if (!open) setPublishPreview(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Publish this draft?</AlertDialogTitle>
						<AlertDialogDescription>
							{conflictCount > 0
								? `This draft has ${conflictCount} conflict(s). Publishing creates and sends a new immutable schedule version.`
								: "Publishing creates and sends a new immutable schedule version. Future edits begin the next draft."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{publishPreview?.hasPublishedVersion &&
					publishPreview.changes.length > 0 ? (
						<ul className="flex max-h-48 flex-col gap-1 overflow-auto text-muted-foreground text-xs">
							{publishPreview.changes.map((change) => (
								<li key={change.summary}>
									{change.material ? "• " : "  "}
									{change.summary}
								</li>
							))}
						</ul>
					) : null}
					{publishPreview && publishPreview.wouldRequireAcceptance > 0 ? (
						<p className="text-muted-foreground text-xs">
							{publishPreview.wouldRequireAcceptance} change(s) start within the{" "}
							{publishPreview.noticeWindowHours}h notice window and will require
							worker acceptance.
						</p>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={publish.isPending}
							onClick={() => publish.mutate()}
						>
							{publish.isPending ? <Spinner data-icon="inline-start" /> : null}
							Publish now
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
