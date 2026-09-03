import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
	Card,
	NativeDatePickerField,
	NativeField,
	PageHeader,
	PrimaryButton,
	SecondaryButton,
	useAppTheme,
} from "@/components/ui";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { formatLeaveHours, formatLeaveRange, todayIsoDate } from "@/lib/leave";
import {
	type ManagerTimeOffResponse,
	useCoverageSwaps,
	useCurrentEmployment,
	useLeaveTypes,
	useManagerTimeOff,
	useManagerWorkers,
	useMarkAttendance,
	useSwapDecision,
} from "@/lib/queries";

// ── Shared metric ───────────────────────────────────────────────────────
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

// ── Overview ─────────────────────────────────────────────────────────────
export function ManagerOverview() {
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
				description="Keep the Published Schedule current — draft and publish on the web, clear requests here."
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
					grid — horizontal week, worker-by-day, Open Shifts in amber, conflicts
					in red. This mobile view is a calm read-only check.
				</Text>
			</Card>
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>What to do now</Text>
				<View style={{ gap: 6 }}>
					<Text style={[s.body, { color: theme.muted }]}>
						• Review Time-off Requests before you publish.
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						• Open Shifts still need a Worker.
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						• Acknowledgement ≠ Shift Acceptance — they are separate.
					</Text>
				</View>
			</Card>
		</AppScreen>
	);
}

// ── Schedule (read-only compact) ───────────────────────────────────────
type Location = { id: string; name: string; timezone: string };
type TimeclockRow = {
	shiftId: string;
	versionShiftId: string;
	status: "open" | "closed" | null;
	clockedInAt: string | null;
	attendance: "late" | "no_show" | "sick" | null;
};
type Schedule = {
	publication: { state?: string; versionNumber?: number } | null;
	timeclock?: TimeclockRow[];
	shifts: {
		id: string;
		date: string;
		startMinute: number;
		endMinute: number;
		positionName: string;
		workerName?: string | null;
	}[];
	staff: unknown[];
};

function mondayKey() {
	const d = new Date();
	const day = d.getDay();
	d.setDate(d.getDate() - ((day + 6) % 7));
	const month = `${d.getMonth() + 1}`.padStart(2, "0");
	const date = `${d.getDate()}`.padStart(2, "0");
	return `${d.getFullYear()}-${month}-${date}`;
}

function zonedDateKey(timeZone: string) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function attendanceLabel(kind: TimeclockRow["attendance"]) {
	if (kind === "no_show") return "No-show";
	if (kind === "sick") return "Sick";
	if (kind === "late") return "Late";
	return null;
}

