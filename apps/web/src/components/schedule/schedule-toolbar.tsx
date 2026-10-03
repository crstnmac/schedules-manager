import { Button } from "@SchedulesManager/ui/components/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@SchedulesManager/ui/components/select";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MapPinIcon,
	PlusIcon,
	UsersIcon,
} from "lucide-react";
import {
	type Dispatch,
	memo,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { DatePicker } from "@/components/date-picker";
import { PublicationBadge } from "@/components/schedule/publication-badge";
import { ScheduleActionsMenu } from "@/components/schedule/schedule-actions-menu";
import { SchedulePublishControl } from "@/components/schedule/schedule-publish-control";
import { defaultAddDate } from "@/components/schedule/shift-form";
import type {
	ScheduleResponse,
	useLocations,
	useScheduleTeams,
} from "@/lib/queries";
import {
	addCalendarMonths,
	addDays,
	formatMonthLabel,
	monthStartForView,
	monthStartOf,
	weekStartOf,
} from "@/lib/schedule-calendar";
import { workplaceTodayKey } from "@/lib/time";

/** Sentinel for the Location's primary (team-less) schedule in the team Select. */
const PRIMARY_TEAM = "__primary_team__";

export type ScheduleViewMode = "week" | "day" | "month";

const VIEW_ITEMS = [
	{ label: "Week", value: "week" },
	{ label: "Day", value: "day" },
	{ label: "Month", value: "month" },
];

const TRIGGER_CLASS =
	"min-w-0 max-w-36 border-transparent bg-transparent font-medium shadow-none [@media(hover:hover)]:hover:bg-muted";

function formatWeekLabel(weekStart: string): string {
	const start = new Date(`${weekStart}T12:00:00`);
	const end = new Date(`${addDays(weekStart, 6)}T12:00:00`);
	const fmt = (d: Date) =>
		d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	return `${fmt(start)} – ${fmt(end)}`;
}

type LocationRows = NonNullable<ReturnType<typeof useLocations>["data"]>;
type TeamRows = NonNullable<ReturnType<typeof useScheduleTeams>["data"]>;

/**
 * Location / team / week navigation, view switch, actions menu, Publish and
 * Add. It portals into the dashboard header and keeps its own header-target
 * state so the page does not rerender to mount it. Every prop is a primitive,
 * a stable query result, or a stable callback.
 */
export const ScheduleToolbar = memo(function ScheduleToolbar({
	locations,
	teams,
	locationId,
	teamId,
	weekStart,
	weekStartDay,
	monthAnchor,
	selectedDay,
	days,
	viewMode,
	scheduleTimeZone,
	publication,
	scheduleId,
	shiftCount,
	openShiftCount,
	conflictCount,
	canManage,
	canPublish,
	canAdd,
	setLocationId,
	setTeamId,
	setWeekStart,
	setMonthAnchor,
	setSelectedDay,
	setViewMode,
	setTodayFocus,
	onResetEditor,
	onAddShift,
}: {
	locations: LocationRows | undefined;
	teams: TeamRows | undefined;
	locationId: string | undefined;
	teamId: string | null;
	weekStart: string;
	weekStartDay: number;
	monthAnchor: string;
	selectedDay: string;
	days: string[];
	viewMode: ScheduleViewMode;
	scheduleTimeZone: string;
	publication: ScheduleResponse["publication"] | undefined;
	scheduleId: string | undefined;
	shiftCount: number | undefined;
	openShiftCount: number;
	conflictCount: number;
	canManage: boolean;
	canPublish: boolean;
	canAdd: boolean;
	setLocationId: Dispatch<SetStateAction<string | undefined>>;
	setTeamId: Dispatch<SetStateAction<string | null>>;
	setWeekStart: Dispatch<SetStateAction<string>>;
	setMonthAnchor: Dispatch<SetStateAction<string>>;
	setSelectedDay: Dispatch<SetStateAction<string>>;
	setViewMode: Dispatch<SetStateAction<ScheduleViewMode>>;
	setTodayFocus: Dispatch<SetStateAction<boolean>>;
	onResetEditor: () => void;
	onAddShift: (date: string) => void;
}) {
	const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
	useEffect(() => {
		setHeaderTarget(document.getElementById("schedule-header-controls"));
	}, []);

	const locationItems = useMemo(
		() =>
			(locations ?? []).map((location) => ({
				label: location.name,
				value: location.id,
			})),
		[locations],
	);
	const teamItems = useMemo(
		() => [
			{ label: "Primary", value: PRIMARY_TEAM },
			...(teams ?? []).map((team) => ({ label: team.name, value: team.id })),
		],
		[teams],
	);

	const handleLocationChange = useCallback(
		(value: string | null) => {
			if (!value) return;
			setLocationId(value);
			setTeamId(null);
			onResetEditor();
		},
		[setLocationId, setTeamId, onResetEditor],
	);
	const handleTeamChange = useCallback(
		(value: string | null) => {
			setTeamId(value && value !== PRIMARY_TEAM ? value : null);
			onResetEditor();
		},
		[setTeamId, onResetEditor],
	);
	const handlePrevious = useCallback(() => {
		if (viewMode === "month") {
			setMonthAnchor((current) => addCalendarMonths(current, -1));
		} else {
			setWeekStart((current) => addDays(current, -7));
		}
		onResetEditor();
	}, [viewMode, setMonthAnchor, setWeekStart, onResetEditor]);
	const handleNext = useCallback(() => {
		if (viewMode === "month") {
			setMonthAnchor((current) => addCalendarMonths(current, 1));
		} else {
			setWeekStart((current) => addDays(current, 7));
		}
		onResetEditor();
	}, [viewMode, setMonthAnchor, setWeekStart, onResetEditor]);
	const handleDatePick = useCallback(
		(date: string) => {
			setWeekStart(weekStartOf(new Date(`${date}T12:00:00`), weekStartDay));
			setMonthAnchor(monthStartOf(date));
			setSelectedDay(date);
			onResetEditor();
		},
		[setWeekStart, setMonthAnchor, setSelectedDay, weekStartDay, onResetEditor],
	);
	const handleToday = useCallback(() => {
		const todayKey = workplaceTodayKey(scheduleTimeZone);
		setWeekStart(weekStartOf(new Date(`${todayKey}T12:00:00`), weekStartDay));
		setMonthAnchor(monthStartOf(todayKey));
		setSelectedDay(todayKey);
		setViewMode((current) => (current === "month" ? "week" : current));
		setTodayFocus(false);
		onResetEditor();
	}, [
		scheduleTimeZone,
		weekStartDay,
		setWeekStart,
		setMonthAnchor,
		setSelectedDay,
		setViewMode,
		setTodayFocus,
		onResetEditor,
	]);
	const handleViewChange = useCallback(
		(value: string | null) => {
			if (value === "week" || value === "day" || value === "month") {
				setViewMode(value);
				setTodayFocus(value === "day");
				if (value === "month") {
					setMonthAnchor(monthStartForView(weekStart));
				}
				if (value === "day" && !days.includes(selectedDay)) {
					setSelectedDay(weekStart);
				}
			}
		},
		[
			setViewMode,
			setTodayFocus,
			setMonthAnchor,
			setSelectedDay,
			weekStart,
			days,
			selectedDay,
		],
	);
	const handleAdd = useCallback(
		() => onAddShift(defaultAddDate(weekStart, scheduleTimeZone)),
		[onAddShift, weekStart, scheduleTimeZone],
	);

	if (!headerTarget) return null;

	return createPortal(
		<div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2">
			<div className="flex min-w-0 flex-wrap items-center gap-1">
				<Select
					items={locationItems}
					value={locationId ?? null}
					onValueChange={handleLocationChange}
				>
					<SelectTrigger
						aria-label="Location"
						size="sm"
						className={TRIGGER_CLASS}
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
				{(teams ?? []).length > 0 ? (
					<Select
						items={teamItems}
						value={teamId ?? PRIMARY_TEAM}
						onValueChange={handleTeamChange}
					>
						<SelectTrigger
							aria-label="Schedule team"
							size="sm"
							className={TRIGGER_CLASS}
						>
							<UsersIcon />
							<SelectValue placeholder="Primary" />
						</SelectTrigger>
						<SelectContent alignItemWithTrigger={false}>
							<SelectGroup>
								{teamItems.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				) : null}
				<div className="flex shrink-0 items-center">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={
							viewMode === "month" ? "Previous month" : "Previous week"
						}
						onClick={handlePrevious}
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
						buttonClassName="h-8 w-auto min-w-0 border-transparent bg-transparent px-1.5 font-medium tabular-nums shadow-none [@media(hover:hover)]:hover:bg-muted"
						onValueChange={handleDatePick}
					/>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={viewMode === "month" ? "Next month" : "Next week"}
						onClick={handleNext}
					>
						<ChevronRightIcon />
					</Button>
					<Button variant="ghost" size="sm" onClick={handleToday}>
						Today
					</Button>
				</div>
			</div>

			<div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
				{publication ? <PublicationBadge publication={publication} /> : null}
				<Select
					items={VIEW_ITEMS}
					value={viewMode}
					onValueChange={handleViewChange}
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
				<ScheduleActionsMenu
					locationId={locationId}
					weekStart={weekStart}
					teamId={teamId}
					canManage={canManage}
					shiftCount={shiftCount}
					openShiftCount={openShiftCount}
				/>
				<SchedulePublishControl
					scheduleId={scheduleId}
					canPublish={canPublish}
					latestVersionNumber={publication?.latestVersionNumber}
					hasUnpublishedChanges={publication?.hasUnpublishedChanges}
					conflictCount={conflictCount}
					locationId={locationId}
					weekStart={weekStart}
					teamId={teamId}
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={!canAdd}
					onClick={handleAdd}
				>
					<PlusIcon data-icon="inline-start" />
					Add
				</Button>
			</div>
		</div>,
		headerTarget,
	);
});
