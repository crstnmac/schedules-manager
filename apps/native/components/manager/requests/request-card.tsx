import type * as React from "react";
import { View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	LinearTransition,
} from "react-native-reanimated";

import {
	AppText,
	Avatar,
	Badge,
	Button,
	Card,
	Icon,
	IconButton,
	type IconName,
	type Tone,
} from "@/components/ui";
import { positionColor } from "@/lib/position-color";
import type { LeaveApprovalDto } from "@/lib/queries";
import { motion, radius, spacing, useAppTheme } from "@/theme";

/**
 * Enter/exit wrapper for queue rows: a decided card fades out and the list
 * closes the gap with a spring instead of jumping.
 */
export function QueueRow({ children }: { children: React.ReactNode }) {
	return (
		<Animated.View
			entering={FadeIn.duration(motion.base)}
			exiting={FadeOut.duration(motion.fast)}
			layout={LinearTransition.springify()
				.damping(motion.spring.damping)
				.stiffness(motion.spring.stiffness)}
		>
			{children}
		</Animated.View>
	);
}

/**
 * One anatomy for every request: who, what, when (with urgency), the facts
 * needed to decide, then the decision. Kind-specific detail goes in children.
 */
export function RequestCard({
	name,
	kindIcon,
	kindLabel,
	startsAt,
	badges,
	children,
	footer,
	emergency,
}: {
	name: string;
	kindIcon: IconName;
	kindLabel: string;
	startsAt?: string | null;
	badges?: React.ReactNode;
	children?: React.ReactNode;
	footer?: React.ReactNode;
	emergency?: boolean;
}) {
	const { theme } = useAppTheme();
	return (
		<Card
			style={[
				{ gap: spacing.md + 2 },
				emergency
					? { borderWidth: 1.5, borderColor: theme.warningBorder }
					: null,
			]}
		>
			<View
				style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
			>
				<Avatar name={name} size={40} color={positionColor(name)} />
				<View style={{ flex: 1, gap: 1 }}>
					<AppText variant="headline" numberOfLines={1}>
						{name}
					</AppText>
					<View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
						<Icon name={kindIcon} size={12} color={theme.textSecondary} />
						<AppText
							variant="footnote"
							tone="secondary"
							numberOfLines={1}
							style={{ flexShrink: 1 }}
						>
							{kindLabel}
						</AppText>
					</View>
				</View>
				{startsAt ? <UrgencyBadge startsAt={startsAt} /> : null}
			</View>
			{badges ? (
				<View
					style={{
						flexDirection: "row",
						flexWrap: "wrap",
						gap: spacing.xs + 2,
					}}
				>
					{badges}
				</View>
			) : null}
			{children}
			{footer}
		</Card>
	);
}

/** "Today" / "Tomorrow" / "In 3 days" — amber once it's two days out or less. */
export function UrgencyBadge({ startsAt }: { startsAt: string }) {
	const start = new Date(startsAt);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const day = new Date(start);
	day.setHours(0, 0, 0, 0);
	const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
	const label =
		days < 0
			? "Started"
			: days === 0
				? "Today"
				: days === 1
					? "Tomorrow"
					: days < 7
						? `In ${days} days`
						: start.toLocaleDateString(undefined, {
								month: "short",
								day: "numeric",
							});
	const tone: Tone = days <= 2 ? "warning" : "neutral";
	return (
		<Badge label={label} tone={tone} icon={days <= 2 ? "clock" : undefined} />
	);
}

/** Inset panel holding the facts a decision depends on. */
export function DetailWell({ children }: { children: React.ReactNode }) {
	const { theme } = useAppTheme();
	return (
		<View
			style={{
				backgroundColor: theme.surfaceMuted,
				borderRadius: radius.md,
				borderCurve: "continuous",
				padding: spacing.md,
				gap: spacing.xs,
			}}
		>
			{children}
		</View>
	);
}

/** The worker's own words, set apart so they read as a quote. */
export function Note({ children }: { children: string }) {
	const { theme } = useAppTheme();
	return (
		<View
			style={{
				borderLeftWidth: 3,
				borderLeftColor: theme.border,
				paddingLeft: spacing.md,
				paddingVertical: 2,
			}}
		>
			<AppText variant="subhead" tone="secondary" selectable>
				“{children}”
			</AppText>
		</View>
	);
}

export function Attachments({ names }: { names: string[] }) {
	if (names.length === 0) return null;
	return (
		<View
			style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 }}
		>
			{names.map((name) => (
				<Badge key={name} label={name} icon="paperclip" />
			))}
		</View>
	);
}

