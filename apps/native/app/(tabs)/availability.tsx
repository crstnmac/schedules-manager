import { useQuery, useQueryClient } from "@tanstack/react-query";
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
	Card,
	Hint,
	NativeDatePickerField,
	NativeField,
	NativeTimePickerField,
	NativeWeekdayPicker,
	PageHeader,
	PrimaryButton,
	useAppTheme,
} from "@/components/ui";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import {
	formatLeaveHours,
	formatLeaveRange,
	todayIsoDate,
} from "@/lib/leave";
import {
	useCurrentEmployment,
	useLeaveTypes,
	usePtoBalances,
} from "@/lib/queries";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

interface ConstraintsResponse {
	unavailability: {
		id: string;
		kind: "recurring" | "date";
		weekday: number | null;
		date: string | null;
		startMinute: number;
		endMinute: number;
		note: string | null;
	}[];
	preference: string | null;
	timeOff: {
		id: string;
		startsAt: string;
		endsAt: string;
		startDate?: string;
		endDate?: string;
		allDay?: boolean;
		startMinute?: number | null;
		endMinute?: number | null;
		chargeMinutes?: number;
		reason: string | null;
		status: "pending" | "approved" | "declined";
		decisionReason: string | null;
		leaveTypeId?: string | null;
	}[];
}
interface RecurringDraft {
	id: string;
	weekday: number;
	start: string;
	end: string;
}
interface DateDraft {
	id: string;
	date: string;
	start: string;
	end: string;
}

const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

