import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

import {
	AppScreen,
	Card,
	PageHeader,
	PrimaryButton,
	SecondaryButton,
	useAppTheme,
} from "@/components/ui";
import { positionColor } from "@/lib/position-color";
import {
	useCurrentEmployment,
	useEndBreak,
	useMyTimeEntries,
	usePayPeriod,
	useStartBreak,
} from "@/lib/queries";

export default function TimecardScreen() {
	const { theme } = useAppTheme();
	const router = useRouter();
	const { workplaceId } = useCurrentEmployment();
	const timecard = useMyTimeEntries(workplaceId);
	const payPeriod = usePayPeriod(workplaceId);
	const startBreak = useStartBreak();
	const endBreak = useEndBreak();

	const entries = timecard.data?.timeEntries ?? [];
	const groups = groupByDay(entries);
	const week = currentWeekTotals(entries, payPeriod.data?.weekStartDay ?? 1);
	const lastWeek = weekTotals(entries, -1, payPeriod.data?.weekStartDay ?? 1);
	const periodTotal = payPeriod.data ? payPeriod.data.periodTotalMs : null;
	const weekLabel = `Week of ${new Date(week.startsAt).toLocaleDateString(
		undefined,
		{ month: "short", day: "numeric" },
	)}`;
	const lastWeekLabel = `Week of ${new Date(
		lastWeek.startsAt,
	).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

	return (
		<AppScreen>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Go back"
				onPress={() => router.back()}
				style={({ pressed }) => [
					styles.backRow,
					{ opacity: pressed ? 0.6 : 1 },
				]}
			>
				<Ionicons name="chevron-back" size={20} color={theme.primary} />
				<Text style={[styles.backText, { color: theme.primary }]}>
					My schedule
				</Text>
			</Pressable>

			<PageHeader
				eyebrow="TIMECLOCK"
				title="My timecard"
				description="Punches are your record of started and finished work."
			/>

			{timecard.isLoading ? (
				<ActivityIndicator color={theme.primary} style={{ marginTop: 8 }} />
			) : null}

			{timecard.isError ? (
				<Card>
					<Text style={[styles.errorText, { color: theme.notification }]}>
						{(timecard.error as Error).message}
					</Text>
				</Card>
			) : null}

			{payPeriod.data && periodTotal !== null ? (
				<Card>
					<Text style={[styles.weekLabel, { color: theme.muted }]}>
						{`PAY PERIOD · ${new Date(
							payPeriod.data.startsAt,
						).toLocaleDateString(undefined, {
							month: "short",
							day: "numeric",
						})} – ${new Date(payPeriod.data.endsAt).toLocaleDateString(
							undefined,
							{ month: "short", day: "numeric" },
						)}`.toUpperCase()}
					</Text>
					<Text style={[styles.weekTotal, { color: theme.text }]}>
						{formatHours(periodTotal)}
					</Text>
					<Text style={[styles.entryMeta, { color: theme.muted }]}>
						{payPeriod.data.type === "weekly"
							? "Weekly"
							: payPeriod.data.type === "biweekly"
								? "Every two weeks"
								: payPeriod.data.type === "semimonthly"
									? "Twice a month"
									: "Monthly"}{" "}
						pay period
					</Text>
				</Card>
			) : null}

			<View style={styles.totalsRow}>
				<Card style={styles.totalsCell}>
					<Text style={[styles.weekLabel, { color: theme.muted }]}>
						{weekLabel.toUpperCase()}
					</Text>
					<Text style={[styles.weekTotal, { color: theme.text }]}>
						{formatHours(week.totalMs)}
					</Text>
				</Card>
				<Card style={styles.totalsCell}>
					<Text style={[styles.weekLabel, { color: theme.muted }]}>
						{lastWeekLabel.toUpperCase()}
					</Text>
					<Text style={[styles.weekTotal, { color: theme.text }]}>
						{formatHours(lastWeek.totalMs)}
					</Text>
				</Card>
			</View>

			{entries.length === 0 && !timecard.isLoading ? (
				<Card>
					<Text style={[styles.dayHeading, { color: theme.text }]}>
						No punches yet
					</Text>
					<Text style={[styles.entryMeta, { color: theme.muted }]}>
						Clock in from your schedule when your shift starts — your punches
						will show up here.
					</Text>
				</Card>
			) : null}

			{groups.map((group) => (
				<Card key={group.dateKey}>
					<View style={styles.dayRow}>
						<Text style={[styles.dayHeading, { color: theme.text }]}>
							{group.dayLabel}
						</Text>
						<Text style={[styles.dayTotal, { color: theme.muted }]}>
							{formatHours(group.totalMs)}
						</Text>
					</View>
					{group.entries.map((entry) => {
						const open = entry.clockedOutAt === null;
						const durationMs = open
							? Date.now() - new Date(entry.clockedInAt).getTime()
							: new Date(entry.clockedOutAt ?? "").getTime() -
								new Date(entry.clockedInAt).getTime();
						return (
							<View key={entry.id}>
								<View style={styles.entryRow}>
									<View
										style={[
											styles.positionDot,
											{ backgroundColor: positionColor(entry.positionName) },
										]}
										aria-hidden
									/>
									<View style={styles.entryCopy}>
										<Text style={[styles.entryTitle, { color: theme.text }]}>
											{entry.positionName}
										</Text>
										<Text style={[styles.entryMeta, { color: theme.muted }]}>
											{formatClock(entry.clockedInAt)} –{" "}
											{open
												? "on the clock"
												: formatClock(entry.clockedOutAt ?? undefined)}
											{" · "}
											{formatHours(durationMs)}
										</Text>
									</View>
									{open ? (
										<View
											style={[styles.pill, { backgroundColor: theme.primary }]}
										>
											<Text
												style={[styles.pillText, { color: theme.onPrimary }]}
											>
												OPEN
											</Text>
										</View>
									) : null}
								</View>
								{open ? (
									<View style={styles.breakActions}>
										<PrimaryButton
											label="Start Break"
											loading={startBreak.isPending}
											disabled={endBreak.isPending}
											onPress={() =>
												startBreak.mutate(entry.id, {
													onError: (error) =>
														Alert.alert(
															"Could not start Break",
															(error as Error).message,
														),
												})
											}
											style={{ flex: 1 }}
										/>
										<SecondaryButton
											label="End Break"
											disabled={startBreak.isPending || endBreak.isPending}
											onPress={() =>
												endBreak.mutate(entry.id, {
													onError: (error) =>
														Alert.alert(
															"Could not end Break",
															(error as Error).message,
														),
												})
											}
											style={{ flex: 1 }}
										/>
									</View>
								) : null}
							</View>
						);
					})}
				</Card>
			))}

			{entries.length > 0 ? (
				<Text style={[styles.footer, { color: theme.muted }]}>
					Showing your last {entries.length} punches.
				</Text>
			) : null}
		</AppScreen>
	);
}

interface TimecardEntry {
	id: string;
	versionShiftId: string;
	positionName: string;
	shiftStartsAt: string;
	shiftEndsAt: string;
	clockedInAt: string;
	clockedOutAt: string | null;
}

function groupByDay(entries: TimecardEntry[]) {
	const map = new Map<
		string,
		{
			dateKey: string;
			dayLabel: string;
			totalMs: number;
			entries: TimecardEntry[];
		}
	>();
	for (const entry of entries) {
		const date = new Date(entry.clockedInAt);
		const dateKey = date.toLocaleDateString(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
		});
		const group = map.get(dateKey) ?? {
			dateKey,
			dayLabel: dateKey,
			totalMs: 0,
			entries: [],
		};
		const end = entry.clockedOutAt
			? new Date(entry.clockedOutAt).getTime()
			: Date.now();
		group.totalMs += Math.max(0, end - new Date(entry.clockedInAt).getTime());
		group.entries.push(entry);
		map.set(dateKey, group);
	}
	return [...map.values()];
}

function mondayStart(from: Date, weekStartDay: number): Date {
	const date = new Date(from);
	date.setHours(0, 0, 0, 0);
	const diff = (date.getDay() - weekStartDay + 7) % 7;
	date.setDate(date.getDate() - diff);
	return date;
}

function currentWeekTotals(entries: TimecardEntry[], weekStartDay: number) {
	return weekTotals(entries, 0, weekStartDay);
}

function weekTotals(
	entries: TimecardEntry[],
	weekOffset: number,
	weekStartDay: number,
) {
	const start = mondayStart(new Date(), weekStartDay);
	start.setDate(start.getDate() + weekOffset * 7);
	const startMs = start.getTime();
	const end = new Date(start);
	end.setDate(end.getDate() + 7);
	const endMs = end.getTime();
	let totalMs = 0;
	for (const entry of entries) {
		const inAt = new Date(entry.clockedInAt).getTime();
		if (inAt < startMs || inAt >= endMs) continue;
		const outAt = entry.clockedOutAt
			? new Date(entry.clockedOutAt).getTime()
			: Date.now();
		totalMs += Math.max(0, outAt - inAt);
	}
	return { startsAt: start.toISOString(), totalMs };
}

function formatHours(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / 60000));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0 && m === 0) return "0m";
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatClock(iso?: string): string {
	if (!iso) return "";
	return new Date(iso).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

const styles = StyleSheet.create({
	backRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginBottom: 4,
		minHeight: 44,
	},
	backText: { fontSize: 15, fontWeight: "600" },
	pill: {
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	weekLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
	totalsRow: { flexDirection: "row", gap: 12 },
	totalsCell: { flex: 1 },
	weekTotal: {
		fontSize: 26,
		fontWeight: "800",
		letterSpacing: -0.5,
		marginTop: 4,
		fontVariant: ["tabular-nums"],
	},
	positionDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
	dayRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	dayHeading: { fontSize: 16, fontWeight: "700" },
	dayTotal: { fontSize: 14, fontWeight: "600" },
	entryRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingVertical: 10,
		gap: 10,
	},
	entryCopy: { flex: 1, gap: 2 },
	breakActions: { flexDirection: "row", gap: 10, paddingBottom: 6 },
	entryTitle: { fontSize: 15, fontWeight: "600" },
	entryMeta: { fontSize: 13, lineHeight: 19 },
	pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
	footer: { fontSize: 12, textAlign: "center", paddingVertical: 8 },
	errorText: { fontSize: 14 },
});
