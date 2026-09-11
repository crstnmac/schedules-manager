import { Ionicons } from "@expo/vector-icons";
import { useQueries } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

import { Badge, Card, Hint, useAppTheme } from "@/components/ui";
import { api } from "@/lib/api";
import { useDisplayPrefs } from "@/lib/display";
import { positionColor } from "@/lib/position-color";
import type { MyScheduleResponse, PublishedWeek } from "@/lib/queries";

type WeekShift = PublishedWeek["shifts"][number];
type CalendarShift = { shift: WeekShift; locationName: string };

const VISIBLE_DOTS = 3;

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
 * the visible month so the worker can scan a whole month of Shifts.
 */
export function WorkerCalendar({
	workplaceId,
	schedule,
}: {
	workplaceId: string | undefined;
	schedule: MyScheduleResponse | undefined;
}) {
	const { theme } = useAppTheme();
	const { formatShiftRange } = useDisplayPrefs();
	const router = useRouter();

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
		const add = (shift: WeekShift, locationName: string) => {
			const list = map.get(shift.date) ?? [];
			list.push({ shift, locationName });
			map.set(shift.date, list);
		};
		for (const shift of schedule?.currentWeek?.shifts ?? [])
			add(shift, schedule?.currentWeek?.locationName ?? "Location");
		for (const shift of schedule?.nextWeek?.shifts ?? [])
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
		return rows;
	}, [days]);

	const weekdayNames = useMemo(
		() =>
			(days.slice(0, 7) ?? []).map((day) =>
				new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
					weekday: "short",
				}),
			),
		[days],
	);

	const dayShifts = shiftsByDay.get(selectedDay) ?? [];

	function changeMonth(delta: number) {
		const next = addMonths(monthStart, delta);
		setMonthStart(next);
		setSelectedDay(next);
	}

	function goToday() {
		setMonthStart(monthStartOf(today));
		setSelectedDay(today);
	}

	return (
		<View style={{ gap: 14 }}>
			<Card>
				<View style={styles.monthNav}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Previous month"
						hitSlop={8}
						onPress={() => changeMonth(-1)}
						style={({ pressed }) => [
							styles.monthArrow,
							{ opacity: pressed ? 0.55 : 1 },
						]}
					>
						<Ionicons name="chevron-back" size={20} color={theme.primary} />
					</Pressable>
					<Text style={[styles.monthLabel, { color: theme.text }]}>
						{monthLabel(monthStart)}
					</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Next month"
						hitSlop={8}
						onPress={() => changeMonth(1)}
						style={({ pressed }) => [
							styles.monthArrow,
							{ opacity: pressed ? 0.55 : 1 },
						]}
					>
						<Ionicons name="chevron-forward" size={20} color={theme.primary} />
					</Pressable>
				</View>

				<View style={styles.weekdayRow}>
					{weekdayNames.map((name) => (
						<Text key={name} style={[styles.weekday, { color: theme.muted }]}>
							{name}
						</Text>
					))}
				</View>

				{weeks.map((week, weekIndex) => (
					<View
						key={week[0]}
						style={[
							styles.weekRow,
							{
								borderTopColor: theme.border,
								borderTopWidth: weekIndex === 0 ? 0 : StyleSheet.hairlineWidth,
							},
						]}
					>
						{week.map((day) => {
							const inMonth =
								new Date(`${day}T12:00:00`).getMonth() === monthIndex;
							const isToday = day === today;
							const isSelected = day === selectedDay;
							const entries = shiftsByDay.get(day) ?? [];
							const dayNumber = new Date(`${day}T12:00:00`).getDate();
							const numberColor = isSelected
								? theme.onPrimary
								: inMonth
									? theme.text
									: theme.muted;
							return (
								<Pressable
									key={day}
									accessibilityRole="button"
									accessibilityLabel={`${longDayLabel(day)}, ${
										entries.length
									} shift${entries.length === 1 ? "" : "s"}`}
									accessibilityState={{ selected: isSelected }}
									onPress={() => setSelectedDay(day)}
									style={[
										styles.dayCell,
										{
											borderLeftColor: theme.border,
											backgroundColor: isSelected
												? theme.primary
												: isToday
													? `${theme.primary}14`
													: "transparent",
										},
									]}
								>
									<Text
										style={[
											styles.dayNumber,
											{
												color: numberColor,
												fontWeight: isToday ? "800" : "600",
											},
										]}
									>
										{dayNumber}
									</Text>
									<View style={styles.dotRow}>
										{entries.slice(0, VISIBLE_DOTS).map((entry) => (
											<View
												key={entry.shift.id}
												style={[
													styles.dot,
													{
														backgroundColor: isSelected
															? theme.onPrimary
															: positionColor(entry.shift.positionName),
													},
												]}
											/>
										))}
										{entries.length > VISIBLE_DOTS ? (
											<Text style={[styles.moreDots, { color: numberColor }]}>
												+{entries.length - VISIBLE_DOTS}
											</Text>
										) : null}
									</View>
								</Pressable>
							);
						})}
					</View>
				))}
			</Card>

			<Card>
				<View style={styles.agendaHeader}>
					<Text style={[styles.agendaTitle, { color: theme.text }]}>
						{longDayLabel(selectedDay)}
					</Text>
					{selectedDay !== today ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Jump to today"
							hitSlop={8}
							onPress={goToday}
							style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
						>
							<Text style={[styles.todayLink, { color: theme.primary }]}>
								Today
							</Text>
						</Pressable>
					) : null}
				</View>

				{loadingVersions ? <ActivityIndicator color={theme.primary} /> : null}

				{!loadingVersions && dayShifts.length === 0 ? (
					<Hint>No Shifts scheduled this day.</Hint>
				) : null}

				{dayShifts.map((entry) => {
					const shift = entry.shift;
					const accent = positionColor(shift.positionName);
					return (
						<Pressable
							key={shift.id}
							accessibilityRole="button"
							accessibilityLabel={`Open details for ${shift.positionName} shift`}
							onPress={() =>
								router.push({
									pathname: "/shift-detail",
									params: {
										shift: JSON.stringify(shift),
										locationName: entry.locationName,
									},
								})
							}
							style={({ pressed }) => [
								styles.shiftRow,
								{
									borderColor: theme.border,
									opacity: pressed ? 0.7 : 1,
									overflow: "hidden",
								},
							]}
						>
							<View
								style={[styles.shiftAccentBar, { backgroundColor: accent }]}
								aria-hidden
							/>
							<View style={{ flex: 1, gap: 3, paddingLeft: 8 }}>
								<Text style={[styles.shiftTime, { color: theme.text }]}>
									{formatShiftRange(
										shift.startMinute,
										shift.endMinute,
										shift.overnight,
									)}
								</Text>
								<View style={styles.shiftMetaRow}>
									<View
										style={[styles.positionDot, { backgroundColor: accent }]}
									/>
									<Text style={[styles.shiftMeta, { color: theme.muted }]}>
										{shift.positionName} · {entry.locationName}
									</Text>
								</View>
								{shift.note ? (
									<Text style={[styles.shiftMeta, { color: theme.muted }]}>
										{shift.note}
									</Text>
								) : null}
							</View>
							{shift.releaseStatus === "pending" ? (
								<Badge label="Release pending" variant="outline" />
							) : null}
						</Pressable>
					);
				})}
			</Card>
		</View>
	);
}

