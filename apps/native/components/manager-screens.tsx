import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen, Badge, Card, Hint, PageHeader, PrimaryButton, SecondaryButton, useAppTheme } from "@/components/ui";
import { api } from "@/lib/api";
import { useCurrentEmployment, useManagerTimeOff, useManagerWorkers } from "@/lib/queries";

// ── Shared metric ───────────────────────────────────────────────────────
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

// ── Overview ─────────────────────────────────────────────────────────────
export function ManagerOverview() {
	const { theme } = useAppTheme();
	const { employment, workplaceId } = useCurrentEmployment();
	const workers = useManagerWorkers(workplaceId);
	const timeOff = useManagerTimeOff(workplaceId);

	const active = workers.data?.workers.filter((w) => w.status === "active" && w.kind === "worker").length ?? 0;
	const pendingInvites = workers.data?.invitations.filter((i) => i.status === "pending").length ?? 0;
	const pendingRequests = timeOff.data?.requests.filter((r) => r.status === "pending").length ?? 0;

	return (
		<AppScreen>
			<PageHeader
				eyebrow="Manager workspace"
				title={employment?.workplace.name ?? "Workplace"}
				description="Keep the Published Schedule current — draft and publish on the web, clear requests here."
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
					Building and publishing the week happens in the manager web Schedule grid — horizontal week,
					worker-by-day, Open Shifts in amber, conflicts in red. This mobile view is a calm read-only
					check.
				</Text>
			</Card>
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>What to do now</Text>
				<View style={{ gap: 6 }}>
					<Text style={[s.body, { color: theme.muted }]}>• Review Time-off Requests before you publish.</Text>
					<Text style={[s.body, { color: theme.muted }]}>• Open Shifts still need a Worker.</Text>
					<Text style={[s.body, { color: theme.muted }]}>• Acknowledgement ≠ Shift Acceptance — they are separate.</Text>
				</View>
			</Card>
		</AppScreen>
	);
}

// ── Schedule (read-only compact) ───────────────────────────────────────
type Location = { id: string; name: string; timezone: string };
type Schedule = {
	publication: { state?: string; versionNumber?: number } | null;
	shifts: { id: string; date: string; startMinute: number; endMinute: number; positionName: string; workerName?: string | null }[];
	staff: unknown[];
};

function mondayKey() {
	const d = new Date();
	const day = d.getDay();
	d.setDate(d.getDate() - ((day + 6) % 7));
	return d.toISOString().slice(0, 10);
}

export function ManagerSchedule() {
	const { theme } = useAppTheme();
	const { workplaceId } = useCurrentEmployment();
	const locations = useQuery({
		queryKey: ["manager", workplaceId, "locations"],
		queryFn: () => api<{ locations: Location[] }>(`/v1/workplaces/${workplaceId}/locations`),
		enabled: Boolean(workplaceId),
	});
	const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
	const locationId = selectedLocation ?? locations.data?.locations[0]?.id;
	const schedule = useQuery({
		queryKey: ["manager", "schedule", locationId, mondayKey()],
		queryFn: () => api<Schedule>(`/v1/locations/${locationId}/schedules/${mondayKey()}`),
		enabled: Boolean(locationId),
	});

	// Group shifts by date for scannable day sections (Week Stays a Week)
	const byDate = new Map<string, Schedule["shifts"]>();
	for (const sh of schedule.data?.shifts ?? []) {
		const arr = byDate.get(sh.date) ?? [];
		arr.push(sh);
		byDate.set(sh.date, arr);
	}

	return (
		<AppScreen>
			<PageHeader title="Schedule" description="Compact read-only view of the live Successor Draft. Use the web workspace to edit and publish the next Schedule Version." />

			{locations.data && locations.data.locations.length > 1 ? (
				<View style={s.chipsRow}>
					{locations.data.locations.map((loc) => {
						const selected = loc.id === locationId;
						return (
							<Pressable
								key={loc.id}
								accessibilityRole="button"
								accessibilityState={{ selected }}
								onPress={() => setSelectedLocation(loc.id)}
								style={[
									s.chip,
									{
										borderColor: selected ? theme.primary : theme.border,
										backgroundColor: selected ? theme.primary : "transparent",
									},
								]}
							>
								<Text style={[s.chipText, { color: selected ? theme.onPrimary : theme.text }]}>{loc.name}</Text>
							</Pressable>
						);
					})}
				</View>
			) : null}

			{schedule.isLoading ? <ActivityIndicator color={theme.primary} /> : null}

			{schedule.data ? (
				<>
					<View style={s.summaryRow}>
						<View style={{ flex: 1 }}>
							<Metric icon="time-outline" value={schedule.data.shifts.length} label="Draft Shifts" />
						</View>
						<View style={{ flex: 1 }}>
							<Metric icon="people-outline" value={schedule.data.staff.length} label="Workers on week" />
						</View>
					</View>

					{schedule.data.shifts.length === 0 ? (
						<Card>
							<Text style={[s.cardTitle, { color: theme.text }]}>No Shifts yet</Text>
							<Text style={[s.body, { color: theme.muted }]}>Open the manager web workspace to build this week’s Schedule.</Text>
						</Card>
					) : (
						[...byDate.entries()].map(([date, shifts]) => (
							<Card key={date}>
								<Text style={[s.dayLabel, { color: theme.muted }]}>{formatDay(date)}</Text>
								{shifts.map((sh) => (
									<View key={sh.id} style={[s.scheduleShiftRow, { borderColor: theme.border }]}>
										<Text style={[s.shiftTime, { color: theme.text }]}>
											{formatMinute(sh.startMinute)}–{formatMinute(sh.endMinute)} · {sh.positionName}
										</Text>
										{sh.workerName ? (
											<Text style={[s.hint, { color: theme.muted }]}>{sh.workerName}</Text>
										) : (
											<Badge label="Open Shift" variant="amber" />
										)}
									</View>
								))}
							</Card>
						))
					)}
				</>
			) : null}
		</AppScreen>
	);
}

