import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
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
import { Skeleton } from "@SchedulesManager/ui/components/skeleton";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangleIcon, MapPinIcon, TagsIcon } from "lucide-react";
import {
	type CSSProperties,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/confirm-action";
import { createDataColumnHelper, DataTable } from "@/components/data-table";
import {
	ScheduleMobileBoard,
	ScheduleMobileBoardSkeleton,
} from "@/components/schedule/mobile-board";
import {
	DEFAULT_SCHEDULE_FILTERS,
	type GridDensity,
	ScheduleFilterBar,
	type ScheduleFilters,
} from "@/components/schedule/schedule-filter-bar";
import {
	ScheduleDayHeader,
	type ScheduleDayInfo,
	ScheduleOffRosterRow,
	ScheduleOpenRow,
	ScheduleStaffCorner,
	type ScheduleSurfaceFilter,
	ScheduleWorkerRow,
	shiftMatchesSurface,
} from "@/components/schedule/schedule-grid";
import {
	ScheduleToolbar,
	type ScheduleViewMode,
} from "@/components/schedule/schedule-toolbar";
import { ScheduleSelectionBars } from "@/components/schedule/selection-bars";
import { createShiftSelectionStore } from "@/components/schedule/selection-store";
import {
	ShiftEditorDialog,
	type ShiftEditorHandle,
	type ShiftMoveRequest,
} from "@/components/schedule/shift-editor-dialog";
import { workerNeedsPositionApproval } from "@/components/schedule/shift-form";
import { useInvalidateSchedule } from "@/components/schedule/use-schedule-invalidate";
import { useStableCallback } from "@/components/schedule/use-stable-callback";
import { ScheduleMonthGrid } from "@/components/schedule-month-grid";
import { api } from "@/lib/api";
import { hasCapability } from "@/lib/privileges";
import type {
	AcceptancesResponse,
	ScheduleResponse,
	ScheduleShiftDto,
	ScheduleTimeclockEntry,
} from "@/lib/queries";
import {
	useAcceptances,
	useHolidays,
	useLocations,
	useMySchedule,
	useRespondToAcceptance,
	useSchedule,
	useScheduleCalendar,
	useScheduleLabor,
	useScheduleTeams,
	useScheduleTimeclock,
	useTimeBlocks,
	useWorkplaceSettings,
} from "@/lib/queries";
import { addDays, monthStartOf, weekStartOf } from "@/lib/schedule-calendar";
import { formatDay, WEEKDAY_NAMES, workplaceTodayKey } from "@/lib/time";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard/schedule")({
	component: SchedulePage,
});

type StaffRow = ScheduleResponse["staff"][number];
type HoursRow = ScheduleResponse["hours"][number];
type AcceptanceRow = AcceptancesResponse["acceptances"][number];
type PublicationRow = ScheduleResponse["publication"]["versions"][number];

const staffHelper = createDataColumnHelper<StaffRow>();
const hoursHelper = createDataColumnHelper<HoursRow>();
const acceptanceHelper = createDataColumnHelper<AcceptanceRow>();
const publicationHelper = createDataColumnHelper<PublicationRow>();

function staffConstraintText(
	member: StaffRow,
	formatMinute: (minute: number) => string,
): string {
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
						`${request.status} time off ${formatDay(request.startsAt)}–${formatDay(request.endsAt)}`,
				)
				.join(" · "),
		);
	}
	return parts.join(" · ");
}

