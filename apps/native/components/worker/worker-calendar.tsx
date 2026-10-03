import { useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import {
	Appear,
	AppText,
	Button,
	Card,
	CardListSkeleton,
	FadeSwap,
	IconButton,
	PressableScale,
	Section,
} from "@/components/ui";
import { api } from "@/lib/api";
import { tapLight } from "@/lib/haptics";
import { positionColor } from "@/lib/position-color";
import type { MyScheduleResponse, PublishedWeek } from "@/lib/queries";
import {
	formatHoursShort,
	relativeDayLabel,
	shiftHours,
} from "@/lib/time-format";
import { radius, spacing, useAppTheme } from "@/theme";
import { ShiftCard, useOpenShift, type WeekShift } from "./shift-card";

type CalendarShift = { shift: WeekShift; locationName: string };

const VISIBLE_DOTS = 3;
const NO_ENTRIES: CalendarShift[] = [];

function dateKey(date: Date): string {
	return date.toLocaleDateString("sv-SE");
}

function todayKey(): string {
	return dateKey(new Date());
}

function addDays(key: string, days: number): string {
	const date = new Date(`${key}T12:00:00`);
	date.setDate(date.getDate() + days);
	return dateKey(date);
}

function monthStartOf(key: string): string {
	const date = new Date(`${key}T12:00:00`);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function addMonths(monthStart: string, delta: number): string {
	const date = new Date(`${monthStart}T12:00:00`);
	date.setMonth(date.getMonth() + delta);
	return monthStartOf(dateKey(date));
}

export function monthKeys(monthStart: string, weekStartDay: number): string[] {
	const date = new Date(`${monthStart}T12:00:00`);
	const first = new Date(date.getFullYear(), date.getMonth(), 1);
	const offset = (first.getDay() - weekStartDay + 7) % 7;
	const start = new Date(first);
	start.setDate(first.getDate() - offset);
	return Array.from({ length: 42 }, (_, index) => {
		const next = new Date(start);
		next.setDate(start.getDate() + index);
		return dateKey(next);
	});
}

function monthLabel(monthStart: string): string {
	return new Date(`${monthStart}T12:00:00`).toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	});
}

function longDayLabel(key: string): string {
	return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}

/**
 * Worker month/agenda calendar. Reads the published weeks already returned by
 * `useMySchedule` and lazily loads older published versions that fall inside
 * the visible month so the worker can scan a whole month of Shifts. Swipe the
 * grid sideways to change month.
 */
