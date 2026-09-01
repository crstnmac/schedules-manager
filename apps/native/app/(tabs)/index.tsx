import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
	Badge,
	Body,
	Card,
	EmptyState,
	FeatureCard,
	Hint,
	NoticeRow,
	PageHeader,
	PrimaryButton,
	SecondaryButton,
	useAppTheme,
} from "@/components/ui";
import { ShiftDetailSheet, SwapsCard } from "@/components/worker-shifts";
import { useAuth } from "@/lib/auth";
import { positionColor } from "@/lib/position-color";
import {
	useAcknowledge,
	useClockIn,
	useClockOut,
	useCurrentEmployment,
	useMe,
	useMySchedule,
	usePublishedVersion,
	useRequestRelease,
	useRespondToAcceptance,
} from "@/lib/queries";
import {
	useShiftStartNotifications,
	useShiftStartResponseHandler,
} from "@/lib/shift-notifications";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

export default function TabOne() {
	const { isManager } = useCurrentEmployment();
	if (isManager) return <ManagerHome />;
	return <WorkerSchedule />;
}

import { Ionicons } from "@expo/vector-icons";
// ── Manager overview – operational truth, not marketing ────────────────
import { useManagerTimeOff, useManagerWorkers } from "@/lib/queries";

function ManagerHome() {
	const { theme } = useAppTheme();
	const { employment, workplaceId } = useCurrentEmployment();
	const workers = useManagerWorkers(workplaceId);
	const timeOff = useManagerTimeOff(workplaceId);

	const active =
		workers.data?.workers.filter(
			(w) => w.status === "active" && w.kind === "worker",
		).length ?? 0;
	const pendingInvites =
		workers.data?.invitations.filter((i) => i.status === "pending").length ?? 0;
	const pendingRequests =
		timeOff.data?.requests.filter((r) => r.status === "pending").length ?? 0;

	return (
		<AppScreen>
			<PageHeader
				eyebrow="Manager workspace"
				title={employment?.workplace.name ?? "Workplace"}
				description="Keep the Published Schedule current. Draft, review, publish on the web; clear requests here."
			/>
			<View style={s.metricGrid}>
				<View style={s.metricCell}>
					<Metric icon="people-outline" value={active} label="Active Workers" />
				</View>
				<View style={s.metricCell}>
					<Metric
						icon="mail-unread-outline"
						value={pendingInvites}
						label="Pending invites"
					/>
				</View>
				<View style={s.metricCell}>
					<Metric
						icon="calendar-outline"
						value={pendingRequests}
						label="Time-off Requests"
					/>
				</View>
			</View>
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>
					Draft on the web
				</Text>
				<Text style={[s.body, { color: theme.muted }]}>
					Building and publishing the week happens in the manager web Schedule
					grid. This mobile view is a calm read-only check: who is active, what
					needs a decision, and where the next Schedule Version stands.
				</Text>
			</Card>
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>What to do now</Text>
				<View style={{ gap: 6 }}>
					<Text style={[s.body, { color: theme.muted }]}>
						• Review pending Time-off Requests before you publish.
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						• Open Shifts with no Worker still need coverage.
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						• Acknowledgement ≠ Shift Acceptance — they are separate.
					</Text>
				</View>
			</Card>
		</AppScreen>
	);
}

function Metric({
	icon,
	value,
	label,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	value: number;
	label: string;
}) {
	const { theme } = useAppTheme();
	return (
		<Card>
			<View style={s.metricTop}>
				<Ionicons name={icon} size={18} color={theme.primary} />
				<Text style={[s.metricValue, { color: theme.text }]}>{value}</Text>
			</View>
			<Text style={[s.label, { color: theme.muted }]}>{label}</Text>
		</Card>
	);
}

