import { useRouter } from "expo-router";
import { Alert, Platform, View } from "react-native";

import { AppText, Badge, Icon } from "@/components/ui";
import { showActionSheet } from "@/lib/action-sheet";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { formatDayShort } from "@/lib/format-day";
import { tapSuccess } from "@/lib/haptics";
import { formatLeaveHours, formatLeaveRange } from "@/lib/leave";
import { positionColor } from "@/lib/position-color";
import {
	useDecideApprovalStep,
	useExpediteLeaveRequest,
	useLeaveEncashmentDecision,
	useSwapDecision,
} from "@/lib/queries";
import { spacing, useAppTheme } from "@/theme";
import {
	ApprovalChain,
	Attachments,
	BalanceLine,
	DecisionBar,
	DetailWell,
	Note,
	RequestCard,
} from "./request-card";
import type { QueueItem, TimeOffRequest } from "./use-request-queue";
import { useCoverageDecisions } from "./use-request-queue";
import { useTimeOffActions } from "./use-time-off-actions";

function dayCount(startDate?: string, endDate?: string) {
	if (!startDate) return 1;
	const start = new Date(`${startDate}T12:00:00`).getTime();
	const end = new Date(`${endDate ?? startDate}T12:00:00`).getTime();
	return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function leaveSummary(input: {
	leaveTypeName?: string | null;
	startDate?: string;
	endDate?: string;
	allDay?: boolean;
}) {
	const days = dayCount(input.startDate, input.endDate);
	const length =
		input.allDay === false ? "Part day" : `${days} day${days === 1 ? "" : "s"}`;
	return `${input.leaveTypeName ?? "Time off"} · ${length}`;
}

export function QueueCard({
	item,
	workplaceId,
}: {
	item: QueueItem;
	workplaceId: string | undefined;
}) {
	switch (item.kind) {
		case "step":
			return <StepCard item={item} workplaceId={workplaceId} />;
		case "timeOff":
			return <TimeOffCard request={item.request} workplaceId={workplaceId} />;
		case "release":
			return <ReleaseCard item={item} workplaceId={workplaceId} />;
		case "pickup":
			return <PickupCard item={item} workplaceId={workplaceId} />;
		case "swap":
			return <SwapCard item={item} workplaceId={workplaceId} />;
		case "encashment":
			return <EncashmentCard item={item} workplaceId={workplaceId} />;
	}
}

function useLeaveOverflow(workplaceId: string | undefined) {
	const router = useRouter();
	const { remove } = useTimeOffActions(workplaceId);
	return (request: TimeOffRequest, noun = "request") =>
		showActionSheet({
			actions: [
				{
					label: "Edit",
					onPress: () =>
						router.push({
							pathname: "/time-off-sheet",
							params: { editId: request.id },
						}),
				},
				{
					label: "Delete",
					destructive: true,
					onPress: () =>
						confirmAction({
							title: `Delete this ${noun}?`,
							message:
								noun === "request"
									? "This removes the request permanently."
									: "They will no longer be blocked on the schedule. Paid hours will be restored.",
							confirmLabel: "Delete",
							destructive: true,
							onConfirm: () => remove.mutate(request.id),
						}),
				},
			],
		});
}

/** An approval step that is waiting on this Manager. */
function StepCard({
	item,
	workplaceId,
}: {
	item: Extract<QueueItem, { kind: "step" }>;
	workplaceId: string | undefined;
}) {
	const { timeFormat, formatPerson } = useDisplayPrefs();
	const decideStep = useDecideApprovalStep(workplaceId);
	const expedite = useExpediteLeaveRequest(workplaceId);
	const { step, request } = item;
	const busy =
		decideStep.isPending && decideStep.variables?.approvalId === step.approvalId
			? decideStep.variables.decision === "approved"
				? "approve"
				: "decline"
			: null;
	const decide = (decision: "approved" | "declined") =>
		decideStep.mutate(
			{ requestId: step.requestId, approvalId: step.approvalId, decision },
			{
				onSuccess: tapSuccess,
				onError: (e) => Alert.alert("Could not save", (e as Error).message),
			},
		);

	function expediteRequest() {
		const run = (reason: string) =>
			expedite.mutate(
				{ requestId: step.requestId, reason: reason.trim() || "Emergency" },
				{
					onSuccess: () =>
						Alert.alert(
							"Expedited",
							"All remaining approval steps were overridden.",
						),
				},
			);
		if (Platform.OS === "ios") {
			Alert.prompt(
				"Expedite emergency leave?",
				"This approves all remaining steps. Give a short reason.",
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "Expedite",
						style: "destructive",
						onPress: (value?: string) => run(value ?? ""),
					},
				],
				"plain-text",
				"",
			);
			return;
		}
		confirmAction({
			title: "Expedite emergency leave?",
			message: 'This approves all remaining steps with the reason "Emergency".',
			confirmLabel: "Expedite",
			destructive: true,
			onConfirm: () => run("Emergency"),
		});
	}

	return (
		<RequestCard
			name={formatPerson(step.worker.fullName, step.worker.email)}
			kindIcon="airplane"
			kindLabel={leaveSummary(step)}
			startsAt={item.sortKey}
			emergency={step.isEmergency}
			badges={
				<>
					{step.isEmergency ? (
						<Badge label="Emergency" tone="warning" icon="bolt" solid />
					) : null}
					<Badge
						label={
							step.via === "delegation" ? "Delegated to you" : "Your approval"
						}
						tone="primary"
					/>
					{step.escalatedAt ? <Badge label="Escalated" tone="warning" /> : null}
					{step.dueAt ? (
						<Badge label={`Due ${formatDayShort(step.dueAt)}`} tone="neutral" />
					) : null}
				</>
			}
			footer={
				<DecisionBar
					busy={busy}
					onMore={step.isEmergency ? expediteRequest : undefined}
					onApprove={() =>
						confirmAction({
							title: "Approve this time off?",
							message: step.chargeMinutes
								? `This uses ${formatLeaveHours(step.chargeMinutes)}${step.leaveTypeName ? ` of ${step.leaveTypeName}` : ""} and advances the approval chain.`
								: "This advances the approval chain.",
							confirmLabel: "Approve",
							onConfirm: () => decide("approved"),
						})
					}
					onDecline={() =>
						confirmAction({
							title: "Decline this request?",
							message: "The worker will see this decision.",
							confirmLabel: "Decline",
							destructive: true,
							onConfirm: () => decide("declined"),
						})
					}
				/>
			}
		>
			<DetailWell>
				<AppText variant="callout" weight="600" tabular>
					{formatLeaveRange(
						{
							...step,
							startsAt: item.sortKey,
							endsAt: step.endsAt ?? `${step.endDate}T12:00:00`,
						},
						timeFormat,
					)}
				</AppText>
				{step.chargeMinutes ? (
					<BalanceLine
						chargeLabel={formatLeaveHours(step.chargeMinutes)}
						remainingLabel={formatLeaveHours(step.remainingMinutes)}
						short={step.remainingMinutes < step.chargeMinutes}
					/>
				) : null}
			</DetailWell>
			{request?.approvals ? (
				<ApprovalChain
					approvals={request.approvals}
					currentStep={request.currentStep}
				/>
			) : null}
			{step.reason ? <Note>{step.reason}</Note> : null}
			<Attachments names={request?.documents?.map((d) => d.fileName) ?? []} />
		</RequestCard>
	);
}

