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
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@SchedulesManager/ui/components/dropdown-menu";
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
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@SchedulesManager/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@SchedulesManager/ui/components/dialog";
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
	useDroppable,
} from "@dnd-kit/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangleIcon,
	BanIcon,
	CalendarOffIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CopyIcon,
	EllipsisIcon,
	ListFilterIcon,
	MapPinIcon,
	PlusIcon,
	SearchIcon,
	TagsIcon,
	Trash2Icon,
	UserPlusIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import { ScheduleMonthGrid } from "@/components/schedule-month-grid";
import { ShiftTile } from "@/components/schedule-shift-tile";
import { TimePicker } from "@/components/time-picker";
import { api } from "@/lib/api";
import type {
	AcceptancesResponse,
	ChangePreviewResponse,
	PublicationResponse,
	ScheduleResponse,
	ScheduleShiftDto,
} from "@/lib/queries";
import {
	useAcceptances,
	useApplyScheduleTemplate,
	useEditTimeEntry,
	useGroups,
	useLocations,
	useMarkAttendance,
	usePublication,
	useSaveScheduleTemplate,
	useSchedule,
	useScheduleCalendar,
	useScheduleTemplates,
	useTags,
	useTimeBlocks,
	useWorkplaceSettings,
} from "@/lib/queries";
import {
	addCalendarMonths,
	addDays,
	formatMonthLabel,
	monthStartForView,
	monthStartOf,
	positionColor,
	weekStartOf,
} from "@/lib/schedule-calendar";
import {
	datetimeLocalToIso,
	formatMinute,
	isoToDatetimeLocal,
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

type StaffRow = ScheduleResponse["staff"][number];
type HoursRow = ScheduleResponse["hours"][number];
type AcceptanceRow = AcceptancesResponse["acceptances"][number];
type PublicationRow = PublicationResponse["versions"][number];
type ChangeRow = ChangePreviewResponse["changes"][number];

const staffHelper = createDataColumnHelper<StaffRow>();
const hoursHelper = createDataColumnHelper<HoursRow>();
const acceptanceHelper = createDataColumnHelper<AcceptanceRow>();
const publicationHelper = createDataColumnHelper<PublicationRow>();
const changeHelper = createDataColumnHelper<ChangeRow>();

function staffConstraintText(member: StaffRow): string {
	const parts: string[] = [];
	if ((member.unavailability?.length ?? 0) > 0) {
		parts.push(
			(member.unavailability ?? [])
				.map((window) =>
					window.kind === "recurring"
						? `Can't work ${WEEKDAY_NAMES[window.weekday ?? 0]} ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`
						: `Can't work ${window.date} ${formatMinute(window.startMinute)}–${formatMinute(window.endMinute)}`,
				)
				.join(" · "),
		);
	}
	if (member.preference) parts.push(`Prefers: ${member.preference}`);
	if ((member.timeOff?.length ?? 0) > 0) {
		parts.push(
			(member.timeOff ?? [])
				.map(
					(request) =>
						`${request.status} time off ${new Date(request.startsAt).toLocaleDateString()}–${new Date(request.endsAt).toLocaleDateString()}`,
				)
				.join(" · "),
		);
	}
	return parts.join(" · ");
}

const scheduleStaffColumns = staffHelper.columns([
	staffHelper.accessor("name", {
		header: "Worker",
		cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
	}),
	staffHelper.accessor((row) => staffConstraintText(row), {
		id: "details",
		header: "Constraints",
	}),
]);
const hoursColumns = hoursHelper.columns([
	hoursHelper.accessor("name", {
		header: "Worker",
		cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
	}),
	hoursHelper.accessor((row) => `${(row.minutes / 60).toFixed(1)}h`, {
		id: "total",
		header: "Total",
		cell: ({ getValue }) => (
			<span className="tabular-nums">{getValue()}</span>
		),
	}),
	hoursHelper.accessor(
		(row) =>
			row.byPosition
				.map(
					(byPosition) =>
						`${byPosition.positionName} ${(byPosition.minutes / 60).toFixed(1)}h`,
				)
				.join(", "),
		{ id: "byPosition", header: "By position" },
	),
]);
const scheduleAcceptanceColumns = acceptanceHelper.columns([
	acceptanceHelper.accessor(
		(row) => `${row.workerName} · v${row.versionNumber}`,
		{
			id: "worker",
			header: "Worker",
			cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
		},
	),
	acceptanceHelper.accessor("changeSummary", { header: "Change" }),
	acceptanceHelper.accessor("status", {
		header: "Status",
		cell: ({ getValue }) => {
			const status = getValue();
			return (
				<Badge
					variant={
						status === "declined"
							? "destructive"
							: status === "accepted"
								? "default"
								: "secondary"
					}
					className="rounded-md uppercase"
				>
					{status}
				</Badge>
			);
		},
	}),
]);
const publicationColumns = publicationHelper.columns([
	publicationHelper.accessor("versionNumber", {
		header: "Version",
		cell: ({ getValue, row }) => (
			<span className="font-medium">
				Version {getValue()} ·{" "}
				{new Date(row.original.publishedAt).toLocaleString()}
			</span>
		),
	}),
	publicationHelper.accessor(
		(row) =>
			`${row.workers.filter((worker) => worker.status === "acknowledged").length}/${row.workers.length} acknowledged`,
		{ id: "ack", header: "Seen" },
	),
	publicationHelper.display({
		id: "workers",
		header: "Workers",
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex flex-wrap gap-1.5">
				{row.original.workers.map((worker) => (
					<Badge
						key={worker.employmentId}
						title={`${worker.name} · ${worker.status}`}
						variant={
							worker.status === "acknowledged" ? "default" : "secondary"
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
		),
	}),
]);
const changeColumns = changeHelper.columns([
	changeHelper.accessor("material", {
		header: "Kind",
		cell: ({ getValue }) =>
			getValue() ? <Badge variant="secondary">Material</Badge> : "—",
	}),
	changeHelper.accessor("summary", { header: "Change" }),
]);

function orderedDayHeaders(weekStartDay: number): string[] {
	return Array.from(
		{ length: 7 },
		(_, index) => DAY_HEADERS[(weekStartDay + index) % 7],
	);
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

function weekdayShort(dateKey: string): string {
	return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
	});
}

function isWeekendDate(dateKey: string): boolean {
	const day = new Date(`${dateKey}T12:00:00`).getDay();
	return day === 0 || day === 6;
}

function formatCents(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(cents / 100);
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
	tagIds: string[];
	taskTitles: string;
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
		tagIds: [],
		taskTitles: "",
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

function workerNeedsPositionApproval(
	member: ScheduleResponse["staff"][number] | undefined,
	positionId: string,
): boolean {
	if (!positionId) return false;
	const positionIds = member?.kind === "worker" ? member.positionIds : undefined;
	if (!positionIds || positionIds.length === 0) return false;
	return !positionIds.includes(positionId);
}

type PositionApproval =
	| {
			kind: "save";
			form: ShiftFormState;
			workerName: string;
			positionName: string;
			shiftCount: number;
	  }
	| {
			kind: "move";
			shift: ScheduleShiftDto;
			employmentId: string;
			date: string;
			workerName: string;
			positionName: string;
	  };

function positionApprovalCopy(approval: PositionApproval) {
	const consequence =
		approval.kind === "move"
			? "moves this shift"
			: approval.shiftCount > 1
				? `adds ${approval.shiftCount} shifts`
				: approval.form.shiftId
					? "saves this shift"
					: "adds this shift";
	return {
		title: `Add ${approval.positionName} to ${approval.workerName}?`,
		description: `${approval.workerName} isn’t approved for ${approval.positionName} yet. Confirming adds this Position to their Employment, then ${consequence}.`,
		confirmLabel: `Add ${approval.positionName} and ${approval.kind === "move" ? "move" : "save"}`,
	};
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
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
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
						<div className="flex flex-1 flex-col gap-1.5">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-2.5 w-16" />
						</div>
					</div>
					{SKELETON_DAYS.map((day) => (
						<div key={`${row}-${day}`} className="min-h-24 p-2">
							{(day.charCodeAt(0) + row.charCodeAt(0)) % 4 === 0 ? (
								<Skeleton className="h-14 w-full rounded-md" />
							) : null}
						</div>
					))}
				</div>
			))}
		</div>
	);
}