// ── Team ─────────────────────────────────────────────────────────────────
export function ManagerTeam() {
	const { theme } = useAppTheme();
	const { workplaceId } = useCurrentEmployment();
	const workers = useManagerWorkers(workplaceId);

	return (
		<AppScreen>
			<PageHeader title="Team" description="Every Employment at this Workplace — Workers and Managers, active and invited." />
			{workers.isLoading ? <ActivityIndicator color={theme.primary} /> : null}

			{workers.data?.workers.map((w) => (
				<Card key={w.employmentId}>
					<View style={s.row}>
						<View style={[s.avatar, { backgroundColor: `${theme.primary}18` }]}>
							<Text style={[s.avatarText, { color: theme.primary }]}>
								{(w.profile.fullName ?? w.profile.email).slice(0, 1).toUpperCase()}
							</Text>
						</View>
						<View style={s.grow}>
							<Text style={[s.cardTitle, { color: theme.text }]}>{w.profile.fullName ?? w.profile.email}</Text>
							<Text style={[s.hint, { color: theme.muted }]}>{w.kind} · {w.status}</Text>
						</View>
						<Badge label={w.status} variant={w.status === "active" ? "success" : "outline"} />
					</View>
				</Card>
			))}

			{workers.data?.invitations
				.filter((i) => i.status === "pending")
				.map((inv) => (
					<Card key={inv.id}>
						<View style={s.rowBetween}>
							<Text style={[s.cardTitle, { color: theme.text }]}>{inv.email}</Text>
							<Badge label="Invited" variant="outline" />
						</View>
						<Text style={[s.hint, { color: theme.muted }]}>Pending {inv.kind} invitation</Text>
					</Card>
				))}

			{workers.data && workers.data.workers.length === 0 && workers.data.invitations.length === 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>No Employments yet</Text>
					<Text style={[s.body, { color: theme.muted }]}>Invite Workers and Managers from the web settings.</Text>
				</Card>
			) : null}
		</AppScreen>
	);
}

// ── Requests (Time-off) ──────────────────────────────────────────────────
export function ManagerRequests() {
	const { theme } = useAppTheme();
	const { workplaceId } = useCurrentEmployment();
	const requests = useManagerTimeOff(workplaceId);
	const client = useQueryClient();
	const decide = useMutation({
		mutationFn: ({ id, decision }: { id: string; decision: "approved" | "declined" }) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${id}/decision`, { method: "POST", body: { decision } }),
		onSuccess: () => client.invalidateQueries({ queryKey: ["manager", workplaceId, "time-off"] }),
		onError: (e) => Alert.alert("Could not save", (e as Error).message),
	});

	return (
		<AppScreen>
			<PageHeader title="Time-off Requests" description="Approve or decline before you build the week. A Time-off Request is distinct from Unavailability." />
			{requests.isLoading ? <ActivityIndicator color={theme.primary} /> : null}
			{requests.data?.requests.length === 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>You’re all caught up</Text>
					<Text style={[s.body, { color: theme.muted }]}>New Time-off Requests will appear here.</Text>
				</Card>
			) : null}
			{requests.data?.requests.map((r) => (
				<Card key={r.id}>
					<View style={s.rowBetween}>
						<Text style={[s.cardTitle, { color: theme.text }]}>{r.worker.fullName ?? r.worker.email}</Text>
						<Badge
							label={r.status}
							variant={r.status === "declined" ? "danger" : r.status === "approved" ? "success" : "default"}
						/>
					</View>
					<Text style={[s.body, { color: theme.text, fontVariant: ["tabular-nums"] }]}>
						{new Date(r.startsAt).toLocaleString()} – {new Date(r.endsAt).toLocaleString()}
					</Text>
					{r.reason ? <Text style={[s.hint, { color: theme.muted }]}>{r.reason}</Text> : null}
					{r.status === "pending" ? (
						<View style={s.actions}>
							<View style={{ flex: 1 }}>
								<PrimaryButton label="Approve" disabled={decide.isPending} onPress={() => decide.mutate({ id: r.id, decision: "approved" })} />
							</View>
							<View style={{ flex: 1 }}>
								<SecondaryButton label="Decline" disabled={decide.isPending} onPress={() => decide.mutate({ id: r.id, decision: "declined" })} />
							</View>
						</View>
					) : null}
				</Card>
			))}
		</AppScreen>
	);
}

function formatMinute(v: number) {
	const h = Math.floor(v / 60);
	const m = v % 60;
	return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function formatDay(date: string) {
	return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
	chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
	chip: { minHeight: 36, borderWidth: 1, borderRadius: 999, justifyContent: "center", paddingHorizontal: 14 },
	chipText: { fontSize: 13, fontWeight: "700" },
	summaryRow: { flexDirection: "row", gap: 10 },
	dayLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
	scheduleShiftRow: { gap: 4, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
	shiftTime: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
	grow: { flex: 1, gap: 3 },
	avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
	avatarText: { fontSize: 16, fontWeight: "800" },
	actions: { flexDirection: "row", gap: 10, marginTop: 8 },
});