/** A pending request this Manager can decide directly. */
function TimeOffCard({
	request,
	workplaceId,
}: {
	request: TimeOffRequest;
	workplaceId: string | undefined;
}) {
	const { timeFormat, formatPerson } = useDisplayPrefs();
	const { decide } = useTimeOffActions(workplaceId);
	const openOverflow = useLeaveOverflow(workplaceId);
	const busy =
		decide.isPending && decide.variables?.id === request.id
			? decide.variables.decision === "approved"
				? "approve"
				: "decline"
			: null;
	const run = (decision: "approved" | "declined") =>
		decide.mutate({ id: request.id, decision }, { onSuccess: tapSuccess });

	return (
		<RequestCard
			name={formatPerson(request.worker.fullName, request.worker.email)}
			kindIcon="airplane"
			kindLabel={`${leaveSummary(request)}${request.kind === "manager" ? " · Manager" : ""}`}
			startsAt={request.startsAt}
			emergency={request.isEmergency}
			badges={
				request.isEmergency ? (
					<Badge label="Emergency" tone="warning" icon="bolt" solid />
				) : undefined
			}
			footer={
				<DecisionBar
					busy={busy}
					onMore={() => openOverflow(request)}
					onApprove={() =>
						confirmAction({
							title: "Approve this time off?",
							message: request.chargeMinutes
								? `This uses ${formatLeaveHours(request.chargeMinutes)}${request.leaveTypeName ? ` of ${request.leaveTypeName}` : ""} and blocks the schedule.`
								: "This marks the request approved for scheduling.",
							confirmLabel: "Approve",
							onConfirm: () => run("approved"),
						})
					}
					onDecline={() =>
						confirmAction({
							title: "Decline this request?",
							message: "The worker will see this decision.",
							confirmLabel: "Decline",
							destructive: true,
							onConfirm: () => run("declined"),
						})
					}
				/>
			}
		>
			<DetailWell>
				<AppText variant="callout" weight="600" tabular>
					{formatLeaveRange(request, timeFormat)}
				</AppText>
				{request.chargeMinutes && request.remainingMinutes != null ? (
					<BalanceLine
						chargeLabel={formatLeaveHours(request.chargeMinutes)}
						remainingLabel={formatLeaveHours(request.remainingMinutes)}
						short={request.remainingMinutes < request.chargeMinutes}
					/>
				) : null}
			</DetailWell>
			{request.approvals ? (
				<ApprovalChain
					approvals={request.approvals}
					currentStep={request.currentStep}
				/>
			) : null}
			{request.reason ? <Note>{request.reason}</Note> : null}
			<Attachments names={request.documents?.map((d) => d.fileName) ?? []} />
		</RequestCard>
	);
}

