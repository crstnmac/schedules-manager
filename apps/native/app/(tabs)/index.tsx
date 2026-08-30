import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
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
import { useAuth } from "@/lib/auth";
import {
	useAcknowledge,
	useCurrentEmployment,
	useMe,
	useMySchedule,
	usePublishedVersion,
	useRequestRelease,
	useRespondToAcceptance,
} from "@/lib/queries";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

export default function TabOne() {
	const { isManager } = useCurrentEmployment();
	if (isManager) return <ManagerHome />;
	return <WorkerSchedule />;
}

// ── Manager overview – operational truth, not marketing ────────────────
import { useManagerTimeOff, useManagerWorkers } from "@/lib/queries";
import { Ionicons } from "@expo/vector-icons";

function ManagerHome() {
	const { theme } = useAppTheme();
	const { employment, workplaceId } = useCurrentEmployment();
	const workers = useManagerWorkers(workplaceId);
	const timeOff = useManagerTimeOff(workplaceId);

	const active =
		workers.data?.workers.filter((w) => w.status === "active" && w.kind === "worker").length ?? 0;
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
					<Metric icon="mail-unread-outline" value={pendingInvites} label="Pending invites" />
				</View>
				<View style={s.metricCell}>
					<Metric icon="calendar-outline" value={pendingRequests} label="Time-off Requests" />
				</View>
			</View>
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>Draft on the web</Text>
				<Text style={[s.body, { color: theme.muted }]}>
					Building and publishing the week happens in the manager web Schedule grid. This mobile
					view is a calm read-only check: who is active, what needs a decision, and where the
					next Schedule Version stands.
				</Text>
			</Card>
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>What to do now</Text>
				<View style={{ gap: 6 }}>
					<Text style={[s.body, { color: theme.muted }]}>• Review pending Time-off Requests before you publish.</Text>
					<Text style={[s.body, { color: theme.muted }]}>• Open Shifts with no Worker still need coverage.</Text>
					<Text style={[s.body, { color: theme.muted }]}>• Acknowledgement ≠ Shift Acceptance — they are separate.</Text>
				</View>
			</Card>
		</AppScreen>
	);
}