function createScheduleStaffColumns(formatMinute: (minute: number) => string) {
	return staffHelper.columns([
		staffHelper.accessor("name", {
			header: "Worker",
			cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
		}),
		staffHelper.accessor((row) => staffConstraintText(row, formatMinute), {
			id: "details",
			header: "Constraints",
		}),
	]);
}
const hoursColumns = hoursHelper.columns([
	hoursHelper.accessor("name", {
		header: "Worker",
		cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
	}),
	hoursHelper.accessor((row) => `${(row.minutes / 60).toFixed(1)}h`, {
		id: "total",
		header: "Total",
		cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
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
function createScheduleAcceptanceColumns(
	respond: ReturnType<typeof useRespondToAcceptance>,
	myAcceptanceIds: Set<string>,
	queryClient: ReturnType<typeof useQueryClient>,
) {
	return acceptanceHelper.columns([
		acceptanceHelper.accessor(
			(row) => `${row.workerName} · v${row.versionNumber}`,
			{
				id: "worker",
				header: "Worker",
				cell: ({ getValue }) => (
					<span className="font-medium">{getValue()}</span>
				),
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
		acceptanceHelper.display({
			id: "actions",
			header: "Actions",
			enableSorting: false,
			cell: ({ row }) => {
				if (!myAcceptanceIds.has(row.original.id)) return null;
				return (
					<div className="flex flex-wrap items-center justify-end gap-2">
						<Button
							size="sm"
							disabled={respond.isPending}
							onClick={() =>
								respond.mutate(
									{ acceptanceId: row.original.id, decision: "accept" },
									{
										onSuccess: () => {
											queryClient.invalidateQueries({
												queryKey: ["acceptances"],
											});
											toast.success("Shift accepted.");
										},
										onError: (error) => toast.error((error as Error).message),
									},
								)
							}
						>
							{respond.isPending ? <Spinner data-icon="inline-start" /> : null}
							Accept shift
						</Button>
						<ConfirmAction
							trigger="Decline"
							disabled={respond.isPending}
							title="Decline this shift change?"
							description="Your response is recorded and visible to workplace managers."
							confirmLabel="Decline shift"
							destructive
							onConfirm={() =>
								respond.mutate(
									{ acceptanceId: row.original.id, decision: "decline" },
									{
										onSuccess: () =>
											queryClient.invalidateQueries({
												queryKey: ["acceptances"],
											}),
										onError: (error) => toast.error((error as Error).message),
									},
								)
							}
						/>
					</div>
				);
			},
		}),
	]);
}
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
						title={`${worker.name} · ${worker.status} · push ${worker.push.status}${worker.push.error ? `: ${worker.push.error}` : ""}`}
						variant={worker.status === "acknowledged" ? "default" : "secondary"}
						className="rounded-md text-xs"
					>
						{worker.name} ·{" "}
						{worker.status === "acknowledged"
							? "Seen"
							: (
									{
										provider_accepted: "Push accepted",
										receipt_pending: "Push pending",
										failed: "Push failed",
										no_device: "No push device",
										queued: "Queued",
										not_queued: "No push queued",
									} as Record<string, string>
								)[worker.push.status]}
					</Badge>
				))}
			</div>
		),
	}),
]);

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

