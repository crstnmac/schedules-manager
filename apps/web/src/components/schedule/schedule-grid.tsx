import { Avatar, AvatarFallback } from "@SchedulesManager/ui/components/avatar";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
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
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@SchedulesManager/ui/components/tooltip";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { useDroppable } from "@dnd-kit/react";
import {
	BanIcon,
	CalendarOffIcon,
	PlusIcon,
	StarIcon,
	UserRoundXIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { ShiftTile } from "@/components/schedule-shift-tile";
import type {
	ScheduleResponse,
	ScheduleShiftDto,
	ScheduleTimeclockEntry,
} from "@/lib/queries";
import {
	cellConstraints,
	formatCents,
	formatDayLabel,
	initials,
	positionsLabel,
	weekdayShort,
} from "./format";
import { type ShiftSelectionStore, useShiftSelected } from "./selection-store";

type StaffRow = ScheduleResponse["staff"][number];
type GridDensity = "compact" | "comfortable";

const NO_SHIFTS: readonly ScheduleShiftDto[] = [];

/** Per-day facts derived once per week/view instead of once per cell. */
export interface ScheduleDayInfo {
	key: string;
	isToday: boolean;
	isWeekend: boolean;
	dayName: string;
	dateNumber: number;
}

/** Tag / time-block filters applied to the tiles inside each cell. */
export interface ScheduleSurfaceFilter {
	tagFilter: string;
	timePart: { startMinute: number; endMinute: number } | null;
}

export function shiftMatchesSurface(
	shift: ScheduleShiftDto,
	filter: ScheduleSurfaceFilter,
) {
	if (filter.tagFilter !== "all" && !shift.tagIds.includes(filter.tagFilter)) {
		return false;
	}
	const part = filter.timePart;
	if (
		part &&
		(shift.startMinute < part.startMinute ||
			shift.startMinute >= part.endMinute)
	) {
		return false;
	}
	return true;
}

function useSurfaceShifts(
	shifts: readonly ScheduleShiftDto[] | undefined,
	filter: ScheduleSurfaceFilter,
) {
	return useMemo(() => {
		const list = shifts ?? NO_SHIFTS;
		if (filter.tagFilter === "all" && !filter.timePart) return list;
		return list.filter((shift) => shiftMatchesSurface(shift, filter));
	}, [shifts, filter]);
}

export interface ScheduleTileHandlers {
	onOpenShift: (shift: ScheduleShiftDto) => void;
	onToggleSelect: (shift: ScheduleShiftDto) => void;
}

const DROP_CELL_BASE =
	"transition-colors duration-150 motion-reduce:transition-none";
const DROP_CELL_ACTIVE =
	"bg-primary/10 ring-2 ring-primary/45 ring-inset motion-reduce:transition-none";

export const ScheduleDropCell = memo(function ScheduleDropCell({
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
				DROP_CELL_BASE,
				isDropTarget && DROP_CELL_ACTIVE,
			)}
		>
			{children}
		</div>
	);
});

/** ShiftTile whose selection ring is driven by the selection store. */
const GridShiftTile = memo(function GridShiftTile({
	shift,
	store,
	onOpen,
	onToggleSelect,
	compact,
	disabled,
	showWorker,
	timeclock,
}: {
	shift: ScheduleShiftDto;
	store: ShiftSelectionStore;
	onOpen: (shift: ScheduleShiftDto) => void;
	onToggleSelect: (shift: ScheduleShiftDto) => void;
	compact: boolean;
	disabled: boolean;
	showWorker: boolean;
	timeclock: ScheduleTimeclockEntry | undefined;
}) {
	const selected = useShiftSelected(store, shift.id);
	return (
		<ShiftTile
			shift={shift}
			onOpen={onOpen}
			onToggleSelect={onToggleSelect}
			selected={selected}
			compact={compact}
			disabled={disabled}
			showWorker={showWorker}
			timeclock={timeclock}
		/>
	);
});

