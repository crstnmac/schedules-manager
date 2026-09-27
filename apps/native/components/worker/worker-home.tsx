import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";

import {
	Appear,
	AppText,
	Button,
	Callout,
	Card,
	Divider,
	EmptyState,
	ErrorState,
	FadeSwap,
	ListRow,
	Screen,
	Section,
	SegmentedControl,
	Skeleton,
} from "@/components/ui";
import { acceptanceHeadline } from "@/lib/acceptance-headline";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { friendlyMessage } from "@/lib/friendly-message";
import { tapSuccess } from "@/lib/haptics";
import { formatDateKey } from "@/lib/leave";
import {
	type MyScheduleResponse,
	useAcknowledge,
	useClockIn,
	useClockOut,
	useMe,
	useMySchedule,
	usePublishedVersion,
	useRespondToAcceptance,
} from "@/lib/queries";
import {
	useShiftStartNotifications,
	useShiftStartResponseHandler,
} from "@/lib/shift-notifications";
import {
	formatHoursShort,
	greeting,
	localDateKey,
	shiftHours,
} from "@/lib/time-format";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";
import { radius, spacing, useAppTheme } from "@/theme";
import { NextShiftHero } from "./next-shift-hero";
import {
	DayHeading,
	ShiftCard,
	useOpenShift,
	type WeekShift,
} from "./shift-card";
import { SwapsCard } from "./swaps-card";

type Scope = "mine" | "everyone";

/**
 * Worker home, in priority order (DESIGN.md): next Shift + time clock, then
 * anything that needs an answer, then the week. History sits last.
 */