export function WorkerCalendar({
	workplaceId,
	schedule,
}: {
	workplaceId: string | undefined;
	schedule: MyScheduleResponse | undefined;
}) {
	const openShift = useOpenShift();

	const weekStartDay = schedule?.weekStartDay ?? 0;
	const [monthStart, setMonthStart] = useState(() => monthStartOf(todayKey()));
	const [selectedDay, setSelectedDay] = useState<string>(() => todayKey());

	const days = useMemo(
		() => monthKeys(monthStart, weekStartDay),
		[monthStart, weekStartDay],
	);
	const rangeStart = days[0];
	const rangeEnd = days[days.length - 1];
	const today = todayKey();
	const monthIndex = new Date(`${monthStart}T12:00:00`).getMonth();

	const historyVersions = useMemo(
		() =>
			(schedule?.history ?? []).filter(
				(entry) =>
					entry.weekStart <= rangeEnd &&
					addDays(entry.weekStart, 6) >= rangeStart,
			),
		[schedule?.history, rangeStart, rangeEnd],
	);

	const versionQueries = useQueries({
		queries: historyVersions.map((entry) => ({
			queryKey: ["published-version", entry.versionId],
			queryFn: () => api<PublishedWeek>(`/v1/my/versions/${entry.versionId}`),
			enabled: Boolean(workplaceId),
			staleTime: 5 * 60_000,
		})),
	});
	const loadingVersions = versionQueries.some((query) => query.isPending);

	const shiftsByDay = useMemo(() => {
		const map = new Map<string, CalendarShift[]>();
		const seen = new Set<string>();
		const add = (shift: WeekShift, locationName: string) => {
			if (seen.has(shift.id)) return;
			seen.add(shift.id);
			const list = map.get(shift.date) ?? [];
			list.push({ shift, locationName });
			map.set(shift.date, list);
		};
		for (const shift of schedule?.currentWeek?.shifts ?? [])
			if (shift.isMine)
				add(shift, schedule?.currentWeek?.locationName ?? "Location");
		for (const shift of schedule?.nextWeek?.shifts ?? [])
			if (shift.isMine)
				add(shift, schedule?.nextWeek?.locationName ?? "Location");
		for (const query of versionQueries) {
			for (const shift of query.data?.shifts ?? [])
				add(shift, query.data?.locationName ?? "Location");
		}
		for (const list of map.values()) {
			list.sort((a, b) =>
				a.shift.startMinute === b.shift.startMinute
					? a.shift.positionName.localeCompare(b.shift.positionName)
					: a.shift.startMinute - b.shift.startMinute,
			);
		}
		return map;
		// versionQueries identity changes every render; data is what matters.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [schedule?.currentWeek, schedule?.nextWeek, versionQueries]);

	const weeks = useMemo(() => {
		const rows: string[][] = [];
		for (let index = 0; index < days.length; index += 7)
			rows.push(days.slice(index, index + 7));
		// Drop a trailing week that is entirely next month.
		return rows.filter(
			(week, index) =>
				index < 5 ||
				week.some(
					(day) => new Date(`${day}T12:00:00`).getMonth() === monthIndex,
				),
		);
	}, [days, monthIndex]);

	const weekdayNames = useMemo(
		() =>
			days.slice(0, 7).map((day) =>
				new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
					weekday: "narrow",
				}),
			),
		[days],
	);

	const monthStats = useMemo(() => {
		let count = 0;
		let hours = 0;
		for (const [day, list] of shiftsByDay) {
			if (new Date(`${day}T12:00:00`).getMonth() !== monthIndex) continue;
			for (const { shift } of list) {
				count += 1;
				hours += shiftHours(
					shift.startMinute,
					shift.endMinute,
					shift.overnight,
				);
			}
		}
		return { count, hours };
	}, [shiftsByDay, monthIndex]);

	const dayShifts = shiftsByDay.get(selectedDay) ?? [];

	function changeMonth(delta: number) {
		const next = addMonths(monthStart, delta);
		tapLight();
		setMonthStart(next);
		setSelectedDay(monthStartOf(today) === next ? today : next);
	}

	function selectDay(day: string) {
		tapLight();
		setSelectedDay(day);
	}

	function goToday() {
		setMonthStart(monthStartOf(today));
		setSelectedDay(today);
	}

	const swipe = Gesture.Pan()
		.runOnJS(true)
		.activeOffsetX([-24, 24])
		.failOffsetY([-16, 16])
		.onEnd((event) => {
			if (Math.abs(event.translationX) < 60) return;
			changeMonth(event.translationX < 0 ? 1 : -1);
		});

	return (
		<View style={{ gap: spacing.xl }}>
			<Card style={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.sm,
						paddingHorizontal: spacing.xs,
					}}
				>
					<View style={{ flex: 1 }}>
						<AppText variant="title3" accessibilityRole="header">
							{monthLabel(monthStart)}
						</AppText>
						<AppText variant="footnote" tone="secondary" tabular>
							{monthStats.count > 0
								? `${monthStats.count} shift${monthStats.count === 1 ? "" : "s"} · ${formatHoursShort(monthStats.hours)}`
								: "No shifts this month"}
						</AppText>
					</View>
					<IconButton
						icon="chevronLeft"
						accessibilityLabel="Previous month"
						onPress={() => changeMonth(-1)}
						size={36}
					/>
					<IconButton
						icon="chevronRight"
						accessibilityLabel="Next month"
						onPress={() => changeMonth(1)}
						size={36}
					/>
				</View>

				<GestureDetector gesture={swipe}>
					<FadeSwap key={monthStart} style={{ gap: 2 }}>
						<View style={{ flexDirection: "row", paddingTop: spacing.xs }}>
							{weekdayNames.map((name, index) => (
								<AppText
									// biome-ignore lint/suspicious/noArrayIndexKey: narrow names repeat (T/T, S/S)
									key={index}
									variant="caption"
									tone="tertiary"
									align="center"
									style={{ flex: 1 }}
								>
									{name}
								</AppText>
							))}
						</View>
						{weeks.map((week) => (
							<View key={week[0]} style={{ flexDirection: "row" }}>
								{week.map((day) => (
									<DayCell
										key={day}
										day={day}
										inMonth={
											new Date(`${day}T12:00:00`).getMonth() === monthIndex
										}
										isToday={day === today}
										isSelected={day === selectedDay}
										entries={shiftsByDay.get(day) ?? NO_ENTRIES}
										onSelect={selectDay}
									/>
								))}
							</View>
						))}
					</FadeSwap>
				</GestureDetector>
			</Card>

			<Section
				title={selectedDay === today ? "Today" : relativeDayLabel(selectedDay)}
				caption={longDayLabel(selectedDay)}
				action={
					selectedDay !== today ? (
						<Button
							label="Today"
							size="sm"
							variant="tinted"
							onPress={goToday}
						/>
					) : undefined
				}
			>
				{loadingVersions && dayShifts.length === 0 ? (
					<CardListSkeleton count={1} />
				) : dayShifts.length === 0 ? (
					<Card>
						<AppText variant="subhead" tone="secondary" align="center">
							Nothing scheduled — a day off.
						</AppText>
					</Card>
				) : (
					dayShifts.map((entry, index) => (
						<Appear key={entry.shift.id} index={index}>
							<ShiftCard
								shift={entry.shift}
								locationName={entry.locationName}
								onPress={
									entry.shift.planned
										? undefined
										: () => openShift(entry.shift, entry.locationName)
								}
							/>
						</Appear>
					))
				)}
			</Section>
		</View>
	);
}