const ShiftStack = memo(function ShiftStack({
	shifts,
	store,
	onOpen,
	onToggleSelect,
	compact,
	disabled,
	showWorker = false,
	timeclockByShiftId,
}: {
	shifts: readonly ScheduleShiftDto[];
	store: ShiftSelectionStore;
	onOpen: (shift: ScheduleShiftDto) => void;
	onToggleSelect: (shift: ScheduleShiftDto) => void;
	compact: boolean;
	disabled: boolean;
	showWorker?: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
}) {
	return (
		<div className="flex flex-col gap-1">
			{shifts.map((shift) => (
				<GridShiftTile
					key={shift.id}
					shift={shift}
					store={store}
					onOpen={onOpen}
					onToggleSelect={onToggleSelect}
					compact={compact}
					disabled={disabled}
					showWorker={showWorker}
					timeclock={timeclockByShiftId.get(shift.id)}
				/>
			))}
		</div>
	);
});

const CELL_HEIGHT: Record<GridDensity, string> = {
	compact: "min-h-[4.5rem]",
	comfortable: "min-h-24",
};

const WORKER_CELL_CLASS =
	"group relative border-border/70 border-r border-b p-1.5 transition-colors last:border-r-0 [@media(hover:hover)]:hover:bg-accent/25";

function workerCellClass(
	density: GridDensity,
	isWeekend: boolean,
	isToday: boolean,
) {
	return cn(
		WORKER_CELL_CLASS,
		CELL_HEIGHT[density],
		isWeekend && "bg-muted/30",
		isToday && "bg-primary/[0.035]",
	);
}

const ADD_BUTTON_BASE =
	"schedule-cell-add absolute text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100";
const ADD_BUTTON_EMPTY = cn(
	ADD_BUTTON_BASE,
	"schedule-cell-add-empty inset-0 m-auto h-7 w-fit border-dashed bg-transparent shadow-none",
);
const ADD_BUTTON_FILLED = cn(ADD_BUTTON_BASE, "right-1 bottom-1");

const CONSTRAINT_BADGE_CLASS =
	"max-w-full gap-1 border-dashed px-1.5 font-normal text-muted-foreground text-xs";

const ScheduleWorkerDayCell = memo(function ScheduleWorkerDayCell({
	member,
	day,
	shifts,
	surface,
	density,
	timeFormat,
	timeZone,
	canAdd,
	disabled,
	timeclockByShiftId,
	store,
	formatMinute,
	onOpenShift,
	onToggleSelect,
	onAddShift,
}: {
	member: StaffRow;
	day: ScheduleDayInfo;
	shifts: readonly ScheduleShiftDto[] | undefined;
	surface: ScheduleSurfaceFilter;
	density: GridDensity;
	/** Only a cache key: `formatMinute` is stable but its output depends on it. */
	timeFormat: string;
	timeZone: string;
	canAdd: boolean;
	disabled: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
	store: ShiftSelectionStore;
	formatMinute: (minute: number) => string;
	onAddShift: (member: StaffRow, day: string) => void;
} & ScheduleTileHandlers) {
	const workerShifts = useSurfaceShifts(shifts, surface);
	// biome-ignore lint/correctness/useExhaustiveDependencies: timeFormat invalidates the labels produced by the stable formatMinute
	const constraints = useMemo(
		() => cellConstraints(member, day.key, formatMinute, timeZone),
		[member, day.key, formatMinute, timeZone, timeFormat],
	);
	const isEmptyCell = workerShifts.length === 0 && constraints.length === 0;
	const className = useMemo(
		() => workerCellClass(density, day.isWeekend, day.isToday),
		[density, day.isWeekend, day.isToday],
	);
	const handleAdd = useCallback(
		() => onAddShift(member, day.key),
		[onAddShift, member, day.key],
	);

	return (
		<ScheduleDropCell
			employmentId={member.employmentId}
			date={day.key}
			className={className}
		>
			{constraints.length > 0 ? (
				<div className="mb-1 flex flex-col gap-1">
					{constraints.map((constraint) => (
						<Badge
							key={constraint.key}
							variant="outline"
							className={CONSTRAINT_BADGE_CLASS}
						>
							{constraint.kind === "unavailability" ? (
								<BanIcon data-icon="inline-start" />
							) : (
								<CalendarOffIcon data-icon="inline-start" />
							)}
							<span className="truncate">{constraint.label}</span>
						</Badge>
					))}
				</div>
			) : null}
			<ShiftStack
				shifts={workerShifts}
				store={store}
				onOpen={onOpenShift}
				onToggleSelect={onToggleSelect}
				compact={density === "compact"}
				disabled={disabled}
				timeclockByShiftId={timeclockByShiftId}
			/>
			<Button
				type="button"
				aria-label={`Add shift for ${member.name} on ${day.dayName}`}
				variant={isEmptyCell ? "outline" : "secondary"}
				size={isEmptyCell ? "sm" : "icon-xs"}
				className={isEmptyCell ? ADD_BUTTON_EMPTY : ADD_BUTTON_FILLED}
				disabled={!canAdd}
				onClick={handleAdd}
			>
				<PlusIcon data-icon={isEmptyCell ? "inline-start" : undefined} />
				{isEmptyCell ? (
					<span>Add</span>
				) : (
					<span className="sr-only">
						Add shift for {member.name} on {day.dayName}
					</span>
				)}
			</Button>
		</ScheduleDropCell>
	);
});

