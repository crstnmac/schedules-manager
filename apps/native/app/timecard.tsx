import { Alert, View } from "react-native";

import {
	Appear,
	AppText,
	Badge,
	Button,
	Card,
	CardListSkeleton,
	Divider,
	EmptyState,
	ErrorState,
	Screen,
	Section,
	Skeleton,
} from "@/components/ui";
import { useDisplayPrefs } from "@/lib/display";
import { positionColor } from "@/lib/position-color";
import {
	type PayPeriodInfo,
	useCurrentEmployment,
	useEndBreak,
	useMyTimeEntries,
	usePayPeriod,
	useStartBreak,
} from "@/lib/queries";
import { spacing } from "@/theme";

export default function TimecardScreen() {
	const { formatClockTime } = useDisplayPrefs();
	const { workplaceId } = useCurrentEmployment();
	const timecard = useMyTimeEntries(workplaceId);
	const payPeriod = usePayPeriod(workplaceId);
	const startBreak = useStartBreak();
	const endBreak = useEndBreak();

	const entries = timecard.data?.timeEntries ?? [];
	const groups = groupByDay(entries);
	const weekStartDay = payPeriod.data?.weekStartDay ?? 1;
	const week = currentWeekTotals(entries, weekStartDay);
	const lastWeek = weekTotals(entries, -1, weekStartDay);
	const period = payPeriod.data;
	const shortDate = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});

	return (
		<Screen
			onRefresh={() => Promise.all([timecard.refetch(), payPeriod.refetch()])}
		>
			{timecard.isError ? (
				<ErrorState
					error={timecard.error}
					onRetry={() => void timecard.refetch()}
				/>
			) : null}

			<Appear>
				<Card style={{ gap: spacing.lg }}>
					<View style={{ gap: spacing.xxs }}>
						<AppText variant="overline" tone="secondary">
							This week · from {shortDate(week.startsAt)}
						</AppText>
						{timecard.isLoading ? (
							<Skeleton width={140} height={40} />
						) : (
							<AppText variant="display">{formatHours(week.totalMs)}</AppText>
						)}
					</View>
					<Divider />
					<View style={{ flexDirection: "row" }}>
						<Stat label="Last week" value={formatHours(lastWeek.totalMs)} />
						{period ? (
							<Stat
								label={`${PERIOD_LABEL[period.type]} · ${shortDate(period.startsAt)}–${shortDate(period.endsAt)}`}
								value={formatHours(period.periodTotalMs)}
							/>
						) : null}
					</View>
				</Card>
			</Appear>

			{timecard.isLoading ? <CardListSkeleton count={2} /> : null}

			{entries.length === 0 && !timecard.isLoading && !timecard.isError ? (
				<EmptyState
					icon="stopwatch"
					tone="success"
					title="No punches yet"
					body="Clock in from Today when your shift starts — your punches will show up here."
				/>
			) : null}

			{groups.map((group, groupIndex) => (
				<Appear key={group.dateKey} index={groupIndex + 1}>
					<Section
						title={group.dayLabel}
						action={
							<AppText variant="callout" weight="600" tone="secondary" tabular>
								{formatHours(group.totalMs)}
							</AppText>
						}
					>
						<Card padded={false} style={{ gap: 0 }}>
							{group.entries.map((entry, index) => {
								const open = entry.clockedOutAt === null;
								const durationMs =
									(open
										? Date.now()
										: new Date(entry.clockedOutAt ?? "").getTime()) -
									new Date(entry.clockedInAt).getTime();
								return (
									<View key={entry.id}>
										{index > 0 ? <Divider inset={spacing.lg} /> : null}
										<View style={{ padding: spacing.lg, gap: spacing.md }}>
											<View
												style={{
													flexDirection: "row",
													alignItems: "center",
													gap: spacing.md,
												}}
											>
												<View
													style={{
														width: 4,
														alignSelf: "stretch",
														borderRadius: 2,
														backgroundColor: positionColor(entry.positionName),
													}}
												/>
												<View style={{ flex: 1, gap: 2 }}>
													<AppText variant="headline">
														{entry.positionName}
													</AppText>
													<AppText variant="footnote" tone="secondary" tabular>
														{formatClockTime(entry.clockedInAt, entry.timezone)}{" "}
														–{" "}
														{open
															? "now"
															: formatClockTime(
																	entry.clockedOutAt ?? undefined,
																	entry.timezone,
																)}
													</AppText>
												</View>
												{open ? (
													<Badge label="On the clock" tone="primary" dot />
												) : (
													<AppText variant="callout" weight="600" tabular>
														{formatHours(durationMs)}
													</AppText>
												)}
											</View>
											{open ? (
												<View style={{ flexDirection: "row", gap: spacing.sm }}>
													<Button
														label="Start break"
														icon="cup"
														variant="tinted"
														loading={startBreak.isPending}
														disabled={endBreak.isPending}
														onPress={() =>
															startBreak.mutate(entry.id, {
																onError: (error) =>
																	Alert.alert(
																		"Could not start break",
																		(error as Error).message,
																	),
															})
														}
														style={{ flex: 1 }}
													/>
													<Button
														label="End break"
														icon="play"
														variant="secondary"
														loading={endBreak.isPending}
														disabled={startBreak.isPending}
														onPress={() =>
															endBreak.mutate(entry.id, {
																onError: (error) =>
																	Alert.alert(
																		"Could not end break",
																		(error as Error).message,
																	),
															})
														}
														style={{ flex: 1 }}
													/>
												</View>
											) : null}
										</View>
									</View>
								);
							})}
						</Card>
					</Section>
				</Appear>
			))}

			{entries.length > 0 ? (
				<AppText variant="caption" tone="tertiary" align="center">
					Showing your last {entries.length} punches
				</AppText>
			) : null}
		</Screen>
	);
}

const PERIOD_LABEL: Record<PayPeriodInfo["type"], string> = {
	weekly: "Pay week",
	biweekly: "Pay period",
	semimonthly: "Pay period",
	monthly: "Pay month",
};

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<View style={{ flex: 1, gap: 2 }}>
			<AppText variant="title3" tabular>
				{value}
			</AppText>
			<AppText variant="caption" tone="secondary" numberOfLines={2}>
				{label}
			</AppText>
		</View>
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
	/** The shift's Location zone. */
	timezone?: string;
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