function DayCell({
	day,
	inMonth,
	isToday,
	isSelected,
	entries,
	onSelect,
}: {
	day: string;
	inMonth: boolean;
	isToday: boolean;
	isSelected: boolean;
	entries: CalendarShift[];
	onSelect: (day: string) => void;
}) {
	const { theme } = useAppTheme();
	const dayNumber = new Date(`${day}T12:00:00`).getDate();
	const numberColor = isSelected
		? theme.onPrimary
		: isToday
			? theme.tint
			: inMonth
				? theme.text
				: theme.textTertiary;

	return (
		<PressableScale
			pressedScale={0.92}
			accessibilityRole="button"
			accessibilityLabel={`${longDayLabel(day)}${isToday ? ", today" : ""}, ${entries.length} shift${entries.length === 1 ? "" : "s"}`}
			accessibilityState={{ selected: isSelected }}
			onPress={() => onSelect(day)}
			style={{
				flex: 1,
				alignItems: "center",
				paddingVertical: 4,
				gap: 3,
				minHeight: 50,
			}}
		>
			<View
				style={{
					width: 36,
					height: 36,
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
					weight={isToday || isSelected ? "700" : "500"}
					color={numberColor}
					tabular
				>
					{dayNumber}
				</AppText>
			</View>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					gap: 3,
					height: 6,
				}}
			>
				{entries.slice(0, VISIBLE_DOTS).map((entry) => (
					<View
						key={entry.shift.id}
						style={{
							width: 5,
							height: 5,
							borderRadius: 3,
							backgroundColor: positionColor(entry.shift.positionName),
							opacity: inMonth ? 1 : 0.4,
						}}
					/>
				))}
			</View>
		</PressableScale>
	);
}
