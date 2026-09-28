import { View } from "react-native";

import {
	AppText,
	Badge,
	Button,
	Card,
	Icon,
	IconTile,
	type Tone,
} from "@/components/ui";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { friendlyMessage } from "@/lib/friendly-message";
import {
	type SwapDetail,
	useCancelSwap,
	useMySwaps,
	useRespondToSwap,
} from "@/lib/queries";
import { radius, spacing, useAppTheme } from "@/theme";

const STATUS: Record<SwapDetail["status"], { label: string; tone: Tone }> = {
	pending_counterpart: { label: "Waiting for reply", tone: "warning" },
	pending_manager: { label: "With your manager", tone: "primary" },
	approved: { label: "Approved", tone: "success" },
	declined_by_counterpart: { label: "Declined by coworker", tone: "danger" },
	declined_by_manager: { label: "Declined by manager", tone: "danger" },
	cancelled: { label: "Cancelled", tone: "neutral" },
};

function swapGiveTake(direction: "incoming" | "outgoing", swap: SwapDetail) {
	return direction === "incoming"
		? { give: swap.counterpartShift, take: swap.requesterShift }
		: { give: swap.requesterShift, take: swap.counterpartShift };
}

/** Open Shift Swaps the worker is part of, newest-first, with their actions. */
export function SwapsCard({
	workplaceId,
}: {
	workplaceId: string | undefined;
}) {
	const { theme } = useAppTheme();
	const swaps = useMySwaps(workplaceId);
	const respond = useRespondToSwap();
	const cancel = useCancelSwap();

	const items = (swaps.data?.swaps ?? []).filter(
		(item) =>
			item.swap.status === "pending_counterpart" ||
			item.swap.status === "pending_manager",
	);
	if (swaps.isLoading || items.length === 0) return null;

	return (
		<View style={{ gap: spacing.md }}>
			{items.map(({ direction, swap }) => {
				const incoming =
					direction === "incoming" && swap.status === "pending_counterpart";
				const { give, take } = swapGiveTake(direction, swap);
				const status = STATUS[swap.status];
				return (
					<Card key={swap.id}>
						<View
							style={{
								flexDirection: "row",
								gap: spacing.md,
								alignItems: "center",
							}}
						>
							<IconTile
								icon="swap"
								tone={incoming ? "warning" : "primary"}
								size={36}
							/>
							<View style={{ flex: 1, gap: 2 }}>
								<AppText variant="headline" numberOfLines={2}>
									{incoming
										? `${swap.requester.name} wants to swap`
										: `Swap with ${swap.counterpart.name}`}
								</AppText>
								<Badge label={status.label} tone={status.tone} dot />
							</View>
						</View>

						<View style={{ gap: spacing.xs }}>
							<SwapLeg label="You give" shift={give} />
							<View
								style={{ alignItems: "center", marginVertical: -spacing.xs }}
							>
								<Icon name="swap" size={14} color={theme.textTertiary} />
							</View>
							<SwapLeg label="You take" shift={take} highlight />
						</View>

						{incoming ? (
							<View style={{ flexDirection: "row", gap: spacing.sm }}>
								<Button
									label="Decline"
									variant="secondary"
									disabled={respond.isPending}
									onPress={() =>
										confirmAction({
											title: "Decline this swap?",
											message: "You will keep your current shift assignment.",
											confirmLabel: "Decline swap",
											destructive: true,
											onConfirm: () =>
												respond.mutate({
													swapId: swap.id,
													decision: "decline",
												}),
										})
									}
									style={{ flex: 1 }}
								/>
								<Button
									label="Accept"
									icon="check"
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
						) : direction === "outgoing" ? (
							<Button
								label="Cancel request"
								variant="secondary"
								size="sm"
								disabled={cancel.isPending}
								onPress={() =>
									confirmAction({
										title: "Cancel this swap?",
										message:
											"Your coworker will be notified. Everyone keeps their current assignment.",
										confirmLabel: "Cancel swap",
										destructive: true,
										onConfirm: () => cancel.mutate(swap.id),
									})
								}
								style={{ alignSelf: "flex-start" }}
							/>
						) : null}

						{respond.isError || cancel.isError ? (
							<AppText variant="footnote" tone="danger" selectable>
								{friendlyMessage(respond.error ?? cancel.error)}
							</AppText>
						) : null}
					</Card>
				);
			})}
		</View>
	);
}

function SwapLeg({
	label,
	shift,
	highlight,
}: {
	label: string;
	shift: {
		startsAt: string;
		endsAt: string;
		positionName: string;
		timezone?: string;
	};
	highlight?: boolean;
}) {
	const { theme } = useAppTheme();
	const { formatClockTime, formatDayShort } = useDisplayPrefs();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.md,
				padding: spacing.md,
				borderRadius: radius.md,
				borderCurve: "continuous",
				backgroundColor: highlight ? theme.primarySoft : theme.surfaceMuted,
			}}
		>
			<AppText
				variant="overline"
				tone={highlight ? "tint" : "secondary"}
				style={{ width: 64 }}
			>
				{label}
			</AppText>
			<View style={{ flex: 1, gap: 1 }}>
				<AppText variant="callout" weight="600" tabular>
					{formatDayShort(shift.startsAt, shift.timezone)} ·{" "}
					{formatClockTime(shift.startsAt, shift.timezone)}–
					{formatClockTime(shift.endsAt, shift.timezone)}
				</AppText>
				<AppText variant="footnote" tone="secondary">
					{shift.positionName}
				</AppText>
			</View>
		</View>
	);
}
