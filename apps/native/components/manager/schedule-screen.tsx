import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";

import { Metric } from "@/components/manager/metric";
import {
	Appear,
	AppText,
	Avatar,
	Badge,
	Button,
	Card,
	CardListSkeleton,
	ChoiceChips,
	Divider,
	EmptyState,
	ErrorState,
	FadeSwap,
	Icon,
	IconButton,
	PressableScale,
	Screen,
	Section,
	type Tone,
} from "@/components/ui";
import { showActionSheet } from "@/lib/action-sheet";
import { api } from "@/lib/api";
import { useDisplayPrefs } from "@/lib/display";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { positionColor } from "@/lib/position-color";
import {
	useCurrentEmployment,
	useMarkAttendance,
	useWorkplaceLocations,
} from "@/lib/queries";
import { formatDuration } from "@/lib/time-format";
import { radius, spacing, useAppTheme } from "@/theme";

type TimeclockRow = {
	shiftId: string;
	versionShiftId: string;
	status: "open" | "closed" | null;
	clockedInAt: string | null;
	clockedOutAt?: string | null;
	workedMinutes?: number | null;
	attendance: "late" | "no_show" | "sick" | null;
	late?: boolean;
};

type ScheduleShift = {
	id: string;
	date: string;
	startsAt: string;
	endsAt: string;
	startMinute: number;
	endMinute: number;
	overnight?: boolean;
	positionName: string;
	workerName?: string | null;
	note?: string | null;
	conflicts?: unknown[];
};

type ScheduleResponse = {
	publication: {
		latestVersionNumber?: number;
		publishedAt?: string;
		hasUnpublishedChanges?: boolean;
		versions?: {
			versionNumber: number;
			workers: { acknowledgedAt: string | null }[];
		}[];
	} | null;
	timeclock?: TimeclockRow[];
	shifts: ScheduleShift[];
	staff: unknown[];
};

type Filter = "all" | "open" | "issues";

function dateKey(date: Date) {
	return date.toLocaleDateString("sv-SE");
}

/** Monday of the week containing `from`, shifted by `offset` weeks. */
function weekStart(offset: number, from = new Date()) {
	const d = new Date(from);
	d.setHours(12, 0, 0, 0);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
	return d;
}

function zonedToday(timeZone: string) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

type Live =
	| { kind: "open" }
	| { kind: "onClock"; since: string }
	| { kind: "late"; minutes: number }
	| { kind: "notIn" }
	| { kind: "worked"; minutes: number }
	| { kind: "noPunch" }
	| { kind: "upcoming" };

/** Where a shift stands right now, from its punch and the clock. */
function liveStatus(
	shift: ScheduleShift,
	punch: TimeclockRow | undefined,
	now: number,
): Live {
	if (!shift.workerName) return { kind: "open" };
	const starts = new Date(shift.startsAt).getTime();
	const ends = new Date(shift.endsAt).getTime();
	if (punch?.status === "open" && punch.clockedInAt) {
		const lateBy = Math.round(
			(new Date(punch.clockedInAt).getTime() - starts) / 60000,
		);
		if (punch.late && lateBy > 0) return { kind: "late", minutes: lateBy };
		return { kind: "onClock", since: punch.clockedInAt };
	}
	if (punch?.status === "closed")
		return { kind: "worked", minutes: punch.workedMinutes ?? 0 };
	if (now > ends) return { kind: "noPunch" };
	if (now > starts + 5 * 60_000) return { kind: "notIn" };
	return { kind: "upcoming" };
}

const ATTENDANCE_LABEL = {
	late: "Marked late",
	no_show: "No-show",
	sick: "Out sick",
} as const;

/**
 * Manager's day view of the published week: pick a day, see who's in, who
 * isn't, and what's uncovered. Building the week stays on the web grid.
 */
