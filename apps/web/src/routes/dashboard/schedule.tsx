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
import { Avatar, AvatarFallback } from "@SchedulesManager/ui/components/avatar";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Card, CardHeader } from "@SchedulesManager/ui/components/card";
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
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@SchedulesManager/ui/components/popover";
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
import { Textarea } from "@SchedulesManager/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@SchedulesManager/ui/components/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@SchedulesManager/ui/components/tooltip";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	DragDropProvider,
	type DragEndEvent,
	useDraggable,
	useDroppable,
} from "@dnd-kit/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangleIcon,
	BanIcon,
	CalendarOffIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	Columns3Icon,
	CopyIcon,
	ListFilterIcon,
	MapPinIcon,
	PlusIcon,
	SearchIcon,
	TagsIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
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
	useWorkplaceSettings,
} from "@/lib/queries";
import {
	formatClockTime,
	formatDurationMs,
	formatMinute,
	WEEKDAY_NAMES,
} from "@/lib/time";
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

function weekStartOf(date: Date, weekStartDay: number): string {
	const result = new Date(date);
	const diff = (result.getDay() - weekStartDay + 7) % 7;
	result.setDate(result.getDate() - diff);
	return result.toLocaleDateString("sv-SE");
}

function orderedDayHeaders(weekStartDay: number): string[] {
	return Array.from(
		{ length: 7 },
		(_, index) => DAY_HEADERS[(weekStartDay + index) % 7],
	);
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
	const start = new Date(`${weekStart}T12:00:00`);
	const end = new Date(`${addDays(weekStart, 6)}T12:00:00`);
	const fmt = (d: Date) =>
		d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	return `${fmt(start)} – ${fmt(end)}`;
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

function positionsLabel(count: number): string {
	if (count === 0) return "All positions";
	return `${count} position${count === 1 ? "" : "s"}`;
}

interface CellConstraint {
	key: string;
	kind: "unavailability" | "timeOff";
	label: string;
}

function localDateKey(date: Date): string {
	return date.toLocaleDateString("sv-SE");
}

function timeOffCoversDay(
	request: { startsAt: string; endsAt: string },
	day: string,
): boolean {
	const startKey = localDateKey(new Date(request.startsAt));
	const endExclusive = new Date(new Date(request.endsAt).getTime() - 1);
	return day >= startKey && day <= localDateKey(endExclusive);
}

function cellConstraints(
	member: ScheduleResponse["staff"][number],
	day: string,
): CellConstraint[] {
	const weekday = new Date(`${day}T12:00:00`).getDay();
	const constraints: CellConstraint[] = [];
	for (const window of member.unavailability ?? []) {
		const matches =
			window.kind === "recurring"
				? window.weekday === weekday
				: window.date === day;
		if (!matches) continue;
		constraints.push({
			key: `unavailability-${window.kind}-${window.weekday ?? window.date}-${window.startMinute}`,
			kind: "unavailability",
			label: `Can't work ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`,
		});
	}
	for (const request of member.timeOff ?? []) {
		if (request.status === "declined") continue;
		if (!timeOffCoversDay(request, day)) continue;
		constraints.push({
			key: `timeOff-${request.startsAt}`,
			kind: "timeOff",
			label: request.status === "approved" ? "Time off" : "Time off (pending)",
		});
	}
	return constraints;
}

const POSITION_PALETTE = [
	{
		block: "bg-card text-category-1-foreground hover:bg-category-1/35",
		dot: "bg-category-1-marker",
	},
	{
		block: "bg-card text-category-2-foreground hover:bg-category-2/35",
		dot: "bg-category-2-marker",
	},
	{
		block: "bg-card text-category-3-foreground hover:bg-category-3/35",
		dot: "bg-category-3-marker",
	},
	{
		block: "bg-card text-category-4-foreground hover:bg-category-4/35",
		dot: "bg-category-4-marker",
	},
	{
		block: "bg-card text-category-5-foreground hover:bg-category-5/35",
		dot: "bg-category-5-marker",
	},
	{
		block: "bg-card text-category-6-foreground hover:bg-category-6/35",
		dot: "bg-category-6-marker",
	},
] as const;

function positionColor(name: string) {
	let hash = 0;
	for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	return POSITION_PALETTE[Math.abs(hash) % POSITION_PALETTE.length];
}

function formatCompactMinute(minute: number): string {
	const normalizedMinute = minute % 1440;
	const hours = Math.floor(normalizedMinute / 60);
	const minutes = normalizedMinute % 60;
	const displayHour = hours % 12 === 0 ? 12 : hours % 12;
	const minuteLabel =
		minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`;
	return `${displayHour}${minuteLabel}${hours >= 12 ? "p" : "a"}`;
}

function formatCompactShiftRange(
	startMinute: number,
	endMinute: number,
	overnight: boolean,
): string {
	return `${formatCompactMinute(startMinute)}–${formatCompactMinute(endMinute)}${overnight ? " +1" : ""}`;
}

function ShiftTile({
	shift,
	onOpen,
	compact = false,
	disabled = false,
	timeclock,
}: {
	shift: ScheduleShiftDto;
	onOpen: (shift: ScheduleShiftDto) => void;
	compact?: boolean;
	disabled?: boolean;
	timeclock?: ScheduleResponse["timeclock"][number];
}) {
	const hasConflicts = shift.conflicts.length > 0;
	const color = positionColor(shift.positionName);
	const NO_PUNCH_GRACE_MS = 15 * 60 * 1000;
	const scheduledMinutes =
		(new Date(shift.endsAt).getTime() - new Date(shift.startsAt).getTime()) /
		60_000;
	const varianceMinutes =
		timeclock?.workedMinutes != null
			? timeclock.workedMinutes - Math.round(scheduledMinutes)
			: null;
	const missedPunch =
		timeclock != null &&
		timeclock.status === null &&
		new Date(shift.endsAt).getTime() + NO_PUNCH_GRACE_MS < Date.now();
	const { ref, isDragging, isDropping } = useDraggable({
		id: `shift:${shift.id}`,
		type: "schedule-shift",
		data: { shiftId: shift.id },
		disabled,
	});
	return (
		<Button
			ref={ref}
			type="button"
			variant="ghost"
			data-press="subtle"
			aria-label={`${formatCompactShiftRange(shift.startMinute, shift.endMinute, shift.overnight)}, ${shift.positionName}. Activate to edit or move this shift.`}
			onClick={() => onOpen(shift)}
			className={cn(
				"relative h-auto w-full cursor-grab touch-none flex-col items-start gap-1 overflow-hidden whitespace-normal rounded-md border py-2 pr-2 pl-3 text-left shadow-xs transition-[background-color,border-color,box-shadow,opacity] hover:shadow-sm active:cursor-grabbing motion-reduce:transition-none",
				compact ? "min-h-11" : "min-h-14",
				(isDragging || isDropping) && "opacity-45 ring-2 ring-primary/30",
				hasConflicts
					? "border-destructive/35 bg-destructive/5 text-destructive hover:bg-destructive/10"
					: cn("border-border/80", color.block),
			)}
		>
			<span
				className={cn(
					"absolute inset-y-0 left-0 w-1",
					hasConflicts ? "bg-destructive" : color.dot,
				)}
				aria-hidden
			/>
			<span className="flex w-full items-center gap-1.5 leading-none">
				<span className="font-semibold text-[11px] tabular-nums">
					{formatCompactShiftRange(
						shift.startMinute,
						shift.endMinute,
						shift.overnight,
					)}
				</span>
				{hasConflicts ? (
					<AlertTriangleIcon className="ml-auto size-3 shrink-0" />
				) : null}
			</span>
			<span className="w-full truncate text-[11px] text-muted-foreground leading-tight">
				{shift.positionName}
			</span>
			{timeclock?.status === "open" ? (
				<span className="flex items-center gap-1.5 font-medium text-[11px] text-primary leading-none">
					<span
						className="size-1.5 shrink-0 rounded-full bg-primary"
						aria-hidden
					/>
					On clock
					{timeclock.clockedInAt
						? ` · since ${formatClockTime(timeclock.clockedInAt)}`
						: ""}
				</span>
			) : null}
			{timeclock?.status === "closed" && timeclock.workedMinutes != null ? (
				<span className="font-medium text-[11px] text-foreground/80 leading-none">
					Worked {formatDurationMs(timeclock.workedMinutes * 60_000)}
					{varianceMinutes != null && Math.abs(varianceMinutes) > 10 ? (
						<span
							className={
								varianceMinutes > 0 ? "text-destructive" : "text-amber-600"
							}
						>
							{" "}
							{varianceMinutes > 0 ? "+" : "−"}
							{Math.abs(varianceMinutes)}m
						</span>
					) : null}
				</span>
			) : null}
			{missedPunch ? (
				<span className="font-medium text-[11px] text-destructive leading-none">
					No punch
				</span>
			) : null}
			{hasConflicts && !compact ? (
				<span className="font-medium text-[11px] leading-none">Conflict</span>
			) : null}
		</Button>
	);
}

function ScheduleDropCell({
	employmentId,
	date,
	className,
	children,
}: {
	employmentId: string | null;
	date: string;
	className?: string;
	children: React.ReactNode;
}) {
	const { ref, isDropTarget } = useDroppable({
		id: `cell:${employmentId ?? "open"}:${date}`,
		type: "schedule-cell",
		accept: "schedule-shift",
		data: { employmentId, date },
	});

	return (
		<div
			ref={ref}
			className={cn(
				className,
				isDropTarget &&
					"bg-primary/10 ring-2 ring-primary/45 ring-inset motion-reduce:transition-none",
			)}
		>
			{children}
		</div>
	);
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

const SKELETON_DAYS = [
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
	"sun",
] as const;
const SKELETON_ROWS = ["a", "b", "c", "d"] as const;

type GridDensity = "compact" | "comfortable";

function ScheduleGridSkeleton() {
	return (
		<Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="grid min-w-[1144px] grid-cols-[220px_repeat(7,minmax(132px,1fr))] border-b">
				<div className="p-3">
					<Skeleton className="h-3 w-14" />
				</div>
				{SKELETON_DAYS.map((key) => (
					<div key={key} className="flex flex-col items-center gap-1.5 p-3">
						<Skeleton className="h-2.5 w-8" />
						<Skeleton className="h-4 w-6" />
					</div>
				))}
			</div>
			{SKELETON_ROWS.map((row) => (
				<div
					key={row}
					className="grid min-w-[1144px] grid-cols-[220px_repeat(7,minmax(132px,1fr))] border-b last:border-b-0"
				>
					<div className="flex items-center gap-2 p-3">
						<Skeleton className="size-8 rounded-full" />
						<div className="flex-1 space-y-1.5">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-2.5 w-16" />
						</div>
					</div>
					{SKELETON_DAYS.map((day) => (
						<div key={`${row}-${day}`} className="min-h-24 p-2">
							{(day.charCodeAt(0) + row.charCodeAt(0)) % 4 === 0 ? (
								<Skeleton className="h-14 w-full" />
							) : null}
						</div>
					))}
				</div>
			))}
		</Card>
	);
}

function SchedulePage() {
	const { workplace } = useWorkplace();
	const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
	const settings = useWorkplaceSettings(workplace?.id);
	const weekStartDay = settings.data?.weekStartDay ?? 1;
	const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date(), 1));

	useEffect(() => {
		setWeekStart((current) =>
			weekStartOf(new Date(`${current}T12:00:00`), weekStartDay),
		);
	}, [weekStartDay]);
	const [visibleStaffCount, setVisibleStaffCount] = useState(40);
	const [workerQuery, setWorkerQuery] = useState("");
	const [positionFilter, setPositionFilter] = useState("all");
	const [staffStateFilter, setStaffStateFilter] = useState("all");
	const [gridDensity, setGridDensity] = useState<GridDensity>("comfortable");
	const locations = useLocations(workplace?.id);
	const [locationId, setLocationId] = useState<string | undefined>(undefined);

	const activeLocationId = locationId ?? locations.data?.[0]?.id;
	const schedule = useSchedule(activeLocationId, weekStart);
	const publication = usePublication(schedule.data?.schedule.id);
	const acceptances = useAcceptances(schedule.data?.schedule.id);
	const queryClient = useQueryClient();
	const [form, setForm] = useState<ShiftFormState | null>(null);
	const [addDates, setAddDates] = useState<string[]>([]);
	const [publishPreview, setPublishPreview] =
		useState<ChangePreviewResponse | null>(null);
	useEffect(() => {
		setHeaderTarget(document.getElementById("schedule-header-controls"));
	}, []);

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
					},
				});
				return { count: 1 };
			}
			const dates = addDates.length > 0 ? addDates : [state.date];
			await Promise.all(
				dates.map((date) =>
					api(
						`/v1/locations/${activeLocationId}/schedules/${weekStart}/shifts`,
						{
							method: "POST",
							body: {
								employmentId: state.employmentId || null,
								positionId: state.positionId,
								date,
								startMinute: state.startMinute,
								endMinute: state.endMinute,
								note: state.note || undefined,
								unavailabilityOverrideReason:
									state.unavailabilityOverrideReason.trim() || undefined,
							},
						},
					),
				),
			);
			return { count: dates.length };
		},
		onSuccess: async (result) => {
			setForm(null);
			setAddDates([]);
			await invalidate();
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
			toast.success("Shift removed.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const moveShift = useMutation({
		mutationFn: async ({
			shift,
			employmentId,
			date,
		}: {
			shift: ScheduleShiftDto;
			employmentId: string | null;
			date: string;
		}) => {
			await api(`/v1/shifts/${shift.id}`, {
				method: "PATCH",
				body: {
					employmentId,
					positionId: shift.positionId,
					date,
					startMinute: shift.startMinute,
					endMinute: shift.endMinute,
					note: shift.note,
					unavailabilityOverrideReason:
						shift.unavailabilityOverrideReason ?? null,
				},
			});
		},
		onSuccess: async () => {
			await invalidate();
			toast.success("Shift moved.");
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
	const scheduleIndex = useMemo(() => {
		const shiftsByWorkerDay = new Map<string, ScheduleShiftDto[]>();
		const hoursByEmploymentId = new Map<string, number>();
		const shiftCountByEmploymentId = new Map<string, number>();
		for (const shift of data?.shifts ?? []) {
			const key = `${shift.employmentId ?? "open"}:${shift.date}`;
			const shifts = shiftsByWorkerDay.get(key);
			if (shifts) shifts.push(shift);
			else shiftsByWorkerDay.set(key, [shift]);
			if (shift.employmentId) {
				shiftCountByEmploymentId.set(
					shift.employmentId,
					(shiftCountByEmploymentId.get(shift.employmentId) ?? 0) + 1,
				);
			}
		}
		for (const entry of data?.hours ?? []) {
			hoursByEmploymentId.set(entry.employmentId, entry.minutes);
		}
		return {
			shiftsByWorkerDay,
			hoursByEmploymentId,
			shiftCountByEmploymentId,
		};
	}, [data?.hours, data?.shifts]);
	const conflictCount =
		data?.shifts.reduce((sum, shift) => sum + shift.conflicts.length, 0) ?? 0;
	const timeclockByShiftId = useMemo(() => {
		const map = new Map<string, ScheduleResponse["timeclock"][number]>();
		for (const entry of data?.timeclock ?? []) {
			map.set(entry.shiftId, entry);
		}
		return map;
	}, [data?.timeclock]);
	const dayHeaders = orderedDayHeaders(weekStartDay);
	const onClockCount =
		data?.timeclock.filter((entry) => entry.status === "open").length ?? 0;
	const openShiftCount =
		data?.shifts.filter((shift) => shift.employmentId === null).length ?? 0;
	const staffIds = useMemo(
		() => new Set((data?.staff ?? []).map((member) => member.employmentId)),
		[data?.staff],
	);
	const offRosterShifts = useMemo(
		() =>
			(data?.shifts ?? []).filter(
				(shift) =>
					shift.employmentId !== null && !staffIds.has(shift.employmentId),
			),
		[data?.shifts, staffIds],
	);
	const offRosterShiftsByDay = useMemo(() => {
		const index = new Map<string, ScheduleShiftDto[]>();
		for (const shift of offRosterShifts) {
			const shifts = index.get(shift.date);
			if (shifts) shifts.push(shift);
			else index.set(shift.date, [shift]);
		}
		return index;
	}, [offRosterShifts]);
	const totalHours =
		data?.hours.reduce((sum, entry) => sum + entry.minutes, 0) ?? 0;
	const daySummaries = useMemo(() => {
		const summaries = new Map<string, { shifts: number; minutes: number }>();
		for (const shift of data?.shifts ?? []) {
			const current = summaries.get(shift.date) ?? { shifts: 0, minutes: 0 };
			const duration =
				shift.endMinute > shift.startMinute
					? shift.endMinute - shift.startMinute
					: 1440 - shift.startMinute + shift.endMinute;
			summaries.set(shift.date, {
				shifts: current.shifts + 1,
				minutes: current.minutes + duration,
			});
		}
		return summaries;
	}, [data?.shifts]);
	const filteredStaff = useMemo(() => {
		const query = workerQuery.trim().toLocaleLowerCase();
		return (data?.staff ?? []).filter((member) => {
			if (
				query &&
				!member.name.toLocaleLowerCase().includes(query) &&
				!member.email.toLocaleLowerCase().includes(query)
			)
				return false;
			if (
				positionFilter !== "all" &&
				!member.positionIds.includes(positionFilter)
			)
				return false;
			const minutes =
				scheduleIndex.hoursByEmploymentId.get(member.employmentId) ?? 0;
			const hasConstraints =
				(member.unavailability?.length ?? 0) > 0 ||
				(member.timeOff?.length ?? 0) > 0;
			if (staffStateFilter === "scheduled" && minutes === 0) return false;
			if (staffStateFilter === "unscheduled" && minutes > 0) return false;
			if (staffStateFilter === "constraints" && !hasConstraints) return false;
			return true;
		});
	}, [
		data?.staff,
		positionFilter,
		scheduleIndex.hoursByEmploymentId,
		staffStateFilter,
		workerQuery,
	]);
	const visibleStaff = filteredStaff.slice(0, visibleStaffCount);
	const hasStaffFilters =
		workerQuery.trim().length > 0 ||
		positionFilter !== "all" ||
		staffStateFilter !== "all";
	const activeSelectFilterCount =
		Number(positionFilter !== "all") + Number(staffStateFilter !== "all");
	const clearStaffFilters = () => {
		setWorkerQuery("");
		setPositionFilter("all");
		setStaffStateFilter("all");
		setVisibleStaffCount(40);
	};

	const days = Array.from({ length: 7 }, (_, index) =>
		addDays(weekStart, index),
	);

	function openEdit(shift: ScheduleShiftDto) {
		setAddDates([]);
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
		setAddDates([date]);
		setForm(draft);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!form) return;
		if (!canSave) return;
		createOrUpdate.mutate(form);
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

	async function handleShiftDragEnd(event: DragEndEvent) {
		if (event.canceled) return;
		const shiftId = event.operation.source?.data.shiftId;
		const targetData = event.operation.target?.data;
		if (
			typeof shiftId !== "string" ||
			!targetData ||
			typeof targetData.date !== "string" ||
			!(
				targetData.employmentId === null ||
				typeof targetData.employmentId === "string"
			)
		)
			return;

		const shift = data?.shifts.find((candidate) => candidate.id === shiftId);
		if (!shift) return;
		if (
			shift.date === targetData.date &&
			shift.employmentId === targetData.employmentId
		)
			return;

		const suspended = event.suspend();
		try {
			await moveShift.mutateAsync({
				shift,
				employmentId: targetData.employmentId,
				date: targetData.date,
			});
			suspended.resume();
		} catch {
			suspended.abort();
		}
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
			(form.shiftId || addDates.length > 0) &&
			form.startMinute !== form.endMinute &&
			!positionBlocked &&
			(!needsOverride || form.unavailabilityOverrideReason.trim()),
	);

	const todayKey = new Date().toLocaleDateString("sv-SE");
	const constrainedStaff = (data?.staff ?? []).filter(
		(member) =>
			(member.unavailability?.length ?? 0) > 0 ||
			member.preference ||
			(member.timeOff?.length ?? 0) > 0,
	);
	const hasInsights =
		constrainedStaff.length > 0 ||
		(data?.hours.length ?? 0) > 0 ||
		(acceptances.data?.acceptances.length ?? 0) > 0 ||
		(publication.data?.versions.length ?? 0) > 0;
	const showScheduleDetails: boolean = false;
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
		<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
			<h1 className="sr-only">Schedule</h1>
			<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-none">
				{headerTarget
					? createPortal(
							<div className="grid w-full min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
								<div className="flex min-w-0 flex-1 items-center gap-2">
									<Select
										items={locationItems}
										value={activeLocationId ?? null}
										onValueChange={(value) => {
											if (!value) return;
											setLocationId(value);
											setForm(null);
										}}
									>
										<SelectTrigger
											aria-label="Location"
											className="h-9 min-w-0 max-w-40 flex-1 border-transparent bg-muted/60 font-medium sm:w-40 sm:flex-none"
										>
											<SelectValue placeholder="Location" />
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
									<div className="flex shrink-0 items-center gap-1">
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														className="size-9"
														onClick={() => {
															setWeekStart((c) => addDays(c, -7));
															setForm(null);
														}}
													/>
												}
											>
												<ChevronLeftIcon className="size-4" />
												<span className="sr-only">Previous week</span>
											</TooltipTrigger>
											<TooltipContent>Previous week</TooltipContent>
										</Tooltip>
										<Button
											variant="ghost"
											size="sm"
											className="hidden h-9 px-3 font-semibold text-sm tabular-nums sm:inline-flex"
											onClick={() => {
												setWeekStart(weekStartOf(new Date(), weekStartDay));
												setForm(null);
											}}
										>
											Today
										</Button>
										<DatePicker
											id="schedule-week"
											value={weekStart}
											displayValue={formatWeekLabel(weekStart)}
											buttonClassName="h-9 w-auto border-transparent bg-transparent px-3 font-semibold text-sm tabular-nums shadow-none hover:bg-muted"
											onValueChange={(date) => {
												setWeekStart(
													weekStartOf(
														new Date(`${date}T12:00:00`),
														weekStartDay,
													),
												);
												setForm(null);
											}}
										/>
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon-sm"
														className="size-9"
														onClick={() => {
															setWeekStart((c) => addDays(c, 7));
															setForm(null);
														}}
													/>
												}
											>
												<ChevronRightIcon className="size-4" />
												<span className="sr-only">Next week</span>
											</TooltipTrigger>
											<TooltipContent>Next week</TooltipContent>
										</Tooltip>
									</div>
								</div>

								<div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
									{publicationState?.latestVersionNumber == null ? (
										<Badge variant="outline" className="font-medium">
											Draft
										</Badge>
									) : publicationState.hasUnpublishedChanges ? (
										<Badge variant="secondary" className="font-medium">
											Draft v{publicationState.latestVersionNumber}
										</Badge>
									) : (
										<Badge className="font-medium">
											Published v{publicationState.latestVersionNumber}
										</Badge>
									)}
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													className="size-9 rounded-lg"
													disabled={copyPrevious.isPending || !activeLocationId}
													onClick={() => copyPrevious.mutate()}
												/>
											}
										>
											{copyPrevious.isPending ? <Spinner /> : <CopyIcon />}
											<span className="sr-only">Copy last week</span>
										</TooltipTrigger>
										<TooltipContent>
											Copy last week into this draft
										</TooltipContent>
									</Tooltip>
									<Button
										size="sm"
										className="h-9 bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
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
										<span className="hidden sm:inline">Review & publish</span>
										<span className="sm:hidden">Publish</span>
									</Button>
									<Button
										size="sm"
										variant="outline"
										className="h-9 px-4 font-medium"
										disabled={!data || data.positions.length === 0}
										onClick={() => openCreate(defaultAddDate(weekStart))}
									>
										<PlusIcon data-icon="inline-start" />
										<span className="hidden sm:inline">Add shifts</span>
										<span className="sm:hidden">Add</span>
									</Button>
								</div>
							</div>,
							headerTarget,
						)
					: null}
				<div className="border-b bg-background print:hidden">
					<div className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[14rem_auto_minmax(18rem,1fr)_auto]">
						{data && data.staff.length > 0 ? (
							<div className="relative order-1 min-w-0 xl:col-start-1 xl:row-start-1">
								<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									aria-label="Search workers"
									className="h-9 pl-8"
									placeholder="Search workers"
									value={workerQuery}
									onChange={(event) => {
										setWorkerQuery(event.target.value);
										setVisibleStaffCount(40);
									}}
								/>
							</div>
						) : null}
						{data ? (
							<div className="order-3 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-border text-muted-foreground text-xs tabular-nums sm:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:flex-nowrap xl:border-l xl:pl-4">
								<span className="shrink-0 whitespace-nowrap">
									<span className="font-semibold text-foreground">
										{data.shifts.length}
									</span>{" "}
									shifts
								</span>
								<span className="text-muted-foreground/40">·</span>
								<span className="shrink-0 whitespace-nowrap">
									<span className="font-semibold text-foreground">
										{(totalHours / 60).toFixed(1)}h
									</span>{" "}
									scheduled
								</span>
								<span className="text-muted-foreground/40">·</span>
								<span
									className={cn(
										"shrink-0 whitespace-nowrap",
										openShiftCount > 0 && "font-medium text-primary",
									)}
								>
									{openShiftCount} open
								</span>
								<span className="text-muted-foreground/40">·</span>
								<span
									className={cn(
										"shrink-0 whitespace-nowrap",
										conflictCount > 0 && "font-medium text-destructive",
									)}
								>
									{conflictCount} conflict{conflictCount === 1 ? "" : "s"}
								</span>
								{onClockCount > 0 ? (
									<>
										<span className="text-muted-foreground/40">·</span>
										<span className="shrink-0 whitespace-nowrap font-medium text-primary">
											{onClockCount} on clock
										</span>
									</>
								) : null}
								{offRosterShifts.length > 0 ? (
									<>
										<span className="text-muted-foreground/40">·</span>
										<span className="shrink-0 whitespace-nowrap">
											{offRosterShifts.length} off-roster
										</span>
									</>
								) : null}
								<span className="hidden min-w-0 truncate whitespace-nowrap 2xl:inline">
									{data.schedule.timezone}
								</span>
							</div>
						) : null}
						{data && data.staff.length > 0 ? (
							<>
								<div className="order-2 flex items-center gap-1 xl:col-start-2 xl:row-start-1">
									<Popover>
										<PopoverTrigger
											render={
												<Button
													variant="outline"
													size="sm"
													className="h-9 min-w-28 justify-start"
												/>
											}
										>
											<ListFilterIcon data-icon="inline-start" />
											Filters
											<Badge
												aria-hidden={activeSelectFilterCount === 0}
												className={cn(
													"ml-auto size-5 px-0 tabular-nums",
													activeSelectFilterCount === 0 && "invisible",
												)}
												variant="secondary"
											>
												{activeSelectFilterCount}
											</Badge>
											<ChevronDownIcon data-icon="inline-end" />
										</PopoverTrigger>
										<PopoverContent align="end" className="w-72 rounded-xl">
											<PopoverHeader>
												<PopoverTitle>Filter workers</PopoverTitle>
											</PopoverHeader>
											<div className="grid gap-3">
												<Field>
													<FieldLabel>Position</FieldLabel>
													<Select
														items={[
															{ label: "All positions", value: "all" },
															...data.positions.map((position) => ({
																label: position.name,
																value: position.id,
															})),
														]}
														value={positionFilter}
														onValueChange={(value) => {
															if (!value) return;
															setPositionFilter(value);
															setVisibleStaffCount(40);
														}}
													>
														<SelectTrigger className="w-full">
															<SelectValue />
														</SelectTrigger>
														<SelectContent alignItemWithTrigger={false}>
															<SelectGroup>
																<SelectItem value="all">
																	All positions
																</SelectItem>
																{data.positions.map((position) => (
																	<SelectItem
																		key={position.id}
																		value={position.id}
																	>
																		{position.name}
																	</SelectItem>
																))}
															</SelectGroup>
														</SelectContent>
													</Select>
												</Field>
												<Field>
													<FieldLabel>Schedule state</FieldLabel>
													<Select
														items={[
															{ label: "All workers", value: "all" },
															{ label: "Scheduled", value: "scheduled" },
															{ label: "Unscheduled", value: "unscheduled" },
															{
																label: "Has constraints",
																value: "constraints",
															},
														]}
														value={staffStateFilter}
														onValueChange={(value) => {
															if (!value) return;
															setStaffStateFilter(value);
															setVisibleStaffCount(40);
														}}
													>
														<SelectTrigger className="w-full">
															<SelectValue />
														</SelectTrigger>
														<SelectContent alignItemWithTrigger={false}>
															<SelectGroup>
																<SelectItem value="all">All workers</SelectItem>
																<SelectItem value="scheduled">
																	Scheduled
																</SelectItem>
																<SelectItem value="unscheduled">
																	Unscheduled
																</SelectItem>
																<SelectItem value="constraints">
																	Has constraints
																</SelectItem>
															</SelectGroup>
														</SelectContent>
													</Select>
												</Field>
											</div>
										</PopoverContent>
									</Popover>
									{hasStaffFilters ? (
										<Button
											variant="ghost"
											size="sm"
											className="h-9"
											onClick={clearStaffFilters}
										>
											<XIcon data-icon="inline-start" />
											Clear
										</Button>
									) : null}
								</div>
								<div className="order-4 flex min-w-0 items-center justify-between gap-3 sm:col-span-2 xl:col-span-1 xl:col-start-4 xl:row-start-1 xl:justify-end">
									<span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
										{filteredStaff.length} of {data.staff.length} workers
									</span>
									<div className="flex shrink-0 items-center gap-1.5">
										<Columns3Icon className="size-3.5 text-muted-foreground" />
										<ToggleGroup
											aria-label="Schedule grid density"
											value={[gridDensity]}
											variant="outline"
											size="sm"
											spacing={0}
											onValueChange={(value) => {
												const next = value[0];
												if (next === "compact" || next === "comfortable") {
													setGridDensity(next);
												}
											}}
										>
											<ToggleGroupItem className="h-9" value="compact">
												Compact
											</ToggleGroupItem>
											<ToggleGroupItem className="h-9" value="comfortable">
												Comfortable
											</ToggleGroupItem>
										</ToggleGroup>
									</div>
								</div>
							</>
						) : null}
					</div>
					{data && data.positions.length > 0 ? (
						<div className="grid min-h-8 grid-cols-1 items-center px-3 pt-0 pb-2 xl:grid-cols-[14rem_auto_minmax(18rem,1fr)_auto]">
							<div className="flex min-w-0 items-center gap-3 overflow-x-auto overscroll-x-contain xl:col-span-2 xl:col-start-3">
								<span className="shrink-0 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Positions
								</span>
								<ul
									className="flex list-none items-center gap-3"
									aria-label="Position colors"
								>
									{data.positions.map((position) => (
										<li
											key={position.id}
											className="flex shrink-0 items-center gap-1.5 text-xs"
										>
											<span
												className={cn(
													"h-3 w-1 rounded-full",
													positionColor(position.name).dot,
												)}
												aria-hidden
											/>
											{position.name}
										</li>
									))}
								</ul>
							</div>
						</div>
					) : null}
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-3">
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
						<Empty className="rounded-2xl border border-dashed">
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
						<Empty className="rounded-2xl border border-dashed">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<TagsIcon />
								</EmptyMedia>
								<EmptyTitle>Add a position before placing shifts</EmptyTitle>
								<EmptyDescription>
									Every shift needs a position such as server, cook, or
									bartender.
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

					<Sheet
						open={form !== null && data !== undefined}
						onOpenChange={(open) => {
							if (!open) {
								setForm(null);
								setAddDates([]);
							}
						}}
					>
						<SheetContent
							side="right"
							className="w-full gap-0 sm:max-w-lg"
							showCloseButton
						>
							{form && data ? (
								<form onSubmit={submit} className="flex h-full flex-col">
									<SheetHeader>
										<SheetTitle>
											{form.shiftId ? "Edit shift" : "Add shifts"}
										</SheetTitle>
										<SheetDescription>
											Times are in {data.schedule.timezone}. Leave the worker
											open if you have not assigned anyone yet.
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
												<FieldLabel htmlFor="shift-position">
													Position
												</FieldLabel>
												<Select
													items={positionItems}
													value={form.positionId || null}
													onValueChange={(positionId) =>
														setForm({ ...form, positionId: positionId ?? "" })
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
												) : allowedPositions.length === 0 &&
													form.employmentId ? (
													<FieldDescription>
														This worker has no approved positions.
													</FieldDescription>
												) : null}
											</Field>
											<Field>
												<FieldLabel htmlFor="shift-date">
													{form.shiftId ? "Day" : "Days"}
												</FieldLabel>
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
														className="grid grid-cols-4 gap-2 sm:grid-cols-7"
													>
														{days.map((date, index) => (
															<Button
																key={date}
																type="button"
																variant={
																	addDates.includes(date)
																		? "default"
																		: "outline"
																}
																className="h-auto min-h-12 flex-col gap-0 px-1 py-1.5 tabular-nums"
																aria-pressed={addDates.includes(date)}
																onClick={() => toggleAddDate(date)}
															>
																<span className="text-[0.6875rem]">
																	{dayHeaders[index]?.slice(0, 3)}
																</span>
																<span>
																	{new Date(`${date}T12:00:00`).getDate()}
																</span>
															</Button>
														))}
													</div>
												)}
												{!form.shiftId ? (
													<FieldDescription>
														Select one or more days in this week.
													</FieldDescription>
												) : null}
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
																unavailabilityOverrideReason:
																	event.target.value,
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
													Preference (does not block):{" "}
													{selectedStaff.preference}
												</p>
											) : null}
											{overlappingShift ? (
												<Alert variant="destructive">
													<AlertTriangleIcon />
													<AlertTitle>Overlaps another shift</AlertTitle>
													<AlertDescription>
														{overlappingShift.positionName} on{" "}
														{formatDayLabel(overlappingShift.date)}. You can
														still save; it will show as a conflict on the week.
													</AlertDescription>
												</Alert>
											) : null}
											{overlappingTimeOff ? (
												<Alert variant="destructive">
													<AlertTriangleIcon />
													<AlertTitle>During approved time off</AlertTitle>
													<AlertDescription>
														This worker has approved time off covering this
														window. You can still save; it will show as a
														conflict.
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
											{form.shiftId
												? "Save"
												: `Add ${addDates.length || 1} shift${(addDates.length || 1) === 1 ? "" : "s"}`}
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
														<AlertDialogTitle>
															Delete this shift?
														</AlertDialogTitle>
														<AlertDialogDescription>
															This removes the shift from the current draft.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Cancel</AlertDialogCancel>
														<AlertDialogAction
															variant="destructive"
															onClick={() =>
																removeShift.mutate(form.shiftId ?? "")
															}
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

					{/* Week grid — borderless canvas, color-coded blocks */}
					{schedule.isPending && !data ? <ScheduleGridSkeleton /> : null}

					{data ? (
						<DragDropProvider onDragEnd={handleShiftDragEnd}>
							<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-border/70 bg-background shadow-sm print:border print:shadow-none">
								<div className="schedule-grid-scroll min-h-0 min-w-0 flex-1 overflow-auto overscroll-none">
									<div
										className={cn(
											"grid",
											gridDensity === "compact"
												? "min-w-[1032px] grid-cols-[200px_repeat(7,minmax(118px,1fr))]"
												: "min-w-[1144px] grid-cols-[220px_repeat(7,minmax(132px,1fr))]",
										)}
									>
										{/* Header */}
										<div className="sticky top-0 left-0 z-30 flex items-end border-border/70 border-r border-b bg-background px-4 pt-3 pb-2.5 shadow-[4px_0_12px_-12px_var(--foreground)]">
											<span className="font-medium text-muted-foreground text-xs">
												{hasStaffFilters
													? `${filteredStaff.length} of ${data.staff.length}`
													: data.staff.length}{" "}
												on roster
											</span>
										</div>
										{days.map((day, index) => {
											const isToday = day === todayKey;
											const isWeekend = index >= 5;
											const summary = daySummaries.get(day);
											return (
												<div
													key={day}
													className={cn(
														"sticky top-0 z-20 border-border/70 border-r border-b bg-background px-2 pt-3 pb-2.5 text-center last:border-r-0",
														isWeekend && "bg-muted/30",
														isToday && "bg-accent/55",
													)}
												>
													<div className="flex items-center justify-center gap-1.5">
														<p className="font-medium text-muted-foreground text-xs">
															{dayHeaders[index]?.slice(0, 3)}
														</p>
														<span
															className={cn(
																"inline-flex size-6 items-center justify-center rounded-full font-semibold text-xs tabular-nums",
																isToday &&
																	"bg-primary text-primary-foreground shadow-sm",
															)}
														>
															{new Date(`${day}T12:00:00`).getDate()}
														</span>
													</div>
													<p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
														{summary
															? `${summary.shifts} shift${summary.shifts === 1 ? "" : "s"} · ${(summary.minutes / 60).toFixed(1)}h`
															: "No shifts"}
													</p>
												</div>
											);
										})}

										{/* Worker rows */}
										{visibleStaff.map((member) => {
											const hasConstraints =
												(member.unavailability?.length ?? 0) > 0 ||
												(member.timeOff?.length ?? 0) > 0;
											const minutes =
												scheduleIndex.hoursByEmploymentId.get(
													member.employmentId,
												) ?? 0;
											const memberShiftCount =
												scheduleIndex.shiftCountByEmploymentId.get(
													member.employmentId,
												) ?? 0;
											return (
												<div key={member.employmentId} className="contents">
													<div
														className={cn(
															"sticky left-0 z-10 flex items-center gap-3 border-border/70 border-r border-b bg-background px-3 py-3 shadow-[4px_0_12px_-12px_var(--foreground)]",
															gridDensity === "compact"
																? "min-h-20"
																: "min-h-[104px]",
														)}
													>
														<Avatar className="shrink-0 shadow-[0_0_0_2px_var(--background)]">
															<AvatarFallback
																className={cn(
																	member.kind === "manager" &&
																		"bg-primary/10 font-semibold text-primary",
																)}
															>
																{initials(member.name)}
															</AvatarFallback>
														</Avatar>
														<div className="min-w-0 flex-1 space-y-1">
															<p
																className="truncate font-semibold text-sm leading-tight"
																title={member.name}
															>
																{member.name}
															</p>
															<p className="truncate text-muted-foreground text-xs leading-tight">
																{member.kind === "manager"
																	? "Manager"
																	: positionsLabel(member.positionIds.length)}
																{" · "}
																{memberShiftCount} shift
																{memberShiftCount === 1 ? "" : "s"}
															</p>
														</div>
														<div className="flex shrink-0 flex-col items-end gap-2">
															<span
																className="font-semibold text-xs tabular-nums"
																title={`${(minutes / 60).toFixed(1)} scheduled hours`}
															>
																{(minutes / 60).toFixed(1)}h
															</span>
															{hasConstraints ? (
																<Tooltip>
																	<TooltipTrigger
																		render={
																			<span className="inline-flex size-6 items-center justify-center text-muted-foreground">
																				<BanIcon className="size-3.5" />
																				<span className="sr-only">
																					Has scheduling constraints
																				</span>
																			</span>
																		}
																	/>
																	<TooltipContent>
																		Has unavailability or time off
																	</TooltipContent>
																</Tooltip>
															) : null}
														</div>
													</div>
													{days.map((day, dayIndex) => {
														const workerShifts =
															scheduleIndex.shiftsByWorkerDay.get(
																`${member.employmentId}:${day}`,
															) ?? [];
														const constraints = cellConstraints(member, day);
														const isEmptyCell =
															workerShifts.length === 0 &&
															constraints.length === 0;
														const isToday = day === todayKey;
														const isWeekend = dayIndex >= 5;
														return (
															<ScheduleDropCell
																key={day}
																employmentId={member.employmentId}
																date={day}
																className={cn(
																	"group relative border-border/60 border-r border-b p-2 transition-colors last:border-r-0 hover:bg-accent/30",
																	gridDensity === "compact"
																		? "min-h-20"
																		: "min-h-[104px]",
																	isWeekend && "bg-muted/30",
																	isToday && "bg-accent/25",
																)}
															>
																{constraints.length > 0 ? (
																	<div className="mb-1.5 space-y-1">
																		{constraints.map((constraint) => (
																			<Badge
																				key={constraint.key}
																				variant="outline"
																				className="max-w-full gap-1 border-border border-dashed px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
																			>
																				{constraint.kind ===
																				"unavailability" ? (
																					<BanIcon className="size-3 shrink-0" />
																				) : (
																					<CalendarOffIcon className="size-3 shrink-0" />
																				)}
																				<span className="truncate">
																					{constraint.label}
																				</span>
																			</Badge>
																		))}
																	</div>
																) : null}
																<div className="space-y-1.5">
																	{workerShifts.map((shift) => (
																		<ShiftTile
																			key={shift.id}
																			shift={shift}
																			onOpen={openEdit}
																			compact={gridDensity === "compact"}
																			disabled={moveShift.isPending}
																			timeclock={timeclockByShiftId.get(
																				shift.id,
																			)}
																		/>
																	))}
																</div>
																<Button
																	type="button"
																	aria-label={`Add shift for ${member.name} on ${dayHeaders[dayIndex]}`}
																	variant={isEmptyCell ? "outline" : "ghost"}
																	size={isEmptyCell ? "sm" : "icon-xs"}
																	className={cn(
																		"schedule-cell-add absolute rounded-md border border-border/60 bg-card/90 text-muted-foreground opacity-0 shadow-xs transition-[opacity,background-color,color] hover:bg-action hover:text-action-foreground focus-visible:opacity-100 group-hover:opacity-100",
																		isEmptyCell &&
																			"schedule-cell-add-empty inset-0 m-auto h-8 w-fit border-dashed bg-transparent px-2.5 opacity-100 shadow-none",
																		!isEmptyCell && "right-1.5 bottom-1.5",
																	)}
																	disabled={
																		!data || data.positions.length === 0
																	}
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
																	<PlusIcon
																		data-icon={
																			isEmptyCell ? "inline-start" : undefined
																		}
																	/>
																	{isEmptyCell ? (
																		<span>Add shift</span>
																	) : (
																		<span className="sr-only">
																			Add shift for {member.name} on{" "}
																			{dayHeaders[dayIndex]}
																		</span>
																	)}
																</Button>
															</ScheduleDropCell>
														);
													})}
												</div>
											);
										})}
										{filteredStaff.length === 0 ? (
											<div className="col-span-8 flex flex-col items-center gap-2 border-b bg-background p-6 text-center">
												<p className="font-medium text-sm">
													No workers match these filters
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={clearStaffFilters}
												>
													Clear filters
												</Button>
											</div>
										) : null}
										{visibleStaff.length < filteredStaff.length ? (
											<div className="col-span-8 flex justify-center border-b bg-background p-3">
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														setVisibleStaffCount((count) => count + 40)
													}
												>
													Show{" "}
													{Math.min(
														40,
														filteredStaff.length - visibleStaff.length,
													)}{" "}
													more workers
												</Button>
											</div>
										) : null}

										{/* Open shifts row */}
										{data.positions.length > 0 ? (
											<>
												<div className="sticky left-0 z-10 flex min-h-20 items-center border-border/70 border-r border-b bg-accent/60 px-4 py-3 shadow-[4px_0_12px_-12px_var(--foreground)]">
													<div>
														<p className="font-medium text-sm leading-tight">
															Open shifts
														</p>
														<p className="text-muted-foreground text-xs leading-tight">
															{openShiftCount > 0
																? "Needs a worker"
																: "Drop here to unassign"}
														</p>
													</div>
												</div>
												{days.map((day, dayIndex) => {
													const isWeekend = dayIndex >= 5;
													return (
														<ScheduleDropCell
															key={day}
															employmentId={null}
															date={day}
															className={cn(
																"min-h-20 border-border/60 border-r border-b bg-accent/25 p-2 last:border-r-0",
																isWeekend && "bg-muted/30",
															)}
														>
															<div className="space-y-1.5">
																{(
																	scheduleIndex.shiftsByWorkerDay.get(
																		`open:${day}`,
																	) ?? []
																).map((shift) => (
																	<ShiftTile
																		key={shift.id}
																		shift={shift}
																		onOpen={openEdit}
																		compact={gridDensity === "compact"}
																		disabled={moveShift.isPending}
																		timeclock={timeclockByShiftId.get(shift.id)}
																	/>
																))}
															</div>
														</ScheduleDropCell>
													);
												})}
											</>
										) : null}

										{/* Off-roster row */}
										{offRosterShifts.length > 0 ? (
											<>
												<div className="sticky left-0 z-10 flex min-h-20 items-center border-border/70 border-r border-b bg-muted/60 px-4 py-3 shadow-[4px_0_12px_-12px_var(--foreground)]">
													<div>
														<p className="font-medium text-sm leading-tight">
															Off-roster
														</p>
														<p className="text-muted-foreground text-xs leading-tight">
															Reassign or remove
														</p>
													</div>
												</div>
												{days.map((day, dayIndex) => {
													const isWeekend = dayIndex >= 5;
													return (
														<div
															key={day}
															className={cn(
																"min-h-20 border-border/60 border-r border-b bg-muted/30 p-2 last:border-r-0",
																isWeekend && "bg-muted/40",
															)}
														>
															<div className="space-y-1.5">
																{(offRosterShiftsByDay.get(day) ?? []).map(
																	(shift) => (
																		<ShiftTile
																			key={shift.id}
																			shift={shift}
																			onOpen={openEdit}
																			compact={gridDensity === "compact"}
																			disabled={moveShift.isPending}
																			timeclock={timeclockByShiftId.get(
																				shift.id,
																			)}
																		/>
																	),
																)}
															</div>
														</div>
													);
												})}
											</>
										) : null}
									</div>
								</div>
							</div>
						</DragDropProvider>
					) : null}

					{/* Insights */}
					{showScheduleDetails && hasInsights ? (
						<Card className="rounded-2xl border-border/60 shadow-sm print:hidden">
							<CardHeader className="gap-4 p-4 sm:p-5">
								<div>
									<h2 className="font-semibold text-base">Schedule details</h2>
									<p className="mt-1 text-muted-foreground text-sm">
										Staffing constraints, assigned hours, and publication
										activity for this week.
									</p>
								</div>

								{constrainedStaff.length > 0 ? (
									<section aria-labelledby="schedule-constraints-heading">
										<div className="mb-3 flex items-center gap-2">
											<h3
												id="schedule-constraints-heading"
												className="font-semibold text-sm"
											>
												Constraints
											</h3>
											<Badge
												variant="secondary"
												className="h-5 rounded-md px-1.5 tabular-nums"
											>
												{constrainedStaff.length}
											</Badge>
										</div>
										<p className="mb-3 text-muted-foreground text-xs">
											Unavailability and approved time off block scheduling
											unless you record an override. Preferences are guidance
											only.
										</p>
										<ItemGroup className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
											{constrainedStaff.map((member) => (
												<Item
													key={member.employmentId}
													variant="outline"
													role="listitem"
													className="rounded-xl"
												>
													<ItemContent>
														<ItemTitle className="text-sm">
															{member.name}
														</ItemTitle>
														<ItemDescription className="text-xs">
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
									</section>
								) : null}

								{(data?.hours.length ?? 0) > 0 ? (
									<section aria-labelledby="schedule-hours-heading">
										<h3
											id="schedule-hours-heading"
											className="mb-1 font-semibold text-sm"
										>
											Assigned hours
										</h3>
										<p className="mb-3 text-muted-foreground text-xs">
											Totals for the draft week, split by position.
										</p>
										<ItemGroup className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
											{(data?.hours ?? []).map((entry) => (
												<Item
													key={entry.employmentId}
													variant="outline"
													role="listitem"
													className="rounded-xl"
												>
													<ItemContent>
														<ItemTitle className="text-sm tabular-nums">
															{(entry.minutes / 60).toFixed(1)}h
														</ItemTitle>
														<ItemDescription className="text-xs">
															{entry.name} ·{" "}
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
									</section>
								) : null}

								{(acceptances.data?.acceptances.length ?? 0) > 0 ? (
									<section aria-labelledby="schedule-acceptances-heading">
										<div className="mb-1 flex items-center gap-2">
											<h3
												id="schedule-acceptances-heading"
												className="font-semibold text-sm"
											>
												Shift acceptances
											</h3>
											<Badge
												variant="secondary"
												className="h-5 rounded-md px-1.5 tabular-nums"
											>
												{acceptances.data?.acceptances.length}
											</Badge>
										</div>
										<p className="mb-3 text-muted-foreground text-xs">
											Late material changes require the worker's explicit
											acceptance. Acceptance is separate from acknowledgement.
										</p>
										<ItemGroup className="grid gap-2 sm:grid-cols-2">
											{(acceptances.data?.acceptances ?? []).map(
												(acceptance) => (
													<Item
														key={acceptance.id}
														variant="outline"
														role="listitem"
														className="rounded-xl"
													>
														<ItemContent>
															<ItemTitle className="text-sm">
																{acceptance.workerName} · v
																{acceptance.versionNumber}
															</ItemTitle>
															<ItemDescription className="text-xs">
																{acceptance.changeSummary}
															</ItemDescription>
														</ItemContent>
														<Badge
															variant={
																acceptance.status === "declined"
																	? "destructive"
																	: acceptance.status === "accepted"
																		? "default"
																		: "secondary"
															}
															className="rounded-md uppercase"
														>
															{acceptance.status}
														</Badge>
													</Item>
												),
											)}
										</ItemGroup>
									</section>
								) : null}

								{(publication.data?.versions.length ?? 0) > 0 ? (
									<section aria-labelledby="schedule-publication-heading">
										<h3
											id="schedule-publication-heading"
											className="mb-1 font-semibold text-sm"
										>
											Publication history
										</h3>
										<p className="mb-3 text-muted-foreground text-xs">
											Acknowledgement means a worker saw the schedule. It does
											not mean they accepted the shifts.
										</p>
										<ItemGroup className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
											{(publication.data?.versions ?? [])
												.slice(0, 3)
												.map((version) => {
													const acknowledged = version.workers.filter(
														(worker) => worker.status === "acknowledged",
													).length;
													return (
														<Item
															key={version.id}
															variant="outline"
															role="listitem"
															className="items-start rounded-xl"
														>
															<ItemContent>
																<ItemTitle className="text-sm">
																	Version {version.versionNumber} ·{" "}
																	{new Date(
																		version.publishedAt,
																	).toLocaleString()}
																</ItemTitle>
																<ItemDescription className="text-xs">
																	{acknowledged}/{version.workers.length}{" "}
																	acknowledged
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
																			className="rounded-md text-[11px]"
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
									</section>
								) : null}
							</CardHeader>
						</Card>
					) : null}
				</div>
			</div>
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