/**
 * Balance impact in one line: what this uses and what's left. Turns red when
 * the request exceeds the balance so it can't be missed.
 */
export function BalanceLine({
	chargeLabel,
	remainingLabel,
	short,
}: {
	chargeLabel: string;
	remainingLabel: string;
	short: boolean;
}) {
	const { theme } = useAppTheme();
	return (
		<View
			style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
		>
			<AppText variant="footnote" tone="secondary" tabular>
				Uses {chargeLabel}
			</AppText>
			<Icon name="arrowRight" size={11} color={theme.textTertiary} />
			<AppText
				variant="footnote"
				weight="600"
				tabular
				color={short ? theme.danger : theme.text}
			>
				{short ? `Only ${remainingLabel} available` : `${remainingLabel} left`}
			</AppText>
		</View>
	);
}

/** Horizontal approval chain: each step a node, the current one ringed. */
export function ApprovalChain({
	approvals,
	currentStep,
}: {
	approvals: LeaveApprovalDto[];
	currentStep?: number;
}) {
	const { theme } = useAppTheme();
	if (approvals.length < 2) return null;
	const current =
		currentStep ??
		approvals.find((a) => a.status === "pending" || a.status === "escalated")
			?.stepOrder;
	const nodeColor = (status: LeaveApprovalDto["status"]) =>
		status === "approved"
			? theme.success
			: status === "declined"
				? theme.danger
				: status === "escalated"
					? theme.warning
					: theme.border;

	return (
		<View
			accessible
			accessibilityLabel={`Approval step ${(current ?? 0) + 1} of ${approvals.length}`}
			style={{ gap: spacing.xs + 2 }}
		>
			<AppText variant="caption" tone="secondary">
				Approval · step {(current ?? 0) + 1} of {approvals.length}
			</AppText>
			<View style={{ flexDirection: "row", alignItems: "center" }}>
				{approvals.map((approval, index) => {
					const done = approval.status === "approved";
					const isCurrent = approval.stepOrder === current;
					const color = nodeColor(approval.status);
					return (
						<View
							key={approval.id}
							style={{
								flexDirection: "row",
								alignItems: "center",
								flex: index === approvals.length - 1 ? 0 : 1,
							}}
						>
							<View
								style={{
									width: 22,
									height: 22,
									borderRadius: 11,
									alignItems: "center",
									justifyContent: "center",
									backgroundColor:
										done || approval.status === "declined"
											? color
											: theme.surface,
									borderWidth: done ? 0 : 2,
									borderColor: isCurrent ? theme.primary : color,
								}}
							>
								{done ? (
									<Icon name="check" size={11} color="#FFFFFF" />
								) : approval.status === "declined" ? (
									<Icon name="close" size={11} color="#FFFFFF" />
								) : (
									<AppText
										variant="caption"
										weight="700"
										color={isCurrent ? theme.tint : theme.textTertiary}
									>
										{approval.stepOrder + 1}
									</AppText>
								)}
							</View>
							{index < approvals.length - 1 ? (
								<View
									style={{
										flex: 1,
										height: 2,
										marginHorizontal: spacing.xs,
										borderRadius: 1,
										backgroundColor: done ? theme.success : theme.border,
									}}
								/>
							) : null}
						</View>
					);
				})}
			</View>
		</View>
	);
}

/**
 * Approve is the primary action on the right (thumb side); Decline sits
 * beside it at equal height so neither is a mis-tap away from the other's
 * meaning. Secondary actions live behind the overflow button.
 */
export function DecisionBar({
	approveLabel = "Approve",
	onApprove,
	onDecline,
	onMore,
	busy,
}: {
	approveLabel?: string;
	onApprove: () => void;
	onDecline: () => void;
	onMore?: () => void;
	busy?: "approve" | "decline" | null;
}) {
	return (
		<View
			style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
		>
			{onMore ? (
				<IconButton
					icon="ellipsis"
					accessibilityLabel="More actions"
					onPress={onMore}
					size={48}
					shape="square"
				/>
			) : null}
			<Button
				label="Decline"
				variant="secondary"
				loading={busy === "decline"}
				disabled={Boolean(busy)}
				onPress={onDecline}
				style={{ flex: 1 }}
			/>
			<Button
				label={approveLabel}
				icon="check"
				loading={busy === "approve"}
				disabled={Boolean(busy)}
				onPress={onApprove}
				style={{ flex: 1.4 }}
			/>
		</View>
	);
}