export function ScheduleScreen() {
	const { workplaceId, canReview } = useCurrentEmployment();
	const locations = useWorkplaceLocations(workplaceId);
	const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
	const [weekOffset, setWeekOffset] = useState(0);
	const [filter, setFilter] = useState<Filter>("all");
	const location =
		locations.data?.find((l) => l.id === selectedLocation) ??
		locations.data?.[0];
	const timezone = location?.timezone ?? "America/Chicago";
	const today = zonedToday(timezone);
	const start = weekStart(weekOffset);
	const startKey = dateKey(start);
	const days = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		return dateKey(d);
	});
	const [selectedDay, setSelectedDay] = useState(today);
	const day = days.includes(selectedDay)
		? selectedDay
		: days.includes(today)
			? today
			: days[0];

	const schedule = useQuery({
		queryKey: ["manager", "schedule", location?.id, startKey],
		queryFn: () =>
			api<ScheduleResponse>(
				`/v1/locations/${location?.id}/schedules/${startKey}`,
			),
		enabled: Boolean(location?.id),
		refetchInterval: weekOffset === 0 ? 60_000 : false,
	});
	const markAttendance = useMarkAttendance(workplaceId);

	const punches = useMemo(
		() =>
			new Map(
				(schedule.data?.timeclock ?? []).map((row) => [row.shiftId, row]),
			),
		[schedule.data],
	);
	const shifts = schedule.data?.shifts ?? [];
	const countsByDay = useMemo(() => {
		const map = new Map<string, { total: number; open: number }>();
		for (const shift of shifts) {
			const entry = map.get(shift.date) ?? { total: 0, open: 0 };
			entry.total += 1;
			if (!shift.workerName) entry.open += 1;
			map.set(shift.date, entry);
		}
		return map;
	}, [shifts]);

	const latest = schedule.data?.publication?.versions?.find(
		(v) => v.versionNumber === schedule.data?.publication?.latestVersionNumber,
	);
	const acknowledged =
		latest?.workers.filter((w) => w.acknowledgedAt).length ?? 0;

	return (
		<>
			<Stack.Screen
				options={{
					headerRight:
						(locations.data?.length ?? 0) > 1
							? () => (
									<Button
										label={location?.name ?? "Location"}
										icon="location"
										variant="ghost"
										size="sm"
										onPress={() =>
											showActionSheet({
												title: "Location",
												actions: (locations.data ?? [])
													.slice(0, 3)
													.map((l) => ({
														label: l.name,
														onPress: () => setSelectedLocation(l.id),
													})),
											})
										}
									/>
								)
							: undefined,
				}}
			/>
			<Screen onRefresh={() => schedule.refetch()}>
				<AppText
					variant="subhead"
					tone="secondary"
					style={{ paddingHorizontal: spacing.xs, marginTop: -spacing.xs }}
				>
					{location?.name ?? "Location"} ·{" "}
					{new Date(`${startKey}T12:00:00`).toLocaleDateString(undefined, {
						month: "short",
						day: "numeric",
					})}
					–
					{new Date(`${days[6]}T12:00:00`).toLocaleDateString(undefined, {
						month: "short",
						day: "numeric",
					})}
				</AppText>

				<WeekStrip
					days={days}
					today={today}
					selected={day}
					counts={countsByDay}
					onSelect={(key) => {
						tapLight();
						setSelectedDay(key);
					}}
					onShift={(delta) => {
						tapLight();
						setWeekOffset((value) => value + delta);
						setSelectedDay("");
					}}
					onToday={
						weekOffset !== 0 || day !== today
							? () => {
									setWeekOffset(0);
									setSelectedDay(today);
								}
							: undefined
					}
				/>

				{schedule.data?.publication ? (
					<PublicationChip
						version={schedule.data.publication.latestVersionNumber}
						unpublished={Boolean(
							schedule.data.publication.hasUnpublishedChanges,
						)}
						acknowledged={acknowledged}
						total={latest?.workers.length ?? 0}
					/>
				) : null}

				{schedule.isLoading || locations.isLoading ? (
					<CardListSkeleton count={3} />
				) : null}
				{schedule.isError ? (
					<ErrorState
						error={schedule.error}
						onRetry={() => void schedule.refetch()}
					/>
				) : null}

				{schedule.data ? (
					<DayView
						key={`${startKey}-${day}`}
						shifts={shifts}
						punches={punches}
						day={day}
						today={today}
						filter={filter}
						onFilter={setFilter}
						canReview={canReview}
						markAttendance={markAttendance}
					/>
				) : null}
			</Screen>
		</>
	);
}

type DayRow = {
	shift: ScheduleShift;
	punch: TimeclockRow | undefined;
	live: Live;
};

/**
 * One day's metrics, filter and shift waves. Owns the once-a-minute clock so
 * the tick re-renders only this subtree, not the header, week strip or chrome.
 */
