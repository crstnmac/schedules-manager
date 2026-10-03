import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, View } from "react-native";

import {
	Appear,
	AppText,
	Badge,
	Button,
	Card,
	CardListSkeleton,
	ChoiceChips,
	Divider,
	FadeSwap,
	Hint,
	Icon,
	IconButton,
	ListRow,
	NativeDatePickerField,
	NativeField,
	NativeSwitchField,
	NativeTimePickerField,
	NativeWeekdayPicker,
	Screen,
	Section,
	SegmentedControl,
	Skeleton,
	type Tone,
	useAppTheme,
} from "@/components/ui";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { tapSuccess } from "@/lib/haptics";
import {
	formatDateKey,
	formatLeaveHours,
	formatLeaveMonth,
	formatLeaveRange,
	leavePolicySummary,
	todayIsoDate,
} from "@/lib/leave";
import {
	type LeaveApprovalDto,
	type LeaveTypeDto,
	useCalendarTokenDiagnostics,
	useCalendarTokens,
	useCreateMyCalendarToken,
	useCurrentEmployment,
	useLeaveForecast,
	useLeaveTypes,
	usePtoBalances,
	useRevokeCalendarToken,
} from "@/lib/queries";
import { getServerUrl } from "@/lib/server-url";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";
import { spacing } from "@/theme";
import { EncashSection } from "./encash-section";

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
					tone={
						approval.status === "approved"
							? "success"
							: approval.status === "declined"
								? "danger"
								: approval.status === "skipped"
									? "neutral"
									: "warning"
					}
				/>
			))}
			{approvals.length > 1 ? (
				<AppText variant="footnote" tone="secondary">
					Step {(current?.stepOrder ?? 0) + 1} of {approvals.length}
				</AppText>
			) : null}
		</View>
	);
}

