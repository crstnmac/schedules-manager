import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	Share,
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
	NativeSwitchField,
	NativeTimePickerField,
	NativeWeekdayPicker,
	PageHeader,
	PrimaryButton,
	SecondaryButton,
	useAppTheme,
} from "@/components/ui";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import {
	formatLeaveHours,
	formatLeaveMonth,
	formatLeaveRange,
	hoursToMinutes,
	leavePolicySummary,
	todayIsoDate,
} from "@/lib/leave";
import {
	type LeaveApprovalDto,
	type LeaveTypeDto,
	useCalendarTokens,
	useCreateMyCalendarToken,
	useCreateMyLeaveEncashment,
	useCurrentEmployment,
	useLeaveForecast,
	useLeaveTypes,
	usePtoBalances,
	useRevokeCalendarToken,
} from "@/lib/queries";
import { getServerUrl } from "@/lib/server-url";
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
		status: "pending" | "approved" | "declined" | "cancelled";
		decisionReason: string | null;
		leaveTypeId?: string | null;
		batchId?: string | null;
		isEmergency?: boolean;
		currentStep?: number;
		createdAt?: string;
		cancelledAt?: string | null;
		approvals?: LeaveApprovalDto[];
		documents?: {
			id: string;
			fileName: string;
			mimeType: string;
			sizeBytes: number;
			createdAt: string;
		}[];
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

type RequestMode = "single" | "repeats";
type RecurrenceFrequency = "weekly" | "biweekly" | "monthly";

const RECURRENCE_FREQUENCIES: { value: RecurrenceFrequency; label: string }[] =
	[
		{ value: "weekly", label: "Weekly" },
		{ value: "biweekly", label: "Biweekly" },
		{ value: "monthly", label: "Monthly" },
	];

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
function Link({
	label,
	color,
	onPress,
}: {
	label: string;
	color: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled={false}
			onPress={onPress}
			style={({ pressed }) => [styles.linkTap, { opacity: pressed ? 0.55 : 1 }]}
		>
			<Text style={[styles.link, { color }]}>{label}</Text>
		</Pressable>
	);
}