// ── Worker schedule – priority stack ───────────────────────────────────
function WorkerSchedule() {
	const { theme } = useAppTheme();
	const { signOut } = useAuth();
	const me = useMe();
	const { selected, select } = useSelectedWorkplaceId();
	const queryClient = useQueryClient();

	const employments = me.data?.employments ?? [];
	const workplaceId =
		employments.find((e) => e.workplace.id === selected)?.workplace.id ??
		employments[0]?.workplace.id;

	const schedule = useMySchedule(workplaceId);
	const acknowledge = useAcknowledge();
	const respond = useRespondToAcceptance();
	const release = useRequestRelease();
	const clockIn = useClockIn();
	const clockOut = useClockOut();
	useShiftStartNotifications(workplaceId, schedule.data);
	useShiftStartResponseHandler();
	const [historyVersionId, setHistoryVersionId] = useState<string | null>(null);
	const historyVersion = usePublishedVersion(historyVersionId);
	const [detailShift, setDetailShift] = useState<WeekShiftType | null>(null);
	const [detailLocation, setDetailLocation] = useState<string | null>(null);

	useFocusEffect(() => {
		if (workplaceId)
			void queryClient.invalidateQueries({
				queryKey: ["my-schedule", workplaceId],
			});
	});

	const workplaceName =
		employments.find((e) => e.workplace.id === workplaceId)?.workplace.name ??
		"Workplace";

	const currentWeek = schedule.data?.currentWeek ?? null;
	const nextWeek = schedule.data?.nextWeek ?? null;
	const nextShift = schedule.data?.nextShift ?? null;
	const history = schedule.data?.history ?? [];
	const needsAcknowledgement =
		currentWeek !== null &&
		currentWeek.shifts.length > 0 &&
		currentWeek.deliveryStatus !== "acknowledged";
	const currentCount = currentWeek?.shifts.length ?? 0;
	const currentHours =
		(currentWeek?.shifts.reduce((sum, shift) => {
			const end = shift.overnight ? shift.endMinute + 1440 : shift.endMinute;
			return sum + end - shift.startMinute;
		}, 0) ?? 0) / 60;

	// Group this week's shifts by date for scannable day sections
	const shiftsByDay = new Map<
		string,
		NonNullable<typeof currentWeek>["shifts"]
	>();
	for (const sh of currentWeek?.shifts ?? []) {
		const arr = shiftsByDay.get(sh.date) ?? [];
		arr.push(sh);
		shiftsByDay.set(sh.date, arr);
	}

	const todayKey = new Date().toLocaleDateString("sv-SE");
	const todayShifts = shiftsByDay.get(todayKey) ?? [];

	return (
		<AppScreen>
			<PageHeader
				eyebrow={workplaceName}
				title="My schedule"
				description={
					me.data?.profile
						? (me.data.profile.fullName ?? me.data.profile.email)
						: undefined
				}
			/>

			{schedule.isLoading ? (
				<ActivityIndicator color={theme.primary} style={{ marginTop: 8 }} />
			) : null}

			{schedule.isError ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>
						We couldn’t load your schedule
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						{(schedule.error as Error).message}
					</Text>
					<SecondaryButton
						label="Try again"
						onPress={() => void schedule.refetch()}
					/>
				</Card>
			) : null}

			{/* 0. Today – calm state when nothing is scheduled today */}
			{!todayShifts.length ? (
				<Card>
					<View style={s.todayRow}>
						<View
							style={[s.todayDot, { backgroundColor: theme.border }]}
							aria-hidden
						/>
						<View style={{ flex: 1 }}>
							<Text style={[s.cardTitle, { color: theme.text }]}>
								Today · {formatDay(todayKey)}
							</Text>
							<Text style={[s.hint, { color: theme.muted }]}>
								No shift scheduled today.
							</Text>
						</View>
					</View>
				</Card>
			) : null}

			{/* 1. Next Shift + time clock – strongest block */}
			{nextShift ? (
				<FeatureCard>
					<Text style={[s.nextLabel, { color: theme.onPrimary }]}>
						{onClockLabel(nextShift, todayKey)}
					</Text>
					<Text style={[s.nextTitle, { color: theme.onPrimary }]}>
						{formatDay(nextShift.startsAt)}
					</Text>
					<Text style={[s.nextTime, { color: theme.onPrimary }]}>
						{formatMinute(nextShift.startMinute)}–
						{formatMinute(nextShift.endMinute)}
						{nextShift.overnight ? " +1" : ""} · {nextShift.positionName}
					</Text>
					<TimeClockControls
						shift={nextShift}
						clockIn={clockIn}
						clockOut={clockOut}
					/>
				</FeatureCard>
			) : null}

			{/* 1b. Swap requests – worker-to-worker exchange */}
			<SwapsCard workplaceId={workplaceId} />

			{/* 2. Material Schedule Change – requires Shift Acceptance */}
			{schedule.data && schedule.data.pendingAcceptances.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>
						Accept this change
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						Late Material Schedule Change — accepting means you agree to work
						the shift. “I saw this” only confirms delivery.
					</Text>
					{schedule.data.pendingAcceptances.map((a) => (
						<View
							key={a.id}
							style={[s.acceptanceCard, { borderColor: theme.border }]}
						>
							<Text style={[s.acceptanceMeta, { color: theme.text }]}>
								{formatDay(a.date)} · {formatMinute(a.startMinute)} ·{" "}
								{a.positionName}
							</Text>
							<Text style={[s.hint, { color: theme.muted }]}>
								{a.changeSummary}
							</Text>
							<View style={s.buttonRow}>
								<View style={{ flex: 1 }}>
									<PrimaryButton
										label="Accept shift"
										disabled={respond.isPending}
										onPress={() =>
											respond.mutate({ acceptanceId: a.id, decision: "accept" })
										}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<SecondaryButton
										label="Decline"
										disabled={respond.isPending}
										onPress={() =>
											respond.mutate({
												acceptanceId: a.id,
												decision: "decline",
											})
										}
									/>
								</View>
							</View>
						</View>
					))}
					{respond.isError ? (
						<Text style={[s.error, { color: theme.notification }]}>
							{(respond.error as Error).message}
						</Text>
					) : null}
				</Card>
			) : null}

			{/* 3. Schedule Change summary */}
			{schedule.data && schedule.data.currentChanges.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>
						What changed this week
					</Text>
					{schedule.data.currentChanges.map((c) => (
						<Text key={c} style={[s.body, { color: theme.muted }]}>
							• {c}
						</Text>
					))}
				</Card>
			) : null}

			{/* 4. Acknowledgement – distinct from acceptance */}
			{needsAcknowledgement && currentWeek ? (
				<NoticeRow>
					<View style={{ flex: 1, gap: 4 }}>
						<Text style={[s.noticeTitle, { color: theme.text }]}>
							Schedule published
						</Text>
						<Text style={[s.hint, { color: theme.muted }]}>
							Let your manager know you saw it.
						</Text>
					</View>
					<PrimaryButton
						label="I saw this"
						loading={acknowledge.isPending}
						onPress={() => acknowledge.mutate(currentWeek.version.id)}
						style={{ minWidth: 110 }}
					/>
				</NoticeRow>
			) : null}
			{acknowledge.isError ? (
				<Text style={[s.error, { color: theme.notification }]}>
					{(acknowledge.error as Error).message}
				</Text>
			) : null}

			{/* 5. This week – Daily Roster */}
			{currentWeek && currentWeek.shifts.length > 0 ? (
				<Card>
					<View style={s.sectionHeader}>
						<View>
							<Text style={[s.cardTitle, { color: theme.text }]}>
								This week
							</Text>
							<Text style={[s.hint, { color: theme.muted }]}>
								Week of {formatDay(currentWeek.weekStart)}
							</Text>
						</View>
						<Text style={[s.weekSummary, { color: theme.text }]}>
							{currentCount} shift{currentCount === 1 ? "" : "s"} ·{" "}
							{currentHours.toFixed(1)}h
						</Text>
					</View>
					{[...shiftsByDay.entries()].map(([date, shifts]) => {
						const isToday = date === todayKey;
						return (
							<View key={date} style={s.dayGroup}>
								<View style={s.dayHeaderRow}>
									<Text
										style={[
											s.dayLabel,
											isToday && s.dayLabelToday,
											{ color: isToday ? theme.primary : theme.muted },
										]}
									>
										{formatDay(date)}
									</Text>
									{isToday ? (
										<View
											style={[s.todayBadge, { backgroundColor: theme.primary }]}
										>
											<Text
												style={[s.todayBadgeText, { color: theme.onPrimary }]}
											>
												TODAY
											</Text>
										</View>
									) : null}
								</View>
								{shifts.map((shift) => {
									const past = new Date(shift.endsAt).getTime() < Date.now();
									const entry = shift.timeEntry;
									const accent = positionColor(shift.positionName);
									return (
										<Pressable
											key={shift.id}
											accessibilityRole="button"
											accessibilityLabel={`Open details for ${shift.positionName} shift`}
											onPress={() => {
												setDetailShift(shift);
												setDetailLocation(currentWeek?.locationName ?? null);
											}}
											style={[
												s.shiftRow,
												{
													borderColor: theme.border,
													backgroundColor: theme.background,
													opacity: past && !entry ? 0.55 : 1,
													overflow: "hidden",
												},
											]}
										>
											<View
												style={[s.shiftAccentBar, { backgroundColor: accent }]}
												aria-hidden
											/>
											<View style={{ flex: 1, gap: 2, paddingLeft: 8 }}>
												<Text style={[s.shiftTime, { color: theme.text }]}>
													{formatRange(
														shift.startMinute,
														shift.endMinute,
														shift.overnight,
													)}
												</Text>
												<View style={s.shiftMetaRow}>
													<View
														style={[s.positionDot, { backgroundColor: accent }]}
													/>
													<Text style={[s.shiftMeta, { color: theme.muted }]}>
														{shift.positionName}
														{shift.note ? ` · ${shift.note}` : ""}
													</Text>
												</View>
											</View>
											<View style={s.shiftSideColumn}>
												{entry && entry.clockedOutAt === null ? (
													<Text style={[s.punchChip, { color: theme.primary }]}>
														On clock
													</Text>
												) : null}
												{entry && entry.clockedOutAt !== null ? (
													<Text style={[s.punchChip, { color: theme.success }]}>
														Worked{" "}
														{formatDuration(
															new Date(entry.clockedOutAt ?? "").getTime() -
																new Date(entry.clockedInAt).getTime(),
														)}
													</Text>
												) : null}
												{shift.releaseStatus === "pending" ? (
													<Text
														style={[s.punchChip, { color: theme.notification }]}
													>
														Release pending
													</Text>
												) : null}
												{!past && shift.releaseStatus === null && !entry ? (
													<Text style={[s.releaseText, { color: theme.muted }]}>
														Tap for options
													</Text>
												) : null}
											</View>
										</Pressable>
									);
								})}
							</View>
						);
					})}
					<Text style={[s.hint, { color: theme.muted }]}>
						You remain responsible for a released Shift until a Manager approves
						the hand-off.
					</Text>
					{release.isError ? (
						<Text style={[s.error, { color: theme.notification }]}>
							{(release.error as Error).message}
						</Text>
					) : null}
					{release.isSuccess ? (
						<Text style={[s.releaseText, { color: theme.success }]}>
							Release requested — your Manager will review it.
						</Text>
					) : null}
				</Card>
			) : null}

			{/* 6. Next week (future context) */}
			{nextWeek && nextWeek.shifts.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>Next week</Text>
					<Text style={[s.hint, { color: theme.muted }]}>
						Week of {formatDay(nextWeek.weekStart)}
					</Text>
					{nextWeek.shifts.map((sh) => {
						const accent = positionColor(sh.positionName);
						return (
							<View
								key={sh.id}
								style={[
									s.shiftRow,
									{
										borderColor: theme.border,
										backgroundColor: theme.background,
										overflow: "hidden",
									},
								]}
							>
								<View
									style={[s.shiftAccentBar, { backgroundColor: accent }]}
									aria-hidden
								/>
								<View style={{ flex: 1, gap: 2, paddingLeft: 8 }}>
									<Text style={[s.shiftTime, { color: theme.text }]}>
										{formatDay(sh.startsAt)} ·{" "}
										{formatRange(sh.startMinute, sh.endMinute, sh.overnight)}
									</Text>
									<View style={s.shiftMetaRow}>
										<View
											style={[s.positionDot, { backgroundColor: accent }]}
										/>
										<Text style={[s.shiftMeta, { color: theme.muted }]}>
											{sh.positionName}
										</Text>
									</View>
								</View>
							</View>
						);
					})}
				</Card>
			) : null}

			{/* 7. History – lowest priority */}
			{history.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>
						Earlier Published Schedules
					</Text>
					<Text style={[s.hint, { color: theme.muted }]}>
						Opening a past Schedule Version does not mark it as acknowledged.
					</Text>
					{history.map((entry) => (
						<Pressable
							key={entry.versionId}
							accessibilityRole="button"
							accessibilityState={{
								expanded: historyVersionId === entry.versionId,
							}}
							onPress={() =>
								setHistoryVersionId((c) =>
									c === entry.versionId ? null : entry.versionId,
								)
							}
							style={{ minHeight: 44, justifyContent: "center" }}
						>
							<Text style={[s.shiftTime, { color: theme.primary }]}>
								Week of {formatDay(entry.weekStart)} · v{entry.versionNumber}
							</Text>
						</Pressable>
					))}
					{historyVersion.isLoading ? (
						<ActivityIndicator color={theme.primary} />
					) : null}
					{historyVersion.data
						? historyVersion.data.shifts.map((sh) => (
								<Text key={sh.id} style={[s.shiftMeta, { color: theme.muted }]}>
									{formatDay(sh.startsAt)} · {formatMinute(sh.startMinute)}–
									{sh.endMinute === 0 ? "12:00 AM" : formatMinute(sh.endMinute)}{" "}
									· {sh.positionName}
								</Text>
							))
						: null}
					{historyVersion.data && historyVersion.data.shifts.length === 0 ? (
						<Text style={[s.hint, { color: theme.muted }]}>
							You had no Shifts on this Published Schedule.
						</Text>
					) : null}
				</Card>
			) : null}

			{!schedule.isLoading && !schedule.isError && !currentWeek ? (
				<EmptyState
					title="No Published Schedule yet"
					body="When your Manager publishes the Schedule for the week, your Shifts will appear here."
				/>
			) : null}

			{employments.length > 1 ? (
				<SecondaryButton
					label="Switch Workplace"
					onPress={() => select(null)}
				/>
			) : null}

			<SecondaryButton label="Sign out" onPress={() => void signOut()} />

			<ShiftDetailSheet
				shift={detailShift}
				workplaceId={workplaceId}
				locationName={detailLocation}
				onClose={() => setDetailShift(null)}
			/>
		</AppScreen>
	);
}