export function TimeOffScreen() {
	const { theme } = useAppTheme();
	const { selected } = useSelectedWorkplaceId();
	const { timeFormat } = useDisplayPrefs();
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

	const typeById = useMemo(() => {
		const map = new Map<string, LeaveTypeDto>();
		for (const type of leaveTypes.data?.leaveTypes ?? [])
			map.set(type.id, type);
		return map;
	}, [leaveTypes.data]);
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
			tapSuccess();
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
				tapSuccess();
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
				tapSuccess();
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
			tapSuccess();
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
			tapSuccess();
			Alert.alert("Attached", "The document was uploaded.");
		} catch (e) {
			Alert.alert("Could not attach", (e as Error).message);
		} finally {
			setUploadingRequestId(null);
		}
	}
	if (c.isLoading)
		return (
			<Screen>
				<CardListSkeleton count={3} />
			</Screen>
		);

	const requests = c.data?.timeOff ?? [];
	const leaveTypeOptions = (leaveTypes.data?.leaveTypes ?? []).map((type) => ({
		value: type.id,
		label: type.name,
	}));

	return (
		<Screen onRefresh={() => Promise.all([c.refetch(), pto.refetch()])}>
			{(pto.data?.balances ?? []).length > 0 ? (
				<Appear>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={{ marginHorizontal: -spacing.lg }}
						contentContainerStyle={{
							paddingHorizontal: spacing.lg,
							gap: spacing.md,
						}}
					>
						{(pto.data?.balances ?? []).map((balance) => {
							const type = typeById.get(balance.leaveTypeId);
							const chips = type?.policy ? leavePolicySummary(type.policy) : [];
							return (
								<Card
									key={balance.leaveTypeId}
									style={{ width: 200, gap: spacing.sm }}
								>
									<AppText
										variant="overline"
										tone="secondary"
										numberOfLines={1}
									>
										{balance.name}
									</AppText>
									<AppText variant="title1" tabular>
										{formatLeaveHours(balance.minutes)}
									</AppText>
									<AppText variant="caption" tone="secondary">
										remaining
									</AppText>
									{chips.length > 0 ? (
										<View style={styles.chipsRow}>
											{chips.slice(0, 2).map((chip) => (
												<Badge key={chip} label={chip} tone="neutral" />
											))}
										</View>
									) : null}
								</Card>
							);
						})}
					</ScrollView>
				</Appear>
			) : null}

			<Appear index={1}>
				<Section
					title={editingId ? "Edit request" : "Request time off"}
					caption="All-day by default. Your Manager reviews every request."
				>
					<Card style={{ gap: spacing.lg }}>
						<View style={{ gap: spacing.sm }}>
							<FieldLabel>Type</FieldLabel>
							<ChoiceChips
								accessibilityLabel="Leave type"
								options={leaveTypeOptions}
								value={leaveTypeId}
								onChange={setLeaveTypeId}
							/>
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
						<View>
							<NativeSwitchField
								label="All day"
								value={offAllDay}
								onChange={setOffAllDay}
							/>
							<Divider />
							<NativeSwitchField
								label="Emergency"
								value={offEmergency}
								onChange={setOffEmergency}
							/>
						</View>
						{offAllDay ? null : (
							<FadeSwap style={styles.pickerStack}>
								<TimeField
									label="Starts"
									value={offStart}
									onChange={setOffStart}
								/>
								<TimeField label="Ends" value={offEnd} onChange={setOffEnd} />
							</FadeSwap>
						)}
						<NativeField
							label="Note (optional)"
							value={offReason}
							onChange={setOffReason}
						/>
						{editingId ? null : (
							<View style={{ gap: spacing.sm }}>
								<FieldLabel>Repeat</FieldLabel>
								<SegmentedControl<RequestMode>
									value={requestMode}
									onChange={setRequestMode}
									options={[
										{ value: "single", label: "Once" },
										{ value: "repeats", label: "Repeats" },
									]}
								/>
								{requestMode === "repeats" ? (
									<FadeSwap style={{ gap: spacing.md }}>
										<ChoiceChips
											accessibilityLabel="Repeat frequency"
											options={RECURRENCE_FREQUENCIES}
											value={recurrenceFrequency}
											onChange={setRecurrenceFrequency}
										/>
										<View style={styles.stepperRow}>
											<IconButton
												icon="minus"
												accessibilityLabel="Fewer repeats"
												onPress={() =>
													setRecurrenceCount((count) => Math.max(2, count - 1))
												}
											/>
											<AppText variant="headline" tabular>
												{recurrenceCount} times
											</AppText>
											<IconButton
												icon="plus"
												accessibilityLabel="More repeats"
												onPress={() =>
													setRecurrenceCount((count) => Math.min(12, count + 1))
												}
											/>
										</View>
									</FadeSwap>
								) : null}
							</View>
						)}
						<Button
							label={editingId ? "Save changes" : "Request time off"}
							icon={editingId ? "check" : "calendarClock"}
							size="lg"
							loading={requesting}
							onPress={() => void requestTimeOff()}
						/>
						{editingId ? (
							<Button
								label="Cancel edit"
								variant="ghost"
								size="sm"
								onPress={() => {
									setEditingId(null);
									setOffReason("");
									setOffStartDate(todayIsoDate());
									setOffEndDate(todayIsoDate());
									setOffAllDay(true);
									setOffEmergency(false);
									setRequestMode("single");
								}}
								style={{ alignSelf: "center" }}
							/>
						) : null}
					</Card>
				</Section>
			</Appear>

			{requests.length > 0 ? (
				<Appear index={2}>
					<Section title="Your requests">
						{requests.map((r) => {
							const attachable =
								r.status === "pending" || r.status === "approved";
							const status = REQUEST_STATUS[r.status];
							return (
								<Card key={r.id}>
									<View
										style={{
											flexDirection: "row",
											alignItems: "flex-start",
											gap: spacing.md,
										}}
									>
										<View style={{ flex: 1, gap: spacing.xs }}>
											<AppText variant="headline" tabular>
												{formatLeaveRange(r, timeFormat)}
											</AppText>
											<AppText variant="footnote" tone="secondary">
												{[
													r.leaveTypeId
														? typeById.get(r.leaveTypeId)?.name
														: null,
													r.chargeMinutes
														? formatLeaveHours(r.chargeMinutes)
														: null,
												]
													.filter(Boolean)
													.join(" · ") || "Time off"}
											</AppText>
										</View>
										<View style={{ alignItems: "flex-end", gap: spacing.xs }}>
											<Badge label={status.label} tone={status.tone} dot />
											{r.isEmergency ? (
												<Badge label="Emergency" tone="warning" />
											) : null}
										</View>
									</View>
									{r.approvals && r.approvals.length > 0 ? (
										<ApprovalSteps
											approvals={r.approvals}
											currentStep={r.currentStep}
										/>
									) : null}
									{r.decisionReason ? (
										<AppText variant="footnote" tone="secondary" selectable>
											Manager: {r.decisionReason}
										</AppText>
									) : null}
									{r.documents && r.documents.length > 0 ? (
										<View
											style={{
												flexDirection: "row",
												alignItems: "center",
												gap: spacing.xs,
											}}
										>
											<Icon name="doc" size={14} color={theme.textSecondary} />
											<AppText
												variant="footnote"
												tone="secondary"
												style={{ flex: 1 }}
											>
												{r.documents
													.map((document) => document.fileName)
													.join(", ")}
											</AppText>
										</View>
									) : null}
									{attachable ? (
										<View style={styles.chipsRow}>
											{r.status === "pending" ? (
												<Button
													label="Edit"
													icon="pencil"
													variant="secondary"
													size="sm"
													accessibilityLabel={`Edit request ${formatLeaveRange(r, timeFormat)}`}
													onPress={() => {
														setEditingId(r.id);
														setLeaveTypeId(r.leaveTypeId ?? "");
														setOffStartDate(
															r.startDate ?? r.startsAt.slice(0, 10),
														);
														setOffEndDate(r.endDate ?? r.endsAt.slice(0, 10));
														setOffAllDay(r.allDay ?? true);
														setOffStart(toLabel(r.startMinute ?? 9 * 60));
														setOffEnd(toLabel(r.endMinute ?? 17 * 60));
														setOffReason(r.reason ?? "");
													}}
												/>
											) : null}
											<Button
												label="Attach"
												icon="doc"
												variant="secondary"
												size="sm"
												loading={uploadingRequestId === r.id}
												accessibilityLabel={`Attach document to ${formatLeaveRange(r, timeFormat)}`}
												onPress={() => void attachDocument(r.id)}
											/>
											<Button
												label="Cancel"
												icon="close"
												variant="destructive"
												size="sm"
												accessibilityLabel="Cancel request"
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
								</Card>
							);
						})}
					</Section>
				</Appear>
			) : null}

			<Appear index={3}>
				<Section
					title="Unavailable times"
					caption="These block scheduling unless a Manager records an override."
				>
					<Card style={{ gap: spacing.lg }}>
						{recurring.length === 0 && dates.length === 0 ? (
							<AppText variant="subhead" tone="secondary">
								Nothing blocks scheduling yet.
							</AppText>
						) : (
							<View>
								{[
									...recurring.map((it) => ({
										id: it.id,
										label: `Every ${DAY_NAMES[it.weekday]}`,
										range: `${it.start}–${it.end}`,
										remove: () =>
											setRecurring(recurring.filter((o) => o.id !== it.id)),
									})),
									...dates.map((it) => ({
										id: it.id,
										label: it.date ? formatDateKey(it.date) : it.date,
										range: `${it.start}–${it.end}`,
										remove: () => setDates(dates.filter((o) => o.id !== it.id)),
									})),
								].map((row, index) => (
									<View key={row.id}>
										{index > 0 ? <Divider /> : null}
										<View
											style={{
												flexDirection: "row",
												alignItems: "center",
												gap: spacing.md,
												minHeight: 52,
											}}
										>
											<Icon
												name="calendarClock"
												size={18}
												color={theme.textSecondary}
											/>
											<View style={{ flex: 1 }}>
												<AppText variant="callout" weight="600">
													{row.label}
												</AppText>
												<AppText variant="footnote" tone="secondary" tabular>
													{row.range}
												</AppText>
											</View>
											<IconButton
												icon="trash"
												variant="ghost"
												size={36}
												accessibilityLabel={`Remove ${row.label} ${row.range}`}
												onPress={row.remove}
											/>
										</View>
									</View>
								))}
							</View>
						)}

						<Divider />
						<View style={styles.builder}>
							<FieldLabel>Every week</FieldLabel>
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
									onChange={(v) =>
										setRecurringDraft({ ...recurringDraft, end: v })
									}
								/>
							</View>
							<Button
								label="Add weekly window"
								icon="plus"
								variant="tinted"
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

						<Divider />
						<View style={styles.builder}>
							<FieldLabel>One specific date</FieldLabel>
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
							<Button
								label="Add date"
								icon="plus"
								variant="tinted"
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

						<Button
							label="Save unavailable times"
							loading={saving}
							onPress={() => void saveUnavailability()}
						/>
					</Card>
				</Section>
			</Appear>

			<Appear index={4}>
				<Section
					title="Shift preference"
					caption="Optional guidance for your Manager. It doesn’t block scheduling."
				>
					<Card>
						<NativeField
							label="Preference"
							value={preference}
							onChange={setPreference}
							placeholder="For example, I prefer morning shifts"
							multiline
						/>
						<Button
							label="Save preference"
							variant="secondary"
							loading={saving}
							onPress={() => void savePreference()}
						/>
					</Card>
				</Section>
			</Appear>

			<EncashSection
				workplaceId={selected ?? undefined}
				leaveTypes={encashableTypes}
			/>

			<CalendarSyncSection
				workplaceId={selected ?? undefined}
				employmentId={employment?.id}
			/>

			<LeaveForecastCard
				workplaceId={selected ?? undefined}
				employmentId={employment?.id}
			/>
		</Screen>
	);
}

function CalendarSyncSection({
	workplaceId,
	employmentId,
}: {
	workplaceId: string | undefined;
	employmentId: string | undefined;
}) {
	const calendarTokens = useCalendarTokens(workplaceId);
	const createCalendarToken = useCreateMyCalendarToken(workplaceId);
	const revokeCalendarToken = useRevokeCalendarToken(workplaceId);
	const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
	const myCalendarToken =
		(calendarTokens.data ?? []).find(
			(token) => token.employmentId === employmentId && !token.revokedAt,
		) ?? null;
	const calendarDiagnostics = useCalendarTokenDiagnostics(
		workplaceId,
		myCalendarToken?.id,
	);

	async function shareCalendarLink() {
		if (!calendarUrl) return;
		try {
			await Share.share({ message: calendarUrl, url: calendarUrl });
		} catch {
			// The share sheet can be dismissed; there is nothing to recover.
		}
	}

	return (
		<Section
			title="Calendar sync"
			caption="Subscribe to your published schedule and approved leave in a calendar app."
		>
			<Card>
				{myCalendarToken ? (
					<>
						<Badge label="Link active" tone="success" dot />
						{calendarUrl ? (
							<AppText
								variant="footnote"
								tone="secondary"
								numberOfLines={1}
								selectable
							>
								{calendarUrl}
							</AppText>
						) : (
							<Hint>Create a new link to share its URL again.</Hint>
						)}
						{calendarDiagnostics.data ? (
							<Hint>
								{calendarDiagnostics.data.feedOk
									? `Feed OK · ${calendarDiagnostics.data.eventCount} events · ${calendarDiagnostics.data.timezone} · fetched ${calendarDiagnostics.data.fetchCount} time${calendarDiagnostics.data.fetchCount === 1 ? "" : "s"}${calendarDiagnostics.data.lastUsedAt ? " · last fetched recently" : " · not fetched by an app yet"}`
									: "This link was revoked; create a new one."}
							</Hint>
						) : null}
						<Hint>
							Google Calendar: Settings → Add calendar → From URL (refreshes
							about daily). Apple Calendar: add a subscribed calendar. Outlook:
							Add calendar → Subscribe from web.
						</Hint>
						<View style={styles.actionsRow}>
							{calendarUrl ? (
								<Button
									label="Share link"
									icon="envelope"
									onPress={() => void shareCalendarLink()}
									style={{ flex: 1 }}
								/>
							) : null}
							<Button
								variant="destructive"
								label="Revoke"
								disabled={revokeCalendarToken.isPending}
								style={{ flex: 1 }}
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
													Alert.alert("Could not revoke", (e as Error).message),
											}),
									})
								}
							/>
						</View>
					</>
				) : (
					<Button
						label="Create calendar link"
						icon="calendar"
						variant="tinted"
						loading={createCalendarToken.isPending}
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
		</Section>
	);
}

