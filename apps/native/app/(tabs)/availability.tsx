import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen, Badge, Card, Hint, NativeDatePickerField, NativeField, NativeTimePickerField, NativeWeekdayPicker, PageHeader, PrimaryButton, useAppTheme } from "@/components/ui";
import { api } from "@/lib/api";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

interface ConstraintsResponse {
	unavailability: { id: string; kind: "recurring" | "date"; weekday: number | null; date: string | null; startMinute: number; endMinute: number; note: string | null }[];
	preference: string | null;
	timeOff: { id: string; startsAt: string; endsAt: string; reason: string | null; status: "pending" | "approved" | "declined"; decisionReason: string | null }[];
}
interface RecurringDraft { id: string; weekday: number; start: string; end: string }
interface DateDraft { id: string; date: string; start: string; end: string }

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function newRecurring(): RecurringDraft { return { id: newId(), weekday: 0, start: "08:00", end: "14:00" }; }
function newDateDraft(): DateDraft { return { id: newId(), date: "", start: "08:00", end: "14:00" }; }
function parseTime(v: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
	if (!m) return null;
	const h = Number(m[1]); const mm = Number(m[2]);
	if (h > 24 || mm > 59) return null;
	return h * 60 + mm;
}
function toLabel(min: number) { const h = Math.floor(min / 60); const mm = min % 60; return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; }