function formatDay(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

function onClockLabel(shift: NextShift, todayKey: string): string {
	const entry = shift.timeEntry;
	if (entry && entry.clockedOutAt === null) return "You're on the clock";
	if (shift.date === todayKey) return "Today's shift";
	return "Next shift";
}

function formatRange(start: number, end: number, overnight: boolean): string {
	return `${formatMinute(start)}–${end === 0 ? "12:00 AM" : formatMinute(end)}${overnight ? " +1" : ""}`;
}
const CLOCK_IN_EARLY_MS = 15 * 60 * 1000;

type NextShift = NonNullable<
	NonNullable<ReturnType<typeof useMySchedule>["data"]>["nextShift"]
>;

type WeekShiftType = NonNullable<
	NonNullable<
		NonNullable<ReturnType<typeof useMySchedule>["data"]>["currentWeek"]
	>["shifts"]
>[number];

function TimeClockControls({
	shift,
	clockIn,
	clockOut,
}: {
	shift: NextShift;
	clockIn: ReturnType<typeof useClockIn>;
	clockOut: ReturnType<typeof useClockOut>;
}) {
	const { theme } = useAppTheme();
	const router = useRouter();
	const [nowMs, setNowMs] = useState(() => Date.now());
	const entry = shift.timeEntry;
	const onShift = entry !== null && entry.clockedOutAt === null;

	useEffect(() => {
		if (!onShift) return;
		const timer = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [onShift]);

	const startsAt = new Date(shift.startsAt).getTime();
	const endsAt = new Date(shift.endsAt).getTime();
	const worked = entry !== null && entry.clockedOutAt !== null;
	const canStart =
		entry === null && nowMs >= startsAt - CLOCK_IN_EARLY_MS && nowMs <= endsAt;

	function confirmClockIn() {
		Alert.alert(
			"Clock in?",
			`${shift.positionName} · ${formatMinute(shift.startMinute)}–${formatMinute(
				shift.endMinute,
			)}\nStart work at ${formatClock(new Date().toISOString())}?`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clock in",
					onPress: () => clockIn.mutate(shift.id),
				},
			],
		);
	}

	function confirmClockOut() {
		if (!entry) return;
		const elapsed = formatDuration(
			Date.now() - new Date(entry.clockedInAt).getTime(),
		);
		Alert.alert(
			"Clock out?",
			`You've been on the clock for ${elapsed}. This ends your Time Entry for this shift.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clock out",
					style: "destructive",
					onPress: () => clockOut.mutate(shift.id),
				},
			],
		);
	}

	return (
		<View style={{ marginTop: 12, gap: 8 }}>
			{worked && entry ? (
				<Text style={[s.hint, { color: theme.onPrimary }]}>
					Last punch · In {formatClock(entry.clockedInAt)} · Out{" "}
					{formatClock(entry.clockedOutAt ?? undefined)} ·{" "}
					{formatDuration(
						new Date(entry.clockedOutAt ?? "").getTime() -
							new Date(entry.clockedInAt).getTime(),
					)}
				</Text>
			) : null}

			{onShift && entry ? (
				<>
					<Text
						style={[s.clockLabel, { color: theme.onPrimary }]}
						accessibilityLiveRegion="polite"
					>
						ON THE CLOCK ·{" "}
						{formatTimer(nowMs - new Date(entry.clockedInAt).getTime())}
					</Text>
					<Text style={[s.hint, { color: theme.onPrimary }]}>
						Clocked in at {formatClock(entry.clockedInAt)}
					</Text>
					<SecondaryButton
						label={clockOut.isPending ? "Clocking out…" : "Clock out"}
						disabled={clockOut.isPending}
						onPress={confirmClockOut}
						style={{
							borderColor: theme.onPrimary,
							backgroundColor: "transparent",
						}}
						textStyle={{ color: theme.onPrimary }}
					/>
				</>
			) : null}

			{canStart ? (
				<>
					<PrimaryButton
						label={clockIn.isPending ? "Clocking in…" : "Clock in"}
						disabled={clockIn.isPending}
						onPress={confirmClockIn}
						style={{ backgroundColor: theme.onPrimary }}
						textStyle={{ color: theme.primary }}
					/>
					{clockIn.isError ? (
						<Text style={[s.hint, { color: theme.onPrimary }]}>
							{(clockIn.error as Error).message}
						</Text>
					) : null}
				</>
			) : null}

			{!canStart && entry === null ? (
				<Text style={[s.hint, { color: theme.onPrimary }]}>
					Clock-in opens at{" "}
					{formatClock(new Date(startsAt - CLOCK_IN_EARLY_MS).toISOString())} —
					15 minutes before your shift.
				</Text>
			) : null}

			{clockOut.isError ? (
				<Text style={[s.hint, { color: theme.onPrimary }]}>
					{(clockOut.error as Error).message}
				</Text>
			) : null}

			<Pressable
				accessibilityRole="link"
				onPress={() => router.push("/timecard")}
				style={({ pressed }) => [
					s.timecardLink,
					{ opacity: pressed ? 0.7 : 1 },
				]}
			>
				<Text style={[s.timecardLinkText, { color: theme.onPrimary }]}>
					My timecard →
				</Text>
			</Pressable>
		</View>
	);
}

function formatClock(iso?: string): string {
	if (!iso) return "";
	return new Date(iso).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatDuration(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / 60000));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

function formatTimer(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const sec = totalSeconds % 60;
	return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function formatMinute(minute: number): string {
	const h = Math.floor(minute / 60);
	const m = minute % 60;
	const suffix = h >= 12 ? "PM" : "AM";
	const display = h % 12 === 0 ? 12 : h % 12;
	return `${display}:${String(m).padStart(2, "0")} ${suffix}`;
}

const s = StyleSheet.create({
	cardTitle: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
	body: { fontSize: 14, lineHeight: 21 },
	hint: { fontSize: 13, lineHeight: 19 },
	label: {
		fontSize: 11,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	metricCell: { width: "48%", flexGrow: 1 },
	metricTop: { flexDirection: "row", alignItems: "center", gap: 8 },
	metricValue: {
		fontSize: 24,
		fontWeight: "800",
		fontVariant: ["tabular-nums"],
	},
	nextLabel: {
		fontSize: 13,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.6,
		opacity: 0.9,
		marginBottom: 4,
	},
	nextTitle: {
		fontSize: 26,
		lineHeight: 30,
		fontWeight: "800",
		letterSpacing: -0.4,
	},
	nextTime: {
		fontSize: 16,
		lineHeight: 22,
		fontWeight: "600",
		fontVariant: ["tabular-nums"],
	},
	acceptanceCard: {
		borderWidth: 1,
		borderRadius: 12,
		padding: 12,
		gap: 8,
		marginTop: 8,
	},
	acceptanceMeta: {
		fontSize: 15,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	buttonRow: { flexDirection: "row", gap: 8, marginTop: 4 },
	noticeTitle: { fontSize: 15, fontWeight: "700" },
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		gap: 12,
	},
	weekSummary: {
		fontSize: 13,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	dayGroup: { gap: 8, marginTop: 4 },
	dayLabel: {
		fontSize: 12,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	shiftRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderWidth: 1,
		borderRadius: 10,
		padding: 12,
	},
	shiftTime: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
	shiftMeta: { fontSize: 13 },
	releaseText: { fontSize: 13, fontWeight: "700" },
	clockLabel: { fontSize: 13, fontWeight: "800", letterSpacing: 1.2 },
	timecardLink: { minHeight: 44, justifyContent: "center", marginTop: 2 },
	timecardLinkText: { fontSize: 14, fontWeight: "700" },
	todayRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	todayDot: { width: 10, height: 10, borderRadius: 5 },
	dayHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 6,
	},
	dayLabelToday: { fontWeight: "800" },
	todayBadge: {
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 2,
	},
	todayBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
	shiftAccentBar: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		width: 4,
	},
	shiftMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	positionDot: { width: 7, height: 7, borderRadius: 4 },
	shiftSideColumn: { alignItems: "flex-end", justifyContent: "center" },
	punchChip: { fontSize: 12, fontWeight: "700" },
	error: { fontSize: 13, marginTop: 4 },
});
