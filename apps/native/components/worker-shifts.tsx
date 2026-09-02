import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";

import { PrimaryButton, SecondaryButton, useAppTheme } from "@/components/ui";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { positionColor } from "@/lib/position-color";
import {
	type DayRosterEntry,
	type PublishedWeek,
	type SwapDetail,
	useDayRoster,
	useMySwaps,
	useProposeSwap,
	useRespondToSwap,
} from "@/lib/queries";

export type WeekShift = PublishedWeek["shifts"][number];

function formatDay(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}

function formatMinute(minute: number): string {
	const h = Math.floor(minute / 60);
	const m = minute % 60;
	const suffix = h >= 12 ? "PM" : "AM";
	const display = h % 12 === 0 ? 12 : h % 12;
	return `${display}:${String(m).padStart(2, "0")} ${suffix}`;
}

function formatClock(iso: string): string {
	return new Date(iso).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatRange(shift: {
	startMinute: number;
	endMinute: number;
	overnight: boolean;
}): string {
	return `${formatMinute(shift.startMinute)}–${shift.endMinute === 0 ? "12:00 AM" : formatMinute(shift.endMinute)}${shift.overnight ? " +1" : ""}`;
}

export function ShiftDetailScreen({
	shift,
	workplaceId,
	locationName,
	onClose,
}: {
	shift: WeekShift;
	workplaceId: string | undefined;
	locationName: string | null;
	onClose: () => void;
}) {
	const { theme } = useAppTheme();
	const queryClient = useQueryClient();
	const [mode, setMode] = useState<"info" | "swap">("info");
	const roster = useDayRoster(workplaceId, shift?.date);
	const release = useMutation({
		mutationFn: (versionShiftId: string) =>
			api("/v1/my/releases", {
				method: "POST",
				body: { versionShiftId },
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
			onClose();
		},
	});

	const coworkers = (roster.data?.roster ?? []).filter(
		(row) => !row.mine && row.employmentId,
	);

	return (
		<View style={[styles.screen, { backgroundColor: theme.background }]}>
			<View style={styles.header}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Close"
					onPress={() => {
						setMode("info");
						onClose();
					}}
					style={styles.closeButton}
				>
					<Text style={[styles.closeText, { color: theme.primary }]}>
						Close
					</Text>
				</Pressable>
			</View>

			<ScrollView
				style={styles.contentScroll}
				contentContainerStyle={styles.content}
				contentInsetAdjustmentBehavior="automatic"
			>
				<View style={styles.dayHeader}>
					<View
						style={[
							styles.accentDot,
							{ backgroundColor: positionColor(shift.positionName) },
						]}
					/>
					<Text style={[styles.dayTitle, { color: theme.text }]}>
						{formatDay(shift.startsAt)}
					</Text>
				</View>
				<Text style={[styles.detailLine, { color: theme.muted }]}>
					{formatRange(shift)} · {shift.positionName}
				</Text>
				<Text style={[styles.detailLine, { color: theme.muted }]}>
					{locationName ?? "Location"}
				</Text>
				{shift.note ? (
					<Text style={[styles.detailLine, { color: theme.muted }]}>
						{shift.note}
					</Text>
				) : null}

				{mode === "info" ? (
					<>
						<Text style={[styles.sectionTitle, { color: theme.muted }]}>
							WHO ELSE IS WORKING
						</Text>
						{roster.isLoading ? (
							<ActivityIndicator color={theme.primary} />
						) : (
							<View style={styles.rosterList}>
								{(roster.data?.roster ?? []).map((row) => (
									<RosterRow key={row.versionShiftId} row={row} />
								))}
								{(roster.data?.roster.length ?? 0) === 0 ? (
									<Text style={[styles.rosterEmpty, { color: theme.muted }]}>
										The published roster for this day isn’t available.
									</Text>
								) : null}
							</View>
						)}
						<View style={styles.actions}>
							<SecondaryButton
								label="Propose swap"
								onPress={() => setMode("swap")}
								style={{ flex: 1 }}
							/>
							<SecondaryButton
								label={release.isPending ? "Requesting…" : "Release shift"}
								disabled={release.isPending}
								onPress={() =>
									confirmAction({
										title: "Release this shift?",
										message:
											"Your Manager must approve the release. You remain responsible for the shift until then.",
										confirmLabel: "Request release",
										onConfirm: () => release.mutate(shift.id),
									})
								}
								style={{ flex: 1 }}
							/>
						</View>
					</>
				) : (
					<SwapProposer
						shift={shift}
						coworkers={coworkers}
						onDone={() => {
							setMode("info");
							onClose();
						}}
						onCancel={() => setMode("info")}
					/>
				)}
			</ScrollView>
		</View>
	);
}

function RosterRow({ row }: { row: DayRosterEntry }) {
	const { theme } = useAppTheme();
	const accent = positionColor(row.positionName);
	return (
		<View style={styles.rosterRow}>
			<View
				style={[styles.rosterDot, { backgroundColor: accent }]}
				aria-hidden
			/>
			<View style={{ flex: 1 }}>
				<Text style={[styles.rosterName, { color: theme.text }]}>
					{row.mine ? "You" : row.workerName}
				</Text>
				<Text style={[styles.rosterMeta, { color: theme.muted }]}>
					{formatClock(row.startsAt)} – {formatClock(row.endsAt)} ·{" "}
					{row.positionName}
				</Text>
			</View>
		</View>
	);
}

function SwapProposer({
	shift,
	coworkers,
	onDone,
	onCancel,
}: {
	shift: WeekShift;
	coworkers: DayRosterEntry[];
	onDone: () => void;
	onCancel: () => void;
}) {
	const { theme } = useAppTheme();
	const [selected, setSelected] = useState<DayRosterEntry | null>(null);
	const propose = useProposeSwap();

	return (
		<>
			<Text style={[styles.sectionTitle, { color: theme.muted }]}>
				SWAP WITH A COWORKER ON THIS DAY
			</Text>
			{coworkers.length === 0 ? (
				<Text style={[styles.rosterEmpty, { color: theme.muted }]}>
					No coworkers are scheduled this day to swap with.
				</Text>
			) : (
				<View style={styles.rosterList}>
					{coworkers.map((row) => {
						const isSelected = selected?.versionShiftId === row.versionShiftId;
						return (
							<Pressable
								key={row.versionShiftId}
								accessibilityRole="radio"
								accessibilityState={{ checked: isSelected }}
								onPress={() => setSelected(row)}
								style={[
									styles.rosterRow,
									styles.selectableRow,
									{
										borderColor: isSelected ? theme.primary : theme.border,
									},
								]}
							>
								<View
									style={[
										styles.rosterDot,
										{ backgroundColor: positionColor(row.positionName) },
									]}
									aria-hidden
								/>
								<View style={{ flex: 1 }}>
									<Text style={[styles.rosterName, { color: theme.text }]}>
										{row.workerName}
									</Text>
									<Text style={[styles.rosterMeta, { color: theme.muted }]}>
										Offers: {formatClock(row.startsAt)} –{" "}
										{formatClock(row.endsAt)} · {row.positionName}
									</Text>
								</View>
							</Pressable>
						);
					})}
				</View>
			)}
			<Text style={[styles.swapHint, { color: theme.muted }]}>
				You give: {formatDay(shift.startsAt)} · {formatRange(shift)}
			</Text>
			<View style={styles.actions}>
				<SecondaryButton label="Back" onPress={onCancel} style={{ flex: 1 }} />
				<PrimaryButton
					label={propose.isPending ? "Sending…" : "Propose swap"}
					disabled={!selected || propose.isPending}
					onPress={() => {
						if (!selected?.employmentId) return;
						propose.mutate(
							{
								requesterShiftId: shift.id,
								counterpartEmploymentId: selected.employmentId,
								counterpartShiftId: selected.versionShiftId,
							},
							{ onSuccess: onDone },
						);
					}}
					style={{ flex: 1 }}
				/>
			</View>
			{propose.isError ? (
				<Text style={[styles.swapHint, { color: theme.notification }]}>
					{(propose.error as Error).message}
				</Text>
			) : null}
		</>
	);
}

const STATUS_LABELS: Record<SwapDetail["status"], string> = {
	pending_counterpart: "Waiting for response",
	pending_manager: "Awaiting manager approval",
	approved: "Approved",
	declined_by_counterpart: "Declined by coworker",
	declined_by_manager: "Declined by manager",
	cancelled: "Cancelled",
};

export function SwapsCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const { theme } = useAppTheme();
	const swaps = useMySwaps(workplaceId);
	const respond = useRespondToSwap();

	const items = swaps.data?.swaps ?? [];
	if (swaps.isLoading || items.length === 0) return null;

	const actionable = items.filter(
		(item) =>
			item.direction === "incoming" &&
			item.swap.status === "pending_counterpart",
	);

	return (
		<View style={{ gap: 12 }}>
			{actionable.map(({ swap }) => (
				<View
					key={swap.id}
					style={[
						styles.swapCard,
						{ backgroundColor: theme.card, borderColor: theme.primary },
					]}
				>
					<Text style={[styles.swapTitle, { color: theme.text }]}>
						Swap request from {swap.requester.name}
					</Text>
					<Text style={[styles.swapLine, { color: theme.muted }]}>
						You would give: {formatDay(swap.counterpartShift.startsAt)} ·{" "}
						{formatClock(swap.counterpartShift.startsAt)} –{" "}
						{formatClock(swap.counterpartShift.endsAt)} ·{" "}
						{swap.counterpartShift.positionName}
					</Text>
					<Text style={[styles.swapLine, { color: theme.muted }]}>
						You would take: {formatDay(swap.requesterShift.startsAt)} ·{" "}
						{formatClock(swap.requesterShift.startsAt)} –{" "}
						{formatClock(swap.requesterShift.endsAt)} ·{" "}
						{swap.requesterShift.positionName}
					</Text>
					<View style={styles.actions}>
						<SecondaryButton
							label="Decline"
							disabled={respond.isPending}
							onPress={() =>
								confirmAction({
									title: "Decline this swap?",
									message: "You will keep your current shift assignment.",
									confirmLabel: "Decline swap",
									destructive: true,
									onConfirm: () =>
										respond.mutate({ swapId: swap.id, decision: "decline" }),
								})
							}
							style={{ flex: 1 }}
						/>
						<PrimaryButton
							label="Accept"
							disabled={respond.isPending}
							onPress={() =>
								confirmAction({
									title: "Accept this swap?",
									message:
										"If your Manager approves it, you will exchange these shift assignments.",
									confirmLabel: "Accept swap",
									onConfirm: () =>
										respond.mutate({ swapId: swap.id, decision: "accept" }),
								})
							}
							style={{ flex: 1 }}
						/>
					</View>
					{respond.isError ? (
						<Text style={[styles.swapLine, { color: theme.notification }]}>
							{(respond.error as Error).message}
						</Text>
					) : null}
				</View>
			))}
			{items.length > 0 ? (
				<View style={styles.swapStatusFooter}>
					<Text style={[styles.swapLine, { color: theme.muted }]}>
						{items.length} swap{items.length === 1 ? "" : "s"} ·{" "}
						{STATUS_LABELS[items[items.length - 1].swap.status]}
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1 },
	header: {
		flexDirection: "row",
		justifyContent: "flex-end",
		paddingTop: 54,
		paddingHorizontal: 16,
	},
	closeButton: {
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 8,
	},
	closeText: { fontSize: 15, fontWeight: "700" },
	contentScroll: { flex: 1 },
	content: { flexGrow: 1, padding: 20, paddingBottom: 32, gap: 10 },
	dayHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	accentDot: { width: 10, height: 10, borderRadius: 5 },
	dayTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
	detailLine: { fontSize: 15, lineHeight: 22 },
	sectionTitle: {
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 1.1,
		marginTop: 14,
	},
	rosterList: { gap: 8, marginTop: 4 },
	rosterRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 8,
	},
	selectableRow: {
		borderWidth: 1.5,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	rosterDot: { width: 8, height: 8, borderRadius: 4 },
	rosterName: { fontSize: 15, fontWeight: "600" },
	rosterMeta: { fontSize: 13, lineHeight: 18 },
	rosterEmpty: { fontSize: 14, lineHeight: 20 },
	actions: { gap: 10, marginTop: 18 },
	swapHint: { fontSize: 13, lineHeight: 19 },
	swapCard: {
		borderWidth: 1.5,
		borderRadius: 14,
		padding: 16,
		gap: 8,
	},
	swapTitle: { fontSize: 16, fontWeight: "700" },
	swapLine: { fontSize: 13, lineHeight: 19 },
	swapStatusFooter: { minHeight: 32, justifyContent: "center" },
});