export default function AvailabilityScreen() {
	const { theme } = useAppTheme();
	const { selected } = useSelectedWorkplaceId();
	const qc = useQueryClient();
	const c = useQuery({ queryKey: ["constraints", selected], queryFn: () => api<ConstraintsResponse>(`/v1/workplaces/${selected}/my/constraints`), enabled: Boolean(selected) });

	const [recurring, setRecurring] = useState<RecurringDraft[]>([]);
	const [dates, setDates] = useState<DateDraft[]>([]);
	const [recurringDraft, setRecurringDraft] = useState<RecurringDraft>(newRecurring());
	const [dateDraft, setDateDraft] = useState<DateDraft>(newDateDraft());
	const [preference, setPreference] = useState("");
	const [saving, setSaving] = useState(false);
	const [offDate, setOffDate] = useState("");
	const [offStart, setOffStart] = useState("17:00");
	const [offEnd, setOffEnd] = useState("23:00");
	const [offReason, setOffReason] = useState("");
	const [requesting, setRequesting] = useState(false);

	useEffect(() => {
		if (!c.data) return;
		setRecurring(c.data.unavailability.filter((r) => r.kind === "recurring").map((r) => ({ id: r.id, weekday: r.weekday ?? 0, start: toLabel(r.startMinute), end: toLabel(r.endMinute) })));
		setDates(c.data.unavailability.filter((r) => r.kind === "date").map((r) => ({ id: r.id, date: r.date ?? "", start: toLabel(r.startMinute), end: toLabel(r.endMinute) })));
		setPreference(c.data.preference ?? "");
	}, [c.data]);

	async function saveUnavailability() {
		for (const it of [...recurring, ...dates]) { const s = parseTime(it.start); const e = parseTime(it.end); if (s === null || e === null || s >= e) { Alert.alert("Check times", `"${it.start}–${it.end}" is not a valid range.`); return; } }
		for (const it of dates) if (!/^\d{4}-\d{2}-\d{2}$/.test(it.date)) { Alert.alert("Check dates", `"${it.date}" is not valid.`); return; }
		setSaving(true);
		try {
			await api(`/v1/workplaces/${selected}/my/unavailability`, { method: "PUT", body: { recurring: recurring.map((i) => ({ weekday: i.weekday, startMinute: parseTime(i.start), endMinute: parseTime(i.end) })), dates: dates.map((i) => ({ date: i.date, startMinute: parseTime(i.start), endMinute: parseTime(i.end) })) } });
			await qc.invalidateQueries({ queryKey: ["constraints", selected] });
			Alert.alert("Saved", "Unavailability updated — hard constraint for your Manager.");
		} catch (e) { Alert.alert("Could not save", (e as Error).message); } finally { setSaving(false); }
	}
	async function savePreference() {
		setSaving(true);
		try { await api(`/v1/workplaces/${selected}/my/preference`, { method: "PUT", body: { note: preference.trim() === "" ? null : preference.trim() } }); await qc.invalidateQueries({ queryKey: ["constraints", selected] }); Alert.alert("Saved", "Work Preference updated."); } catch (e) { Alert.alert("Could not save", (e as Error).message); } finally { setSaving(false); }
	}
	async function requestTimeOff() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(offDate)) { Alert.alert("Check date", "Use YYYY-MM-DD."); return; }
		const s = parseTime(offStart); const e = parseTime(offEnd); if (s === null || e === null || s >= e) { Alert.alert("Check times", "Invalid range."); return; }
		const sd = new Date(`${offDate}T00:00:00`); sd.setMinutes(s); const ed = new Date(`${offDate}T00:00:00`); ed.setMinutes(e);
		setRequesting(true);
		try { await api(`/v1/workplaces/${selected}/my/time-off`, { method: "POST", body: { startsAt: sd.toISOString(), endsAt: ed.toISOString(), reason: offReason.trim() || undefined } }); setOffDate(""); setOffReason(""); await qc.invalidateQueries({ queryKey: ["constraints", selected] }); Alert.alert("Requested", "Time-off Request sent to your Manager."); } catch (e) { Alert.alert("Could not request", (e as Error).message); } finally { setRequesting(false); }
	}
	async function cancelRequest(id: string) { try { await api(`/v1/workplaces/${selected}/my/time-off/${id}`, { method: "DELETE" }); await qc.invalidateQueries({ queryKey: ["constraints", selected] }); } catch (e) { Alert.alert("Could not cancel", (e as Error).message); } }

	if (c.isLoading) return <View style={[styles.centered, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.primary} /></View>;

	return (
		<AppScreen>
			<PageHeader eyebrow="SCHEDULING" title="Availability" description="Tell your manager when you can’t work, which shifts you prefer, and when you need time off." />

			{/* Unavailability */}
			<Card>
				<Text style={[styles.title, { color: theme.text }]}>Unavailable times</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>These times block scheduling unless a manager records an override.</Text>

				{recurring.map((it) => (
					<View key={it.id} style={[styles.rowCard, { borderColor: theme.border }]}>
						<View style={{ flex: 1 }}><Text style={[styles.rowLabel, { color: theme.text }]}>{DAY_NAMES[it.weekday]} · {it.start}–{it.end}</Text></View>
						<Pressable onPress={() => setRecurring(recurring.filter((o) => o.id !== it.id))}><Text style={[styles.link, { color: theme.notification }]}>Remove</Text></Pressable>
					</View>
				))}
				{dates.map((it) => (
					<View key={it.id} style={[styles.rowCard, { borderColor: theme.border }]}>
						<View style={{ flex: 1 }}><Text style={[styles.rowLabel, { color: theme.text }]}>{it.date} · {it.start}–{it.end}</Text></View>
						<Pressable onPress={() => setDates(dates.filter((o) => o.id !== it.id))}><Text style={[styles.link, { color: theme.notification }]}>Remove</Text></Pressable>
					</View>
				))}
				{recurring.length === 0 && dates.length === 0 ? <Hint>No Unavailability added.</Hint> : null}

				<View style={[styles.dashed, { borderColor: theme.border }]}>
					<Text style={[styles.label, { color: theme.muted }]}>Recurring Unavailability</Text>
					<NativeWeekdayPicker value={recurringDraft.weekday} onChange={(v) => setRecurringDraft({ ...recurringDraft, weekday: v })} />
					<View style={styles.pickerStack}><TimeField label="Start time" value={recurringDraft.start} onChange={(v) => setRecurringDraft({ ...recurringDraft, start: v })} /><TimeField label="End time" value={recurringDraft.end} onChange={(v) => setRecurringDraft({ ...recurringDraft, end: v })} /></View>
					<PrimaryButton label="Add weekly window" onPress={() => { if (parseTime(recurringDraft.start) === null || parseTime(recurringDraft.end) === null) { Alert.alert("Check times", "Use HH:mm."); return; } setRecurring([...recurring, recurringDraft]); setRecurringDraft(newRecurring()); }} />
				</View>

				<View style={[styles.dashed, { borderColor: theme.border }]}>
					<Text style={[styles.label, { color: theme.muted }]}>Date exception</Text>
					<DateField label="Date" value={dateDraft.date} onChange={(v) => setDateDraft({ ...dateDraft, date: v })} />
					<View style={styles.pickerStack}><TimeField label="Start time" value={dateDraft.start} onChange={(v) => setDateDraft({ ...dateDraft, start: v })} /><TimeField label="End time" value={dateDraft.end} onChange={(v) => setDateDraft({ ...dateDraft, end: v })} /></View>
					<PrimaryButton label="Add date exception" onPress={() => { if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft.date) || parseTime(dateDraft.start) === null || parseTime(dateDraft.end) === null) { Alert.alert("Check date and times"); return; } setDates([...dates, dateDraft]); setDateDraft(newDateDraft()); }} />
				</View>

				<PrimaryButton label={saving ? "Saving…" : "Save Unavailability"} disabled={saving} onPress={() => void saveUnavailability()} />
			</Card>

			{/* Preference */}
			<Card>
				<Text style={[styles.title, { color: theme.text }]}>Shift preference</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>Optional guidance for your manager. This does not block scheduling.</Text>
				<NativeField label="Preference" value={preference} onChange={setPreference} placeholder="For example, I prefer morning shifts" multiline />
				<PrimaryButton label={saving ? "Saving…" : "Save preference"} disabled={saving} onPress={() => void savePreference()} />
			</Card>

			{/* Time-off */}
			<Card>
				<Text style={[styles.title, { color: theme.text }]}>Time off</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>Send a request for your manager to review.</Text>
				{(c.data?.timeOff ?? []).map((r) => (
					<View key={r.id} style={[styles.rowCard, { borderColor: theme.border }]}>
						<View style={{ flex: 1, gap: 4 }}>
							<Text style={[styles.rowLabel, { color: theme.text, fontVariant: ["tabular-nums"] }]}>{formatDay(r.startsAt)} · {toLabel(toMin(r.startsAt))}–{toLabel(toMin(r.endsAt))}</Text>
							<View style={{ flexDirection: "row" }}><Badge label={r.status} variant={r.status === "approved" ? "success" : r.status === "declined" ? "danger" : "outline"} /></View>
							{r.decisionReason ? <Text style={[styles.desc, { color: theme.muted }]}>Manager: {r.decisionReason}</Text> : null}
						</View>
						{r.status === "pending" ? <Pressable onPress={() => void cancelRequest(r.id)}><Text style={[styles.link, { color: theme.primary }]}>Cancel</Text></Pressable> : null}
					</View>
				))}
				<View style={[styles.dashed, { borderColor: theme.border }]}>
					<Text style={[styles.label, { color: theme.muted }]}>New Time-off Request</Text>
					<DateField label="Date" value={offDate} onChange={setOffDate} />
					<View style={styles.pickerStack}><TimeField label="Start time" value={offStart} onChange={setOffStart} /><TimeField label="End time" value={offEnd} onChange={setOffEnd} /></View>
					<Field label="Reason (optional)" value={offReason} onChange={setOffReason} />
					<PrimaryButton label={requesting ? "Sending…" : "Request time off"} disabled={requesting} onPress={() => void requestTimeOff()} />
				</View>
			</Card>
		</AppScreen>
	);
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
	return <View style={{ flex: 1 }}><NativeField label={label} value={value} onChange={onChange} /></View>;
}
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
	return <View style={styles.pickerField}><NativeDatePickerField label={label} value={value} onChange={onChange} /></View>;
}
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
	return <View style={styles.pickerField}><NativeTimePickerField label={label} value={value} onChange={onChange} /></View>;
}
function toMin(iso: string) { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); }
function formatDay(iso: string) { return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }

const styles = StyleSheet.create({
	centered: { flex: 1, alignItems: "center", justifyContent: "center" },
	title: { fontSize: 17, fontWeight: "700", lineHeight: 24 },
	desc: { fontSize: 13, lineHeight: 19 },
	label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
	rowCard: { borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
	rowLabel: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
	link: { fontSize: 13, fontWeight: "700" },
	dashed: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10, borderStyle: "dashed" },
	pickerStack: { gap: 12, width: "100%" },
	pickerField: { width: "100%", minHeight: 52 },
});