const WORKER_HEADER_BASE =
	"sticky left-0 z-10 flex items-center gap-2.5 border-border border-r border-b bg-background px-3 py-2.5";

export const ScheduleWorkerRow = memo(function ScheduleWorkerRow({
	member,
	days,
	shiftsByWorkerDay,
	minutes,
	shiftCount,
	...cellProps
}: {
	member: StaffRow;
	days: readonly ScheduleDayInfo[];
	shiftsByWorkerDay: ReadonlyMap<string, ScheduleShiftDto[]>;
	minutes: number;
	shiftCount: number;
	surface: ScheduleSurfaceFilter;
	density: GridDensity;
	timeFormat: string;
	timeZone: string;
	canAdd: boolean;
	disabled: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
	store: ShiftSelectionStore;
	formatMinute: (minute: number) => string;
	onAddShift: (member: StaffRow, day: string) => void;
} & ScheduleTileHandlers) {
	const hasConstraints =
		(member.unavailability?.length ?? 0) > 0 ||
		(member.timeOff?.length ?? 0) > 0;
	const hoursLabel = (minutes / 60).toFixed(1);

	return (
		<div className="contents">
			<div className={cn(WORKER_HEADER_BASE, CELL_HEIGHT[cellProps.density])}>
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
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
						{shiftCount} shift
						{shiftCount === 1 ? "" : "s"}
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					<span
						className="font-medium text-xs tabular-nums"
						title={`${hoursLabel} scheduled hours`}
					>
						{hoursLabel}h
					</span>
					{hasConstraints ? <ConstraintsIndicator /> : null}
				</div>
			</div>
			{days.map((day) => (
				<ScheduleWorkerDayCell
					key={day.key}
					member={member}
					day={day}
					shifts={shiftsByWorkerDay.get(`${member.employmentId}:${day.key}`)}
					{...cellProps}
				/>
			))}
		</div>
	);
});

const ConstraintsIndicator = memo(function ConstraintsIndicator() {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-flex size-5 items-center justify-center text-muted-foreground">
						<BanIcon className="size-3.5" />
						<span className="sr-only">Has scheduling constraints</span>
					</span>
				}
			/>
			<TooltipContent>Has unavailability or time off</TooltipContent>
		</Tooltip>
	);
});

const OPEN_CELL_CLASS =
	"min-h-20 border-border/70 border-r border-b bg-warning/25 p-1.5 last:border-r-0";

const ScheduleOpenDayCell = memo(function ScheduleOpenDayCell({
	day,
	shifts,
	surface,
	density,
	disabled,
	timeclockByShiftId,
	store,
	onOpenShift,
	onToggleSelect,
}: {
	day: ScheduleDayInfo;
	shifts: readonly ScheduleShiftDto[] | undefined;
	surface: ScheduleSurfaceFilter;
	density: GridDensity;
	disabled: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
	store: ShiftSelectionStore;
} & ScheduleTileHandlers) {
	const visible = useSurfaceShifts(shifts, surface);
	return (
		<ScheduleDropCell
			employmentId={null}
			date={day.key}
			className={OPEN_CELL_CLASS}
		>
			<ShiftStack
				shifts={visible}
				store={store}
				onOpen={onOpenShift}
				onToggleSelect={onToggleSelect}
				compact={density === "compact"}
				disabled={disabled}
				timeclockByShiftId={timeclockByShiftId}
			/>
		</ScheduleDropCell>
	);
});

