import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";

import {
	Appear,
	AppText,
	Avatar,
	Badge,
	Button,
	Callout,
	Card,
	Divider,
	Icon,
	type IconName,
	NativeCheckboxRow,
	PressableScale,
	Screen,
	Section,
	Skeleton,
} from "@/components/ui";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { friendlyMessage } from "@/lib/friendly-message";
import { tapSuccess } from "@/lib/haptics";
import { positionColor } from "@/lib/position-color";
import {
	type DayRosterEntry,
	useCompleteShiftTask,
	useDayRoster,
	useProposeSwap,
	useShiftTasks,
} from "@/lib/queries";
import {
	formatHoursShort,
	relativeDayLabel,
	shiftHours,
} from "@/lib/time-format";
import { radius, spacing, useAppTheme } from "@/theme";
import type { WeekShift } from "./shift-card";

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
	const { formatShiftRange, formatDayLong, formatDayShort } = useDisplayPrefs();
	const queryClient = useQueryClient();
	const [mode, setMode] = useState<"info" | "swap">("info");
	const roster = useDayRoster(workplaceId, shift.date);
	const release = useMutation({
		mutationFn: (versionShiftId: string) =>
			api("/v1/my/releases", { method: "POST", body: { versionShiftId } }),
		onSuccess: () => {
			tapSuccess();
			queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
			onClose();
		},
	});

	const isMine = shift.isMine;
	const past = new Date(shift.endsAt).getTime() < Date.now();
	const canChange =
		isMine &&
		!past &&
		!shift.planned &&
		!shift.timeEntry &&
		shift.releaseStatus === null;
	const coworkers = (roster.data?.roster ?? []).filter(
		(row) => !row.mine && row.employmentId,
	);
	const accent = positionColor(shift.positionName);

	return (
		<Screen>
			<Appear>
				<Card>
					<View style={{ gap: spacing.xs }}>
						<AppText variant="overline" tone="tint">
							{relativeDayLabel(shift.date)}
						</AppText>
						<AppText variant="title2" selectable>
							{formatDayLong(shift.startsAt)}
						</AppText>
						<View
							style={{
								flexDirection: "row",
								alignItems: "baseline",
								gap: spacing.sm,
							}}
						>
							<AppText variant="title3" weight="500" tabular selectable>
								{formatShiftRange(
									shift.startMinute,
									shift.endMinute,
									shift.overnight,
								)}
							</AppText>
							<AppText variant="footnote" tone="secondary" tabular>
								{formatHoursShort(
									shiftHours(
										shift.startMinute,
										shift.endMinute,
										shift.overnight,
									),
								)}
							</AppText>
						</View>
					</View>
					<Divider />
					<View style={{ gap: spacing.md }}>
						<DetailRow
							icon="briefcase"
							label={shift.positionName}
							dotColor={accent}
						/>
						<DetailRow icon="location" label={locationName ?? "Location"} />
						{!isMine ? (
							<DetailRow icon="person" label={shift.workerName ?? "Coworker"} />
						) : null}
						{shift.note ? <DetailRow icon="doc" label={shift.note} /> : null}
					</View>
					{shift.planned ? (
						<Badge label="Planned · not published yet" tone="neutral" />
					) : shift.releaseStatus === "pending" ? (
						<Badge
							label="Release pending manager approval"
							tone="warning"
							dot
						/>
					) : null}
				</Card>
			</Appear>

			{mode === "info" ? (
				<>
					{isMine ? <TasksSection shiftId={shift.id} /> : null}

					<Appear index={2}>
						<Section
							title="Who’s working"
							caption={formatDayShort(shift.startsAt)}
						>
							{roster.isLoading ? (
								<Card>
									<Skeleton width="60%" />
									<Skeleton width="40%" />
								</Card>
							) : (roster.data?.roster.length ?? 0) === 0 ? (
								<Card>
									<AppText variant="subhead" tone="secondary">
										The published roster for this day isn’t available.
									</AppText>
								</Card>
							) : (
								<Card padded={false} style={{ gap: 0 }}>
									{(roster.data?.roster ?? []).map((row, index) => (
										<View key={row.versionShiftId}>
											{index > 0 ? <Divider inset={68} /> : null}
											<RosterRow row={row} />
										</View>
									))}
								</Card>
							)}
						</Section>
					</Appear>

					{canChange ? (
						<Appear index={3}>
							<Section title="Can’t make it?">
								<View style={{ flexDirection: "row", gap: spacing.sm }}>
									<Button
										label="Propose swap"
										icon="swap"
										variant="tinted"
										onPress={() => setMode("swap")}
										style={{ flex: 1 }}
									/>
									<Button
										label="Release"
										icon="release"
										variant="secondary"
										loading={release.isPending}
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
								<AppText
									variant="footnote"
									tone="secondary"
									style={{ paddingHorizontal: spacing.xs }}
								>
									You stay responsible for a released Shift until your Manager
									approves the hand-off.
								</AppText>
								{release.isError ? (
									<AppText variant="footnote" tone="danger" selectable>
										{friendlyMessage(release.error)}
									</AppText>
								) : null}
							</Section>
						</Appear>
					) : null}
				</>
			) : (
				<SwapProposer
					shift={shift}
					coworkers={coworkers}
					onDone={() => {
						tapSuccess();
						setMode("info");
						onClose();
					}}
					onCancel={() => setMode("info")}
				/>
			)}
		</Screen>
	);
}

