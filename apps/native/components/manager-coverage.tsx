import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
	Badge,
	Card,
	PrimaryButton,
	SecondaryButton,
	useAppTheme,
} from "@/components/ui";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { formatDayShort } from "@/lib/format-day";
import { friendlyMessage } from "@/lib/friendly-message";

export interface CoverageRelease {
	id: string;
	workerName: string;
	workerEmail: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	reason: string | null;
	status: "pending" | "approved" | "declined";
}

export interface CoveragePickup {
	id: string;
	workerName: string;
	workerEmail: string;
	positionName: string;
	startsAt: string | null;
	endsAt: string | null;
	status: "pending" | "approved" | "declined";
}

export interface CoverageResponse {
	releases: CoverageRelease[];
	pickups: CoveragePickup[];
}

export function useManagerCoverage(workplaceId: string | undefined) {
	return useQuery({
		queryKey: ["manager", workplaceId, "coverage"],
		queryFn: () =>
			api<CoverageResponse>(`/v1/workplaces/${workplaceId}/coverage`),
		enabled: Boolean(workplaceId),
	});
}

function useCoverageDecisions(workplaceId: string | undefined) {
	const queryClient = useQueryClient();
	function invalidate() {
		void queryClient.invalidateQueries({
			queryKey: ["manager", workplaceId, "coverage"],
		});
		void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
		void queryClient.invalidateQueries({ queryKey: ["open-shifts"] });
	}
	const decideRelease = useMutation({
		mutationFn: (input: {
			releaseId: string;
			decision: "approved" | "declined";
		}) =>
			api(
				`/v1/workplaces/${workplaceId}/releases/${input.releaseId}/decision`,
				{
					method: "POST",
					body: { decision: input.decision },
				},
			),
		onSuccess: invalidate,
	});
	const decidePickup = useMutation({
		mutationFn: (input: {
			pickupId: string;
			decision: "approved" | "declined";
		}) =>
			api(`/v1/workplaces/${workplaceId}/pickups/${input.pickupId}/decision`, {
				method: "POST",
				body: { decision: input.decision },
			}),
		onSuccess: invalidate,
	});
	return { decideRelease, decidePickup };
}

function formatShiftWindow(
	startsAt: string | null,
	endsAt: string | null,
	formatClockTime: (iso?: string) => string,
): string {
	if (!startsAt) return "Open Shift";
	const sameDay =
		endsAt != null &&
		new Date(startsAt).toDateString() === new Date(endsAt).toDateString();
	if (!endsAt)
		return `${formatDayShort(startsAt)} · ${formatClockTime(startsAt)}`;
	return `${formatDayShort(startsAt)} · ${formatClockTime(startsAt)} – ${
		sameDay ? "" : `${formatDayShort(endsAt)} `
	}${formatClockTime(endsAt)}`;
}

/**
 * Pending Shift Release and Shift Pickup requests for managers. Decisions use
 * the coverage endpoints: releases open the Shift for pickup; pickups assign
 * the worker and publish a successor Schedule Version atomically.
 */