function newId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function newRecurring(): RecurringDraft {
	return { id: newId(), weekday: 0, start: "08:00", end: "14:00" };
}
function newDateDraft(): DateDraft {
	return { id: newId(), date: "", start: "08:00", end: "14:00" };
}
function parseTime(v: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
	if (!m) return null;
	const h = Number(m[1]);
	const mm = Number(m[2]);
	if (h > 24 || mm > 59) return null;
	return h * 60 + mm;
}
function toLabel(min: number) {
	const h = Math.floor(min / 60);
	const mm = min % 60;
	return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export default function AvailabilityScreen() {
	const { theme } = useAppTheme();
	const { selected } = useSelectedWorkplaceId();
	const { employment } = useCurrentEmployment();
	const leaveTypes = useLeaveTypes(selected ?? undefined);
	const pto = usePtoBalances(selected ?? undefined, employment?.id);
	const qc = useQueryClient();
	const c = useQuery({
		queryKey: ["constraints", selected],
		queryFn: () =>
			api<ConstraintsResponse>(`/v1/workplaces/${selected}/my/constraints`),
		enabled: Boolean(selected),
	});

	const [recurring, setRecurring] = useState<RecurringDraft[]>([]);
	const [dates, setDates] = useState<DateDraft[]>([]);
	const [recurringDraft, setRecurringDraft] = useState<RecurringDraft>(
		newRecurring(),
	);
	const [dateDraft, setDateDraft] = useState<DateDraft>(newDateDraft());
	const [preference, setPreference] = useState("");
	const [saving, setSaving] = useState(false);
	const [offStartDate, setOffStartDate] = useState(todayIsoDate);
	const [offEndDate, setOffEndDate] = useState(todayIsoDate);
	const [offAllDay, setOffAllDay] = useState(true);
	const [offStart, setOffStart] = useState("09:00");
	const [offEnd, setOffEnd] = useState("17:00");
	const [offReason, setOffReason] = useState("");
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [requesting, setRequesting] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	useEffect(() => {
		if (!c.data) return;
		setRecurring(
			c.data.unavailability
				.filter((r) => r.kind === "recurring")
				.map((r) => ({
					id: r.id,
					weekday: r.weekday ?? 0,
					start: toLabel(r.startMinute),
					end: toLabel(r.endMinute),
				})),
		);
		setDates(
			c.data.unavailability
				.filter((r) => r.kind === "date")
				.map((r) => ({
					id: r.id,
					date: r.date ?? "",
					start: toLabel(r.startMinute),
					end: toLabel(r.endMinute),
				})),
		);
		setPreference(c.data.preference ?? "");
	}, [c.data]);

	async function saveUnavailability() {
		for (const it of [...recurring, ...dates]) {
			const s = parseTime(it.start);
			const e = parseTime(it.end);
			if (s === null || e === null || s >= e) {
				Alert.alert(
					"Check times",
					`"${it.start}–${it.end}" is not a valid range.`,
				);
				return;
			}
		}
		for (const it of dates)
			if (!/^\d{4}-\d{2}-\d{2}$/.test(it.date)) {
				Alert.alert("Check dates", `"${it.date}" is not valid.`);
				return;
			}
		setSaving(true);
		try {
			await api(`/v1/workplaces/${selected}/my/unavailability`, {
				method: "PUT",
				body: {
					recurring: recurring.map((i) => ({
						weekday: i.weekday,
						startMinute: parseTime(i.start),
						endMinute: parseTime(i.end),
					})),
					dates: dates.map((i) => ({
						date: i.date,
						startMinute: parseTime(i.start),
						endMinute: parseTime(i.end),
					})),
				},
			});
			await qc.invalidateQueries({ queryKey: ["constraints", selected] });
			Alert.alert(
				"Saved",
				"Unavailability updated — hard constraint for your Manager.",
			);
		} catch (e) {
			Alert.alert("Could not save", (e as Error).message);
		} finally {
			setSaving(false);
		}
	}
	async function savePreference() {
		setSaving(true);
		try {
			await api(`/v1/workplaces/${selected}/my/preference`, {
				method: "PUT",
				body: { note: preference.trim() === "" ? null : preference.trim() },
			});
			await qc.invalidateQueries({ queryKey: ["constraints", selected] });
			Alert.alert("Saved", "Work Preference updated.");
		} catch (e) {
			Alert.alert("Could not save", (e as Error).message);
		} finally {
			setSaving(false);
		}
	}
	async function requestTimeOff() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(offStartDate)) {
			Alert.alert("Check dates", "Choose a start date.");
			return;
		}
		if (!leaveTypeId) {
			Alert.alert("Leave type", "Choose vacation, sick, or another type.");
			return;
		}
		const endDate = /^\d{4}-\d{2}-\d{2}$/.test(offEndDate)
			? offEndDate
			: offStartDate;
		if (endDate < offStartDate) {
			Alert.alert("Check dates", "End date must be on or after the start.");
			return;
		}
		const s = parseTime(offStart);
		const e = parseTime(offEnd);
		if (!offAllDay && (s === null || e === null || s >= e)) {
			Alert.alert("Check times", "Invalid range.");
			return;
		}
		setRequesting(true);
		try {
			if (editingId) {
				await api(`/v1/workplaces/${selected}/my/time-off/${editingId}`, {
					method: "PATCH",
					body: {
						startDate: offStartDate,
						endDate,
						allDay: offAllDay,
						...(offAllDay ? {} : { startMinute: s, endMinute: e }),
						reason: offReason.trim() || undefined,
						leaveTypeId,
					},
				});
				setEditingId(null);
				setOffReason("");
				await qc.invalidateQueries({ queryKey: ["constraints", selected] });
				await qc.invalidateQueries({ queryKey: ["pto", selected] });
				Alert.alert("Updated", "Your pending request was updated.");
			} else {
				await api(`/v1/workplaces/${selected}/my/time-off`, {
					method: "POST",
					body: {
						startDate: offStartDate,
						endDate,
						allDay: offAllDay,
						...(offAllDay ? {} : { startMinute: s, endMinute: e }),
						reason: offReason.trim() || undefined,
						leaveTypeId,
					},
				});
				setOffReason("");
				await qc.invalidateQueries({ queryKey: ["constraints", selected] });
				await qc.invalidateQueries({ queryKey: ["pto", selected] });
				Alert.alert("Requested", "Your manager will review this time off.");
			}
		} catch (err) {
			Alert.alert(
				editingId ? "Could not update" : "Could not request",
				(err as Error).message,
			);
		} finally {
			setRequesting(false);
		}
	}
	async function cancelRequest(id: string) {
		try {
			await api(`/v1/workplaces/${selected}/my/time-off/${id}`, {
				method: "DELETE",
			});
			await qc.invalidateQueries({ queryKey: ["constraints", selected] });
		} catch (e) {
			Alert.alert("Could not cancel", (e as Error).message);
		}
	}

	if (c.isLoading)
		return (
			<View style={[styles.centered, { backgroundColor: theme.background }]}>
				<ActivityIndicator color={theme.primary} />
			</View>
		);

	return (
		<AppScreen>
			<PageHeader
				title="Time off & availability"
				description="Request days off first. Recurring unavailability and preferences stay separate."
			/>

			<Card>
				<Text style={[styles.title, { color: theme.text }]}>Time off</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>
					All-day by default. Your manager reviews every request.
				</Text>
				{(pto.data?.balances ?? []).map((balance) => (
					<Text
						key={balance.leaveTypeId}
						style={[styles.desc, { color: theme.muted }]}
					>
						{balance.name}: {formatLeaveHours(balance.minutes)} remaining
					</Text>
				))}
				{(c.data?.timeOff ?? []).map((r) => (
					<View
						key={r.id}
						style={[styles.rowCard, { borderColor: theme.border }]}
					>
						<View style={{ flex: 1, gap: 4 }}>
							<Text
								style={[
									styles.rowLabel,
									{ color: theme.text, fontVariant: ["tabular-nums"] },
								]}
							>
								{formatLeaveRange(r)}
								{r.chargeMinutes
									? ` · ${formatLeaveHours(r.chargeMinutes)}`
									: ""}
							</Text>
							<View style={{ flexDirection: "row" }}>
								<Badge
									label={
										r.status === "pending"
											? "Needs a decision"
											: r.status === "approved"
												? "Approved"
												: "Declined"
									}
									variant={
										r.status === "approved"
											? "success"
											: r.status === "declined"
												? "danger"
												: "outline"
									}
								/>
							</View>
							{r.decisionReason ? (
								<Text style={[styles.desc, { color: theme.muted }]}>
									Manager: {r.decisionReason}
								</Text>
							) : null}
						</View>
						{r.status === "pending" ? (
							<View style={{ alignItems: "flex-end", gap: 8 }}>
								<Pressable
									onPress={() => {
										setEditingId(r.id);
										setLeaveTypeId(r.leaveTypeId ?? "");
										setOffStartDate(r.startDate ?? r.startsAt.slice(0, 10));
										setOffEndDate(r.endDate ?? r.endsAt.slice(0, 10));
										setOffAllDay(r.allDay ?? true);
										setOffStart(
											toLabel(r.startMinute ?? 9 * 60),
										);
										setOffEnd(toLabel(r.endMinute ?? 17 * 60));
										setOffReason(r.reason ?? "");
									}}
								>
									<Text style={[styles.link, { color: theme.primary }]}>
										Edit
									</Text>
								</Pressable>
								<Pressable
									onPress={() =>
										confirmAction({
											title: "Cancel this time-off request?",
											message:
												"Your manager will no longer review it. You can submit a new request later.",
											confirmLabel: "Cancel request",
											destructive: true,
											onConfirm: () => void cancelRequest(r.id),
										})
									}
								>
									<Text style={[styles.link, { color: theme.primary }]}>
										Cancel
									</Text>
								</Pressable>
							</View>
						) : null}
					</View>
				))}
				<View style={[styles.dashed, { borderColor: theme.border }]}>
					<Text style={[styles.label, { color: theme.muted }]}>
						{editingId ? "Edit request" : "New request"}
					</Text>
					<View style={styles.chipsRow}>
						{(leaveTypes.data?.leaveTypes ?? []).map((type) => {
							const selectedType = leaveTypeId === type.id;
							return (
								<Pressable
									key={type.id}
									onPress={() => setLeaveTypeId(type.id)}
									style={[
										styles.chip,
										{
											borderColor: selectedType ? theme.primary : theme.border,
											backgroundColor: selectedType
												? theme.primary
												: "transparent",
										},
									]}
								>
									<Text
										style={[
											styles.chipText,
											{ color: selectedType ? theme.onPrimary : theme.text },
										]}
									>
										{type.name}
									</Text>
								</Pressable>
							);
						})}
					</View>
					<DateField
						label="From"
						value={offStartDate}
						onChange={(value) => {
							setOffStartDate(value);
							if (!offEndDate || offEndDate < value) setOffEndDate(value);
						}}
					/>
					<DateField
						label="Until"
						value={offEndDate}
						onChange={setOffEndDate}
					/>
					<Pressable
						onPress={() => setOffAllDay((value) => !value)}
						style={styles.rowBetween}
					>
						<Text style={[styles.rowLabel, { color: theme.text }]}>
							All day
						</Text>
						<Badge
							label={offAllDay ? "On" : "Off"}
							variant={offAllDay ? "success" : "outline"}
						/>
					</Pressable>
					{offAllDay ? null : (
						<View style={styles.pickerStack}>
							<TimeField
								label="Starts"
								value={offStart}
								onChange={setOffStart}
							/>
							<TimeField label="Ends" value={offEnd} onChange={setOffEnd} />
						</View>
					)}
					<Field
						label="Note (optional)"
						value={offReason}
						onChange={setOffReason}
					/>
					<PrimaryButton
						label={
							requesting
								? "Saving…"
								: editingId
									? "Save changes"
									: "Request time off"
						}
						disabled={requesting}
						onPress={() => void requestTimeOff()}
					/>
					{editingId ? (
						<Pressable
							onPress={() => {
								setEditingId(null);
								setOffReason("");
								setOffStartDate(todayIsoDate());
								setOffEndDate(todayIsoDate());
								setOffAllDay(true);
							}}
						>
							<Text style={[styles.link, { color: theme.primary }]}>
								Cancel edit
							</Text>
						</Pressable>
					) : null}
				</View>
			</Card>

			{/* Unavailability */}
			<Card>
				<Text style={[styles.title, { color: theme.text }]}>
					Unavailable times
				</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>
					These times block scheduling unless a manager records an override.
				</Text>

				{recurring.map((it) => (
					<View
						key={it.id}
						style={[styles.rowCard, { borderColor: theme.border }]}
					>
						<View style={{ flex: 1 }}>
							<Text style={[styles.rowLabel, { color: theme.text }]}>
								{DAY_NAMES[it.weekday]} · {it.start}–{it.end}
							</Text>
						</View>
						<Pressable
							onPress={() =>
								setRecurring(recurring.filter((o) => o.id !== it.id))
							}
						>
							<Text style={[styles.link, { color: theme.notification }]}>
								Remove
							</Text>
						</Pressable>
					</View>
				))}
				{dates.map((it) => (
					<View
						key={it.id}
						style={[styles.rowCard, { borderColor: theme.border }]}
					>
						<View style={{ flex: 1 }}>
							<Text style={[styles.rowLabel, { color: theme.text }]}>
								{it.date} · {it.start}–{it.end}
							</Text>
						</View>
						<Pressable
							onPress={() => setDates(dates.filter((o) => o.id !== it.id))}
						>
							<Text style={[styles.link, { color: theme.notification }]}>
								Remove
							</Text>
						</Pressable>
					</View>
				))}
				{recurring.length === 0 && dates.length === 0 ? (
					<Hint>No Unavailability added.</Hint>
				) : null}

				<View style={[styles.dashed, { borderColor: theme.border }]}>
					<Text style={[styles.label, { color: theme.muted }]}>
						Recurring Unavailability
					</Text>
					<NativeWeekdayPicker
						value={recurringDraft.weekday}
						onChange={(v) =>
							setRecurringDraft({ ...recurringDraft, weekday: v })
						}
					/>
					<View style={styles.pickerStack}>
						<TimeField
							label="Start time"
							value={recurringDraft.start}
							onChange={(v) =>
								setRecurringDraft({ ...recurringDraft, start: v })
							}
						/>
						<TimeField
							label="End time"
							value={recurringDraft.end}
							onChange={(v) => setRecurringDraft({ ...recurringDraft, end: v })}
						/>
					</View>
					<PrimaryButton
						label="Add weekly window"
						onPress={() => {
							if (
								parseTime(recurringDraft.start) === null ||
								parseTime(recurringDraft.end) === null
							) {
								Alert.alert("Check times", "Use HH:mm.");
								return;
							}
							setRecurring([...recurring, recurringDraft]);
							setRecurringDraft(newRecurring());
						}}
					/>
				</View>

				<View style={[styles.dashed, { borderColor: theme.border }]}>
					<Text style={[styles.label, { color: theme.muted }]}>
						Date exception
					</Text>
					<DateField
						label="Date"
						value={dateDraft.date}
						onChange={(v) => setDateDraft({ ...dateDraft, date: v })}
					/>
					<View style={styles.pickerStack}>
						<TimeField
							label="Start time"
							value={dateDraft.start}
							onChange={(v) => setDateDraft({ ...dateDraft, start: v })}
						/>
						<TimeField
							label="End time"
							value={dateDraft.end}
							onChange={(v) => setDateDraft({ ...dateDraft, end: v })}
						/>
					</View>
					<PrimaryButton
						label="Add date exception"
						onPress={() => {
							if (
								!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft.date) ||
								parseTime(dateDraft.start) === null ||
								parseTime(dateDraft.end) === null
							) {
								Alert.alert("Check date and times");
								return;
							}
							setDates([...dates, dateDraft]);
							setDateDraft(newDateDraft());
						}}
					/>
				</View>

				<PrimaryButton
					label={saving ? "Saving…" : "Save Unavailability"}
					disabled={saving}
					onPress={() => void saveUnavailability()}
				/>
			</Card>

			{/* Preference */}
			<Card>
				<Text style={[styles.title, { color: theme.text }]}>
					Shift preference
				</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>
					Optional guidance for your manager. This does not block scheduling.
				</Text>
				<NativeField
					label="Preference"
					value={preference}
					onChange={setPreference}
					placeholder="For example, I prefer morning shifts"
					multiline
				/>
				<PrimaryButton
					label={saving ? "Saving…" : "Save preference"}
					disabled={saving}
					onPress={() => void savePreference()}
				/>
			</Card>

		</AppScreen>
	);
}