function Metric({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
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
		employments.find((e) => e.workplace.id === selected)?.workplace.id ?? employments[0]?.workplace.id;

	const schedule = useMySchedule(workplaceId);
	const acknowledge = useAcknowledge();
	const respond = useRespondToAcceptance();
	const release = useRequestRelease();
	const [historyVersionId, setHistoryVersionId] = useState<string | null>(null);
	const historyVersion = usePublishedVersion(historyVersionId);

	useFocusEffect(() => {
		if (workplaceId) void queryClient.invalidateQueries({ queryKey: ["my-schedule", workplaceId] });
	});

	const workplaceName =
		employments.find((e) => e.workplace.id === workplaceId)?.workplace.name ?? "Workplace";

	const currentWeek = schedule.data?.currentWeek ?? null;
	const nextWeek = schedule.data?.nextWeek ?? null;
	const nextShift = schedule.data?.nextShift ?? null;
	const history = schedule.data?.history ?? [];
	const needsAcknowledgement =
		currentWeek !== null && currentWeek.shifts.length > 0 && currentWeek.deliveryStatus !== "acknowledged";
	const currentCount = currentWeek?.shifts.length ?? 0;
	const currentHours =
		(currentWeek?.shifts.reduce((sum, shift) => {
			const end = shift.overnight ? shift.endMinute + 1440 : shift.endMinute;
			return sum + end - shift.startMinute;
		}, 0) ?? 0) / 60;

	// Group this week's shifts by date for scannable day sections
	const shiftsByDay = new Map<string, NonNullable<typeof currentWeek>["shifts"]>();
	for (const sh of currentWeek?.shifts ?? []) {
		const arr = shiftsByDay.get(sh.date) ?? [];
		arr.push(sh);
		shiftsByDay.set(sh.date, arr);
	}

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

			{schedule.isLoading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 8 }} /> : null}

			{schedule.isError ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>We couldn’t load your schedule</Text>
					<Text style={[s.body, { color: theme.muted }]}>{(schedule.error as Error).message}</Text>
					<SecondaryButton label="Try again" onPress={() => void schedule.refetch()} />
				</Card>
			) : null}

			{/* 1. Next Shift – strongest block */}
			{nextShift ? (
				<FeatureCard>
					<Text style={[s.nextLabel, { color: theme.onPrimary }]}>Next shift</Text>
					<Text style={[s.nextTitle, { color: theme.onPrimary }]}>{formatDay(nextShift.startsAt)}</Text>
					<Text style={[s.nextTime, { color: theme.onPrimary }]}> 
						{formatMinute(nextShift.startMinute)}–{formatMinute(nextShift.endMinute)}
						{nextShift.overnight ? " +1" : ""} · {nextShift.positionName}
					</Text>
				</FeatureCard>
			) : null}

			{/* 2. Material Schedule Change – requires Shift Acceptance */}
			{schedule.data && schedule.data.pendingAcceptances.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>Accept this change</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						Late Material Schedule Change — accepting means you agree to work the shift. “I saw
						this” only confirms delivery.
					</Text>
					{schedule.data.pendingAcceptances.map((a) => (
						<View key={a.id} style={[s.acceptanceCard, { borderColor: theme.border }]}>
							<Text style={[s.acceptanceMeta, { color: theme.text }]}>
								{formatDay(a.date)} · {formatMinute(a.startMinute)} · {a.positionName}
							</Text>
							<Text style={[s.hint, { color: theme.muted }]}>{a.changeSummary}</Text>
							<View style={s.buttonRow}>
								<View style={{ flex: 1 }}>
									<PrimaryButton
										label="Accept shift"
										disabled={respond.isPending}
										onPress={() => respond.mutate({ acceptanceId: a.id, decision: "accept" })}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<SecondaryButton
										label="Decline"
										disabled={respond.isPending}
										onPress={() => respond.mutate({ acceptanceId: a.id, decision: "decline" })}
									/>
								</View>
							</View>
						</View>
					))}
					{respond.isError ? <Text style={[s.error, { color: theme.notification }]}>{(respond.error as Error).message}</Text> : null}
				</Card>
			) : null}

			{/* 3. Schedule Change summary */}
			{schedule.data && schedule.data.currentChanges.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>What changed this week</Text>
					{schedule.data.currentChanges.map((c) => (
						<Text key={c} style={[s.body, { color: theme.muted }]}>• {c}</Text>
					))}
				</Card>
			) : null}

			{/* 4. Acknowledgement – distinct from acceptance */}
			{needsAcknowledgement && currentWeek ? (
				<NoticeRow>
					<View style={{ flex: 1, gap: 4 }}>
						<Text style={[s.noticeTitle, { color: theme.text }]}>Schedule published</Text>
						<Text style={[s.hint, { color: theme.muted }]}>Let your manager know you saw it.</Text>
					</View>
					<PrimaryButton
						label="I saw this"
						loading={acknowledge.isPending}
						onPress={() => acknowledge.mutate(currentWeek.version.id)}
						style={{ minWidth: 110 }}
					/>
				</NoticeRow>
			) : null}
			{acknowledge.isError ? <Text style={[s.error, { color: theme.notification }]}>{(acknowledge.error as Error).message}</Text> : null}

			{/* 5. This week – Daily Roster */}
			{currentWeek && currentWeek.shifts.length > 0 ? (
				<Card>
					<View style={s.sectionHeader}>
						<View>
							<Text style={[s.cardTitle, { color: theme.text }]}>This week</Text>
							<Text style={[s.hint, { color: theme.muted }]}>Week of {formatDay(currentWeek.weekStart)}</Text>
						</View>
						<Text style={[s.weekSummary, { color: theme.text }]}>
							{currentCount} shift{currentCount === 1 ? "" : "s"} · {currentHours.toFixed(1)}h
						</Text>
					</View>
					{[...shiftsByDay.entries()].map(([date, shifts]) => (
						<View key={date} style={s.dayGroup}>
							<Text style={[s.dayLabel, { color: theme.muted }]}>{formatDay(date)}</Text>
							{shifts.map((shift) => (
								<View key={shift.id} style={[s.shiftRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
									<View style={{ flex: 1, gap: 2 }}>
										<Text style={[s.shiftTime, { color: theme.text }]}>
											{formatMinute(shift.startMinute)}–{shift.endMinute === 0 ? "12:00 AM" : formatMinute(shift.endMinute)}
											{shift.overnight ? " +1" : ""}
										</Text>
										<Text style={[s.shiftMeta, { color: theme.muted }]}>
											{shift.positionName}
											{shift.note ? ` · ${shift.note}` : ""}
										</Text>
									</View>
									<Pressable
										accessibilityRole="button"
										hitSlop={8}
										disabled={release.isPending}
										onPress={() => release.mutate(shift.id)}
										style={{ minHeight: 44, justifyContent: "center" }}
									>
										<Text style={[s.releaseText, { color: theme.primary }]}>Request release</Text>
									</Pressable>
								</View>
							))}
						</View>
					))}
					<Text style={[s.hint, { color: theme.muted }]}>
						You remain responsible for a released Shift until a Manager approves the hand-off.
					</Text>
					{release.isError ? <Text style={[s.error, { color: theme.notification }]}>{(release.error as Error).message}</Text> : null}
					{release.isSuccess ? <Text style={[s.releaseText, { color: theme.success }]}>Release requested — your Manager will review it.</Text> : null}
				</Card>
			) : null}

			{/* 6. Next week (future context) */}
			{nextWeek && nextWeek.shifts.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>Next week</Text>
					<Text style={[s.hint, { color: theme.muted }]}>Week of {formatDay(nextWeek.weekStart)}</Text>
					{nextWeek.shifts.map((sh) => (
						<Text key={sh.id} style={[s.shiftTime, { color: theme.text }]}>
							{formatDay(sh.startsAt)} · {formatMinute(sh.startMinute)}–{sh.endMinute === 0 ? "12:00 AM" : formatMinute(sh.endMinute)} · {sh.positionName}
						</Text>
					))}
				</Card>
			) : null}

			{/* 7. History – lowest priority */}
			{history.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>Earlier Published Schedules</Text>
					<Text style={[s.hint, { color: theme.muted }]}>Opening a past Schedule Version does not mark it as acknowledged.</Text>
					{history.map((entry) => (
						<Pressable
							key={entry.versionId}
							accessibilityRole="button"
							accessibilityState={{ expanded: historyVersionId === entry.versionId }}
							onPress={() => setHistoryVersionId((c) => (c === entry.versionId ? null : entry.versionId))}
							style={{ minHeight: 44, justifyContent: "center" }}
						>
							<Text style={[s.shiftTime, { color: theme.primary }]}>
								Week of {formatDay(entry.weekStart)} · v{entry.versionNumber}
							</Text>
						</Pressable>
					))}
					{historyVersion.isLoading ? <ActivityIndicator color={theme.primary} /> : null}
					{historyVersion.data
						? historyVersion.data.shifts.map((sh) => (
								<Text key={sh.id} style={[s.shiftMeta, { color: theme.muted }]}>
									{formatDay(sh.startsAt)} · {formatMinute(sh.startMinute)}–{sh.endMinute === 0 ? "12:00 AM" : formatMinute(sh.endMinute)} · {sh.positionName}
								</Text>
							))
						: null}
					{historyVersion.data && historyVersion.data.shifts.length === 0 ? (
						<Text style={[s.hint, { color: theme.muted }]}>You had no Shifts on this Published Schedule.</Text>
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
				<SecondaryButton label="Switch Workplace" onPress={() => select(null)} />
			) : null}

			<SecondaryButton label="Sign out" onPress={() => void signOut()} />
		</AppScreen>
	);
}

function formatDay(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
	label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
	metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	metricCell: { width: "48%", flexGrow: 1 },
	metricTop: { flexDirection: "row", alignItems: "center", gap: 8 },
	metricValue: { fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
	nextLabel: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.9, marginBottom: 4 },
	nextTitle: { fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.4 },
	nextTime: { fontSize: 16, lineHeight: 22, fontWeight: "600", fontVariant: ["tabular-nums"] },
	acceptanceCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, marginTop: 8 },
	acceptanceMeta: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
	buttonRow: { flexDirection: "row", gap: 8, marginTop: 4 },
	noticeTitle: { fontSize: 15, fontWeight: "700" },
	sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
	weekSummary: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
	dayGroup: { gap: 8, marginTop: 4 },
	dayLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
	shiftRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 10, padding: 12 },
	shiftTime: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
	shiftMeta: { fontSize: 13 },
	releaseText: { fontSize: 13, fontWeight: "700" },
	error: { fontSize: 13, marginTop: 4 },
});