function DetailRow({
	icon,
	label,
	dotColor,
}: {
	icon: IconName;
	label: string;
	dotColor?: string;
}) {
	const { theme } = useAppTheme();
	return (
		<View
			style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
		>
			<Icon name={icon} size={17} color={theme.textSecondary} />
			<AppText variant="body" style={{ flex: 1 }} selectable>
				{label}
			</AppText>
			{dotColor ? (
				<View
					style={{
						width: 10,
						height: 10,
						borderRadius: 5,
						backgroundColor: dotColor,
					}}
				/>
			) : null}
		</View>
	);
}

function TasksSection({ shiftId }: { shiftId: string }) {
	const tasks = useShiftTasks(shiftId);
	const completeTask = useCompleteShiftTask(shiftId);
	const list = tasks.data ?? [];
	if (!tasks.isLoading && list.length === 0 && !tasks.isError) return null;
	const done = list.filter((task) => task.completed).length;

	return (
		<Appear index={1}>
			<Section
				title="Tasks"
				action={
					list.length > 0 ? (
						<Badge
							label={
								done === list.length ? "All done" : `${done} of ${list.length}`
							}
							tone={done === list.length ? "success" : "neutral"}
						/>
					) : undefined
				}
			>
				<Card style={{ gap: 0, paddingVertical: spacing.xs }}>
					{tasks.isLoading ? (
						<View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
							<Skeleton width="70%" />
							<Skeleton width="50%" />
						</View>
					) : (
						list.map((task) => (
							<NativeCheckboxRow
								key={task.id}
								label={task.title}
								checked={task.completed}
								disabled={task.completed || completeTask.isPending}
								strikethrough
								onChange={() => {
									tapSuccess();
									completeTask.mutate(task.id);
								}}
							/>
						))
					)}
					{tasks.isError || completeTask.isError ? (
						<AppText variant="footnote" tone="danger" selectable>
							{friendlyMessage(tasks.error ?? completeTask.error)}
						</AppText>
					) : null}
				</Card>
			</Section>
		</Appear>
	);
}