function LeaveForecastCard({
	workplaceId,
	employmentId,
}: {
	workplaceId: string | undefined;
	employmentId: string | undefined;
}) {
	const [forecastOpen, setForecastOpen] = useState(false);
	const forecast = useLeaveForecast(workplaceId, employmentId, 6);

	return (
		<Card>
			<ListRow
				icon="history"
				iconTone="neutral"
				title="Leave forecast"
				subtitle="Accrual, planned usage, and balance for 6 months"
				chevron={false}
				onPress={() => setForecastOpen((open) => !open)}
				trailing={
					<AppText variant="footnote" tone="tint" weight="600">
						{forecastOpen ? "Hide" : "Show"}
					</AppText>
				}
			/>
			{forecastOpen ? (
				<FadeSwap style={{ gap: spacing.lg }}>
					{forecast.isLoading ? (
						<Skeleton width="70%" />
					) : (forecast.data ?? []).length === 0 ? (
						<Hint>No accrual policies to forecast yet.</Hint>
					) : (
						(forecast.data ?? []).map((entry) => (
							<View key={entry.leaveTypeId} style={{ gap: spacing.xs }}>
								<AppText variant="callout" weight="600">
									{entry.leaveTypeName}
								</AppText>
								<AppText variant="footnote" tone="secondary">
									Starting {formatLeaveHours(entry.startingMinutes)}
									{entry.pendingMinutes > 0
										? ` · ${formatLeaveHours(entry.pendingMinutes)} pending`
										: ""}
								</AppText>
								{entry.points.slice(0, 6).map((point) => (
									<AppText
										key={point.month}
										variant="footnote"
										tone="secondary"
										tabular
									>
										{formatLeaveMonth(point.month)}: +
										{formatLeaveHours(point.accruedMinutes)} · −
										{formatLeaveHours(point.plannedUsageMinutes)} planned ·{" "}
										{formatLeaveHours(point.balanceMinutes)} balance
									</AppText>
								))}
							</View>
						))
					)}
				</FadeSwap>
			) : null}
		</Card>
	);
}

const REQUEST_STATUS: Record<
	ConstraintsResponse["timeOff"][number]["status"],
	{ label: string; tone: Tone }
> = {
	pending: { label: "Waiting", tone: "warning" },
	approved: { label: "Approved", tone: "success" },
	declined: { label: "Declined", tone: "danger" },
	cancelled: { label: "Cancelled", tone: "neutral" },
};

function FieldLabel({ children }: { children: string }) {
	return (
		<AppText
			variant="footnote"
			weight="600"
			tone="secondary"
			style={{ paddingHorizontal: spacing.xxs }}
		>
			{children}
		</AppText>
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
	builder: { gap: spacing.md },
	actionsRow: { flexDirection: "row", gap: spacing.sm },
	stepperRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.lg,
	},
	pickerStack: { gap: spacing.md, width: "100%" },
	pickerField: { width: "100%" },
	chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