function ScheduleMetric({
	value,
	label,
	tone = "default",
}: {
	value: string | number;
	label: string;
	tone?: "default" | "emphasis" | "danger";
}) {
	return (
		<Badge
			variant={tone === "danger" ? "destructive" : "outline"}
			className={cn(
				"h-6 gap-1 rounded-md px-2 font-normal tabular-nums",
				tone === "emphasis" && "border-primary/30 bg-primary/5 text-foreground",
			)}
		>
			<span className="font-semibold">{value}</span>
			<span
				className={cn(
					tone === "danger" ? "opacity-90" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
		</Badge>
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
	const [todayFocus, setTodayFocus] = useState(false);
	const [viewMode, setViewMode] = useState<"week" | "day" | "month">("week");
	const [monthAnchor, setMonthAnchor] = useState(() =>
		monthStartOf(new Date().toLocaleDateString("sv-SE")),
	);
	const [selectedDay, setSelectedDay] = useState(() =>
		new Date().toLocaleDateString("sv-SE"),
	);
	const [groupFilter, setGroupFilter] = useState("all");
	const [tagFilter, setTagFilter] = useState("all");
	const [dayPartFilter, setDayPartFilter] = useState("all");
	const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
	const [copiedShifts, setCopiedShifts] = useState<
		{
			positionId: string;
			startMinute: number;
			endMinute: number;
			note: string | null;
		}[]
	>([]);
	const [salesDollars, setSalesDollars] = useState("");
	const [repeatWeeks, setRepeatWeeks] = useState("1");
	const [templateName, setTemplateName] = useState("");
	const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
	const [punchReason, setPunchReason] = useState("");
	const [punchInLocal, setPunchInLocal] = useState("");
	const [punchOutLocal, setPunchOutLocal] = useState("");
	const [punchStillOpen, setPunchStillOpen] = useState(false);
	const [staffStateFilter, setStaffStateFilter] = useState("all");
	const [gridDensity, setGridDensity] = useState<GridDensity>("comfortable");
	const locations = useLocations(workplace?.id);
	const [locationId, setLocationId] = useState<string | undefined>(undefined);

	const activeLocationId = locationId ?? locations.data?.[0]?.id;
	const schedule = useSchedule(activeLocationId, weekStart);
	const calendar = useScheduleCalendar(
		activeLocationId,
		monthAnchor,
		viewMode === "month",
	);
	const templates = useScheduleTemplates(activeLocationId);
	const saveTemplate = useSaveScheduleTemplate(activeLocationId);
	const applyTemplate = useApplyScheduleTemplate(activeLocationId);
	const groups = useGroups(workplace?.id);
	const tags = useTags(workplace?.id);
	const timeBlocks = useTimeBlocks(activeLocationId);
	const markAttendance = useMarkAttendance(workplace?.id);
	const editTimeEntry = useEditTimeEntry(workplace?.id);
	const publication = usePublication(schedule.data?.schedule.id);
	const acceptances = useAcceptances(schedule.data?.schedule.id);
	const queryClient = useQueryClient();
	const [form, setForm] = useState<ShiftFormState | null>(null);
	const [addDates, setAddDates] = useState<string[]>([]);
	const [addEmploymentIds, setAddEmploymentIds] = useState<string[]>([]);
	const [positionApproval, setPositionApproval] =
		useState<PositionApproval | null>(null);
	const [publishPreview, setPublishPreview] =
		useState<ChangePreviewResponse | null>(null);
	useEffect(() => {
		setHeaderTarget(document.getElementById("schedule-header-controls"));
	}, []);

	async function invalidate() {
		await queryClient.invalidateQueries({ queryKey: ["schedule"] });
		await queryClient.invalidateQueries({ queryKey: ["schedule-calendar"] });
		await queryClient.refetchQueries({
			queryKey: ["schedule", activeLocationId, weekStart],
		});
	}

	const createOrUpdate = useMutation({
		mutationFn: async (
			state: ShiftFormState & { approvePosition?: boolean },
		) => {
			if (!activeLocationId) throw new Error("No location selected");
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
						api(
							`/v1/locations/${activeLocationId}/schedules/${weekStart}/shifts`,
							{
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
								},
							},
						),
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
			approvePosition,
		}: {
			shift: ScheduleShiftDto;
			employmentId: string | null;
			date: string;
			approvePosition?: boolean;
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
					...(approvePosition ? { approvePosition: true } : {}),
				},
			});
			return { approvePosition: approvePosition === true };
		},
		onSuccess: async (result) => {
			setPositionApproval(null);
			await invalidate();
			if (result.approvePosition) {
				await queryClient.invalidateQueries({
					queryKey: ["workplaces", workplace?.id, "workers"],
				});
			}
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

	const autoAssign = useMutation({
		mutationFn: () =>
			api<{ assigned: number }>(
				`/v1/locations/${activeLocationId}/schedules/${weekStart}/auto-assign`,
				{ method: "POST" },
			),
		onSuccess: async (result) => {
			await invalidate();
			toast.success(
				result.assigned === 0
					? "No unassigned Shifts could be filled."
					: `Assigned ${result.assigned} Shift${result.assigned === 1 ? "" : "s"}.`,
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const bulkShifts = useMutation({
		mutationFn: (body: {
			shiftIds: string[];
			delete?: boolean;
			employmentId?: string | null;
		}) =>
			api(
				`/v1/locations/${activeLocationId}/schedules/${weekStart}/bulk`,
				{ method: "POST", body },
			),
		onSuccess: async () => {
			setSelectedShiftIds([]);
			await invalidate();
			toast.success("Bulk change saved.");
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const pasteShifts = useMutation({
		mutationFn: (date: string) =>
			api<{ pasted: number }>(
				`/v1/locations/${activeLocationId}/schedules/${weekStart}/paste`,
				{
					method: "POST",
					body: { date, shifts: copiedShifts },
				},
			),
		onSuccess: async (result: { pasted: number }) => {
			await invalidate();
			toast.success(`Pasted ${result.pasted} Shift${result.pasted === 1 ? "" : "s"}.`);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const saveSales = useMutation({
		mutationFn: ({
			day,
			amountCents,
		}: {
			day: string;
			amountCents: number;
		}) =>
			api(`/v1/locations/${activeLocationId}/sales/${day}`, {
				method: "PUT",
				body: { amountCents },
			}),
		onSuccess: async () => {
			await invalidate();
			toast.success("Daily sales saved.");
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
	const summaryShifts =
		viewMode === "month"
			? (calendar.data?.shifts ?? [])
			: (data?.shifts ?? []);
	const conflictCount = summaryShifts.reduce(
		(sum, shift) => sum + shift.conflicts.length,
		0,
	);
	const timeclockByShiftId = useMemo(() => {
		const map = new Map<string, ScheduleResponse["timeclock"][number]>();
		for (const entry of data?.timeclock ?? []) {
			map.set(entry.shiftId, entry);
		}
		for (const entry of calendar.data?.timeclock ?? []) {
			if (!map.has(entry.shiftId)) map.set(entry.shiftId, entry);
		}
		return map;
	}, [calendar.data?.timeclock, data?.timeclock]);

	function syncPunchFields(shift: ScheduleShiftDto | undefined) {
		const timezone = data?.schedule.timezone ?? "America/Chicago";
		const timeclock = shift ? timeclockByShiftId.get(shift.id) : undefined;
		setPunchInLocal(
			isoToDatetimeLocal(
				timeclock?.clockedInAt ?? shift?.startsAt ?? "",
				timezone,
			),
		);
		setPunchOutLocal(
			isoToDatetimeLocal(
				timeclock?.clockedOutAt ?? shift?.endsAt ?? "",
				timezone,
			),
		);
		setPunchStillOpen(timeclock?.status === "open");
		setPunchReason("");
	}
	const dayHeaders = orderedDayHeaders(weekStartDay);
	const onClockCount = (
		viewMode === "month"
			? (calendar.data?.timeclock ?? [])
			: (data?.timeclock ?? [])
	).filter((entry) => entry.status === "open").length;
	const openShiftCount = summaryShifts.filter(
		(shift) => shift.employmentId === null,
	).length;
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
	const salesByDate = useMemo(() => {
		const map = new Map<string, number>();
		for (const row of data?.labor?.byDate ?? []) {
			map.set(row.date, row.amountCents);
		}
		return map;
	}, [data?.labor?.byDate]);

	function prepareDaySales(day: string) {
		setSelectedDay(day);
		const cents = salesByDate.get(day) ?? 0;
		setSalesDollars(cents > 0 ? String(cents / 100) : "");
	}

	function submitDaySales(day: string) {
		const dollars = Number(salesDollars);
		if (!Number.isFinite(dollars) || dollars < 0) {
			toast.error("Enter daily sales as a dollar amount");
			return;
		}
		saveSales.mutate({ day, amountCents: Math.round(dollars * 100) });
	}
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
			if (
				groupFilter !== "all" &&
				!member.groupIds.includes(groupFilter)
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
		groupFilter,
		positionFilter,
		scheduleIndex.hoursByEmploymentId,
		staffStateFilter,
		workerQuery,
	]);
	const visibleStaff = filteredStaff.slice(0, visibleStaffCount);
	const hasStaffFilters =
		workerQuery.trim().length > 0 ||
		positionFilter !== "all" ||
		staffStateFilter !== "all" ||
		groupFilter !== "all" ||
		tagFilter !== "all" ||
		dayPartFilter !== "all";
	const activeSelectFilterCount =
		Number(positionFilter !== "all") +
		Number(staffStateFilter !== "all") +
		Number(groupFilter !== "all") +
		Number(tagFilter !== "all") +
		Number(dayPartFilter !== "all");
	const clearStaffFilters = () => {
		setWorkerQuery("");
		setPositionFilter("all");
		setStaffStateFilter("all");
		setGroupFilter("all");
		setTagFilter("all");
		setDayPartFilter("all");
		setVisibleStaffCount(40);
	};

	function shiftMatchesSurfaceFilters(shift: ScheduleShiftDto) {
		if (tagFilter !== "all" && !shift.tagIds.includes(tagFilter)) return false;
		if (dayPartFilter !== "all") {
			const part = (timeBlocks.data?.dayParts ?? []).find(
				(row) => row.id === dayPartFilter,
			);
			if (
				part &&
				(shift.startMinute < part.startMinute ||
					shift.startMinute >= part.endMinute)
			)
				return false;
		}
		return true;
	}

	function shiftMatchesCalendarFilters(shift: ScheduleShiftDto) {
		if (!shiftMatchesSurfaceFilters(shift)) return false;
		if (positionFilter !== "all" && shift.positionId !== positionFilter) {
			return false;
		}
		const query = workerQuery.trim().toLowerCase();
		if (query) {
			const haystack = `${shift.workerName ?? "open"} ${shift.positionName}`.toLowerCase();
			if (!haystack.includes(query)) return false;
		}
		if (groupFilter !== "all") {
			const member = (data?.staff ?? []).find(
				(row) => row.employmentId === shift.employmentId,
			);
			if (!member?.groupIds.includes(groupFilter)) return false;
		}
		return true;
	}

	const days = Array.from({ length: 7 }, (_, index) =>
		addDays(weekStart, index),
	);
	const todayKey = new Date().toLocaleDateString("sv-SE");
	const visibleDays =
		viewMode === "day"
			? days.includes(selectedDay)
				? [selectedDay]
				: [weekStart]
			: todayFocus && days.includes(todayKey)
				? days.filter((day) => day === todayKey)
				: days;

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

	function toggleShiftSelect(shiftId: string) {
		setSelectedShiftIds((current) =>
			current.includes(shiftId)
				? current.filter((id) => id !== shiftId)
				: [...current, shiftId],
		);
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
				data?.staff.find((candidate) => candidate.employmentId === employmentId),
			)
			.filter((member): member is NonNullable<typeof member> =>
				Boolean(member && workerNeedsPositionApproval(member, state.positionId)),
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

		const targetMember =
			typeof targetData.employmentId === "string"
				? data?.staff.find(
						(member) => member.employmentId === targetData.employmentId,
					)
				: undefined;
		if (
			typeof targetData.employmentId === "string" &&
			workerNeedsPositionApproval(targetMember, shift.positionId)
		) {
			const suspended = event.suspend();
			suspended.abort();
			setPositionApproval({
				kind: "move",
				shift,
				employmentId: targetData.employmentId,
				date: targetData.date,
				workerName: targetMember?.name ?? "this worker",
				positionName: shift.positionName,
			});
			return;
		}

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
					? staffWindowOverlaps(
							window,
							date,
							form.startMinute,
							form.endMinute,
						)
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
			return checkDates.some((date) => {
				const overnight = form.endMinute <= form.startMinute;
				const [year, month, day] = date.split("-").map(Number);
				const start = new Date(
					year ?? 0,
					(month ?? 1) - 1,
					day ?? 1,
					Math.floor(form.startMinute / 60),
					form.startMinute % 60,
				);
				const endDate = overnight ? addDays(date, 1) : date;
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
			});
		});
	const pendingAddCount = form ? createShiftCount(form) : 0;
	const canSave = Boolean(
		form?.positionId &&
			(form.shiftId || addDates.length > 0) &&
			form.startMinute !== form.endMinute &&
			(!needsOverride || form.unavailabilityOverrideReason.trim()),
	);

	const selectedShiftTimeclock = form?.shiftId
		? timeclockByShiftId.get(form.shiftId)
		: undefined;
	const selectedShiftAssigned = Boolean(form?.employmentId);
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
	const approvalCopy = positionApproval
		? positionApprovalCopy(positionApproval)
		: null;
	return (
		<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
			<h1 className="sr-only">Schedule</h1>
			<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-none">
				{headerTarget
					? createPortal(
							<div className="flex w-full min-w-0 items-center justify-between gap-3">
								<div className="flex min-w-0 items-center gap-1">
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
											size="sm"
											className="min-w-0 max-w-36 border-transparent bg-transparent font-medium shadow-none hover:bg-muted"
										>
											<MapPinIcon />
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
									<div className="flex shrink-0 items-center">
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={
												viewMode === "month"
													? "Previous month"
													: "Previous week"
											}
											onClick={() => {
												if (viewMode === "month") {
													setMonthAnchor((current) =>
														addCalendarMonths(current, -1),
													);
												} else {
													setWeekStart((current) => addDays(current, -7));
												}
												setForm(null);
											}}
										>
											<ChevronLeftIcon />
										</Button>
										<DatePicker
											id="schedule-week"
											value={viewMode === "month" ? monthAnchor : weekStart}
											displayValue={
												viewMode === "month"
													? formatMonthLabel(monthAnchor)
													: formatWeekLabel(weekStart)
											}
											buttonClassName="h-8 w-auto min-w-0 border-transparent bg-transparent px-1.5 font-medium tabular-nums shadow-none hover:bg-muted"
											onValueChange={(date) => {
												setWeekStart(
													weekStartOf(
														new Date(`${date}T12:00:00`),
														weekStartDay,
													),
												);
												setMonthAnchor(monthStartOf(date));
												setSelectedDay(date);
												setForm(null);
											}}
										/>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={
												viewMode === "month" ? "Next month" : "Next week"
											}
											onClick={() => {
												if (viewMode === "month") {
													setMonthAnchor((current) =>
														addCalendarMonths(current, 1),
													);
												} else {
													setWeekStart((current) => addDays(current, 7));
												}
												setForm(null);
											}}
										>
											<ChevronRightIcon />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												const today = new Date();
												setWeekStart(weekStartOf(today, weekStartDay));
												setMonthAnchor(
													monthStartOf(today.toLocaleDateString("sv-SE")),
												);
												setSelectedDay(today.toLocaleDateString("sv-SE"));
												setViewMode((current) =>
													current === "month" ? "week" : current,
												);
												setTodayFocus(false);
												setForm(null);
											}}
										>
											Today
										</Button>
									</div>
								</div>

								<div className="flex shrink-0 items-center gap-1.5">
									{publicationState?.latestVersionNumber == null ||
									publicationState.hasUnpublishedChanges ? (
										<span className="px-1 text-muted-foreground text-xs">
											Draft
										</span>
									) : null}
									<Select
										items={[
											{ label: "Week", value: "week" },
											{ label: "Day", value: "day" },
											{ label: "Month", value: "month" },
										]}
										value={viewMode}
										onValueChange={(value) => {
											if (
												value === "week" ||
												value === "day" ||
												value === "month"
											) {
												setViewMode(value);
												setTodayFocus(value === "day");
												if (value === "month") {
													setMonthAnchor(monthStartForView(weekStart));
												}
												if (value === "day" && !days.includes(selectedDay)) {
													setSelectedDay(weekStart);
												}
											}
										}}
									>
										<SelectTrigger
											aria-label="Schedule view"
											size="sm"
											className="w-[5.5rem]"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent alignItemWithTrigger={false}>
											<SelectGroup>
												<SelectItem value="week">Week</SelectItem>
												<SelectItem value="day">Day</SelectItem>
												<SelectItem value="month">Month</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													disabled={!activeLocationId}
												/>
											}
										>
											<EllipsisIcon />
											<span className="sr-only">More schedule actions</span>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="min-w-56">
											<DropdownMenuGroup>
												<DropdownMenuItem
													disabled={
														copyPrevious.isPending || !activeLocationId
													}
													onClick={() => copyPrevious.mutate()}
												>
													{copyPrevious.isPending ? <Spinner /> : null}
													Copy last week
												</DropdownMenuItem>
												<DropdownMenuItem
													disabled={
														saveTemplate.isPending ||
														!data ||
														data.shifts.length === 0
													}
													onClick={() => {
														setTemplateName("");
														setSaveTemplateOpen(true);
													}}
												>
													Save as template
												</DropdownMenuItem>
												<DropdownMenuItem
													disabled={
														autoAssign.isPending ||
														!data ||
														openShiftCount === 0
													}
													onClick={() => autoAssign.mutate()}
												>
													Auto-assign open shifts
												</DropdownMenuItem>
											</DropdownMenuGroup>
											{(templates.data ?? []).length > 0 ? (
												<>
													<DropdownMenuSeparator />
													<DropdownMenuGroup>
														{(templates.data ?? []).map((template) => (
															<DropdownMenuItem
																key={template.id}
																disabled={applyTemplate.isPending}
																onClick={() =>
																	applyTemplate.mutate(
																		{
																			weekStart,
																			templateId: template.id,
																		},
																		{
																			onSuccess: () =>
																				toast.success(
																					`Applied “${template.name}”. Review the draft before publishing.`,
																				),
																			onError: (error) =>
																				toast.error((error as Error).message),
																		},
																	)
																}
															>
																Apply {template.name}
															</DropdownMenuItem>
														))}
													</DropdownMenuGroup>
												</>
											) : null}
										</DropdownMenuContent>
									</DropdownMenu>
									<Button
										size="sm"
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
										Publish
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={!data || data.positions.length === 0}
										onClick={() => openCreate(defaultAddDate(weekStart))}
									>
										<PlusIcon data-icon="inline-start" />
										Add
									</Button>
								</div>
							</div>,
							headerTarget,
						)
					: null}
				<div className="flex min-w-0 items-center gap-2 border-b bg-background px-3 py-1.5 print:hidden">
						{data && data.staff.length > 0 ? (
							<>
								<InputGroup className="max-w-52 min-w-36 flex-1 sm:flex-none">
									<InputGroupAddon align="inline-start">
										<SearchIcon />
									</InputGroupAddon>
									<InputGroupInput
										aria-label="Search workers"
										placeholder="Search"
										value={workerQuery}
										onChange={(event) => {
											setWorkerQuery(event.target.value);
											setVisibleStaffCount(40);
										}}
									/>
								</InputGroup>
								<Popover>
									<PopoverTrigger
										render={<Button variant="ghost" size="sm" />}
									>
										<ListFilterIcon data-icon="inline-start" />
										Filters
										{activeSelectFilterCount > 0 ? (
											<Badge
												variant="secondary"
												className="ml-1 size-5 px-0 tabular-nums"
											>
												{activeSelectFilterCount}
											</Badge>
										) : null}
									</PopoverTrigger>
									<PopoverContent align="start" className="w-72">
										<PopoverHeader>
											<PopoverTitle>Filters</PopoverTitle>
										</PopoverHeader>
										<FieldGroup className="gap-3">
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
															<SelectItem value="all">All positions</SelectItem>
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
															<SelectItem value="scheduled">Scheduled</SelectItem>
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
											{(groups.data?.groups ?? []).length > 0 ? (
												<Field>
													<FieldLabel>Worker group</FieldLabel>
													<Select
														items={[
															{ label: "All groups", value: "all" },
															...(groups.data?.groups ?? []).map((group) => ({
																label: group.name,
																value: group.id,
															})),
														]}
														value={groupFilter}
														onValueChange={(value) => {
															if (!value) return;
															setGroupFilter(value);
															setVisibleStaffCount(40);
														}}
													>
														<SelectTrigger className="w-full">
															<SelectValue />
														</SelectTrigger>
														<SelectContent alignItemWithTrigger={false}>
															<SelectGroup>
																<SelectItem value="all">All groups</SelectItem>
																{(groups.data?.groups ?? []).map((group) => (
																	<SelectItem key={group.id} value={group.id}>
																		{group.name}
																	</SelectItem>
																))}
															</SelectGroup>
														</SelectContent>
													</Select>
												</Field>
											) : null}
											{(tags.data?.tags ?? []).length > 0 ? (
												<Field>
													<FieldLabel>Shift tag</FieldLabel>
													<Select
														items={[
															{ label: "All tags", value: "all" },
															...(tags.data?.tags ?? []).map((tag) => ({
																label: tag.name,
																value: tag.id,
															})),
														]}
														value={tagFilter}
														onValueChange={(value) => {
															if (!value) return;
															setTagFilter(value);
														}}
													>
														<SelectTrigger className="w-full">
															<SelectValue />
														</SelectTrigger>
														<SelectContent alignItemWithTrigger={false}>
															<SelectGroup>
																<SelectItem value="all">All tags</SelectItem>
																{(tags.data?.tags ?? []).map((tag) => (
																	<SelectItem key={tag.id} value={tag.id}>
																		{tag.name}
																	</SelectItem>
																))}
															</SelectGroup>
														</SelectContent>
													</Select>
												</Field>
											) : null}
											{(timeBlocks.data?.dayParts ?? []).length > 0 ? (
												<Field>
													<FieldLabel>Day part</FieldLabel>
													<Select
														items={[
															{ label: "All day parts", value: "all" },
															...(timeBlocks.data?.dayParts ?? []).map(
																(part) => ({
																	label: part.name,
																	value: part.id,
																}),
															),
														]}
														value={dayPartFilter}
														onValueChange={(value) => {
															if (!value) return;
															setDayPartFilter(value);
														}}
													>
														<SelectTrigger className="w-full">
															<SelectValue />
														</SelectTrigger>
														<SelectContent alignItemWithTrigger={false}>
															<SelectGroup>
																<SelectItem value="all">All day parts</SelectItem>
																{(timeBlocks.data?.dayParts ?? []).map(
																	(part) => (
																		<SelectItem key={part.id} value={part.id}>
																			{part.name}
																		</SelectItem>
																	),
																)}
															</SelectGroup>
														</SelectContent>
													</Select>
												</Field>
											) : null}
											{viewMode !== "month" ? (
												<Field>
													<FieldLabel>Density</FieldLabel>
													<ToggleGroup
														aria-label="Schedule grid density"
														value={[gridDensity]}
														variant="outline"
														size="sm"
														spacing={0}
														className="w-full"
														onValueChange={(value) => {
															const next = value[0];
															if (
																next === "compact" ||
																next === "comfortable"
															) {
																setGridDensity(next);
															}
														}}
													>
														<ToggleGroupItem
															className="flex-1"
															value="compact"
														>
															Compact
														</ToggleGroupItem>
														<ToggleGroupItem
															className="flex-1"
															value="comfortable"
														>
															Comfortable
														</ToggleGroupItem>
													</ToggleGroup>
												</Field>
											) : null}
											{data.positions.length > 0 ? (
												<Field>
													<FieldLabel>Position colors</FieldLabel>
													<ul
														className="flex list-none flex-wrap gap-x-3 gap-y-1.5"
														aria-label="Position colors"
													>
														{data.positions.map((position) => (
															<li
																key={position.id}
																className="flex items-center gap-1.5 text-muted-foreground text-xs"
															>
																<span
																	className={cn(
																		"size-1.5 rounded-full",
																		positionColor(position.name).dot,
																	)}
																	aria-hidden
																/>
																{position.name}
															</li>
														))}
													</ul>
												</Field>
											) : null}
										</FieldGroup>
									</PopoverContent>
								</Popover>
								{hasStaffFilters ? (
									<Button
										variant="ghost"
										size="sm"
										onClick={clearStaffFilters}
									>
										<XIcon data-icon="inline-start" />
										Clear
									</Button>
								) : null}
							</>
						) : null}

						{data &&
						(openShiftCount > 0 || conflictCount > 0 || onClockCount > 0) ? (
							<div className="ml-auto flex min-w-0 items-center gap-1.5">
								{openShiftCount > 0 ? (
									<ScheduleMetric
										value={openShiftCount}
										label="open"
										tone="emphasis"
									/>
								) : null}
								{conflictCount > 0 ? (
									<ScheduleMetric
										value={conflictCount}
										label={conflictCount === 1 ? "conflict" : "conflicts"}
										tone="danger"
									/>
								) : null}
								{onClockCount > 0 ? (
									<ScheduleMetric
										value={onClockCount}
										label="on clock"
										tone="emphasis"
									/>
								) : null}
							</div>
						) : null}
				</div>

				<div className="flex min-h-0 flex-1 flex-col">
					{schedule.isError ? (
						<Alert variant="destructive" className="mx-3 mt-3">
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
						<Empty className="m-3 border border-dashed">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<MapPinIcon />
								</EmptyMedia>
								<EmptyTitle>Add a location to start scheduling</EmptyTitle>
								<EmptyDescription>
									Schedules are drafted per location and workweek. Add the first
									location, then you can place shifts here.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button
									nativeButton={false}
									render={<Link to="/dashboard/settings/locations" />}
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
						<Empty className="m-3 border border-dashed">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<TagsIcon />
								</EmptyMedia>
								<EmptyTitle>Add a position before placing shifts</EmptyTitle>
								<EmptyDescription>
									Every shift needs a position such as cashier, nurse, or
									technician.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button
									nativeButton={false}
									render={<Link to="/dashboard/settings/positions" />}
								>
									Go to settings
								</Button>
							</EmptyContent>
						</Empty>
					) : null}

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
								<form
									onSubmit={submit}
									className="flex min-h-0 flex-1 flex-col"
								>
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
																			<SelectItem
																				key={block.id}
																				value={block.id}
																			>
																				{block.name}
																			</SelectItem>
																		),
																	)}
																</SelectGroup>
															</SelectContent>
														</Select>
													) : null}
													{(timeBlocks.data?.shiftTemplates ?? []).length >
													0 ? (
														<Select
															items={(
																timeBlocks.data?.shiftTemplates ?? []
															).map((template) => ({
																label: template.name,
																value: template.id,
															}))}
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
																	{(
																		timeBlocks.data?.shiftTemplates ?? []
																	).map((template) => (
																		<SelectItem
																			key={template.id}
																			value={template.id}
																		>
																			{template.name}
																		</SelectItem>
																	))}
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
															onValueChange={(date) =>
																setForm({ ...form, date })
															}
															disabled={(date) => {
																const key = date.toLocaleDateString("sv-SE");
																return (
																	key < weekStart ||
																	key > addDays(weekStart, 6)
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
																		variant={
																			selected ? "default" : "outline"
																		}
																		className="h-auto min-h-11 flex-col gap-0.5 px-1 py-1.5 tabular-nums"
																		aria-pressed={selected}
																		onClick={() => toggleAddDate(date)}
																	>
																		<span
																			className={cn(
																				"text-[10px]",
																				selected
																					? "text-primary-foreground/80"
																					: "text-muted-foreground",
																			)}
																		>
																			{weekdayShort(date)}
																		</span>
																		<span className="font-medium">
																			{new Date(
																				`${date}T12:00:00`,
																			).getDate()}
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
												<div className="min-w-0 space-y-1.5">
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
												<div className="min-w-0 space-y-1.5">
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
														>
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
														<Alert>
															<UserPlusIcon />
															<AlertTitle>
																{selectedCreateStaff.length > 1
																	? `${selectedCreateStaff.length} workers aren’t approved`
																	: `${selectedStaff?.name ?? "This worker"} isn’t approved`}{" "}
																for{" "}
																{data.positions.find(
																	(position) =>
																		position.id === form.positionId,
																)?.name ?? "this position"}
															</AlertTitle>
															<AlertDescription>
																You can add this Position to their Employment
																when you save. It will apply to future shifts
																too.
															</AlertDescription>
														</Alert>
													) : null}
												</div>

												<span className="pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
													{form.shiftId ? "Worker" : "Workers"}
												</span>
												<div className="min-w-0 space-y-1.5">
													{form.shiftId ? (
														<Select
															items={workerItems}
															value={form.employmentId || null}
															onValueChange={(employmentId) => {
																const nextEmploymentId = employmentId ?? "";
																const member = data.staff.find(
																	(candidate) =>
																		candidate.employmentId ===
																		nextEmploymentId,
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
															<SelectTrigger
																id="shift-worker"
																className="w-full"
															>
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
																			<button
																				type="button"
																				className="rounded-sm p-0.5 hover:bg-muted"
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
																				<XIcon className="size-3" />
																			</button>
																		</Badge>
																	);
																})}
																{(data.staff ?? []).some(
																	(member) =>
																		!addEmploymentIds.includes(
																			member.employmentId,
																		),
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
																			if (
																				addEmploymentIds.includes(
																					employmentId,
																				)
																			)
																				return;
																			const member = data.staff.find(
																				(candidate) =>
																					candidate.employmentId ===
																					employmentId,
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
												<details className="group rounded-lg border border-border/70">
													<summary className="cursor-pointer list-none px-3 py-2 font-medium text-sm marker:content-none [&::-webkit-details-marker]:hidden">
														<span className="flex items-center justify-between gap-2">
															More options
															<span className="font-normal text-muted-foreground text-xs group-open:hidden">
																Tags, tasks, repeat…
															</span>
														</span>
													</summary>
													<div className="flex flex-col gap-4 border-t px-3 py-3">
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
																				Math.min(
																					12,
																					Number(repeatWeeks) || 1,
																				),
																			),
																		})
																	}
																>
																	Copy forward
																</Button>
															</div>
														</Field>
													</div>
												</details>
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
																		onSuccess: () =>
																			toast.success("Marked late."),
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
																		onSuccess: () =>
																			toast.success("Marked no-show."),
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
																		onSuccess: () =>
																			toast.success("Marked sick."),
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
														<FieldLabel htmlFor="punch-out">
															Clock out
														</FieldLabel>
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
														onChange={(event) =>
															setPunchReason(event.target.value)
														}
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
									<DialogFooter className="flex-row flex-wrap border-t px-6 py-4 sm:justify-start">
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
												onClick={() =>
													queueShiftSave({ ...form, shiftId: null })
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
									</DialogFooter>
								</form>
							) : null}
						</DialogContent>
					</Dialog>

					{copiedShifts.length > 0 && viewMode !== "month" ? (
						<div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 print:hidden">
							<span className="text-muted-foreground text-xs tabular-nums">
								{copiedShifts.length} shift
								{copiedShifts.length === 1 ? "" : "s"} copied
							</span>
							<Select
								items={[
									{ label: "Paste onto day", value: null },
									...days.map((day) => ({
										label: formatDayLabel(day),
										value: day,
									})),
								]}
								value={null}
								onValueChange={(value) => {
									if (value) pasteShifts.mutate(value);
								}}
							>
								<SelectTrigger aria-label="Paste copied shifts onto a day">
									<SelectValue placeholder="Paste onto day" />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									<SelectGroup>
										{days.map((day) => (
											<SelectItem key={day} value={day}>
												{formatDayLabel(day)}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setCopiedShifts([])}
							>
								Clear
							</Button>
						</div>
					) : null}

					{selectedShiftIds.length > 0 ? (
						<div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 print:hidden">
							<Badge variant="secondary" className="tabular-nums">
								{selectedShiftIds.length} selected
							</Badge>
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									const picked = (data?.shifts ?? []).filter((shift) =>
										selectedShiftIds.includes(shift.id),
									);
									setCopiedShifts(
										picked.map((shift) => ({
											positionId: shift.positionId,
											startMinute: shift.startMinute,
											endMinute: shift.endMinute,
											note: shift.note,
										})),
									);
									toast.success("Shifts copied.");
								}}
							>
								Copy
							</Button>
							<Button
								size="sm"
								variant="destructive"
								disabled={bulkShifts.isPending}
								onClick={() =>
									bulkShifts.mutate({
										shiftIds: selectedShiftIds,
										delete: true,
									})
								}
							>
								Delete
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setSelectedShiftIds([])}
							>
								Clear
							</Button>
							<p className="text-muted-foreground text-xs">
								Shift-click or ⌘-click a shift to select.
							</p>
						</div>
					) : null}

					{viewMode === "month" ? (
						<div className="flex min-h-0 flex-1 flex-col">
							<ScheduleMonthGrid
								monthStart={monthAnchor}
								weekStartDay={weekStartDay}
								todayKey={todayKey}
								shifts={calendar.data?.shifts ?? []}
								timeclockByShiftId={timeclockByShiftId}
								filterShift={shiftMatchesCalendarFilters}
								isPending={calendar.isPending && !calendar.data}
								onSelectDay={(day) => {
									setWeekStart(
										weekStartOf(new Date(`${day}T12:00:00`), weekStartDay),
									);
									setSelectedDay(day);
									setMonthAnchor(monthStartOf(day));
									setViewMode("day");
									setTodayFocus(false);
									setForm(null);
								}}
								onOpenShift={(shift) => {
									setWeekStart(
										weekStartOf(
											new Date(`${shift.date}T12:00:00`),
											weekStartDay,
										),
									);
									setSelectedDay(shift.date);
									openEdit(shift);
								}}
							/>
						</div>
					) : null}

					{viewMode !== "month" && schedule.isPending && !data ? (
						<div className="flex min-h-0 flex-1 flex-col">
							<ScheduleGridSkeleton />
						</div>
					) : null}

					{viewMode !== "month" && data ? (
						<DragDropProvider onDragEnd={handleShiftDragEnd}>
							<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
								<div className="schedule-grid-scroll min-h-0 min-w-0 flex-1 overflow-auto overscroll-none">
									<div
										className="grid"
										style={{
											gridTemplateColumns:
												gridDensity === "compact"
													? `200px repeat(${visibleDays.length}, minmax(118px, 1fr))`
													: `220px repeat(${visibleDays.length}, minmax(132px, 1fr))`,
											minWidth:
												visibleDays.length === 1
													? undefined
													: gridDensity === "compact"
														? 1032
														: 1144,
										}}
									>
										<div className="sticky top-0 left-0 z-30 flex items-center border-border border-r border-b bg-background px-3 py-2">
											<span className="font-medium text-muted-foreground text-xs">
												Staff
											</span>
										</div>
										{visibleDays.map((day) => {
											const isToday = day === todayKey;
											const isWeekend = isWeekendDate(day);
											const summary = daySummaries.get(day);
											const daySalesCents = salesByDate.get(day) ?? 0;
											const hoursLabel =
												summary && summary.minutes > 0
													? `${(summary.minutes / 60).toFixed(1)}h`
													: null;
											return (
												<div
													key={day}
													className={cn(
														"group/day sticky top-0 z-20 flex flex-col items-center gap-0.5 border-border border-r border-b bg-background px-1.5 py-2 last:border-r-0",
														isWeekend && "bg-muted",
													)}
												>
													<span
														className={cn(
															"text-[11px] font-medium leading-none",
															isToday
																? "text-primary"
																: "text-muted-foreground",
														)}
													>
														{weekdayShort(day)}
													</span>
													<span
														className={cn(
															"flex size-7 items-center justify-center text-sm font-semibold tabular-nums leading-none",
															isToday &&
																"rounded-full bg-primary text-primary-foreground",
														)}
													>
														{new Date(`${day}T12:00:00`).getDate()}
													</span>
													{hoursLabel ? (
														<span className="text-[10px] text-muted-foreground/80 tabular-nums leading-none">
															{hoursLabel}
														</span>
													) : null}
													<Popover
														onOpenChange={(open) => {
															if (open) prepareDaySales(day);
														}}
													>
														<PopoverTrigger
															render={
																<Button
																	variant="ghost"
																	size="xs"
																	aria-label={`Sales for ${formatDayLabel(day)}`}
																	className={cn(
																		"h-4 px-1 font-normal text-[10px] text-muted-foreground tabular-nums",
																		daySalesCents > 0
																			? undefined
																			: "opacity-0 transition-opacity group-hover/day:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60",
																	)}
																/>
															}
														>
															{daySalesCents > 0
																? formatCents(daySalesCents)
																: "Sales"}
														</PopoverTrigger>
														<PopoverContent
															align="center"
															className="w-64"
															sideOffset={6}
														>
															<PopoverHeader>
																<PopoverTitle>
																	Sales · {formatDayLabel(day)}
																</PopoverTitle>
																<PopoverDescription>
																	Used for labor percent on this day.
																</PopoverDescription>
															</PopoverHeader>
															<FieldGroup className="gap-3">
																<Field>
																	<FieldLabel htmlFor={`day-sales-${day}`}>
																		Amount
																	</FieldLabel>
																	<InputGroup>
																		<InputGroupAddon align="inline-start">
																			$
																		</InputGroupAddon>
																		<InputGroupInput
																			id={`day-sales-${day}`}
																			inputMode="decimal"
																			placeholder="0"
																			value={
																				selectedDay === day ? salesDollars : ""
																			}
																			onChange={(event) =>
																				setSalesDollars(event.target.value)
																			}
																		/>
																	</InputGroup>
																</Field>
																<Button
																	size="sm"
																	disabled={
																		saveSales.isPending || !activeLocationId
																	}
																	onClick={() => submitDaySales(day)}
																>
																	{saveSales.isPending ? (
																		<Spinner data-icon="inline-start" />
																	) : null}
																	Save sales
																</Button>
															</FieldGroup>
														</PopoverContent>
													</Popover>
												</div>
											);
										})}

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
															"sticky left-0 z-10 flex items-center gap-2.5 border-border border-r border-b bg-background px-3 py-2.5",
															gridDensity === "compact"
																? "min-h-[4.5rem]"
																: "min-h-24",
														)}
													>
														<Avatar size="sm" className="shrink-0">
															<AvatarFallback
																className={cn(
																	member.kind === "manager" &&
																		"bg-primary/10 font-semibold text-primary",
																)}
															>
																{initials(member.name)}
															</AvatarFallback>
														</Avatar>
														<div className="min-w-0 flex-1 flex flex-col gap-0.5">
															<p
																className="truncate font-medium text-sm leading-tight"
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
														<div className="flex shrink-0 flex-col items-end gap-1">
															<span
																className="font-medium text-xs tabular-nums"
																title={`${(minutes / 60).toFixed(1)} scheduled hours`}
															>
																{(minutes / 60).toFixed(1)}h
															</span>
															{hasConstraints ? (
																<Tooltip>
																	<TooltipTrigger
																		render={
																			<span className="inline-flex size-5 items-center justify-center text-muted-foreground">
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
													{visibleDays.map((day) => {
														const workerShifts = (
															scheduleIndex.shiftsByWorkerDay.get(
																`${member.employmentId}:${day}`,
															) ?? []
														).filter(shiftMatchesSurfaceFilters);
														const constraints = cellConstraints(member, day);
														const isEmptyCell =
															workerShifts.length === 0 &&
															constraints.length === 0;
														const isToday = day === todayKey;
														const dayIndex = days.indexOf(day);
														const isWeekend = dayIndex >= 5;
														return (
															<ScheduleDropCell
																key={day}
																employmentId={member.employmentId}
																date={day}
																className={cn(
																	"group relative border-border/70 border-r border-b p-1.5 transition-colors last:border-r-0 hover:bg-accent/25",
																	gridDensity === "compact"
																		? "min-h-[4.5rem]"
																		: "min-h-24",
																	isWeekend && "bg-muted/20",
																	isToday && "bg-accent/20",
																)}
															>
																{constraints.length > 0 ? (
																	<div className="mb-1 flex flex-col gap-1">
																		{constraints.map((constraint) => (
																			<Badge
																				key={constraint.key}
																				variant="outline"
																				className="max-w-full gap-1 border-dashed px-1.5 font-normal text-[10px] text-muted-foreground"
																			>
																				{constraint.kind ===
																				"unavailability" ? (
																					<BanIcon data-icon="inline-start" />
																				) : (
																					<CalendarOffIcon data-icon="inline-start" />
																				)}
																				<span className="truncate">
																					{constraint.label}
																				</span>
																			</Badge>
																		))}
																	</div>
																) : null}
																<div className="flex flex-col gap-1">
																	{workerShifts.map((shift) => (
																		<ShiftTile
																			key={shift.id}
																			shift={shift}
																			onOpen={openEdit}
																			onToggleSelect={() =>
																				toggleShiftSelect(shift.id)
																			}
																			selected={selectedShiftIds.includes(
																				shift.id,
																			)}
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
																	variant={isEmptyCell ? "outline" : "secondary"}
																	size={isEmptyCell ? "sm" : "icon-xs"}
																	className={cn(
																		"schedule-cell-add absolute text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100",
																		isEmptyCell &&
																			"schedule-cell-add-empty inset-0 m-auto h-7 w-fit border-dashed bg-transparent shadow-none",
																		!isEmptyCell && "right-1 bottom-1",
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
																		setAddDates([day]);
																		setAddEmploymentIds([member.employmentId]);
																		syncPunchFields(undefined);
																		setForm(draft);
																	}}
																>
																	<PlusIcon
																		data-icon={
																			isEmptyCell ? "inline-start" : undefined
																		}
																	/>
																	{isEmptyCell ? (
																		<span>Add</span>
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
											<div className="col-span-8 flex flex-col items-center gap-2 border-b bg-background p-8 text-center">
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

										{data.positions.length > 0 ? (
											<>
												<div className="sticky left-0 z-10 flex min-h-20 items-center border-border border-r border-b bg-accent px-3 py-3">
													<div className="flex flex-col gap-0.5">
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
												{visibleDays.map((day) => {
													const isWeekend = days.indexOf(day) >= 5;
													return (
														<ScheduleDropCell
															key={day}
															employmentId={null}
															date={day}
															className={cn(
																"min-h-20 border-border/70 border-r border-b bg-accent/20 p-1.5 last:border-r-0",
																isWeekend && "bg-muted/20",
															)}
														>
															<div className="flex flex-col gap-1">
																{(
																	scheduleIndex.shiftsByWorkerDay.get(
																		`open:${day}`,
																	) ?? []
																)
																	.filter(shiftMatchesSurfaceFilters)
																	.map((shift) => (
																		<ShiftTile
																			key={shift.id}
																			shift={shift}
																			onOpen={openEdit}
																			onToggleSelect={() =>
																				toggleShiftSelect(shift.id)
																			}
																			selected={selectedShiftIds.includes(
																				shift.id,
																			)}
																			compact={gridDensity === "compact"}
																			disabled={moveShift.isPending}
																			timeclock={timeclockByShiftId.get(
																				shift.id,
																			)}
																		/>
																	))}
															</div>
														</ScheduleDropCell>
													);
												})}
											</>
										) : null}

										{offRosterShifts.length > 0 ? (
											<>
												<div className="sticky left-0 z-10 flex min-h-20 items-center border-border border-r border-b bg-muted px-3 py-3">
													<div className="flex flex-col gap-0.5">
														<p className="font-medium text-sm leading-tight">
															Off-roster
														</p>
														<p className="text-muted-foreground text-xs leading-tight">
															Reassign or remove
														</p>
													</div>
												</div>
												{visibleDays.map((day) => {
													const isWeekend = days.indexOf(day) >= 5;
													return (
														<div
															key={day}
															className={cn(
																"min-h-20 border-border/70 border-r border-b bg-muted/20 p-1.5 last:border-r-0",
																isWeekend && "bg-muted/30",
															)}
														>
															<div className="flex flex-col gap-1">
																{(offRosterShiftsByDay.get(day) ?? [])
																	.filter(shiftMatchesSurfaceFilters)
																	.map((shift) => (
																		<ShiftTile
																			key={shift.id}
																			shift={shift}
																			onOpen={openEdit}
																			onToggleSelect={() =>
																				toggleShiftSelect(shift.id)
																			}
																			selected={selectedShiftIds.includes(
																				shift.id,
																			)}
																			compact={gridDensity === "compact"}
																			disabled={moveShift.isPending}
																			showWorker
																			timeclock={timeclockByShiftId.get(
																				shift.id,
																			)}
																		/>
																	))}
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
										<DataTable
											fill={false}
											bounded
											columns={scheduleStaffColumns}
											data={constrainedStaff}
											getRowId={(row) => row.employmentId}
										/>
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
										<DataTable
											fill={false}
											bounded
											columns={hoursColumns}
											data={data?.hours ?? []}
											getRowId={(row) => row.employmentId}
										/>
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
										<DataTable
											fill={false}
											bounded
											columns={scheduleAcceptanceColumns}
											data={acceptances.data?.acceptances ?? []}
											getRowId={(row) => row.id}
										/>
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
										<DataTable
											fill={false}
											bounded
											columns={publicationColumns}
											data={(publication.data?.versions ?? []).slice(0, 3)}
											getRowId={(row) => row.id}
										/>
									</section>
								) : null}
							</CardHeader>
						</Card>
					) : null}
				</div>
			</div>
			<AlertDialog
				open={positionApproval !== null}
				onOpenChange={(open) => {
					if (!open && !createOrUpdate.isPending && !moveShift.isPending) {
						setPositionApproval(null);
					}
				}}
			>
				<AlertDialogContent className="sm:max-w-md">
					{positionApproval && approvalCopy ? (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>{approvalCopy.title}</AlertDialogTitle>
								<AlertDialogDescription>
									{approvalCopy.description}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel
									disabled={createOrUpdate.isPending || moveShift.isPending}
								>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									disabled={createOrUpdate.isPending || moveShift.isPending}
									onClick={(event) => {
										event.preventDefault();
										if (positionApproval.kind === "save") {
											createOrUpdate.mutate({
												...positionApproval.form,
												approvePosition: true,
											});
											return;
										}
										moveShift.mutate({
											shift: positionApproval.shift,
											employmentId: positionApproval.employmentId,
											date: positionApproval.date,
											approvePosition: true,
										});
									}}
								>
									{createOrUpdate.isPending || moveShift.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									{approvalCopy.confirmLabel}
								</AlertDialogAction>
							</AlertDialogFooter>
						</>
					) : null}
				</AlertDialogContent>
			</AlertDialog>
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
						<DataTable
							fill={false}
							bounded
							columns={changeColumns}
							data={publishPreview.changes}
							getRowId={(row, index) => `${row.kind}-${row.summary}-${index}`}
						/>
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
			<AlertDialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Save this week as a template</AlertDialogTitle>
						<AlertDialogDescription>
							Stores this draft’s Shift times, Positions, and assignments so you
							can apply them to another week. Applying replaces that week’s
							draft.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Field>
						<FieldLabel htmlFor="template-name">Template name</FieldLabel>
						<Input
							id="template-name"
							value={templateName}
							onChange={(event) => setTemplateName(event.target.value)}
							placeholder="Weekday opening"
						/>
					</Field>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={
								saveTemplate.isPending || templateName.trim().length === 0
							}
							onClick={(event) => {
								event.preventDefault();
								saveTemplate.mutate(
									{ weekStart, name: templateName.trim() },
									{
										onSuccess: () => {
											setSaveTemplateOpen(false);
											toast.success("Template saved.");
										},
										onError: (error) => toast.error((error as Error).message),
									},
								);
							}}
						>
							{saveTemplate.isPending ? (
								<Spinner data-icon="inline-start" />
							) : null}
							Save template
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