export function ManagerCoverageSection({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const { theme } = useAppTheme();
	const { formatClockTime } = useDisplayPrefs();
	const coverage = useManagerCoverage(workplaceId);
	const { decideRelease, decidePickup } = useCoverageDecisions(workplaceId);

	const pendingReleases = (coverage.data?.releases ?? []).filter(
		(release) => release.status === "pending",
	);
	const pendingPickups = (coverage.data?.pickups ?? []).filter(
		(pickup) => pickup.status === "pending",
	);

	if (coverage.isLoading) return <ActivityIndicator color={theme.primary} />;
	if (coverage.isError) {
		return (
			<Card>
				<Text style={[s.hint, { color: theme.notification }]}>
					{friendlyMessage(coverage.error)}
				</Text>
			</Card>
		);
	}
	if (pendingReleases.length === 0 && pendingPickups.length === 0) return null;

	return (
		<View style={{ gap: 12 }}>
			<Text style={[s.groupLabel, { color: theme.muted }]}>
				COVERAGE REQUESTS
			</Text>

			{pendingReleases.map((release) => (
				<Card key={release.id}>
					<View style={s.rowBetween}>
						<Text style={[s.cardTitle, { color: theme.text }]}>
							{release.workerName} · release
						</Text>
						<Badge label="Needs a decision" variant="default" />
					</View>
					<Text style={[s.body, { color: theme.text }]}>
						{formatShiftWindow(
							release.startsAt,
							release.endsAt,
							formatClockTime,
						)}{" "}
						· {release.positionName}
					</Text>
					{release.reason ? (
						<Text style={[s.hint, { color: theme.muted }]}>
							Reason: {release.reason}
						</Text>
					) : null}
					<Text style={[s.hint, { color: theme.muted }]}>
						Approving opens the Shift for pickup. {release.workerName} stays
						responsible until someone is assigned.
					</Text>
					<View style={s.actions}>
						<View style={{ flex: 1 }}>
							<PrimaryButton
								label="Approve release"
								disabled={decideRelease.isPending}
								onPress={() =>
									confirmAction({
										title: "Approve this release?",
										message: `${release.workerName} stays responsible until someone picks up the Shift.`,
										confirmLabel: "Approve release",
										onConfirm: () =>
											decideRelease.mutate({
												releaseId: release.id,
												decision: "approved",
											}),
									})
								}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<SecondaryButton
								label="Decline"
								disabled={decideRelease.isPending}
								onPress={() =>
									confirmAction({
										title: "Decline this release?",
										message: `${release.workerName} will remain assigned to this Shift.`,
										confirmLabel: "Decline release",
										destructive: true,
										onConfirm: () =>
											decideRelease.mutate({
												releaseId: release.id,
												decision: "declined",
											}),
									})
								}
							/>
						</View>
					</View>
				</Card>
			))}

			{pendingPickups.map((pickup) => (
				<Card key={pickup.id}>
					<View style={s.rowBetween}>
						<Text style={[s.cardTitle, { color: theme.text }]}>
							{pickup.workerName} · pickup
						</Text>
						<Badge label="Needs a decision" variant="default" />
					</View>
					<Text style={[s.body, { color: theme.text }]}>
						{formatShiftWindow(pickup.startsAt, pickup.endsAt, formatClockTime)}{" "}
						· {pickup.positionName}
					</Text>
					<Text style={[s.hint, { color: theme.muted }]}>
						Approving assigns {pickup.workerName} and may publish a new Schedule
						Version immediately.
					</Text>
					<View style={s.actions}>
						<View style={{ flex: 1 }}>
							<PrimaryButton
								label="Approve & publish"
								disabled={decidePickup.isPending}
								onPress={() =>
									confirmAction({
										title: "Approve pickup and publish?",
										message: `${pickup.workerName} will be assigned and a new schedule version may be published immediately.`,
										confirmLabel: "Approve & publish",
										onConfirm: () =>
											decidePickup.mutate({
												pickupId: pickup.id,
												decision: "approved",
											}),
									})
								}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<SecondaryButton
								label="Decline"
								disabled={decidePickup.isPending}
								onPress={() =>
									confirmAction({
										title: "Decline this pickup?",
										message: `${pickup.workerName} will not be assigned to this Open Shift.`,
										confirmLabel: "Decline pickup",
										destructive: true,
										onConfirm: () =>
											decidePickup.mutate({
												pickupId: pickup.id,
												decision: "declined",
											}),
									})
								}
							/>
						</View>
					</View>
				</Card>
			))}

			{decideRelease.isError || decidePickup.isError ? (
				<Text style={[s.hint, { color: theme.notification }]}>
					{friendlyMessage(decideRelease.error ?? decidePickup.error)}
				</Text>
			) : null}
		</View>
	);
}

const s = StyleSheet.create({
	groupLabel: {
		fontSize: 11,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.4,
		marginTop: 2,
	},
	cardTitle: { fontSize: 17, fontWeight: "700", lineHeight: 24, flex: 1 },
	body: { fontSize: 14, lineHeight: 21, fontVariant: ["tabular-nums"] },
	hint: { fontSize: 13, lineHeight: 19 },
	rowBetween: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 8,
	},
	actions: { flexDirection: "row", gap: 10, marginTop: 8 },
});