export function WorkerHome() {
	const { formatPerson } = useDisplayPrefs();
	const me = useMe();
	const { selected } = useSelectedWorkplaceId();
	const queryClient = useQueryClient();
	const openShift = useOpenShift();

	const employments = me.data?.employments ?? [];
	const employment =
		employments.find((e) => e.workplace.id === selected) ?? employments[0];
	const workplaceId = employment?.workplace.id;

	const schedule = useMySchedule(workplaceId);
	const clockIn = useClockIn();
	const clockOut = useClockOut();
	const [scope, setScope] = useState<Scope>("mine");

	// Planned (unpublished) shifts are visible to the worker but must not raise
	// shift-start notifications, which belong to the Published Schedule.
	const publishedSchedule = useMemo(() => {
		if (!schedule.data) return schedule.data;
		const onlyPublishedMine = (week: MyScheduleResponse["currentWeek"]) =>
			week
				? {
						...week,
						shifts: week.shifts.filter(
							(shift) => shift.isMine && !shift.planned,
						),
					}
				: null;
		return {
			...schedule.data,
			currentWeek: onlyPublishedMine(schedule.data.currentWeek),
			nextWeek: onlyPublishedMine(schedule.data.nextWeek),
		};
	}, [schedule.data]);
	useShiftStartNotifications(workplaceId, publishedSchedule);
	useShiftStartResponseHandler();

	useFocusEffect(() => {
		if (workplaceId)
			void queryClient.invalidateQueries({
				queryKey: ["my-schedule", workplaceId],
			});
	});

	const data = schedule.data;
	const currentWeek = data?.currentWeek ?? null;
	const nextWeek = data?.nextWeek ?? null;
	const nextShift = data?.nextShift ?? null;
	const todayKey = localDateKey();
	const firstName = me.data?.profile
		? formatPerson(me.data.profile.fullName, me.data.profile.email).split(
				" ",
			)[0]
		: null;

	const nextShiftDetail = useMemo(() => {
		if (!nextShift) return null;
		for (const week of [currentWeek, nextWeek]) {
			const match = week?.shifts.find((shift) => shift.id === nextShift.id);
			if (match && week)
				return { shift: match, locationName: week.locationName };
		}
		return null;
	}, [nextShift, currentWeek, nextWeek]);

	const hasCoworkerShifts = Boolean(
		currentWeek?.shifts.some((shift) => !shift.isMine),
	);
	const weekShifts = (currentWeek?.shifts ?? []).filter(
		(shift) => scope === "everyone" || shift.isMine,
	);
	const shiftsByDay = groupByDay(weekShifts);
	const myWeek = (currentWeek?.shifts ?? []).filter((shift) => shift.isMine);
	const myHours = myWeek.reduce(
		(sum, shift) =>
			sum + shiftHours(shift.startMinute, shift.endMinute, shift.overnight),
		0,
	);
	const workedHours = myWeek.reduce((sum, shift) => {
		const entry = shift.timeEntry;
		if (!entry?.clockedOutAt) return sum;
		return (
			sum +
			(new Date(entry.clockedOutAt).getTime() -
				new Date(entry.clockedInAt).getTime()) /
				3_600_000
		);
	}, 0);
	const nextWeekMine = (nextWeek?.shifts ?? []).filter((shift) => shift.isMine);

	const needsAcknowledgement =
		currentWeek !== null &&
		currentWeek.version !== null &&
		currentWeek.shifts.some((shift) => shift.isMine && !shift.planned) &&
		currentWeek.deliveryStatus !== "acknowledged";

	return (
		<Screen onRefresh={() => schedule.refetch()}>
			<View
				style={{
					gap: 2,
					paddingHorizontal: spacing.xs,
					marginTop: -spacing.xs,
				}}
			>
				<AppText variant="subhead" tone="secondary">
					{firstName ? `${greeting()}, ${firstName}` : greeting()}
					{employment ? ` · ${employment.workplace.name}` : ""}
				</AppText>
			</View>

			{schedule.isLoading ? <HomeSkeleton /> : null}

			{schedule.isError ? (
				<ErrorState
					title="We couldn’t load your schedule"
					error={schedule.error}
					onRetry={() => void schedule.refetch()}
				/>
			) : null}

			{nextShift ? (
				<Appear>
					<NextShiftHero
						shift={nextShift}
						locationName={nextShiftDetail?.locationName}
						clockIn={clockIn}
						clockOut={clockOut}
						onOpen={
							nextShiftDetail && !nextShift.planned
								? () =>
										openShift(
											nextShiftDetail.shift,
											nextShiftDetail.locationName,
										)
								: undefined
						}
					/>
				</Appear>
			) : data ? (
				<Appear>
					<Card>
						<EmptyState
							icon="sun"
							tone="primary"
							title="No upcoming shifts"
							body="Enjoy the time off. New shifts show up here as soon as your Manager publishes them."
						/>
					</Card>
				</Appear>
			) : null}

			{data ? (
				<ActionItems data={data} needsAcknowledgement={needsAcknowledgement} />
			) : null}

			<SwapsCard workplaceId={workplaceId} />

			{currentWeek && currentWeek.shifts.length > 0 ? (
				<Appear index={2}>
					<Section
						title="This week"
						caption={`Week of ${formatDateKey(currentWeek.weekStart)} · ${currentWeek.locationName}`}
					>
						<WeekStats
							shifts={myWeek.length}
							scheduledHours={myHours}
							workedHours={workedHours}
						/>
						{hasCoworkerShifts ? (
							<SegmentedControl<Scope>
								value={scope}
								onChange={setScope}
								options={[
									{ value: "mine", label: "My shifts", count: myWeek.length },
									{
										value: "everyone",
										label: "Everyone",
										count: currentWeek.shifts.length,
									},
								]}
							/>
						) : null}
						<FadeSwap key={scope} style={{ gap: spacing.md }}>
							{shiftsByDay.length === 0 ? (
								<Card>
									<AppText variant="subhead" tone="secondary" align="center">
										You have no shifts this week.
									</AppText>
								</Card>
							) : null}
							{shiftsByDay.map(([date, shifts]) => (
								<View key={date} style={{ gap: spacing.sm }}>
									<DayHeading
										dateKey={date}
										isToday={date === todayKey}
										trailing={
											shifts.length > 1 ? `${shifts.length} shifts` : undefined
										}
									/>
									{shifts.map((shift) => (
										<ShiftCard
											key={shift.id}
											shift={shift}
											locationName={currentWeek.locationName}
											onPress={
												shift.planned
													? undefined
													: () => openShift(shift, currentWeek.locationName)
											}
										/>
									))}
								</View>
							))}
						</FadeSwap>
						{currentWeek.shifts.some((shift) => shift.planned) ? (
							<AppText
								variant="footnote"
								tone="secondary"
								style={{ paddingHorizontal: spacing.xs }}
							>
								Planned shifts aren’t published yet and may still change.
							</AppText>
						) : null}
					</Section>
				</Appear>
			) : null}

			{nextWeek && nextWeekMine.length > 0 ? (
				<Appear index={3}>
					<Section
						title="Next week"
						caption={`Week of ${formatDateKey(nextWeek.weekStart)} · ${nextWeekMine.length} shift${nextWeekMine.length === 1 ? "" : "s"}`}
					>
						{nextWeekMine.map((shift) => (
							<ShiftCard
								key={shift.id}
								shift={shift}
								leading="date"
								locationName={nextWeek.locationName}
								onPress={
									shift.planned
										? undefined
										: () => openShift(shift, nextWeek.locationName)
								}
							/>
						))}
					</Section>
				</Appear>
			) : null}

			{data && data.history.length > 0 ? (
				<Appear index={4}>
					<HistorySection history={data.history} />
				</Appear>
			) : null}

			{!schedule.isLoading && !schedule.isError && data && !currentWeek ? (
				<EmptyState
					icon="calendar"
					title="No Published Schedule yet"
					body="When your Manager publishes the Schedule for the week, your Shifts will appear here."
				/>
			) : null}
		</Screen>
	);
}