export const ScheduleOpenRow = memo(function ScheduleOpenRow({
	days,
	openShiftCount,
	shiftsByWorkerDay,
	...cellProps
}: {
	days: readonly ScheduleDayInfo[];
	openShiftCount: number;
	shiftsByWorkerDay: ReadonlyMap<string, ScheduleShiftDto[]>;
	surface: ScheduleSurfaceFilter;
	density: GridDensity;
	disabled: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
	store: ShiftSelectionStore;
} & ScheduleTileHandlers) {
	return (
		<>
			<div className="sticky left-0 z-10 flex min-h-20 items-center gap-2.5 border-border border-r border-b bg-warning px-3 py-3 text-warning-foreground">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background/70">
					<UserRoundXIcon className="size-3.5" aria-hidden="true" />
				</span>
				<div className="flex flex-col gap-0.5">
					<p className="font-medium text-sm leading-tight">
						Open shifts
						{openShiftCount > 0 ? ` · ${openShiftCount}` : ""}
					</p>
					<p className="text-warning-foreground/80 text-xs leading-tight">
						{openShiftCount > 0 ? "Needs a worker" : "Drop here to unassign"}
					</p>
				</div>
			</div>
			{days.map((day) => (
				<ScheduleOpenDayCell
					key={day.key}
					day={day}
					shifts={shiftsByWorkerDay.get(`open:${day.key}`)}
					{...cellProps}
				/>
			))}
		</>
	);
});

const OFF_ROSTER_CELL_BASE =
	"min-h-20 border-border/70 border-r border-b bg-muted/20 p-1.5 last:border-r-0";

const ScheduleOffRosterDayCell = memo(function ScheduleOffRosterDayCell({
	day,
	shifts,
	surface,
	density,
	disabled,
	timeclockByShiftId,
	store,
	onOpenShift,
	onToggleSelect,
}: {
	day: ScheduleDayInfo;
	shifts: readonly ScheduleShiftDto[] | undefined;
	surface: ScheduleSurfaceFilter;
	density: GridDensity;
	disabled: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
	store: ShiftSelectionStore;
} & ScheduleTileHandlers) {
	const visible = useSurfaceShifts(shifts, surface);
	return (
		<div className={cn(OFF_ROSTER_CELL_BASE, day.isWeekend && "bg-muted/30")}>
			<ShiftStack
				shifts={visible}
				store={store}
				onOpen={onOpenShift}
				onToggleSelect={onToggleSelect}
				compact={density === "compact"}
				disabled={disabled}
				showWorker
				timeclockByShiftId={timeclockByShiftId}
			/>
		</div>
	);
});

export const ScheduleOffRosterRow = memo(function ScheduleOffRosterRow({
	days,
	shiftsByDay,
	...cellProps
}: {
	days: readonly ScheduleDayInfo[];
	shiftsByDay: ReadonlyMap<string, ScheduleShiftDto[]>;
	surface: ScheduleSurfaceFilter;
	density: GridDensity;
	disabled: boolean;
	timeclockByShiftId: ReadonlyMap<string, ScheduleTimeclockEntry>;
	store: ShiftSelectionStore;
} & ScheduleTileHandlers) {
	return (
		<>
			<div className="sticky left-0 z-10 flex min-h-20 items-center border-border border-r border-b bg-muted px-3 py-3">
				<div className="flex flex-col gap-0.5">
					<p className="font-medium text-sm leading-tight">Off-roster</p>
					<p className="text-muted-foreground text-xs leading-tight">
						Reassign or remove
					</p>
				</div>
			</div>
			{days.map((day) => (
				<ScheduleOffRosterDayCell
					key={day.key}
					day={day}
					shifts={shiftsByDay.get(day.key)}
					{...cellProps}
				/>
			))}
		</>
	);
});

export const ScheduleStaffCorner = memo(function ScheduleStaffCorner() {
	return (
		<div className="sticky top-0 left-0 z-30 flex items-end border-border border-r border-b bg-muted px-3 py-2">
			<span className="font-medium text-muted-foreground text-xs">Staff</span>
		</div>
	);
});

const DAY_HEADER_BASE =
	"group/day sticky top-0 z-20 flex flex-col items-center gap-0.5 border-border border-r border-b bg-muted px-1.5 py-2 last:border-r-0";
const SALES_BUTTON_BASE =
	"h-4 px-1 font-normal text-muted-foreground text-xs tabular-nums";