function DayView({
	shifts,
	punches,
	day,
	today,
	filter,
	onFilter,
	canReview,
	markAttendance,
}: {
	shifts: ScheduleShift[];
	punches: Map<string, TimeclockRow>;
	day: string;
	today: string;
	filter: Filter;
	onFilter: (filter: Filter) => void;
	canReview: boolean;
	markAttendance: ReturnType<typeof useMarkAttendance>;
}) {
	// Location-local minutes, never the phone's timezone: the schedule is
	// planned in the Location's time.
	const { formatMinute } = useDisplayPrefs();
	// Re-evaluate "not in yet" / "on clock" each minute without refetching.
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(timer);
	}, []);

	const dayShifts = shifts
		.filter((shift) => shift.date === day)
		.sort((a, b) =>
			a.startMinute === b.startMinute
				? (a.workerName ?? "").localeCompare(b.workerName ?? "")
				: a.startMinute - b.startMinute,
		)
		.map((shift) => ({
			shift,
			punch: punches.get(shift.id),
			live: liveStatus(shift, punches.get(shift.id), now),
		}));
	const isIssue = (row: DayRow) =>
		row.live.kind === "late" ||
		row.live.kind === "notIn" ||
		row.live.kind === "noPunch" ||
		Boolean(row.punch?.attendance) ||
		(row.shift.conflicts?.length ?? 0) > 0;
	const open = dayShifts.filter((row) => row.live.kind === "open");
	const issues = dayShifts.filter(isIssue);
	const onClock = dayShifts.filter(
		(row) => row.live.kind === "onClock" || row.live.kind === "late",
	);
	const visible =
		filter === "open" ? open : filter === "issues" ? issues : dayShifts;

	// Group by start time so a busy day reads as a handful of waves.
	const groups = new Map<number, typeof visible>();
	for (const row of visible) {
		const list = groups.get(row.shift.startMinute) ?? [];
		list.push(row);
		groups.set(row.shift.startMinute, list);
	}

	function openRow(row: DayRow) {
		const punch = row.punch;
		if (!canReview || !punch?.versionShiftId || !row.shift.workerName) return;
		const name = row.shift.workerName;
		const mark = (kind: "late" | "no_show" | "sick") =>
			markAttendance.mutate(
				{ versionShiftId: punch.versionShiftId, kind },
				{
					onSuccess: tapSuccess,
					onError: (error) =>
						Alert.alert("Could not save", (error as Error).message),
				},
			);
		showActionSheet({
			title: `Mark ${name}`,
			message: "Attendance marks don’t change the published schedule.",
			actions: [
				{ label: "Late", onPress: () => mark("late") },
				{ label: "No-show", destructive: true, onPress: () => mark("no_show") },
				{ label: "Sick", onPress: () => mark("sick") },
			],
		});
	}

	return (
		<FadeSwap style={{ gap: spacing.xl }}>
			<View style={{ flexDirection: "row", gap: spacing.md }}>
				{day === today ? (
					<Metric
						icon="clockFill"
						value={onClock.length}
						label="On the clock"
						tone="success"
					/>
				) : null}
				<Metric icon="calendar" value={dayShifts.length} label="Scheduled" />
				<Metric
					icon="handRaised"
					value={open.length}
					label="Open shifts"
					tone={open.length > 0 ? "warning" : "primary"}
				/>
				{day !== today ? (
					<Metric
						icon="warning"
						value={issues.length}
						label="Issues"
						tone={issues.length > 0 ? "danger" : "primary"}
					/>
				) : null}
			</View>

			{dayShifts.length > 0 ? (
				<ChoiceChips<Filter>
					accessibilityLabel="Filter shifts"
					value={filter}
					onChange={onFilter}
					options={[
						{ value: "all", label: `All ${dayShifts.length}` },
						{ value: "open", label: `Open ${open.length}` },
						{
							value: "issues",
							label: `Needs attention ${issues.length}`,
						},
					]}
				/>
			) : null}

			{dayShifts.length === 0 ? (
				<EmptyState
					icon="calendar"
					title="Nothing scheduled"
					body="No shifts on this day. Build and publish the week on the web Schedule grid."
				/>
			) : visible.length === 0 ? (
				<EmptyState
					icon="checkCircle"
					tone="success"
					title={
						filter === "open"
							? "Every shift is covered"
							: "Nothing needs attention"
					}
					body={
						filter === "open"
							? "All shifts on this day have someone assigned."
							: "Everyone scheduled is where they should be."
					}
				/>
			) : (
				[...groups.entries()].map(([minute, rows], index) => (
					<Appear key={minute} index={index}>
						<Section
							title={formatMinute(minute)}
							caption={`${rows.length} shift${rows.length === 1 ? "" : "s"}`}
						>
							<Card padded={false} style={{ gap: 0 }}>
								{rows.map((row, rowIndex) => (
									<View key={row.shift.id}>
										{rowIndex > 0 ? <Divider inset={68} /> : null}
										<ShiftRow
											shift={row.shift}
											live={row.live}
											attendance={row.punch?.attendance ?? null}
											onPress={
												canReview &&
												row.punch?.versionShiftId &&
												row.shift.workerName
													? () => openRow(row)
													: undefined
											}
										/>
									</View>
								))}
							</Card>
						</Section>
					</Appear>
				))
			)}
		</FadeSwap>
	);
}