function toLabel(min: number) {
	const h = Math.floor(min / 60);
	const mm = min % 60;
	return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function approvalStatusLabel(status: LeaveApprovalDto["status"]): string {
	if (status === "approved") return "Approved";
	if (status === "declined") return "Declined";
	if (status === "skipped") return "Skipped";
	if (status === "escalated") return "Escalated";
	return "Waiting";
}

function ApprovalSteps({
	approvals,
	currentStep,
}: {
	approvals: LeaveApprovalDto[];
	currentStep?: number;
}) {
	const { theme } = useAppTheme();
	const current =
		typeof currentStep === "number"
			? approvals.find((approval) => approval.stepOrder === currentStep)
			: approvals.find(
					(approval) =>
						approval.status === "pending" || approval.status === "escalated",
				);
	return (
		<View style={styles.chipsRow}>
			{approvals.map((approval) => (
				<Badge
					key={approval.id}
					label={`${approval.stepOrder + 1}. ${approvalStatusLabel(approval.status)}`}
					variant={
						approval.status === "approved"
							? "success"
							: approval.status === "declined"
								? "danger"
								: approval.status === "skipped"
									? "outline"
									: "amber"
					}
				/>
			))}
			{approvals.length > 1 ? (
				<Text style={[styles.desc, { color: theme.muted }]}>
					Step {(current?.stepOrder ?? 0) + 1} of {approvals.length}
				</Text>
			) : null}
		</View>
	);
}

export default function AvailabilityScreen() {
	const { theme } = useAppTheme();
	const { selected } = useSelectedWorkplaceId();
	const { timeFormat } = useDisplayPrefs();
	const { employment } = useCurrentEmployment();
	const leaveTypes = useLeaveTypes(selected ?? undefined);
	const pto = usePtoBalances(selected ?? undefined, employment?.id);
	const calendarTokens = useCalendarTokens(selected ?? undefined);
	const createCalendarToken = useCreateMyCalendarToken(selected ?? undefined);
	const revokeCalendarToken = useRevokeCalendarToken(selected ?? undefined);
	const createEncashment = useCreateMyLeaveEncashment(selected ?? undefined);
	const forecast = useLeaveForecast(selected ?? undefined, employment?.id, 6);
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
	const [offEmergency, setOffEmergency] = useState(false);
	const [requestMode, setRequestMode] = useState<RequestMode>("single");
	const [recurrenceFrequency, setRecurrenceFrequency] =
		useState<RecurrenceFrequency>("weekly");
	const [recurrenceCount, setRecurrenceCount] = useState(4);
	const [leaveTypeId, setLeaveTypeId] = useState("");
	const [requesting, setRequesting] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [uploadingRequestId, setUploadingRequestId] = useState<string | null>(
		null,
	);
	const [forecastOpen, setForecastOpen] = useState(false);
	const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
	const [encashOpen, setEncashOpen] = useState(false);
	const [encashLeaveTypeId, setEncashLeaveTypeId] = useState("");
	const [encashHours, setEncashHours] = useState("8");
	const [encashNote, setEncashNote] = useState("");

	const typeById = useMemo(() => {
		const map = new Map<string, LeaveTypeDto>();
		for (const type of leaveTypes.data?.leaveTypes ?? [])
			map.set(type.id, type);
		return map;
	}, [leaveTypes.data]);
	const myCalendarToken =
		(calendarTokens.data ?? []).find(
			(token) => token.employmentId === employment?.id && !token.revokedAt,
		) ?? null;
	const encashableTypes = (leaveTypes.data?.leaveTypes ?? []).filter(
		(type) => type.policy?.encashmentEnabled,
	);

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
				"Your manager can’t schedule you into those times without talking to you first.",
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
				const window = {
					startDate: offStartDate,
					endDate,
					allDay: offAllDay,
					...(offAllDay ? {} : { startMinute: s, endMinute: e }),
					reason: offReason.trim() || undefined,
					leaveTypeId,
				};
				const recurring = requestMode === "repeats";
				await api(`/v1/workplaces/${selected}/my/time-off`, {
					method: "POST",
					body: recurring
						? {
								windows: [window],
								recurrence: {
									frequency: recurrenceFrequency,
									count: recurrenceCount,
								},
								isEmergency: offEmergency,
							}
						: { ...window, isEmergency: offEmergency },
				});
				setOffReason("");
				setOffEmergency(false);
				setRequestMode("single");
				await qc.invalidateQueries({ queryKey: ["constraints", selected] });
				await qc.invalidateQueries({ queryKey: ["pto", selected] });
				await qc.invalidateQueries({ queryKey: ["leave-forecast", selected] });
				Alert.alert(
					"Requested",
					recurring
						? `${recurrenceCount} recurring requests submitted. Your manager will review them.`
						: "Your manager will review this time off.",
				);
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
	async function cancelApprovedRequest(id: string) {
		try {
			await api(`/v1/workplaces/${selected}/my/time-off/${id}/cancel`, {
				method: "POST",
			});
			await qc.invalidateQueries({ queryKey: ["constraints", selected] });
			await qc.invalidateQueries({ queryKey: ["pto", selected] });
			await qc.invalidateQueries({ queryKey: ["leave-forecast", selected] });
			Alert.alert("Cancelled", "Any charged balance was restored.");
		} catch (e) {
			Alert.alert("Could not cancel", (e as Error).message);
		}
	}
	async function attachDocument(requestId: string) {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: [
					"application/pdf",
					"image/jpeg",
					"image/png",
					"image/webp",
					"image/heic",
				],
				copyToCacheDirectory: true,
			});
			if (result.canceled) return;
			const asset = result.assets[0];
			if (!asset) return;
			if (asset.size != null && asset.size > 10 * 1024 * 1024) {
				Alert.alert("Too large", "Documents must be 10 MB or smaller.");
				return;
			}
			setUploadingRequestId(requestId);
			const formData = new FormData();
			formData.append("file", {
				uri: asset.uri,
				name: asset.name,
				type: asset.mimeType ?? "application/octet-stream",
			} as unknown as Blob);
			const cookie = await authClient.getCookie();
			const response = await fetch(
				`${getServerUrl()}/v1/workplaces/${selected}/time-off/${requestId}/documents`,
				{
					method: "POST",
					headers: cookie ? { Cookie: cookie } : undefined,
					body: formData,
				},
			);
			if (!response.ok) {
				let message = `Upload failed (${response.status}).`;
				try {
					const payload = (await response.json()) as { message?: string };
					if (payload.message) message = payload.message;
				} catch {
					// keep default message
				}
				throw new Error(message);
			}
			await qc.invalidateQueries({ queryKey: ["constraints", selected] });
			Alert.alert("Attached", "The document was uploaded.");
		} catch (e) {
			Alert.alert("Could not attach", (e as Error).message);
		} finally {
			setUploadingRequestId(null);
		}
	}
	async function shareCalendarLink() {
		if (!calendarUrl) return;
		try {
			await Share.share({ message: calendarUrl, url: calendarUrl });
		} catch {
			// The share sheet can be dismissed; there is nothing to recover.
		}
	}
	async function submitEncashment() {
		if (!encashLeaveTypeId) {
			Alert.alert("Leave type", "Choose a leave type to encash.");
			return;
		}
		const minutes = hoursToMinutes(encashHours);
		if (minutes <= 0) {
			Alert.alert("Hours", "Enter how many hours to encash.");
			return;
		}
		try {
			await createEncashment.mutateAsync({
				leaveTypeId: encashLeaveTypeId,
				minutes,
				note: encashNote.trim() || undefined,
			});
			setEncashOpen(false);
			setEncashHours("8");
			setEncashNote("");
			Alert.alert("Requested", "Your manager will review the encashment.");
		} catch (e) {
			Alert.alert("Could not request", (e as Error).message);
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
			<PageHeader title="Time off" />

			<Card>
				<Text style={[styles.title, { color: theme.text }]}>Time off</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>
					All-day by default. Your manager reviews every request.
				</Text>
				{(pto.data?.balances ?? []).map((balance) => {
					const type = typeById.get(balance.leaveTypeId);
					const chips = type?.policy ? leavePolicySummary(type.policy) : [];
					return (
						<View key={balance.leaveTypeId} style={{ gap: 4 }}>
							<Text style={[styles.desc, { color: theme.muted }]}>
								{balance.name}: {formatLeaveHours(balance.minutes)} remaining
							</Text>
							{chips.length > 0 ? (
								<View style={styles.chipsRow}>
									{chips.map((chip) => (
										<Badge key={chip} label={chip} variant="outline" />
									))}
								</View>
							) : null}
						</View>
					);
				})}
				{(c.data?.timeOff ?? []).map((r) => {
					const attachable = r.status === "pending" || r.status === "approved";
					return (
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
									{formatLeaveRange(r, timeFormat)}
									{r.chargeMinutes
										? ` · ${formatLeaveHours(r.chargeMinutes)}`
										: ""}
								</Text>
								<View style={styles.chipsRow}>
									<Badge
										label={
											r.status === "pending"
												? "Waiting for manager"
												: r.status === "approved"
													? "Approved"
													: r.status === "cancelled"
														? "Cancelled"
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
									{r.isEmergency ? (
										<Badge label="Emergency" variant="amber" />
									) : null}
								</View>
								{r.approvals && r.approvals.length > 0 ? (
									<ApprovalSteps
										approvals={r.approvals}
										currentStep={r.currentStep}
									/>
								) : null}
								{r.decisionReason ? (
									<Text style={[styles.desc, { color: theme.muted }]}>
										Manager: {r.decisionReason}
									</Text>
								) : null}
								{r.documents && r.documents.length > 0 ? (
									<Text style={[styles.desc, { color: theme.muted }]}>
										Documents:{" "}
										{r.documents
											.map((document) => document.fileName)
											.join(", ")}
									</Text>
								) : null}
								{attachable ? (
									<Link
										label={
											uploadingRequestId === r.id
												? "Uploading…"
												: `Attach document to ${formatLeaveRange(r, timeFormat)}`
										}
										color={theme.primary}
										onPress={() => void attachDocument(r.id)}
									/>
								) : null}
							</View>
							{r.status === "pending" || r.status === "approved" ? (
								<View style={{ alignItems: "flex-end", gap: 8 }}>
									{r.status === "pending" ? (
										<Link
											label={`Edit request ${formatLeaveRange(r, timeFormat)}`}
											color={theme.primary}
											onPress={() => {
												setEditingId(r.id);
												setLeaveTypeId(r.leaveTypeId ?? "");
												setOffStartDate(r.startDate ?? r.startsAt.slice(0, 10));
												setOffEndDate(r.endDate ?? r.endsAt.slice(0, 10));
												setOffAllDay(r.allDay ?? true);
												setOffStart(toLabel(r.startMinute ?? 9 * 60));
												setOffEnd(toLabel(r.endMinute ?? 17 * 60));
												setOffReason(r.reason ?? "");
											}}
										/>
									) : null}
									<Link
										label="Cancel request"
										color={theme.primary}
										onPress={() =>
											confirmAction({
												title:
													r.status === "approved"
														? "Cancel this approved time off?"
														: "Cancel this time-off request?",
												message:
													r.status === "approved"
														? "Your manager will see the cancellation and any charged balance will be restored."
														: "Your manager will no longer review it. You can submit a new request later.",
												confirmLabel: "Cancel request",
												destructive: true,
												onConfirm: () =>
													void (r.status === "approved"
														? cancelApprovedRequest(r.id)
														: cancelRequest(r.id)),
											})
										}
									/>
								</View>
							) : null}
						</View>
					);
				})}
				<View style={styles.builder}>
					<Text style={[styles.label, { color: theme.muted }]}>
						{editingId ? "Edit request" : "New request"}
					</Text>
					<View style={styles.chipsRow}>
						{(leaveTypes.data?.leaveTypes ?? []).map((type) => {
							const selectedType = leaveTypeId === type.id;
							return (
								<Pressable
									key={type.id}
									accessibilityRole="radio"
									accessibilityLabel={type.name}
									accessibilityState={{ checked: selectedType }}
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
						minimumDate={new Date()}
						onChange={(value) => {
							setOffStartDate(value);
							if (!offEndDate || offEndDate < value) setOffEndDate(value);
						}}
					/>
					<DateField
						label="Until"
						value={offEndDate}
						minimumDate={new Date(offStartDate)}
						onChange={setOffEndDate}
					/>
					<NativeSwitchField
						label="All day"
						value={offAllDay}
						onChange={setOffAllDay}
					/>
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
					<NativeSwitchField
						label="Emergency"
						value={offEmergency}
						onChange={setOffEmergency}
					/>
					{editingId ? null : (
						<>
							<Text style={[styles.label, { color: theme.muted }]}>Repeat</Text>
							<View style={styles.chipsRow}>
								{(
									[
										{ value: "single", label: "Single" },
										{ value: "repeats", label: "Repeats" },
									] as const
								).map((option) => {
									const active = requestMode === option.value;
									return (
										<Pressable
											key={option.value}
											accessibilityRole="radio"
											accessibilityLabel={option.label}
											accessibilityState={{ checked: active }}
											onPress={() => setRequestMode(option.value)}
											style={[
												styles.chip,
												{
													borderColor: active ? theme.primary : theme.border,
													backgroundColor: active
														? theme.primary
														: "transparent",
												},
											]}
										>
											<Text
												style={[
													styles.chipText,
													{
														color: active ? theme.onPrimary : theme.text,
													},
												]}
											>
												{option.label}
											</Text>
										</Pressable>
									);
								})}
							</View>
							{requestMode === "repeats" ? (
								<>
									<View style={styles.chipsRow}>
										{RECURRENCE_FREQUENCIES.map((option) => {
											const active = recurrenceFrequency === option.value;
											return (
												<Pressable
													key={option.value}
													accessibilityRole="radio"
													accessibilityLabel={option.label}
													accessibilityState={{ checked: active }}
													onPress={() => setRecurrenceFrequency(option.value)}
													style={[
														styles.chip,
														{
															borderColor: active
																? theme.primary
																: theme.border,
															backgroundColor: active
																? theme.primary
																: "transparent",
														},
													]}
												>
													<Text
														style={[
															styles.chipText,
															{
																color: active ? theme.onPrimary : theme.text,
															},
														]}
													>
														{option.label}
													</Text>
												</Pressable>
											);
										})}
									</View>
									<View style={styles.stepperRow}>
										<Pressable
											accessibilityRole="button"
											accessibilityLabel="Fewer repeats"
											onPress={() =>
												setRecurrenceCount((count) => Math.max(2, count - 1))
											}
											style={[
												styles.stepperButton,
												{ borderColor: theme.border },
											]}
										>
											<Text
												style={[
													styles.stepperButtonText,
													{ color: theme.text },
												]}
											>
												−
											</Text>
										</Pressable>
										<Text style={[styles.rowLabel, { color: theme.text }]}>
											{recurrenceCount} times
										</Text>
										<Pressable
											accessibilityRole="button"
											accessibilityLabel="More repeats"
											onPress={() =>
												setRecurrenceCount((count) => Math.min(12, count + 1))
											}
											style={[
												styles.stepperButton,
												{ borderColor: theme.border },
											]}
										>
											<Text
												style={[
													styles.stepperButtonText,
													{ color: theme.text },
												]}
											>
												+
											</Text>
										</Pressable>
										<Text
											style={[styles.desc, { color: theme.muted, flex: 1 }]}
										>
											Repeats this window automatically.
										</Text>
									</View>
								</>
							) : null}
						</>
					)}
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
						<Link
							label="Cancel edit"
							color={theme.primary}
							onPress={() => {
								setEditingId(null);
								setOffReason("");
								setOffStartDate(todayIsoDate());
								setOffEndDate(todayIsoDate());
								setOffAllDay(true);
								setOffEmergency(false);
								setRequestMode("single");
							}}
						/>
					) : null}
				</View>
			</Card>

			{encashableTypes.length > 0 ? (
				<Card>
					<Text style={[styles.title, { color: theme.text }]}>
						Encash leave
					</Text>
					<Text style={[styles.desc, { color: theme.muted }]}>
						Turn unused leave into pay. A manager must approve the request.
					</Text>
					{encashOpen ? (
						<>
							<View style={styles.chipsRow}>
								{encashableTypes.map((type) => {
									const active = encashLeaveTypeId === type.id;
									return (
										<Pressable
											key={type.id}
											accessibilityRole="radio"
											accessibilityLabel={type.name}
											accessibilityState={{ checked: active }}
											onPress={() => setEncashLeaveTypeId(type.id)}
											style={[
												styles.chip,
												{
													borderColor: active ? theme.primary : theme.border,
													backgroundColor: active
														? theme.primary
														: "transparent",
												},
											]}
										>
											<Text
												style={[
													styles.chipText,
													{ color: active ? theme.onPrimary : theme.text },
												]}
											>
												{type.name}
											</Text>
										</Pressable>
									);
								})}
							</View>
							<NativeField
								label="Hours"
								value={encashHours}
								onChange={setEncashHours}
								keyboardType="decimal-pad"
							/>
							<Field
								label="Note (optional)"
								value={encashNote}
								onChange={setEncashNote}
							/>
							<PrimaryButton
								label={
									createEncashment.isPending ? "Sending…" : "Request encashment"
								}
								disabled={createEncashment.isPending}
								onPress={() => void submitEncashment()}
							/>
							<Link
								label="Cancel encashment"
								color={theme.primary}
								onPress={() => setEncashOpen(false)}
							/>
						</>
					) : (
						<SecondaryButton
							label="Encash leave"
							onPress={() => {
								setEncashLeaveTypeId(
									(current) => current || encashableTypes[0]?.id || "",
								);
								setEncashOpen(true);
							}}
						/>
					)}
				</Card>
			) : null}

			<Card>
				<Text style={[styles.title, { color: theme.text }]}>Calendar sync</Text>
				<Text style={[styles.desc, { color: theme.muted }]}>
					Subscribe to your published schedule and approved leave in a calendar
					app.
				</Text>
				{myCalendarToken ? (
					<>
						<View style={styles.chipsRow}>
							<Badge label="Active" variant="success" />
						</View>
						{calendarUrl ? (
							<Text
								style={[styles.desc, { color: theme.muted }]}
								numberOfLines={1}
							>
								{calendarUrl}
							</Text>
						) : (
							<Hint>Create a new link to share its URL again.</Hint>
						)}
						<View style={styles.actionsRow}>
							{calendarUrl ? (
								<View style={{ flex: 1 }}>
									<PrimaryButton
										label="Share link"
										onPress={() => void shareCalendarLink()}
									/>
								</View>
							) : null}
							<View style={{ flex: 1 }}>
								<SecondaryButton
									label="Revoke link"
									disabled={revokeCalendarToken.isPending}
									onPress={() =>
										confirmAction({
											title: "Revoke this calendar link?",
											message:
												"Calendar apps using this link will stop updating. You can create a new link later.",
											confirmLabel: "Revoke",
											destructive: true,
											onConfirm: () =>
												revokeCalendarToken.mutate(myCalendarToken.id, {
													onSuccess: () => {
														setCalendarUrl(null);
														Alert.alert("Revoked", "Calendar link revoked.");
													},
													onError: (e) =>
														Alert.alert(
															"Could not revoke",
															(e as Error).message,
														),
												}),
										})
									}
								/>
							</View>
						</View>
					</>
				) : (
					<PrimaryButton
						label={
							createCalendarToken.isPending
								? "Creating…"
								: "Create calendar link"
						}
						disabled={createCalendarToken.isPending}
						onPress={() =>
							createCalendarToken.mutate(undefined, {
								onSuccess: (result) => {
									setCalendarUrl(
										result.token.url
											? `${getServerUrl()}${result.token.url}`
											: null,
									);
									Alert.alert("Created", "Calendar link created.");
								},
								onError: (e) =>
									Alert.alert("Could not create", (e as Error).message),
							})
						}
					/>
				)}
			</Card>

			<Card>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ expanded: forecastOpen }}
					onPress={() => setForecastOpen((open) => !open)}
					style={styles.rowHeader}
				>
					<View style={{ flex: 1, gap: 3 }}>
						<Text style={[styles.title, { color: theme.text }]}>
							Leave forecast
						</Text>
						<Text style={[styles.desc, { color: theme.muted }]}>
							Projected accrual, planned usage, and balance for the next 6
							months.
						</Text>
					</View>
					<Text style={[styles.link, { color: theme.primary }]}>
						{forecastOpen ? "Hide" : "Show"}
					</Text>
				</Pressable>
				{forecastOpen ? (
					forecast.isLoading ? (
						<ActivityIndicator color={theme.primary} />
					) : (forecast.data ?? []).length === 0 ? (
						<Hint>No accrual policies to forecast yet.</Hint>
					) : (
						(forecast.data ?? []).map((entry) => (
							<View key={entry.leaveTypeId} style={{ gap: 4 }}>
								<Text style={[styles.rowLabel, { color: theme.text }]}>
									{entry.leaveTypeName}
								</Text>
								<Text style={[styles.desc, { color: theme.muted }]}>
									Starting {formatLeaveHours(entry.startingMinutes)}
									{entry.pendingMinutes > 0
										? ` · ${formatLeaveHours(entry.pendingMinutes)} pending`
										: ""}
								</Text>
								{entry.points.slice(0, 6).map((point) => (
									<Text
										key={point.month}
										style={[
											styles.desc,
											{
												color: theme.muted,
												fontVariant: ["tabular-nums"],
											},
										]}
									>
										{formatLeaveMonth(point.month)}: +
										{formatLeaveHours(point.accruedMinutes)} · −
										{formatLeaveHours(point.plannedUsageMinutes)} planned ·{" "}
										{formatLeaveHours(point.balanceMinutes)} balance
									</Text>
								))}
							</View>
						))
					)
				) : null}
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
						<Link
							label={`Remove ${DAY_NAMES[it.weekday]} ${it.start}–${it.end}`}
							color={theme.notification}
							onPress={() =>
								setRecurring(recurring.filter((o) => o.id !== it.id))
							}
						/>
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
						<Link
							label={`Remove ${it.date} ${it.start}–${it.end}`}
							color={theme.notification}
							onPress={() => setDates(dates.filter((o) => o.id !== it.id))}
						/>
					</View>
				))}
				{recurring.length === 0 && dates.length === 0 ? (
					<Hint>Nothing blocks scheduling yet.</Hint>
				) : null}

				<View style={styles.builder}>
					<Text style={[styles.label, { color: theme.muted }]}>
						Weekly unavailable times
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
							)
								return;
							setRecurring([...recurring, recurringDraft]);
							setRecurringDraft(newRecurring());
						}}
					/>
				</View>

				<View style={styles.builder}>
					<Text style={[styles.label, { color: theme.muted }]}>
						One specific date
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
					label={saving ? "Saving…" : "Save unavailable times"}
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
	minimumDate,
	onChange,
}: {
	label: string;
	value: string;
	minimumDate?: Date;
	onChange: (v: string) => void;
}) {
	return (
		<View style={styles.pickerField}>
			<NativeDatePickerField
				label={label}
				value={value}
				minimumDate={minimumDate}
				onChange={onChange}
			/>
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
	builder: { gap: 12, paddingTop: 2 },
	rowHeader: {
		minHeight: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	actionsRow: { flexDirection: "row", gap: 10 },
	stepperRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	stepperButton: {
		width: 44,
		height: 44,
		borderWidth: 1,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	stepperButtonText: { fontSize: 20, fontWeight: "700", lineHeight: 22 },
	pickerStack: { gap: 12, width: "100%" },
	pickerField: { width: "100%", minHeight: 52 },
	chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		minHeight: 44,
		borderWidth: 1,
		borderRadius: 999,
		justifyContent: "center",
		paddingHorizontal: 14,
	},
	chipText: { fontSize: 13, fontWeight: "700" },
	linkTap: { minHeight: 44, justifyContent: "center" },
});