function groupByDay(shifts: WeekShift[]): [string, WeekShift[]][] {
	const map = new Map<string, WeekShift[]>();
	for (const shift of shifts) {
		const list = map.get(shift.date) ?? [];
		list.push(shift);
		map.set(shift.date, list);
	}
	return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Responses the worker owes, kept as separate plainly-worded actions
 * (DESIGN.md): accept a late change, acknowledge a publication.
 */
function ActionItems({
	data,
	needsAcknowledgement,
}: {
	data: MyScheduleResponse;
	needsAcknowledgement: boolean;
}) {
	const { formatMinute } = useDisplayPrefs();
	const acknowledge = useAcknowledge();
	const respond = useRespondToAcceptance();
	const currentWeek = data.currentWeek;

	return (
		<>
			{data.pendingAcceptances.map((a, index) => (
				<Appear key={a.id} index={index + 1}>
					<Callout
						tone="warning"
						icon="warning"
						title="Your shift changed"
						body={`${acceptanceHeadline(a.date, a.positionName)} · new start ${formatMinute(a.startMinute)}. ${a.changeSummary}`}
					>
						<AppText variant="footnote" tone="secondary">
							Accept if you can work the new time. Declining hands it back to
							your Manager — nothing else changes either way.
						</AppText>
						<View style={{ flexDirection: "row", gap: spacing.sm }}>
							<Button
								label="Decline"
								variant="outline"
								disabled={respond.isPending}
								onPress={() =>
									respond.mutate({ acceptanceId: a.id, decision: "decline" })
								}
								style={{ flex: 1 }}
							/>
							<Button
								label="I’ll work it"
								icon="check"
								disabled={respond.isPending}
								onPress={() =>
									confirmAction({
										title: "Work this changed shift?",
										message:
											"Accepting confirms you agree to work the new time. You are not agreeing to anything extra.",
										confirmLabel: "Accept change",
										onConfirm: () =>
											respond.mutate(
												{ acceptanceId: a.id, decision: "accept" },
												{ onSuccess: tapSuccess },
											),
									})
								}
								style={{ flex: 1.3 }}
							/>
						</View>
						{respond.isError ? (
							<AppText variant="footnote" tone="danger" selectable>
								Could not save your answer — {friendlyMessage(respond.error)}
							</AppText>
						) : null}
					</Callout>
				</Appear>
			))}

			{needsAcknowledgement && currentWeek ? (
				<Appear index={2}>
					<Callout
						tone="primary"
						icon="bellFill"
						title="New schedule published"
						body={`Week of ${formatDateKey(currentWeek.weekStart)}. Let your Manager know you’ve seen it.`}
					>
						<Button
							label="I saw this"
							icon="eye"
							loading={acknowledge.isPending}
							onPress={() =>
								acknowledge.mutate(currentWeek.version?.id ?? "", {
									onSuccess: tapSuccess,
								})
							}
						/>
						{acknowledge.isError ? (
							<AppText variant="footnote" tone="danger" selectable>
								{friendlyMessage(acknowledge.error)}
							</AppText>
						) : null}
					</Callout>
				</Appear>
			) : null}

			{data.currentChanges.length > 0 ? (
				<Appear index={3}>
					<Callout tone="neutral" icon="history" title="What changed this week">
						<View style={{ gap: spacing.xs }}>
							{data.currentChanges.map((change) => (
								<View
									key={change}
									style={{ flexDirection: "row", gap: spacing.sm }}
								>
									<AppText variant="subhead" tone="secondary">
										•
									</AppText>
									<AppText
										variant="subhead"
										tone="secondary"
										style={{ flex: 1 }}
									>
										{change}
									</AppText>
								</View>
							))}
						</View>
					</Callout>
				</Appear>
			) : null}
		</>
	);
}

function WeekStats({
	shifts,
	scheduledHours,
	workedHours,
}: {
	shifts: number;
	scheduledHours: number;
	workedHours: number;
}) {
	const { theme } = useAppTheme();
	const stats = [
		{ label: "Shifts", value: String(shifts) },
		{ label: "Scheduled", value: formatHoursShort(scheduledHours) },
		{ label: "Worked", value: formatHoursShort(workedHours) },
	];
	return (
		<Card style={{ flexDirection: "row", gap: 0, paddingVertical: spacing.md }}>
			{stats.map((stat, index) => (
				<View
					key={stat.label}
					accessible
					accessibilityLabel={`${stat.label}: ${stat.value}`}
					style={{
						flex: 1,
						alignItems: "center",
						gap: 2,
						borderLeftWidth: index === 0 ? 0 : 1,
						borderLeftColor: theme.separator,
					}}
				>
					<AppText variant="title2" tabular>
						{stat.value}
					</AppText>
					<AppText variant="caption" tone="secondary">
						{stat.label}
					</AppText>
				</View>
			))}
		</Card>
	);
}

function HistorySection({
	history,
}: {
	history: MyScheduleResponse["history"];
}) {
	const { formatShiftRange, formatDayShort } = useDisplayPrefs();
	const [openId, setOpenId] = useState<string | null>(null);
	const version = usePublishedVersion(openId);

	return (
		<Section
			title="Past schedules"
			caption="Opening an old Schedule doesn’t mark it as acknowledged."
		>
			<Card padded={false} style={{ gap: 0 }}>
				{history.map((entry, index) => {
					const open = openId === entry.versionId;
					return (
						<View key={entry.versionId}>
							{index > 0 ? <Divider inset={60} /> : null}
							<ListRow
								icon="history"
								iconTone="neutral"
								title={`Week of ${formatDateKey(entry.weekStart)}`}
								subtitle={`Version ${entry.versionNumber}`}
								chevron={false}
								onPress={() => setOpenId(open ? null : entry.versionId)}
								trailing={
									<AppText variant="footnote" tone="tint" weight="600">
										{open ? "Hide" : "View"}
									</AppText>
								}
							/>
							{open ? (
								<FadeSwap
									style={{
										gap: spacing.sm,
										paddingHorizontal: spacing.lg,
										paddingBottom: spacing.lg,
										paddingLeft: 60,
									}}
								>
									{version.isLoading ? <Skeleton width="70%" /> : null}
									{version.data?.shifts.map((shift) => (
										<AppText
											key={shift.id}
											variant="footnote"
											tone="secondary"
											tabular
										>
											{formatDayShort(shift.startsAt)} ·{" "}
											{formatShiftRange(
												shift.startMinute,
												shift.endMinute,
												shift.overnight,
											)}{" "}
											· {shift.positionName}
										</AppText>
									))}
									{version.data && version.data.shifts.length === 0 ? (
										<AppText variant="footnote" tone="secondary">
											You had no Shifts on this Published Schedule.
										</AppText>
									) : null}
								</FadeSwap>
							) : null}
						</View>
					);
				})}
			</Card>
		</Section>
	);
}

function HomeSkeleton() {
	const { theme } = useAppTheme();
	return (
		<View
			style={{ gap: spacing.xl }}
			accessibilityLabel="Loading your schedule"
		>
			<View
				style={{
					height: 236,
					borderRadius: radius.xl,
					borderCurve: "continuous",
					backgroundColor: theme.surfaceMuted,
				}}
			/>
			<View style={{ gap: spacing.md }}>
				<Skeleton width={120} height={20} />
				<Skeleton height={72} rounded={radius.lg} />
				<Skeleton height={72} rounded={radius.lg} />
			</View>
		</View>
	);
}
