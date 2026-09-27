import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import {
	AppText,
	Avatar,
	Badge,
	Button,
	Card,
	CardListSkeleton,
	ChoiceChips,
	Divider,
	EmptyState,
	ErrorState,
	FadeSwap,
	IconButton,
	Screen,
	Section,
	SegmentedControl,
} from "@/components/ui";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { tapSuccess } from "@/lib/haptics";
import { formatLeaveHours, formatLeaveRange, todayIsoDate } from "@/lib/leave";
import { positionColor } from "@/lib/position-color";
import {
	type LeaveEncashmentDto,
	useCurrentEmployment,
	useMarkLeaveEncashmentPaid,
} from "@/lib/queries";
import { spacing } from "@/theme";
import { QueueCard, useLeaveOverflow } from "./queue-cards";
import { QueueRow } from "./request-card";
import {
	type QueueCategory,
	type TimeOffRequest,
	useRequestQueue,
} from "./use-request-queue";

type View_ = "inbox" | "out" | "payouts";
type Filter = "all" | QueueCategory;

const FILTER_LABEL: Record<QueueCategory, string> = {
	timeOff: "Time off",
	shifts: "Shifts",
	pay: "Leave pay",
};

/**
 * Manager decision queue. Everything waiting on a decision comes first,
 * ordered by urgency; creating time off lives in a sheet behind "+", so the
 * screen is never a form to scroll past.
 */
export function RequestsScreen() {
	const router = useRouter();
	const { workplaceId } = useCurrentEmployment();
	const data = useRequestQueue(workplaceId);
	const [view, setView] = useState<View_>("inbox");
	const [filter, setFilter] = useState<Filter>("all");
	// The queue must be current whenever a Manager lands here, not whenever
	// the 30s stale window happens to lapse.
	const refetchRef = useRef(data.refetch);
	refetchRef.current = data.refetch;
	useFocusEffect(
		useCallback(() => {
			void refetchRef.current();
		}, []),
	);

	const counts = {
		timeOff: data.queue.filter((item) => item.category === "timeOff").length,
		shifts: data.queue.filter((item) => item.category === "shifts").length,
		pay: data.queue.filter((item) => item.category === "pay").length,
	};
	const activeCategories = (Object.keys(counts) as QueueCategory[]).filter(
		(key) => counts[key] > 0,
	);
	const effectiveFilter =
		filter !== "all" && counts[filter] === 0 ? "all" : filter;
	const visible = data.queue.filter(
		(item) => effectiveFilter === "all" || item.category === effectiveFilter,
	);
	const urgent = data.queue.filter((item) => {
		if (item.emergency) return true;
		const days = (new Date(item.sortKey).getTime() - Date.now()) / 86_400_000;
		return item.category !== "pay" && days <= 2;
	}).length;

	const segments: { value: View_; label: string; count?: number }[] = [
		{ value: "inbox", label: "To decide", count: data.queue.length },
		{ value: "out", label: "Who’s out", count: data.whosOut.length },
		...(data.payouts.length > 0
			? [
					{
						value: "payouts" as const,
						label: "Payouts",
						count: data.payouts.length,
					},
				]
			: []),
	];

	return (
		<>
			<Stack.Screen
				options={{
					headerRight: () => (
						<IconButton
							icon="plus"
							variant="tinted"
							size={34}
							accessibilityLabel="Add time off"
							onPress={() => router.push("/time-off-sheet")}
						/>
					),
				}}
			/>
			<Screen onRefresh={data.refetch}>
				<AppText
					variant="subhead"
					tone="secondary"
					style={{ paddingHorizontal: spacing.xs, marginTop: -spacing.xs }}
				>
					{data.isLoading
						? "Checking for requests…"
						: data.queue.length === 0
							? "You’re all caught up."
							: `${data.queue.length} waiting on you${urgent > 0 ? ` · ${urgent} urgent` : ""}`}
				</AppText>

				<SegmentedControl<View_>
					value={segments.some((s) => s.value === view) ? view : "inbox"}
					onChange={setView}
					options={segments}
				/>

				{data.error ? (
					<ErrorState error={data.error} onRetry={() => void data.refetch()} />
				) : null}

				{view === "inbox" ? (
					<FadeSwap key="inbox" style={{ gap: spacing.lg }}>
						{activeCategories.length > 1 ? (
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								style={{ marginHorizontal: -spacing.lg }}
								contentContainerStyle={{ paddingHorizontal: spacing.lg }}
							>
								<ChoiceChips<Filter>
									accessibilityLabel="Filter requests"
									value={effectiveFilter}
									onChange={setFilter}
									options={[
										{ value: "all", label: `All ${data.queue.length}` },
										...activeCategories.map((key) => ({
											value: key,
											label: `${FILTER_LABEL[key]} ${counts[key]}`,
										})),
									]}
								/>
							</ScrollView>
						) : null}

						{data.isLoading ? <CardListSkeleton count={2} /> : null}

						{!data.isLoading && data.queue.length === 0 ? (
							<EmptyState
								icon="checkCircle"
								tone="success"
								title="All caught up"
								body="Time off, shift releases, pickups, and swaps land here when they need your decision."
								action={
									<Button
										label="Add time off"
										icon="plus"
										variant="tinted"
										onPress={() => router.push("/time-off-sheet")}
									/>
								}
							/>
						) : null}

						{visible.map((item) => (
							<QueueRow key={item.id}>
								<QueueCard item={item} workplaceId={workplaceId} />
							</QueueRow>
						))}
					</FadeSwap>
				) : null}

				{view === "out" ? (
					<FadeSwap key="out" style={{ gap: spacing.xl }}>
						<WhosOut requests={data.whosOut} workplaceId={workplaceId} />
					</FadeSwap>
				) : null}

				{view === "payouts" ? (
					<FadeSwap key="payouts" style={{ gap: spacing.md }}>
						<Payouts items={data.payouts} workplaceId={workplaceId} />
					</FadeSwap>
				) : null}
			</Screen>
		</>
	);
}