const SALES_BUTTON_HIDDEN =
	"opacity-0 transition-opacity focus-visible:opacity-100 [@media(hover:hover)]:group-hover/day:opacity-100 [@media(hover:none)]:opacity-60";
const HOLIDAY_CHIP_CLASS =
	"flex max-w-full items-center gap-0.5 rounded bg-warning/40 px-1 py-0.5 font-medium text-warning-foreground text-xs leading-none";

export const ScheduleDayHeader = memo(function ScheduleDayHeader({
	day,
	minutes,
	salesCents,
	holiday,
	savingSales,
	canSaveSales,
	onPrepareSales,
	onSubmitSales,
}: {
	day: ScheduleDayInfo;
	minutes: number;
	salesCents: number;
	holiday: { id: string; name: string } | undefined;
	savingSales: boolean;
	canSaveSales: boolean;
	onPrepareSales: (day: string) => void;
	onSubmitSales: (day: string, dollars: string) => void;
}) {
	// The sales draft is local so typing re-renders only this header, not the page.
	const [salesDollars, setSalesDollars] = useState("");
	const hoursLabel = minutes > 0 ? `${(minutes / 60).toFixed(1)}h` : null;
	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) return;
			onPrepareSales(day.key);
			setSalesDollars(salesCents > 0 ? String(salesCents / 100) : "");
		},
		[onPrepareSales, day.key, salesCents],
	);
	const handleSubmit = useCallback(
		() => onSubmitSales(day.key, salesDollars),
		[onSubmitSales, day.key, salesDollars],
	);
	const handleChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) =>
			setSalesDollars(event.target.value),
		[],
	);
	const dayLabel = formatDayLabel(day.key);

	return (
		<div className={cn(DAY_HEADER_BASE, day.isToday && "bg-primary/10")}>
			<span
				className={cn(
					"font-medium text-xs leading-none",
					day.isToday ? "text-primary" : "text-muted-foreground",
				)}
			>
				{weekdayShort(day.key)}
			</span>
			<span
				className={cn(
					"flex size-7 items-center justify-center font-semibold text-sm tabular-nums leading-none",
					day.isToday && "rounded-full bg-primary text-primary-foreground",
				)}
			>
				{day.dateNumber}
			</span>
			{hoursLabel ? (
				<span className="text-muted-foreground/80 text-xs tabular-nums leading-none">
					{hoursLabel}
				</span>
			) : null}
			{holiday ? (
				<Tooltip>
					<TooltipTrigger
						render={
							<span className={HOLIDAY_CHIP_CLASS}>
								<StarIcon className="size-2.5 shrink-0" />
								<span className="truncate">{holiday.name}</span>
							</span>
						}
					/>
					<TooltipContent>Holiday · {holiday.name}</TooltipContent>
				</Tooltip>
			) : null}
			<Popover onOpenChange={handleOpenChange}>
				<PopoverTrigger
					render={
						<Button
							variant="ghost"
							size="xs"
							aria-label={`Sales for ${dayLabel}`}
							className={cn(
								SALES_BUTTON_BASE,
								salesCents > 0 ? undefined : SALES_BUTTON_HIDDEN,
							)}
						/>
					}
				>
					{salesCents > 0 ? formatCents(salesCents) : "Sales"}
				</PopoverTrigger>
				<PopoverContent align="center" className="w-64" sideOffset={6}>
					<PopoverHeader>
						<PopoverTitle>Sales · {dayLabel}</PopoverTitle>
						<PopoverDescription>
							Used for labor percent on this day.
						</PopoverDescription>
					</PopoverHeader>
					<FieldGroup className="gap-3">
						<Field>
							<FieldLabel htmlFor={`day-sales-${day.key}`}>Amount</FieldLabel>
							<InputGroup>
								<InputGroupAddon align="inline-start">$</InputGroupAddon>
								<InputGroupInput
									id={`day-sales-${day.key}`}
									inputMode="decimal"
									placeholder="0"
									value={salesDollars}
									onChange={handleChange}
								/>
							</InputGroup>
						</Field>
						<Button
							size="sm"
							disabled={savingSales || !canSaveSales}
							onClick={handleSubmit}
						>
							{savingSales ? <Spinner data-icon="inline-start" /> : null}
							Save sales
						</Button>
					</FieldGroup>
				</PopoverContent>
			</Popover>
		</div>
	);
});