function ScheduleGridSkeleton() {
	return (
		<div
			className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
			role="status"
		>
			<span className="sr-only">Loading</span>
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

function SchedulePage() {
	const { workplace, kind, privileges, capabilities } = useWorkplace();
	const subject = kind ? { kind, privileges: privileges ?? null } : null;
	const canManage = hasCapability(subject, "schedule.manage");
	const canPublish = hasCapability(subject, "schedule.publish");
	const { formatMinute, timeFormat } = useDisplayPrefs();
	const stableFormatMinute = useStableCallback(formatMinute);
	const scheduleStaffColumns = useMemo(
		() => createScheduleStaffColumns(formatMinute),
		[formatMinute],
	);
	const settings = useWorkplaceSettings(workplace?.id);
	const weekStartDay = settings.data?.weekStartDay ?? 1;
	const [weekStart, setWeekStart] = useState(() =>
		weekStartOf(new Date(`${workplaceTodayKey()}T12:00:00`), 1),
	);

	useEffect(() => {
		setWeekStart((current) =>
			weekStartOf(new Date(`${current}T12:00:00`), weekStartDay),
		);
	}, [weekStartDay]);
	const [visibleStaffCount, setVisibleStaffCount] = useState(40);
	const [filters, setFilters] = useState(DEFAULT_SCHEDULE_FILTERS);
	const {
		workerQuery,
		positionFilter,
		staffStateFilter,
		groupFilter,
		tagFilter,
		timeBlockFilter,
	} = filters;
	const [todayFocus, setTodayFocus] = useState(false);
	const [viewMode, setViewMode] = useState<ScheduleViewMode>("week");
	const [monthAnchor, setMonthAnchor] = useState(() =>
		monthStartOf(workplaceTodayKey()),
	);
	const [selectedDay, setSelectedDay] = useState(() => workplaceTodayKey());
	const [selectionStore] = useState(createShiftSelectionStore);
	const [gridDensity, setGridDensity] = useState<GridDensity>("comfortable");
	const locations = useLocations(workplace?.id);
	const [locationId, setLocationId] = useState<string | undefined>(undefined);
	const [teamId, setTeamId] = useState<string | null>(null);
	const editorRef = useRef<ShiftEditorHandle>(null);

	const activeLocationId = locationId ?? locations.data?.[0]?.id;
	const teams = useScheduleTeams(activeLocationId);
	const activeTeamId =
		teamId && (teams.data ?? []).some((team) => team.id === teamId)
			? teamId
			: null;
	const schedule = useSchedule(activeLocationId, weekStart, activeTeamId);
	const calendar = useScheduleCalendar(
		activeLocationId,
		monthAnchor,
		viewMode === "month",
		activeTeamId,
	);
	const timeBlocks = useTimeBlocks(activeLocationId);
	const holidays = useHolidays(workplace?.id, {
		from: weekStart,
		to: addDays(weekStart, 6),
		locationId: activeLocationId,
	});
	const holidayByDate = useMemo(() => {
		const map = new Map<string, { id: string; name: string }>();
		for (const holiday of holidays.data?.holidays ?? []) {
			map.set(holiday.date, { id: holiday.id, name: holiday.name });
		}
		return map;
	}, [holidays.data?.holidays]);
	const acceptances = useAcceptances(schedule.data?.schedule.id);
	const queryClient = useQueryClient();
	const mySchedule = useMySchedule(workplace?.id);
	const respondToAcceptance = useRespondToAcceptance();
	const pendingAcceptances = mySchedule.data?.pendingAcceptances;
	const myAcceptanceIds = useMemo(
		() =>
			new Set((pendingAcceptances ?? []).map((acceptance) => acceptance.id)),
		[pendingAcceptances],
	);
	const scheduleAcceptanceColumns = useMemo(
		() =>
			createScheduleAcceptanceColumns(
				respondToAcceptance,
				myAcceptanceIds,
				queryClient,
			),
		[respondToAcceptance, myAcceptanceIds, queryClient],
	);
	const invalidate = useInvalidateSchedule(
		activeLocationId,
		weekStart,
		activeTeamId,
	);

	const moveShift = useMutation({
		mutationFn: async ({
			shift,
			employmentId,
			date,
			approvePosition,
		}: ShiftMoveRequest) => {
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
		onSuccess: async (result, variables) => {
			editorRef.current?.closeApproval();
			await invalidate();
			if (result.approvePosition) {
				await queryClient.invalidateQueries({
					queryKey: ["workplaces", workplace?.id, "workers"],
				});
			}
			toast.success("Shift moved.", {
				action: {
					label: "Undo",
					onClick: () =>
						moveShift.mutate({
							shift: variables.shift,
							employmentId: variables.shift.employmentId,
							date: variables.shift.date,
						}),
				},
			});
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const saveSales = useMutation({
		mutationFn: ({ day, amountCents }: { day: string; amountCents: number }) =>
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

	const retryPublicationPush = useMutation({
		mutationFn: async (versionId: string) => {
			const scheduleId = schedule.data?.schedule.id;
			if (!scheduleId) throw new Error("No schedule loaded");
			return api<{ requeued: number }>(
				`/v1/schedules/${scheduleId}/publications/${versionId}/retry-push`,
				{ method: "POST" },
			);
		},
		onSuccess: async ({ requeued }) => {
			await invalidate();
			toast.success(
				requeued
					? `${requeued} push notification(s) queued for retry.`
					: "No failed push notifications need retrying.",
			);
		},
		onError: (error) => toast.error((error as Error).message),
	});

	const data = schedule.data;
	const canAddShift = Boolean(data && data.positions.length > 0);
	const scheduleTimeZone = data?.schedule.timezone ?? "America/Chicago";
	const publicationState = data?.publication;
	const previousShiftGroups = useRef(new Map<string, ScheduleShiftDto[]>());
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
		// Reuse the previous array for any cell whose shifts are unchanged so
		// memoized cells keep a stable `shifts` prop across refetches.
		for (const [key, shifts] of shiftsByWorkerDay) {
			const previous = previousShiftGroups.current.get(key);
			if (
				previous &&
				previous.length === shifts.length &&
				previous.every((shift, index) => shift === shifts[index])
			) {
				shiftsByWorkerDay.set(key, previous);
			}
		}
		previousShiftGroups.current = shiftsByWorkerDay;
		return {
			shiftsByWorkerDay,
			hoursByEmploymentId,
			shiftCountByEmploymentId,
		};
	}, [data?.hours, data?.shifts]);
	const summaryShifts =
		viewMode === "month" ? (calendar.data?.shifts ?? []) : (data?.shifts ?? []);
	const conflictCount = summaryShifts.reduce(
		(sum, shift) => sum + shift.conflicts.length,
		0,
	);
	const timeclockQuery = useScheduleTimeclock(
		activeLocationId,
		weekStart,
		activeTeamId,
		capabilities.operations,
	);
	const laborQuery = useScheduleLabor(
		activeLocationId,
		weekStart,
		activeTeamId,
	);
	const timeclockByShiftId = useMemo(() => {
		const map = new Map<string, ScheduleTimeclockEntry>();
		for (const entry of timeclockQuery.data ?? []) {
			map.set(entry.shiftId, entry);
		}
		for (const entry of calendar.data?.timeclock ?? []) {
			if (!map.has(entry.shiftId)) map.set(entry.shiftId, entry);
		}
		return map;
	}, [calendar.data?.timeclock, timeclockQuery.data]);

	const onClockCount = (
		viewMode === "month"
			? (calendar.data?.timeclock ?? [])
			: (timeclockQuery.data ?? [])
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
		for (const row of laborQuery.data?.byDate ?? []) {
			map.set(row.date, row.amountCents);
		}
		return map;
	}, [laborQuery.data?.byDate]);

	const prepareDaySales = useStableCallback((day: string) => {
		setSelectedDay(day);
	});

	const submitDaySales = useStableCallback((day: string, input: string) => {
		const dollars = Number(input);
		if (!Number.isFinite(dollars) || dollars < 0) {
			toast.error("Enter daily sales as a dollar amount");
			return;
		}
		saveSales.mutate({ day, amountCents: Math.round(dollars * 100) });
	});
	const deferredWorkerQuery = useDeferredValue(workerQuery);
	const filteredStaff = useMemo(() => {
		const query = deferredWorkerQuery.trim().toLocaleLowerCase();
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
			if (groupFilter !== "all" && !member.groupIds.includes(groupFilter))
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
		deferredWorkerQuery,
	]);
	const visibleStaff = useMemo(
		() => filteredStaff.slice(0, visibleStaffCount),
		[filteredStaff, visibleStaffCount],
	);
	const handleFilterChange = useCallback(
		(key: keyof ScheduleFilters, value: string) => {
			setFilters((current) => ({ ...current, [key]: value }));
			if (key !== "tagFilter" && key !== "timeBlockFilter") {
				setVisibleStaffCount(40);
			}
		},
		[],
	);
	const clearStaffFilters = useCallback(() => {
		setFilters(DEFAULT_SCHEDULE_FILTERS);
		setVisibleStaffCount(40);
	}, []);

	const timeBlockRows = timeBlocks.data?.timeBlocks;
	const surfaceFilter = useMemo<ScheduleSurfaceFilter>(() => {
		const part =
			timeBlockFilter === "all"
				? undefined
				: (timeBlockRows ?? []).find((row) => row.id === timeBlockFilter);
		return {
			tagFilter,
			timePart: part
				? { startMinute: part.startMinute, endMinute: part.endMinute }
				: null,
		};
	}, [tagFilter, timeBlockFilter, timeBlockRows]);
	const shiftMatchesSurfaceFilters = useCallback(
		(shift: ScheduleShiftDto) => shiftMatchesSurface(shift, surfaceFilter),
		[surfaceFilter],
	);

	function shiftMatchesCalendarFilters(shift: ScheduleShiftDto) {
		if (!shiftMatchesSurfaceFilters(shift)) return false;
		if (positionFilter !== "all" && shift.positionId !== positionFilter) {
			return false;
		}
		const query = workerQuery.trim().toLowerCase();
		if (query) {
			const haystack =
				`${shift.workerName ?? "open"} ${shift.positionName}`.toLowerCase();
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

	const days = useMemo(
		() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
		[weekStart],
	);
	const todayKey = workplaceTodayKey(scheduleTimeZone);
	const visibleDays = useMemo(
		() =>
			viewMode === "day"
				? days.includes(selectedDay)
					? [selectedDay]
					: [weekStart]
				: todayFocus && days.includes(todayKey)
					? days.filter((day) => day === todayKey)
					: days,
		[viewMode, days, selectedDay, weekStart, todayFocus, todayKey],
	);
	const visibleDayInfos = useMemo<ScheduleDayInfo[]>(
		() =>
			visibleDays.map((day) => {
				const date = new Date(`${day}T12:00:00`);
				return {
					key: day,
					isToday: day === todayKey,
					isWeekend: days.indexOf(day) >= 5,
					dayName: date.toLocaleDateString(undefined, { weekday: "long" }),
					dateNumber: date.getDate(),
				};
			}),
		[visibleDays, days, todayKey],
	);
	const gridColumnsStyle = useMemo(
		() =>
			({
				"--schedule-grid-columns":
					gridDensity === "compact"
						? `200px repeat(${visibleDays.length}, minmax(118px, 1fr))`
						: `220px repeat(${visibleDays.length}, minmax(132px, 1fr))`,
				"--schedule-grid-min-width":
					visibleDays.length === 1
						? "auto"
						: gridDensity === "compact"
							? "1032px"
							: "1144px",
			}) as CSSProperties,
		[gridDensity, visibleDays.length],
	);

	// The editor dialog owns its open/draft state; everything else reaches it
	// through these stable, identity-preserving callbacks.
	const openEdit = useCallback(
		(shift: ScheduleShiftDto) => editorRef.current?.openEdit(shift),
		[],
	);
	const openCreate = useCallback(
		(date: string) => editorRef.current?.openCreate(date),
		[],
	);
	const openAddShift = useCallback(
		(member: ScheduleResponse["staff"][number], day: string) =>
			editorRef.current?.openAdd(member, day),
		[],
	);
	const resetEditor = useCallback(() => editorRef.current?.reset(), []);
	const toggleSelect = useCallback(
		(shift: ScheduleShiftDto) => selectionStore.toggle(shift.id),
		[selectionStore],
	);
	const confirmMove = useStableCallback((request: ShiftMoveRequest) =>
		moveShift.mutate(request),
	);

	const handleSelectDay = useCallback(
		(day: string) => {
			setWeekStart(weekStartOf(new Date(`${day}T12:00:00`), weekStartDay));
			setSelectedDay(day);
			setMonthAnchor(monthStartOf(day));
			setViewMode("day");
			setTodayFocus(false);
			editorRef.current?.reset();
		},
		[weekStartDay],
	);
	const handleOpenMonthShift = useCallback(
		(shift: ScheduleShiftDto) => {
			setWeekStart(
				weekStartOf(new Date(`${shift.date}T12:00:00`), weekStartDay),
			);
			setSelectedDay(shift.date);
			editorRef.current?.openEdit(shift);
		},
		[weekStartDay],
	);

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
			editorRef.current?.requestMoveApproval({
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
		(data?.publication.versions.length ?? 0) > 0;
	const showScheduleDetails: boolean = false;
	return (
		<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
			<h1 className="sr-only">Schedule</h1>
			<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-none">
				<ScheduleToolbar
					locations={locations.data}
					teams={teams.data}
					locationId={activeLocationId}
					teamId={activeTeamId}
					weekStart={weekStart}
					weekStartDay={weekStartDay}
					monthAnchor={monthAnchor}
					selectedDay={selectedDay}
					days={days}
					viewMode={viewMode}
					scheduleTimeZone={scheduleTimeZone}
					publication={publicationState}
					scheduleId={data?.schedule.id}
					shiftCount={data?.shifts.length}
					openShiftCount={openShiftCount}
					conflictCount={conflictCount}
					canManage={canManage}
					canPublish={canPublish}
					canAdd={canManage && canAddShift}
					setLocationId={setLocationId}
					setTeamId={setTeamId}
					setWeekStart={setWeekStart}
					setMonthAnchor={setMonthAnchor}
					setSelectedDay={setSelectedDay}
					setViewMode={setViewMode}
					setTodayFocus={setTodayFocus}
					onResetEditor={resetEditor}
					onAddShift={openCreate}
				/>
				<ScheduleFilterBar
					hasData={data !== undefined}
					hasStaff={(data?.staff.length ?? 0) > 0}
					positions={data?.positions}
					locationId={activeLocationId}
					filters={filters}
					onFilterChange={handleFilterChange}
					onClearFilters={clearStaffFilters}
					density={gridDensity}
					onDensityChange={setGridDensity}
					showDensity={viewMode !== "month"}
					openShiftCount={openShiftCount}
					conflictCount={conflictCount}
					onClockCount={onClockCount}
				/>

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

					<ShiftEditorDialog
						ref={editorRef}
						data={data}
						locationId={activeLocationId}
						weekStart={weekStart}
						teamId={activeTeamId}
						days={days}
						canManage={canManage}
						timeclockByShiftId={timeclockByShiftId}
						movePending={moveShift.isPending}
						onConfirmMove={confirmMove}
					/>

					<ScheduleSelectionBars
						store={selectionStore}
						shifts={data?.shifts}
						staff={data?.staff}
						hasData={data !== undefined}
						scheduleId={data?.schedule.id}
						locationId={activeLocationId}
						weekStart={weekStart}
						teamId={activeTeamId}
						days={days}
						showPaste={viewMode !== "month"}
						canManage={canManage}
						canPublish={canPublish}
					/>

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
								onSelectDay={handleSelectDay}
								onOpenShift={handleOpenMonthShift}
							/>
						</div>
					) : null}

					{viewMode !== "month" && schedule.isPending && !data ? (
						<div className="flex min-h-0 flex-1 flex-col max-md:hidden">
							<ScheduleGridSkeleton />
						</div>
					) : null}

					{viewMode !== "month" && schedule.isPending && !data ? (
						<ScheduleMobileBoardSkeleton />
					) : null}

					{viewMode !== "month" && data ? (
						<DragDropProvider onDragEnd={handleShiftDragEnd}>
							<div className="relative hidden min-h-0 flex-1 flex-col overflow-hidden bg-background md:flex">
								<div className="schedule-grid-scroll min-h-0 min-w-0 flex-1 overflow-auto overscroll-none">
									<div
										className="grid min-w-(--schedule-grid-min-width) grid-cols-(--schedule-grid-columns)"
										style={gridColumnsStyle}
									>
										<ScheduleStaffCorner />
										{visibleDayInfos.map((day) => (
											<ScheduleDayHeader
												key={day.key}
												day={day}
												minutes={daySummaries.get(day.key)?.minutes ?? 0}
												salesCents={salesByDate.get(day.key) ?? 0}
												holiday={holidayByDate.get(day.key)}
												savingSales={saveSales.isPending}
												canSaveSales={Boolean(activeLocationId)}
												onPrepareSales={prepareDaySales}
												onSubmitSales={submitDaySales}
											/>
										))}

										{visibleStaff.map((member) => (
											<ScheduleWorkerRow
												key={member.employmentId}
												member={member}
												days={visibleDayInfos}
												shiftsByWorkerDay={scheduleIndex.shiftsByWorkerDay}
												minutes={
													scheduleIndex.hoursByEmploymentId.get(
														member.employmentId,
													) ?? 0
												}
												shiftCount={
													scheduleIndex.shiftCountByEmploymentId.get(
														member.employmentId,
													) ?? 0
												}
												surface={surfaceFilter}
												density={gridDensity}
												timeFormat={timeFormat}
												timeZone={scheduleTimeZone}
												canAdd={canAddShift}
												disabled={moveShift.isPending}
												timeclockByShiftId={timeclockByShiftId}
												store={selectionStore}
												formatMinute={stableFormatMinute}
												onOpenShift={openEdit}
												onToggleSelect={toggleSelect}
												onAddShift={openAddShift}
											/>
										))}
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
											<ScheduleOpenRow
												days={visibleDayInfos}
												openShiftCount={openShiftCount}
												shiftsByWorkerDay={scheduleIndex.shiftsByWorkerDay}
												surface={surfaceFilter}
												density={gridDensity}
												disabled={moveShift.isPending}
												timeclockByShiftId={timeclockByShiftId}
												store={selectionStore}
												onOpenShift={openEdit}
												onToggleSelect={toggleSelect}
											/>
										) : null}

										{offRosterShifts.length > 0 ? (
											<ScheduleOffRosterRow
												days={visibleDayInfos}
												shiftsByDay={offRosterShiftsByDay}
												surface={surfaceFilter}
												density={gridDensity}
												disabled={moveShift.isPending}
												timeclockByShiftId={timeclockByShiftId}
												store={selectionStore}
												onOpenShift={openEdit}
												onToggleSelect={toggleSelect}
											/>
										) : null}
									</div>
								</div>
							</div>
						</DragDropProvider>
					) : null}

					{viewMode !== "month" && data ? (
						<ScheduleMobileBoard
							className="md:hidden"
							days={days}
							todayKey={todayKey}
							staff={visibleStaff}
							shiftsByWorkerDay={scheduleIndex.shiftsByWorkerDay}
							offRosterShiftsByDay={offRosterShiftsByDay}
							daySummaries={daySummaries}
							holidayByDate={holidayByDate}
							filterShift={shiftMatchesSurfaceFilters}
							timeclockByShiftId={timeclockByShiftId}
							canManage={canManage}
							shiftsPending={moveShift.isPending}
							onOpenShift={openEdit}
							onCreateShift={openCreate}
						/>
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

								{(data?.publication.versions.length ?? 0) > 0 ? (
									<section aria-labelledby="schedule-publication-heading">
										<h3
											id="schedule-publication-heading"
											className="mb-1 font-semibold text-sm"
										>
											Publication history
										</h3>
										<p className="mb-3 text-muted-foreground text-xs">
											Push accepted means the device provider accepted it, not
											that a phone displayed it. Seen means the worker opened
											the schedule; shift acceptance is separate.
										</p>
										{data?.publication.versions[0]?.workers.some(
											(worker) => worker.push.status === "failed",
										) ? (
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={retryPublicationPush.isPending}
												onClick={() =>
													retryPublicationPush.mutate(
														data.publication.versions[0].id,
													)
												}
											>
												Retry failed pushes
											</Button>
										) : null}
										<DataTable
											fill={false}
											bounded
											columns={publicationColumns}
											data={(data?.publication.versions ?? []).slice(0, 3)}
											getRowId={(row) => row.id}
										/>
									</section>
								) : null}
							</CardHeader>
						</Card>
					) : null}
				</div>
			</div>
		</section>
	);
}