function WhosOut({
	requests,
	workplaceId,
}: {
	requests: TimeOffRequest[];
	workplaceId: string | undefined;
}) {
	const today = todayIsoDate();
	const outNow = requests.filter(
		(r) => (r.startDate ?? r.startsAt.slice(0, 10)) <= today,
	);
	const upcoming = requests.filter(
		(r) => (r.startDate ?? r.startsAt.slice(0, 10)) > today,
	);
	if (requests.length === 0)
		return (
			<EmptyState
				icon="people"
				title="Everyone’s in"
				body="Approved time off shows up here until it ends."
			/>
		);
	return (
		<>
			{outNow.length > 0 ? (
				<Section title="Out now">
					<LeaveList requests={outNow} workplaceId={workplaceId} />
				</Section>
			) : null}
			{upcoming.length > 0 ? (
				<Section title="Coming up">
					<LeaveList requests={upcoming} workplaceId={workplaceId} />
				</Section>
			) : null}
		</>
	);
}

function LeaveList({
	requests,
	workplaceId,
}: {
	requests: TimeOffRequest[];
	workplaceId: string | undefined;
}) {
	const { formatPerson, timeFormat } = useDisplayPrefs();
	const openOverflow = useLeaveOverflow(workplaceId);
	return (
		<Card padded={false} style={{ gap: 0 }}>
			{requests.map((request, index) => {
				const name = formatPerson(
					request.worker.fullName,
					request.worker.email,
				);
				return (
					<QueueRow key={request.id}>
						{index > 0 ? <Divider inset={68} /> : null}
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: spacing.md,
								paddingLeft: spacing.lg,
								paddingRight: spacing.sm,
								paddingVertical: spacing.md,
							}}
						>
							<Avatar name={name} size={40} color={positionColor(name)} />
							<View style={{ flex: 1, gap: 2 }}>
								<AppText variant="callout" weight="600" numberOfLines={1}>
									{name}
									{request.kind === "manager" ? " · Manager" : ""}
								</AppText>
								<AppText
									variant="footnote"
									tone="secondary"
									tabular
									numberOfLines={1}
								>
									{formatLeaveRange(request, timeFormat)}
								</AppText>
							</View>
							{request.leaveTypeName ? (
								<Badge label={request.leaveTypeName} tone="primary" />
							) : null}
							<IconButton
								icon="ellipsis"
								variant="ghost"
								size={36}
								accessibilityLabel={`Options for ${name}’s time off`}
								onPress={() => openOverflow(request, "time off")}
							/>
						</View>
					</QueueRow>
				);
			})}
		</Card>
	);
}

function Payouts({
	items,
	workplaceId,
}: {
	items: LeaveEncashmentDto[];
	workplaceId: string | undefined;
}) {
	const { formatPerson } = useDisplayPrefs();
	const markPaid = useMarkLeaveEncashmentPaid(workplaceId);
	return (
		<>
			<AppText
				variant="footnote"
				tone="secondary"
				style={{ paddingHorizontal: spacing.xs }}
			>
				Approved leave payouts. Mark each one paid once payroll has run.
			</AppText>
			{items.map((item) => {
				const name = formatPerson(
					item.employmentName ?? null,
					item.employmentEmail ?? "",
				);
				const busy =
					markPaid.isPending && markPaid.variables?.encashmentId === item.id;
				return (
					<QueueRow key={item.id}>
						<Card>
							<View
								style={{
									flexDirection: "row",
									alignItems: "center",
									gap: spacing.md,
								}}
							>
								<Avatar name={name} size={40} color={positionColor(name)} />
								<View style={{ flex: 1, gap: 1 }}>
									<AppText variant="headline" numberOfLines={1}>
										{name}
									</AppText>
									<AppText variant="footnote" tone="secondary">
										{item.leaveTypeName ?? "Leave"} ·{" "}
										{formatLeaveHours(item.minutes)}
									</AppText>
								</View>
								{item.amountCents > 0 ? (
									<AppText variant="title3" tabular>
										${(item.amountCents / 100).toFixed(2)}
									</AppText>
								) : null}
							</View>
							<Button
								label="Mark paid"
								icon="check"
								variant="tinted"
								loading={busy}
								onPress={() =>
									confirmAction({
										title: "Mark this payout paid?",
										message: "Record that the payout has been made.",
										confirmLabel: "Mark paid",
										onConfirm: () =>
											markPaid.mutate(
												{ encashmentId: item.id },
												{ onSuccess: tapSuccess },
											),
									})
								}
							/>
						</Card>
					</QueueRow>
				);
			})}
		</>
	);
}