function Field({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<View style={{ flex: 1 }}>
			<NativeField label={label} value={value} onChange={onChange} />
		</View>
	);
}
function DateField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<View style={styles.pickerField}>
			<NativeDatePickerField label={label} value={value} onChange={onChange} />
		</View>
	);
}
function TimeField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<View style={styles.pickerField}>
			<NativeTimePickerField label={label} value={value} onChange={onChange} />
		</View>
	);
}
const styles = StyleSheet.create({
	centered: { flex: 1, alignItems: "center", justifyContent: "center" },
	title: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
	desc: { fontSize: 13, lineHeight: 19 },
	label: {
		fontSize: 11,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	rowCard: {
		borderWidth: 1,
		borderRadius: 10,
		padding: 12,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	rowLabel: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
	link: { fontSize: 13, fontWeight: "700" },
	dashed: {
		borderWidth: 1,
		borderRadius: 12,
		padding: 12,
		gap: 10,
		borderStyle: "dashed",
	},
	pickerStack: { gap: 12, width: "100%" },
	pickerField: { width: "100%", minHeight: 52 },
	chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		minHeight: 36,
		borderWidth: 1,
		borderRadius: 999,
		justifyContent: "center",
		paddingHorizontal: 14,
	},
	chipText: { fontSize: 13, fontWeight: "700" },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});