export function ManagerSchedule() {
	const { theme } = useAppTheme();
	const { formatMinute } = useDisplayPrefs();
	const { workplaceId } = useCurrentEmployment();
	const locations = useQuery({
		queryKey: ["manager", workplaceId, "locations"],
		queryFn: () =>
			api<{ locations: Location[] }>(`/v1/workplaces/${workplaceId}/locations`),
		enabled: Boolean(workplaceId),
	});
	const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
	const [todayFocus, setTodayFocus] = useState(true);
	const locationId = selectedLocation ?? locations.data?.locations[0]?.id;
	const timezone =
		locations.data?.locations.find((location) => location.id === locationId)
			?.timezone ?? "America/Chicago";
	const todayKey = zonedDateKey(timezone);
	const schedule = useQuery({
		queryKey: ["manager", "schedule", locationId, mondayKey()],
		queryFn: () =>
			api<Schedule>(`/v1/locations/${locationId}/schedules/${mondayKey()}`),
		enabled: Boolean(locationId),
	});
	const markAttendance = useMarkAttendance(workplaceId);

	const timeclockByShiftId = new Map(
		(schedule.data?.timeclock ?? []).map((row) => [row.shiftId, row]),
	);
	const visibleShifts = (schedule.data?.shifts ?? []).filter(
		(shift) => !todayFocus || shift.date === todayKey,
	);
	const byDate = new Map<string, Schedule["shifts"]>();
	for (const shift of visibleShifts) {
		const arr = byDate.get(shift.date) ?? [];
		arr.push(shift);
		byDate.set(shift.date, arr);
	}

	function promptAttendance(versionShiftId: string, workerName: string) {
		Alert.alert(
			"Attendance mark",
			`Mark ${workerName} without changing the published schedule.`,
			[
				{
					text: "Late",
					onPress: () =>
						markAttendance.mutate(
							{ versionShiftId, kind: "late" },
							{
								onSuccess: () => Alert.alert("Saved", "Marked late."),
								onError: (error) =>
									Alert.alert("Could not save", (error as Error).message),
							},
						),
				},
				{
					text: "No-show",
					style: "destructive",
					onPress: () =>
						markAttendance.mutate(
							{ versionShiftId, kind: "no_show" },
							{
								onSuccess: () => Alert.alert("Saved", "Marked no-show."),
								onError: (error) =>
									Alert.alert("Could not save", (error as Error).message),
							},
						),
				},
				{
					text: "Sick",
					onPress: () =>
						markAttendance.mutate(
							{ versionShiftId, kind: "sick" },
							{
								onSuccess: () => Alert.alert("Saved", "Marked sick."),
								onError: (error) =>
									Alert.alert("Could not save", (error as Error).message),
							},
						),
				},
				{ text: "Cancel", style: "cancel" },
			],
		);
	}

	return (
		<AppScreen>
			<PageHeader
				title="Schedule"
				description={
					todayFocus
						? "Today’s published Shifts. Mark late, no-show, or sick without changing the schedule. Edit the draft on web."
						: "Compact read-only view of the live Successor Draft. Use the web workspace to edit and publish the next Schedule Version."
				}
			/>

			<View style={s.chipsRow}>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ selected: todayFocus }}
					onPress={() => setTodayFocus(true)}
					style={[
						s.chip,
						{
							borderColor: todayFocus ? theme.primary : theme.border,
							backgroundColor: todayFocus ? theme.primary : "transparent",
						},
					]}
				>
					<Text
						style={[
							s.chipText,
							{ color: todayFocus ? theme.onPrimary : theme.text },
						]}
					>
						Today
					</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ selected: !todayFocus }}
					onPress={() => setTodayFocus(false)}
					style={[
						s.chip,
						{
							borderColor: !todayFocus ? theme.primary : theme.border,
							backgroundColor: !todayFocus ? theme.primary : "transparent",
						},
					]}
				>
					<Text
						style={[
							s.chipText,
							{ color: !todayFocus ? theme.onPrimary : theme.text },
						]}
					>
						Week
					</Text>
				</Pressable>
			</View>

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
								<Text
									style={[
										s.chipText,
										{ color: selected ? theme.onPrimary : theme.text },
									]}
								>
									{loc.name}
								</Text>
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
							<Metric
								icon="time-outline"
								value={visibleShifts.length}
								label={todayFocus ? "Today’s Shifts" : "Draft Shifts"}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Metric
								icon="people-outline"
								value={schedule.data.staff.length}
								label="Workers on week"
							/>
						</View>
					</View>

					{visibleShifts.length === 0 ? (
						<Card>
							<Text style={[s.cardTitle, { color: theme.text }]}>
								{todayFocus ? "Nothing on today" : "No Shifts yet"}
							</Text>
							<Text style={[s.body, { color: theme.muted }]}>
								{todayFocus
									? "Switch to Week to see the rest of the draft, or open the manager web workspace to publish."
									: "Open the manager web workspace to build this week’s Schedule."}
							</Text>
						</Card>
					) : (
						[...byDate.entries()].map(([date, shifts]) => (
							<Card key={date}>
								<Text style={[s.dayLabel, { color: theme.muted }]}>
									{formatDay(date)}
								</Text>
								{shifts.map((sh) => {
									const timeclock = timeclockByShiftId.get(sh.id);
									const mark = attendanceLabel(timeclock?.attendance ?? null);
									return (
										<View
											key={sh.id}
											style={[
												s.scheduleShiftRow,
												{ borderColor: theme.border },
											]}
										>
											<Text style={[s.shiftTime, { color: theme.text }]}>
												{formatMinute(sh.startMinute)}–
												{formatMinute(sh.endMinute)} · {sh.positionName}
											</Text>
											{sh.workerName ? (
												<Text style={[s.hint, { color: theme.muted }]}>
													{sh.workerName}
												</Text>
											) : (
												<Badge label="Open Shift" variant="amber" />
											)}
											<View style={s.chipsRow}>
												{timeclock?.status === "open" ? (
													<Badge label="On clock" variant="success" />
												) : null}
												{timeclock?.status === "closed" ? (
													<Badge label="Clocked out" variant="outline" />
												) : null}
												{mark ? <Badge label={mark} variant="danger" /> : null}
											</View>
											{timeclock?.versionShiftId && sh.workerName ? (
												<SecondaryButton
													label="Mark attendance"
													disabled={markAttendance.isPending}
													onPress={() =>
														promptAttendance(
															timeclock.versionShiftId,
															sh.workerName ?? "this worker",
														)
													}
												/>
											) : null}
										</View>
									);
								})}
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
	const { formatPerson } = useDisplayPrefs();
	const { workplaceId } = useCurrentEmployment();
	const workers = useManagerWorkers(workplaceId);

	return (
		<AppScreen>
			<PageHeader
				title="Team"
				description="Every Employment at this Workplace — Workers and Managers, active and invited."
			/>
			{workers.isLoading ? <ActivityIndicator color={theme.primary} /> : null}

			{workers.data?.workers.map((w) => (
				<Card key={w.employmentId}>
					<View style={s.row}>
						<View style={[s.avatar, { backgroundColor: `${theme.primary}18` }]}>
							<Text style={[s.avatarText, { color: theme.primary }]}>
								{formatPerson(w.profile.fullName, w.profile.email)
									.slice(0, 1)
									.toUpperCase()}
							</Text>
						</View>
						<View style={s.grow}>
							<Text style={[s.cardTitle, { color: theme.text }]}>
								{formatPerson(w.profile.fullName, w.profile.email)}
							</Text>
							<Text style={[s.hint, { color: theme.muted }]}>
								{w.kind} · {w.status}
							</Text>
						</View>
						<Badge
							label={w.status}
							variant={w.status === "active" ? "success" : "outline"}
						/>
					</View>
				</Card>
			))}

			{workers.data?.invitations
				.filter((i) => i.status === "pending")
				.map((inv) => (
					<Card key={inv.id}>
						<View style={s.rowBetween}>
							<Text style={[s.cardTitle, { color: theme.text }]}>
								{inv.email}
							</Text>
							<Badge label="Invited" variant="outline" />
						</View>
						<Text style={[s.hint, { color: theme.muted }]}>
							Pending {inv.kind} invitation
						</Text>
					</Card>
				))}

			{workers.data &&
			workers.data.workers.length === 0 &&
			workers.data.invitations.length === 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>
						No Employments yet
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						Invite workers and managers from the web Team page.
					</Text>
				</Card>
			) : null}
		</AppScreen>
	);
}

// ── Requests (Time-off) ──────────────────────────────────────────────────
export function ManagerRequests() {
	const { theme } = useAppTheme();
	const { formatPerson } = useDisplayPrefs();
	const { workplaceId, employment } = useCurrentEmployment();
	const requests = useManagerTimeOff(workplaceId);
	const workers = useManagerWorkers(workplaceId);
	const leaveTypes = useLeaveTypes(workplaceId);
	const swaps = useCoverageSwaps(workplaceId);
	const client = useQueryClient();
	const [employmentId, setEmploymentId] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [startDate, setStartDate] = useState(todayIsoDate);
	const [endDate, setEndDate] = useState(todayIsoDate);
	const [reason, setReason] = useState("");
	const [mineLeaveTypeId, setMineLeaveTypeId] = useState("");
	const [mineStartDate, setMineStartDate] = useState(todayIsoDate);
	const [mineEndDate, setMineEndDate] = useState(todayIsoDate);
	const [mineReason, setMineReason] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editLeaveTypeId, setEditLeaveTypeId] = useState("");
	const [editStartDate, setEditStartDate] = useState(todayIsoDate);
	const [editEndDate, setEditEndDate] = useState(todayIsoDate);
	const [editReason, setEditReason] = useState("");
	const decide = useMutation({
		mutationFn: ({
			id,
			decision,
		}: {
			id: string;
			decision: "approved" | "declined";
		}) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${id}/decision`, {
				method: "POST",
				body: { decision },
			}),
		onSuccess: () =>
			client.invalidateQueries({
				queryKey: ["manager", workplaceId, "time-off"],
			}),
		onError: (e) => Alert.alert("Could not save", (e as Error).message),
	});
	const record = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/time-off`, {
				method: "POST",
				body: {
					employmentId,
					leaveTypeId,
					startDate,
					endDate: endDate || startDate,
					allDay: true,
					reason: reason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			setReason("");
			client.invalidateQueries({
				queryKey: ["manager", workplaceId, "time-off"],
			});
			Alert.alert("Recorded", "They are now out on the schedule.");
		},
		onError: (e) => Alert.alert("Could not record", (e as Error).message),
	});
	const requestMine = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/my/time-off`, {
				method: "POST",
				body: {
					leaveTypeId: mineLeaveTypeId,
					startDate: mineStartDate,
					endDate: mineEndDate || mineStartDate,
					allDay: true,
					reason: mineReason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			setMineReason("");
			client.invalidateQueries({
				queryKey: ["manager", workplaceId, "time-off"],
			});
			Alert.alert(
				"Requested",
				"Another manager can approve this, or record it for yourself to approve now.",
			);
		},
		onError: (e) => Alert.alert("Could not request", (e as Error).message),
	});
	const saveEdit = useMutation({
		mutationFn: () =>
			api(`/v1/workplaces/${workplaceId}/time-off/${editingId}`, {
				method: "PATCH",
				body: {
					leaveTypeId: editLeaveTypeId,
					startDate: editStartDate,
					endDate: editEndDate || editStartDate,
					allDay: true,
					reason: editReason.trim() || undefined,
				},
			}),
		onSuccess: () => {
			setEditingId(null);
			client.invalidateQueries({
				queryKey: ["manager", workplaceId, "time-off"],
			});
			Alert.alert("Updated", "Time off was updated.");
		},
		onError: (e) => Alert.alert("Could not update", (e as Error).message),
	});
	const removeLeave = useMutation({
		mutationFn: (id: string) =>
			api(`/v1/workplaces/${workplaceId}/time-off/${id}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			if (editingId) setEditingId(null);
			client.invalidateQueries({
				queryKey: ["manager", workplaceId, "time-off"],
			});
		},
		onError: (e) => Alert.alert("Could not delete", (e as Error).message),
	});
	const decideSwap = useSwapDecision(workplaceId);

	function beginEdit(r: ManagerTimeOffResponse["requests"][number]) {
		setEditingId(r.id);
		setEditLeaveTypeId(r.leaveTypeId ?? "");
		setEditStartDate(r.startDate ?? r.startsAt.slice(0, 10));
		setEditEndDate(r.endDate ?? r.endsAt.slice(0, 10));
		setEditReason(r.reason ?? "");
	}
	const pendingTimeOff =
		requests.data?.requests.filter((r) => r.status === "pending") ?? [];
	const approvedUpcoming =
		requests.data?.requests.filter(
			(r) =>
				r.status === "approved" &&
				(r.endDate ?? r.endsAt.slice(0, 10)) >= todayIsoDate(),
		) ?? [];
	const pendingSwaps = swaps.data ?? [];
	const activePeople =
		workers.data?.workers.filter((member) => member.status === "active") ?? [];
	const empty =
		!requests.isLoading &&
		!swaps.isLoading &&
		pendingTimeOff.length === 0 &&
		pendingSwaps.length === 0;

	return (
		<AppScreen>
			<PageHeader
				title="Time off"
				description="Managers and workers can take leave. Decide requests, record leave, or request your own."
			/>
			{editingId ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>
						Edit time off
					</Text>
					<View style={s.chipsRow}>
						{(leaveTypes.data?.leaveTypes ?? []).map((type) => {
							const selected = editLeaveTypeId === type.id;
							return (
								<Pressable
									key={type.id}
									onPress={() => setEditLeaveTypeId(type.id)}
									style={[
										s.chip,
										{
											borderColor: selected ? theme.primary : theme.border,
											backgroundColor: selected ? theme.primary : "transparent",
										},
									]}
								>
									<Text
										style={[
											s.chipText,
											{ color: selected ? theme.onPrimary : theme.text },
										]}
									>
										{type.name}
									</Text>
								</Pressable>
							);
						})}
					</View>
					<NativeDatePickerField
						label="From"
						value={editStartDate}
						onChange={(value) => {
							setEditStartDate(value);
							if (!editEndDate || editEndDate < value) setEditEndDate(value);
						}}
					/>
					<NativeDatePickerField
						label="Until"
						value={editEndDate}
						onChange={setEditEndDate}
					/>
					<NativeField
						label="Note (optional)"
						value={editReason}
						onChange={setEditReason}
					/>
					<View style={s.actions}>
						<View style={{ flex: 1 }}>
							<PrimaryButton
								label={saveEdit.isPending ? "Saving…" : "Save changes"}
								disabled={saveEdit.isPending || !editLeaveTypeId}
								onPress={() => saveEdit.mutate()}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<SecondaryButton
								label="Cancel"
								onPress={() => setEditingId(null)}
							/>
						</View>
					</View>
				</Card>
			) : null}
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>
					Request my leave
				</Text>
				<Text style={[s.hint, { color: theme.muted }]}>
					Pending until another manager approves. Record yourself below to
					approve immediately.
				</Text>
				<View style={s.chipsRow}>
					{(leaveTypes.data?.leaveTypes ?? []).map((type) => {
						const selected = mineLeaveTypeId === type.id;
						return (
							<Pressable
								key={type.id}
								onPress={() => setMineLeaveTypeId(type.id)}
								style={[
									s.chip,
									{
										borderColor: selected ? theme.primary : theme.border,
										backgroundColor: selected ? theme.primary : "transparent",
									},
								]}
							>
								<Text
									style={[
										s.chipText,
										{ color: selected ? theme.onPrimary : theme.text },
									]}
								>
									{type.name}
								</Text>
							</Pressable>
						);
					})}
				</View>
				<NativeDatePickerField
					label="From"
					value={mineStartDate}
					onChange={(value) => {
						setMineStartDate(value);
						if (!mineEndDate || mineEndDate < value) setMineEndDate(value);
					}}
				/>
				<NativeDatePickerField
					label="Until"
					value={mineEndDate}
					onChange={setMineEndDate}
				/>
				<NativeField
					label="Note (optional)"
					value={mineReason}
					onChange={setMineReason}
				/>
				<PrimaryButton
					label={requestMine.isPending ? "Sending…" : "Request my leave"}
					disabled={
						requestMine.isPending || !employment?.id || !mineLeaveTypeId
					}
					onPress={() => requestMine.mutate()}
				/>
			</Card>
			<Card>
				<Text style={[s.cardTitle, { color: theme.text }]}>
					Record time off
				</Text>
				<Text style={[s.hint, { color: theme.muted }]}>
					Approved immediately for a worker or manager. Paid hours deduct from
					the balance.
				</Text>
				<View style={s.chipsRow}>
					{activePeople.map((member) => {
						const selected = employmentId === member.employmentId;
						const label = formatPerson(
							member.profile.fullName,
							member.profile.email,
						);
						return (
							<Pressable
								key={member.employmentId}
								onPress={() => setEmploymentId(member.employmentId)}
								style={[
									s.chip,
									{
										borderColor: selected ? theme.primary : theme.border,
										backgroundColor: selected ? theme.primary : "transparent",
									},
								]}
							>
								<Text
									style={[
										s.chipText,
										{ color: selected ? theme.onPrimary : theme.text },
									]}
								>
									{member.kind === "manager" ? `${label} · Mgr` : label}
								</Text>
							</Pressable>
						);
					})}
				</View>
				<View style={s.chipsRow}>
					{(leaveTypes.data?.leaveTypes ?? []).map((type) => {
						const selected = leaveTypeId === type.id;
						return (
							<Pressable
								key={type.id}
								onPress={() => setLeaveTypeId(type.id)}
								style={[
									s.chip,
									{
										borderColor: selected ? theme.primary : theme.border,
										backgroundColor: selected ? theme.primary : "transparent",
									},
								]}
							>
								<Text
									style={[
										s.chipText,
										{ color: selected ? theme.onPrimary : theme.text },
									]}
								>
									{type.name}
								</Text>
							</Pressable>
						);
					})}
				</View>
				<NativeDatePickerField
					label="From"
					value={startDate}
					onChange={(value) => {
						setStartDate(value);
						if (!endDate || endDate < value) setEndDate(value);
					}}
				/>
				<NativeDatePickerField
					label="Until"
					value={endDate}
					onChange={setEndDate}
				/>
				<NativeField
					label="Note (optional)"
					value={reason}
					onChange={setReason}
				/>
				<PrimaryButton
					label={record.isPending ? "Saving…" : "Record time off"}
					disabled={record.isPending || !employmentId || !leaveTypeId}
					onPress={() => record.mutate()}
				/>
			</Card>
			{requests.isLoading || swaps.isLoading ? (
				<ActivityIndicator color={theme.primary} />
			) : null}
			{empty ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>
						No requests waiting
					</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						Request your leave, record time off, or wait for a request or swap.
					</Text>
				</Card>
			) : null}
			{pendingSwaps.map((swap) => (
				<Card key={swap.id}>
					<View style={s.rowBetween}>
						<Text style={[s.cardTitle, { color: theme.text }]}>
							{swap.requester.name} ⇄ {swap.counterpart.name}
						</Text>
						<Badge label="swap" variant="default" />
					</View>
					<Text style={[s.body, { color: theme.text }]}>
						{swap.requester.name} gives{" "}
						{new Date(swap.requesterShift.startsAt).toLocaleString()} (
						{swap.requesterShift.positionName})
					</Text>
					<Text style={[s.body, { color: theme.text }]}>
						{swap.counterpart.name} gives{" "}
						{new Date(swap.counterpartShift.startsAt).toLocaleString()} (
						{swap.counterpartShift.positionName})
					</Text>
					<View style={s.actions}>
						<View style={{ flex: 1 }}>
							<PrimaryButton
								label="Approve & publish"
								disabled={decideSwap.isPending}
								onPress={() =>
									confirmAction({
										title: "Approve swap and publish?",
										message:
											"This exchanges both assignments and may publish a new schedule version immediately.",
										confirmLabel: "Approve & publish",
										onConfirm: () =>
											decideSwap.mutate({
												swapId: swap.id,
												decision: "approved",
											}),
									})
								}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<SecondaryButton
								label="Decline"
								disabled={decideSwap.isPending}
								onPress={() =>
									confirmAction({
										title: "Decline this swap?",
										message:
											"Both workers will keep their current assignments.",
										confirmLabel: "Decline swap",
										destructive: true,
										onConfirm: () =>
											decideSwap.mutate({
												swapId: swap.id,
												decision: "declined",
											}),
									})
								}
							/>
						</View>
					</View>
					{decideSwap.isError ? (
						<Text style={[s.hint, { color: theme.notification }]}>
							{(decideSwap.error as Error).message}
						</Text>
					) : null}
				</Card>
			))}
			{pendingTimeOff.map((r) => (
				<Card key={r.id}>
					<View style={s.rowBetween}>
						<Text style={[s.cardTitle, { color: theme.text }]}>
							{formatPerson(r.worker.fullName, r.worker.email)}
							{r.kind === "manager" ? " · Manager" : ""}
						</Text>
						<Badge label="Needs a decision" variant="default" />
					</View>
					<Text
						style={[
							s.body,
							{ color: theme.text, fontVariant: ["tabular-nums"] },
						]}
					>
						{formatLeaveRange(r)}
						{r.leaveTypeName ? ` · ${r.leaveTypeName}` : ""}
						{r.chargeMinutes ? ` · ${formatLeaveHours(r.chargeMinutes)}` : ""}
					</Text>
					{r.remainingMinutes != null && r.chargeMinutes != null ? (
						<Text style={[s.hint, { color: theme.muted }]}>
							{r.remainingMinutes >= r.chargeMinutes
								? `${formatLeaveHours(r.remainingMinutes)} remaining after this.`
								: `Only ${formatLeaveHours(r.remainingMinutes)} remaining.`}
						</Text>
					) : null}
					{r.reason ? (
						<Text style={[s.hint, { color: theme.muted }]}>{r.reason}</Text>
					) : null}
					<View style={s.actions}>
						<View style={{ flex: 1 }}>
							<PrimaryButton
								label="Approve"
								disabled={decide.isPending}
								onPress={() =>
									confirmAction({
										title: "Approve this time off?",
										message: r.chargeMinutes
											? `This uses ${formatLeaveHours(r.chargeMinutes)}${r.leaveTypeName ? ` of ${r.leaveTypeName}` : ""} and blocks the schedule.`
											: "This marks the request approved for scheduling.",
										confirmLabel: "Approve",
										onConfirm: () =>
											decide.mutate({ id: r.id, decision: "approved" }),
									})
								}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<SecondaryButton
								label="Decline"
								disabled={decide.isPending}
								onPress={() =>
									confirmAction({
										title: "Decline this request?",
										message: "The worker will see this decision.",
										confirmLabel: "Decline",
										destructive: true,
										onConfirm: () =>
											decide.mutate({ id: r.id, decision: "declined" }),
									})
								}
							/>
						</View>
					</View>
					<View style={s.actions}>
						<View style={{ flex: 1 }}>
							<SecondaryButton
								label="Edit"
								disabled={removeLeave.isPending}
								onPress={() => beginEdit(r)}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<SecondaryButton
								label="Delete"
								disabled={removeLeave.isPending}
								onPress={() =>
									confirmAction({
										title: "Delete this request?",
										message: "This removes the request permanently.",
										confirmLabel: "Delete",
										destructive: true,
										onConfirm: () => removeLeave.mutate(r.id),
									})
								}
							/>
						</View>
					</View>
				</Card>
			))}
			{approvedUpcoming.length > 0 ? (
				<Card>
					<Text style={[s.cardTitle, { color: theme.text }]}>Who’s out</Text>
					{approvedUpcoming.map((r) => (
						<View key={r.id} style={{ gap: 8 }}>
							<View style={{ gap: 2 }}>
								<Text style={[s.body, { color: theme.text }]}>
									{formatPerson(r.worker.fullName, r.worker.email)}
									{r.kind === "manager" ? " · Manager" : ""}
								</Text>
								<Text
									style={[
										s.hint,
										{ color: theme.muted, fontVariant: ["tabular-nums"] },
									]}
								>
									{formatLeaveRange(r)}
									{r.leaveTypeName ? ` · ${r.leaveTypeName}` : ""}
								</Text>
							</View>
							<View style={s.actions}>
								<View style={{ flex: 1 }}>
									<SecondaryButton
										label="Edit"
										disabled={removeLeave.isPending}
										onPress={() => beginEdit(r)}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<SecondaryButton
										label="Delete"
										disabled={removeLeave.isPending}
										onPress={() =>
											confirmAction({
												title: "Delete this time off?",
												message:
													"They will no longer be blocked on the schedule. Paid hours will be restored.",
												confirmLabel: "Delete",
												destructive: true,
												onConfirm: () => removeLeave.mutate(r.id),
											})
										}
									/>
								</View>
							</View>
						</View>
					))}
				</Card>
			) : null}
		</AppScreen>
	);
}

function formatDay(date: string) {
	return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
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
	chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
	chip: {
		minHeight: 36,
		borderWidth: 1,
		borderRadius: 999,
		justifyContent: "center",
		paddingHorizontal: 14,
	},
	chipText: { fontSize: 13, fontWeight: "700" },
	summaryRow: { flexDirection: "row", gap: 10 },
	dayLabel: {
		fontSize: 12,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	scheduleShiftRow: {
		gap: 4,
		borderTopWidth: 1,
		paddingTop: 10,
		marginTop: 10,
	},
	shiftTime: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	rowBetween: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 8,
	},
	grow: { flex: 1, gap: 3 },
	avatar: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarText: { fontSize: 16, fontWeight: "800" },
	actions: { flexDirection: "row", gap: 10, marginTop: 8 },
});