function ShiftWindow({
	startsAt,
	endsAt,
	positionName,
}: {
	startsAt: string | null;
	endsAt: string | null;
	positionName: string;
}) {
	const { formatClockTime } = useDisplayPrefs();
	return (
		<DetailWell>
			<AppText variant="callout" weight="600" tabular>
				{startsAt
					? `${formatDayShort(startsAt)} · ${formatClockTime(startsAt)}${endsAt ? `–${formatClockTime(endsAt)}` : ""}`
					: "Open Shift"}
			</AppText>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					gap: spacing.xs + 2,
				}}
			>
				<View
					style={{
						width: 8,
						height: 8,
						borderRadius: 4,
						backgroundColor: positionColor(positionName),
					}}
				/>
				<AppText variant="footnote" tone="secondary">
					{positionName}
				</AppText>
			</View>
		</DetailWell>
	);
}

function Consequence({ children }: { children: string }) {
	return (
		<AppText variant="footnote" tone="tertiary">
			{children}
		</AppText>
	);
}

function ReleaseCard({
	item,
	workplaceId,
}: {
	item: Extract<QueueItem, { kind: "release" }>;
	workplaceId: string | undefined;
}) {
	const { decideRelease } = useCoverageDecisions(workplaceId);
	const { release } = item;
	const busy =
		decideRelease.isPending && decideRelease.variables?.releaseId === release.id
			? decideRelease.variables.decision === "approved"
				? "approve"
				: "decline"
			: null;
	const run = (decision: "approved" | "declined") =>
		decideRelease.mutate(
			{ releaseId: release.id, decision },
			{
				onSuccess: tapSuccess,
				onError: (e) => Alert.alert("Could not save", (e as Error).message),
			},
		);
	return (
		<RequestCard
			name={release.workerName}
			kindIcon="release"
			kindLabel="Wants to release a shift"
			startsAt={release.startsAt}
			footer={
				<DecisionBar
					approveLabel="Release"
					busy={busy}
					onApprove={() =>
						confirmAction({
							title: "Approve this release?",
							message: `${release.workerName} stays responsible until someone picks up the Shift.`,
							confirmLabel: "Approve release",
							onConfirm: () => run("approved"),
						})
					}
					onDecline={() =>
						confirmAction({
							title: "Decline this release?",
							message: `${release.workerName} will remain assigned to this Shift.`,
							confirmLabel: "Decline release",
							destructive: true,
							onConfirm: () => run("declined"),
						})
					}
				/>
			}
		>
			<ShiftWindow
				startsAt={release.startsAt}
				endsAt={release.endsAt}
				positionName={release.positionName}
			/>
			{release.reason ? <Note>{release.reason}</Note> : null}
			<Consequence>
				{`Approving opens the Shift for pickup. ${release.workerName} stays responsible until someone is assigned.`}
			</Consequence>
		</RequestCard>
	);
}