function WeekStrip({
	days,
	today,
	selected,
	counts,
	onSelect,
	onShift,
	onToday,
}: {
	days: string[];
	today: string;
	selected: string;
	counts: Map<string, { total: number; open: number }>;
	onSelect: (day: string) => void;
	onShift: (delta: number) => void;
	onToday?: () => void;
}) {
	const { theme } = useAppTheme();
	return (
		<Card
			style={{
				gap: spacing.sm,
				paddingHorizontal: spacing.sm,
				paddingVertical: spacing.md,
			}}
		>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					paddingHorizontal: spacing.xs,
				}}
			>
				<IconButton
					icon="chevronLeft"
					accessibilityLabel="Previous week"
					size={32}
					variant="ghost"
					onPress={() => onShift(-1)}
				/>
				<View style={{ flex: 1, alignItems: "center" }}>
					{onToday ? (
						<Button
							label="Jump to today"
							variant="ghost"
							size="sm"
							onPress={onToday}
						/>
					) : (
						<AppText variant="footnote" weight="600" tone="secondary">
							This week
						</AppText>
					)}
				</View>
				<IconButton
					icon="chevronRight"
					accessibilityLabel="Next week"
					size={32}
					variant="ghost"
					onPress={() => onShift(1)}
				/>
			</View>
			<View style={{ flexDirection: "row" }}>
				{days.map((key) => {
					const date = new Date(`${key}T12:00:00`);
					const isSelected = key === selected;
					const isToday = key === today;
					const count = counts.get(key);
					return (
						<Pressable
							key={key}
							accessibilityRole="tab"
							accessibilityState={{ selected: isSelected }}
							accessibilityLabel={`${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}${isToday ? ", today" : ""}, ${count?.total ?? 0} shifts${count?.open ? `, ${count.open} open` : ""}`}
							onPress={() => onSelect(key)}
							style={{ flex: 1, alignItems: "center", gap: spacing.xs }}
						>
							<AppText
								variant="caption"
								tone={isToday ? "tint" : "tertiary"}
								weight="600"
							>
								{date.toLocaleDateString(undefined, { weekday: "narrow" })}
							</AppText>
							<View
								style={{
									width: 38,
									height: 38,
									borderRadius: radius.full,
									alignItems: "center",
									justifyContent: "center",
									backgroundColor: isSelected
										? theme.primary
										: isToday
											? theme.primarySoft
											: "transparent",
								}}
							>
								<AppText
									variant="callout"
									weight={isSelected || isToday ? "700" : "500"}
									color={
										isSelected
											? theme.onPrimary
											: isToday
												? theme.tint
												: theme.text
									}
									tabular
								>
									{date.getDate()}
								</AppText>
							</View>
							<View style={{ flexDirection: "row", gap: 3, height: 5 }}>
								{count ? (
									<View
										style={{
											width: 5,
											height: 5,
											borderRadius: 3,
											backgroundColor: theme.textTertiary,
										}}
									/>
								) : null}
								{count?.open ? (
									<View
										style={{
											width: 5,
											height: 5,
											borderRadius: 3,
											backgroundColor: theme.warning,
										}}
									/>
								) : null}
							</View>
						</Pressable>
					);
				})}
			</View>
		</Card>
	);
}