function RosterRow({ row }: { row: DayRosterEntry }) {
	const { formatClockTime } = useDisplayPrefs();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.md,
				paddingHorizontal: spacing.lg,
				paddingVertical: spacing.md,
			}}
		>
			<Avatar
				name={row.workerName}
				size={40}
				color={positionColor(row.positionName)}
			/>
			<View style={{ flex: 1, gap: 1 }}>
				<AppText variant="callout" weight="600">
					{row.mine ? "You" : row.workerName}
				</AppText>
				<AppText variant="footnote" tone="secondary" tabular>
					{formatClockTime(row.startsAt, row.timezone)}–
					{formatClockTime(row.endsAt, row.timezone)} · {row.positionName}
				</AppText>
			</View>
			{row.mine ? <Badge label="You" tone="primary" /> : null}
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
	const { formatClockTime, formatShiftRange, formatDayShort } =
		useDisplayPrefs();
	const [selected, setSelected] = useState<DayRosterEntry | null>(null);
	const propose = useProposeSwap();

	return (
		<Appear>
			<Section
				title="Swap with a coworker"
				caption="Pick whose shift you’d take in exchange. They accept first, then your Manager approves."
			>
				{coworkers.length === 0 ? (
					<Callout
						tone="neutral"
						title="No one to swap with"
						body="No coworkers are scheduled this day. Try releasing the shift instead."
					/>
				) : (
					<Card
						padded={false}
						style={{ gap: 0 }}
						accessibilityLabel="Coworkers"
					>
						{coworkers.map((row, index) => {
							const isSelected =
								selected?.versionShiftId === row.versionShiftId;
							return (
								<View key={row.versionShiftId}>
									{index > 0 ? <Divider inset={68} /> : null}
									<PressableScale
										accessibilityRole="radio"
										accessibilityState={{ checked: isSelected }}
										accessibilityLabel={`${row.workerName}, ${formatClockTime(row.startsAt, row.timezone)} to ${formatClockTime(row.endsAt, row.timezone)}, ${row.positionName}`}
										haptic
										pressedScale={0.985}
										onPress={() => setSelected(row)}
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: spacing.md,
											paddingHorizontal: spacing.lg,
											paddingVertical: spacing.md,
											backgroundColor: isSelected
												? theme.primarySoft
												: undefined,
										}}
									>
										<Avatar
											name={row.workerName}
											color={positionColor(row.positionName)}
										/>
										<View style={{ flex: 1, gap: 1 }}>
											<AppText variant="callout" weight="600">
												{row.workerName}
											</AppText>
											<AppText variant="footnote" tone="secondary" tabular>
												{formatClockTime(row.startsAt, row.timezone)}–
												{formatClockTime(row.endsAt, row.timezone)} ·{" "}
												{row.positionName}
											</AppText>
										</View>
										<View
											style={{
												width: 24,
												height: 24,
												borderRadius: 12,
												borderWidth: isSelected ? 0 : 1.5,
												borderColor: theme.border,
												backgroundColor: isSelected ? theme.primary : undefined,
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											{isSelected ? (
												<Icon name="check" size={13} color={theme.onPrimary} />
											) : null}
										</View>
									</PressableScale>
								</View>
							);
						})}
					</Card>
				)}

				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.sm,
						padding: spacing.md,
						borderRadius: radius.md,
						borderCurve: "continuous",
						backgroundColor: theme.surfaceMuted,
					}}
				>
					<AppText variant="overline" tone="secondary">
						You give
					</AppText>
					<AppText variant="callout" weight="600" tabular style={{ flex: 1 }}>
						{formatDayShort(shift.startsAt)} ·{" "}
						{formatShiftRange(
							shift.startMinute,
							shift.endMinute,
							shift.overnight,
						)}
					</AppText>
				</View>

				<View style={{ flexDirection: "row", gap: spacing.sm }}>
					<Button
						label="Back"
						variant="secondary"
						onPress={onCancel}
						style={{ flex: 1 }}
					/>
					<Button
						label="Send request"
						icon="swap"
						loading={propose.isPending}
						disabled={!selected}
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
						style={{ flex: 1.4 }}
					/>
				</View>
				{propose.isError ? (
					<AppText variant="footnote" tone="danger" selectable>
						{friendlyMessage(propose.error)}
					</AppText>
				) : null}
			</Section>
		</Appear>
	);
}