function PickupCard({
	item,
	workplaceId,
}: {
	item: Extract<QueueItem, { kind: "pickup" }>;
	workplaceId: string | undefined;
}) {
	const { decidePickup } = useCoverageDecisions(workplaceId);
	const { pickup } = item;
	const busy =
		decidePickup.isPending && decidePickup.variables?.pickupId === pickup.id
			? decidePickup.variables.decision === "approved"
				? "approve"
				: "decline"
			: null;
	const run = (decision: "approved" | "declined") =>
		decidePickup.mutate(
			{ pickupId: pickup.id, decision },
			{
				onSuccess: tapSuccess,
				onError: (e) => Alert.alert("Could not save", (e as Error).message),
			},
		);
	return (
		<RequestCard
			name={pickup.workerName}
			kindIcon="handRaised"
			kindLabel="Wants to pick up an open shift"
			startsAt={pickup.startsAt}
			footer={
				<DecisionBar
					approveLabel="Assign"
					busy={busy}
					onApprove={() =>
						confirmAction({
							title: "Approve pickup and publish?",
							message: `${pickup.workerName} will be assigned and a new schedule version may be published immediately.`,
							confirmLabel: "Approve & publish",
							onConfirm: () => run("approved"),
						})
					}
					onDecline={() =>
						confirmAction({
							title: "Decline this pickup?",
							message: `${pickup.workerName} will not be assigned to this Open Shift.`,
							confirmLabel: "Decline pickup",
							destructive: true,
							onConfirm: () => run("declined"),
						})
					}
				/>
			}
		>
			<ShiftWindow
				startsAt={pickup.startsAt}
				endsAt={pickup.endsAt}
				positionName={pickup.positionName}
			/>
			<Consequence>
				Assigning may publish a new Schedule Version right away.
			</Consequence>
		</RequestCard>
	);
}