const styles = StyleSheet.create({
	monthNav: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	monthArrow: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	monthLabel: {
		fontSize: 17,
		fontWeight: "800",
		letterSpacing: -0.3,
	},
	weekdayRow: { flexDirection: "row", marginTop: 4 },
	weekday: {
		flex: 1,
		textAlign: "center",
		fontSize: 11,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	weekRow: { flexDirection: "row" },
	dayCell: {
		flex: 1,
		minHeight: 54,
		borderLeftWidth: StyleSheet.hairlineWidth,
		paddingTop: 6,
		paddingHorizontal: 2,
		gap: 5,
	},
	dayNumber: {
		fontSize: 13,
		textAlign: "center",
		fontVariant: ["tabular-nums"],
	},
	dotRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 3,
		minHeight: 12,
	},
	dot: { width: 6, height: 6, borderRadius: 3 },
	moreDots: { fontSize: 10, fontWeight: "700" },
	agendaHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	agendaTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
	todayLink: { fontSize: 13, fontWeight: "700" },
	shiftRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderWidth: 1,
		borderRadius: 10,
		borderCurve: "continuous",
		padding: 12,
	},
	shiftAccentBar: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		width: 4,
	},
	shiftTime: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
	shiftMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
	shiftMeta: { fontSize: 13, lineHeight: 18 },
	positionDot: { width: 7, height: 7, borderRadius: 4 },
});