function PublicationChip({
	version,
	unpublished,
	acknowledged,
	total,
}: {
	version?: number;
	unpublished: boolean;
	acknowledged: number;
	total: number;
}) {
	const { theme } = useAppTheme();
	const tone: Tone = unpublished ? "warning" : "success";
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.sm,
				paddingHorizontal: spacing.md,
				paddingVertical: spacing.sm + 2,
				borderRadius: radius.md,
				borderCurve: "continuous",
				backgroundColor: unpublished ? theme.warningSoft : theme.successSoft,
			}}
		>
			<Icon
				name={unpublished ? "warning" : "checkCircle"}
				size={16}
				color={unpublished ? theme.warning : theme.success}
			/>
			<AppText variant="footnote" weight="600" style={{ flex: 1 }}>
				{unpublished
					? "Unpublished changes — publish from the web grid"
					: `Published${version ? ` · version ${version}` : ""}`}
			</AppText>
			{total > 0 ? (
				<Badge
					label={`${acknowledged}/${total} saw it`}
					tone={tone === "success" ? "neutral" : "warning"}
				/>
			) : null}
		</View>
	);
}

function ShiftRow({
	shift,
	live,
	attendance,
	onPress,
}: {
	shift: ScheduleShift;
	live: Live;
	attendance: TimeclockRow["attendance"];
	onPress?: () => void;
}) {
	const { theme } = useAppTheme();
	const { formatMinute, formatShiftRange } = useDisplayPrefs();
	const conflict = (shift.conflicts?.length ?? 0) > 0;
	const range = formatShiftRange(
		shift.startMinute,
		shift.endMinute,
		Boolean(shift.overnight),
	);
	const content = (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.md,
				paddingHorizontal: spacing.lg,
				paddingVertical: spacing.md,
			}}
		>
			{shift.workerName ? (
				<Avatar
					name={shift.workerName}
					size={40}
					color={positionColor(shift.workerName)}
				/>
			) : (
				<View
					style={{
						width: 40,
						height: 40,
						borderRadius: 20,
						borderWidth: 1.5,
						borderStyle: "dashed",
						borderColor: theme.warningBorder,
						backgroundColor: theme.warningSoft,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Icon name="handRaised" size={16} color={theme.warning} />
				</View>
			)}
			<View style={{ flex: 1, gap: 2 }}>
				<AppText variant="callout" weight="600" numberOfLines={1}>
					{shift.workerName ?? "Open shift"}
				</AppText>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.xs + 2,
					}}
				>
					<View
						style={{
							width: 7,
							height: 7,
							borderRadius: 4,
							backgroundColor: positionColor(shift.positionName),
						}}
					/>
					<AppText
						variant="footnote"
						tone="secondary"
						tabular
						numberOfLines={1}
						style={{ flexShrink: 1 }}
					>
						{shift.positionName} · until {formatMinute(shift.endMinute)}
						{shift.overnight ? " +1" : ""}
					</AppText>
				</View>
			</View>
			<View style={{ alignItems: "flex-end", gap: spacing.xs }}>
				<LiveBadge live={live} />
				{attendance ? (
					<Badge label={ATTENDANCE_LABEL[attendance]} tone="danger" />
				) : null}
				{conflict ? (
					<Badge label="Conflict" tone="danger" icon="warning" />
				) : null}
			</View>
		</View>
	);
	if (!onPress) return content;
	return (
		<PressableScale
			accessibilityRole="button"
			accessibilityLabel={`${shift.workerName ?? "Open shift"}, ${shift.positionName}, ${range}`}
			accessibilityHint="Mark attendance"
			pressedScale={0.985}
			haptic
			onPress={onPress}
		>
			{content}
		</PressableScale>
	);
}

function LiveBadge({ live }: { live: Live }) {
	switch (live.kind) {
		case "open":
			return <Badge label="Unassigned" tone="warning" />;
		case "onClock":
			return <OnClockBadge />;
		case "late":
			return (
				<Badge label={`Late ${live.minutes}m`} tone="warning" icon="clock" />
			);
		case "notIn":
			return <Badge label="Not in yet" tone="danger" dot />;
		case "worked":
			return (
				<Badge
					label={formatDuration(live.minutes * 60_000)}
					tone="neutral"
					icon="check"
				/>
			);
		case "noPunch":
			return <Badge label="No punch" tone="danger" />;
		default:
			return null;
	}
}

/** Success pill with a dot: someone is working right now. */
function OnClockBadge() {
	const { theme } = useAppTheme();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 5,
				backgroundColor: theme.successSoft,
				borderRadius: radius.full,
				paddingHorizontal: spacing.sm,
				paddingVertical: 3,
			}}
		>
			<View
				style={{
					width: 6,
					height: 6,
					borderRadius: 3,
					backgroundColor: theme.success,
				}}
			/>
			<AppText variant="caption" weight="600" color={theme.success}>
				On clock
			</AppText>
		</View>
	);
}