function SwapCard({
	item,
	workplaceId,
}: {
	item: Extract<QueueItem, { kind: "swap" }>;
	workplaceId: string | undefined;
}) {
	const { theme } = useAppTheme();
	const { formatClockTime } = useDisplayPrefs();
	const { swap } = item;
	const decideSwap = useSwapDecision(workplaceId);
	const busy =
		decideSwap.isPending && decideSwap.variables?.swapId === swap.id
			? decideSwap.variables.decision === "approved"
				? "approve"
				: "decline"
			: null;
	const run = (decision: "approved" | "declined") =>
		decideSwap.mutate(
			{ swapId: swap.id, decision },
			{
				onSuccess: tapSuccess,
				onError: (e) => Alert.alert("Could not save", (e as Error).message),
			},
		);
	const leg = (name: string, shift: typeof swap.requesterShift) => (
		<View
			style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
		>
			<AppText
				variant="footnote"
				weight="600"
				style={{ width: 88 }}
				numberOfLines={1}
			>
				{name}
			</AppText>
			<View style={{ flex: 1 }}>
				<AppText variant="footnote" weight="600" tabular>
					{formatDayShort(shift.startsAt)} · {formatClockTime(shift.startsAt)}–
					{formatClockTime(shift.endsAt)}
				</AppText>
				<AppText variant="caption" tone="secondary">
					{shift.positionName}
				</AppText>
			</View>
		</View>
	);
	return (
		<RequestCard
			name={`${swap.requester.name} & ${swap.counterpart.name}`}
			kindIcon="swap"
			kindLabel="Agreed to swap shifts"
			startsAt={item.sortKey}
			footer={
				<DecisionBar
					approveLabel="Approve swap"
					busy={busy}
					onApprove={() =>
						confirmAction({
							title: "Approve swap and publish?",
							message:
								"This exchanges both assignments and may publish a new schedule version immediately.",
							confirmLabel: "Approve & publish",
							onConfirm: () => run("approved"),
						})
					}
					onDecline={() =>
						confirmAction({
							title: "Decline this swap?",
							message: "Both workers will keep their current assignments.",
							confirmLabel: "Decline swap",
							destructive: true,
							onConfirm: () => run("declined"),
						})
					}
				/>
			}
		>
			<DetailWell>
				{leg(swap.requester.name, swap.requesterShift)}
				<View style={{ paddingLeft: 88 + spacing.md, paddingVertical: 2 }}>
					<Icon name="swap" size={13} color={theme.textTertiary} />
				</View>
				{leg(swap.counterpart.name, swap.counterpartShift)}
			</DetailWell>
			<Consequence>
				Approving exchanges both assignments and may publish right away.
			</Consequence>
		</RequestCard>
	);
}

function EncashmentCard({
	item,
	workplaceId,
}: {
	item: Extract<QueueItem, { kind: "encashment" }>;
	workplaceId: string | undefined;
}) {
	const { formatPerson } = useDisplayPrefs();
	const decision = useLeaveEncashmentDecision(workplaceId);
	const { encashment } = item;
	const busy =
		decision.isPending && decision.variables?.encashmentId === encashment.id
			? decision.variables.decision === "approved"
				? "approve"
				: "decline"
			: null;
	const run = (value: "approved" | "declined") =>
		decision.mutate(
			{ encashmentId: encashment.id, decision: value },
			{
				onSuccess: tapSuccess,
				onError: (e) => Alert.alert("Could not save", (e as Error).message),
			},
		);
	return (
		<RequestCard
			name={formatPerson(
				encashment.employmentName ?? null,
				encashment.employmentEmail ?? "",
			)}
			kindIcon="banknote"
			kindLabel={`Leave payout · ${encashment.leaveTypeName ?? "Leave"}`}
			footer={
				<DecisionBar
					busy={busy}
					onApprove={() =>
						confirmAction({
							title: "Approve this encashment?",
							message: `This deducts ${formatLeaveHours(encashment.minutes)} from their balance.`,
							confirmLabel: "Approve",
							onConfirm: () => run("approved"),
						})
					}
					onDecline={() =>
						confirmAction({
							title: "Decline this encashment?",
							message: "The worker keeps their balance.",
							confirmLabel: "Decline",
							destructive: true,
							onConfirm: () => run("declined"),
						})
					}
				/>
			}
		>
			<DetailWell>
				<View
					style={{
						flexDirection: "row",
						alignItems: "baseline",
						gap: spacing.sm,
					}}
				>
					<AppText variant="title3" tabular>
						{formatLeaveHours(encashment.minutes)}
					</AppText>
					{encashment.amountCents > 0 ? (
						<AppText variant="callout" tone="secondary" tabular>
							≈ ${(encashment.amountCents / 100).toFixed(2)}
						</AppText>
					) : null}
				</View>
			</DetailWell>
			{encashment.note ? <Note>{encashment.note}</Note> : null}
		</RequestCard>
	);
}

export { useLeaveOverflow };
