import { View } from "react-native";

import {
	Appear,
	AppText,
	Badge,
	Button,
	Card,
	CardListSkeleton,
	EmptyState,
	ErrorState,
	Icon,
	Screen,
} from "@/components/ui";
import { confirmAction } from "@/lib/confirm-action";
import { useDisplayPrefs } from "@/lib/display";
import { friendlyMessage } from "@/lib/friendly-message";
import { tapSuccess } from "@/lib/haptics";
import { positionColor } from "@/lib/position-color";
import {
	type OpenShiftsResponse,
	useCurrentEmployment,
	useOpenShifts,
	useRequestPickup,
} from "@/lib/queries";
import {
	formatHoursShort,
	relativeDayLabel,
	shiftHours,
} from "@/lib/time-format";
import { radius, spacing, useAppTheme } from "@/theme";

type OpenShift = OpenShiftsResponse["openShifts"][number];

export default function OpenShiftsScreen() {
	const { workplaceId } = useCurrentEmployment();
	const openShifts = useOpenShifts(workplaceId);
	const items = openShifts.data?.openShifts ?? [];

	return (
		<Screen onRefresh={() => openShifts.refetch()}>
			<AppText
				variant="subhead"
				tone="secondary"
				style={{ paddingHorizontal: spacing.xs, marginTop: -spacing.xs }}
			>
				Pick up extra hours. Your Manager reviews every request.
			</AppText>

			{openShifts.isLoading ? <CardListSkeleton /> : null}
			{openShifts.isError ? (
				<ErrorState
					error={openShifts.error}
					onRetry={() => void openShifts.refetch()}
				/>
			) : null}

			{!openShifts.isLoading && !openShifts.isError && items.length === 0 ? (
				<EmptyState
					icon="handRaised"
					tone="warning"
					title="No open shifts right now"
					body="When a Manager posts an Open Shift or approves someone’s release, it shows up here."
				/>
			) : null}

			<View style={{ gap: spacing.md }}>
				{items.map((shift, index) => (
					<Appear key={shift.id} index={index}>
						<OpenShiftCard shift={shift} />
					</Appear>
				))}
			</View>
		</Screen>
	);
}

function OpenShiftCard({ shift }: { shift: OpenShift }) {
	const { theme } = useAppTheme();
	const { formatShiftRange } = useDisplayPrefs();
	const requestPickup = useRequestPickup();
	const date = new Date(`${shift.date}T12:00:00`);
	const range = formatShiftRange(
		shift.startMinute,
		shift.endMinute,
		shift.overnight,
	);

	return (
		<Card>
			<View style={{ flexDirection: "row", gap: spacing.md }}>
				<View
					style={{
						width: 52,
						paddingVertical: spacing.sm,
						borderRadius: radius.md,
						borderCurve: "continuous",
						backgroundColor: theme.warningSoft,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<AppText variant="caption" weight="700" color={theme.warning}>
						{date
							.toLocaleDateString(undefined, { weekday: "short" })
							.toUpperCase()}
					</AppText>
					<AppText variant="title2" tabular color={theme.warning}>
						{date.getDate()}
					</AppText>
				</View>
				<View style={{ flex: 1, gap: 3 }}>
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: spacing.sm,
						}}
					>
						<AppText variant="overline" tone="secondary" style={{ flex: 1 }}>
							{relativeDayLabel(shift.date)}
						</AppText>
						<AppText variant="footnote" tone="tertiary" tabular>
							{formatHoursShort(
								shiftHours(shift.startMinute, shift.endMinute, shift.overnight),
							)}
						</AppText>
					</View>
					<AppText variant="headline" tabular>
						{range}
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
								backgroundColor: positionColor(shift.positionName),
							}}
						/>
						<AppText
							variant="footnote"
							tone="secondary"
							numberOfLines={1}
							style={{ flexShrink: 1 }}
						>
							{shift.positionName}
						</AppText>
						<Icon name="location" size={12} color={theme.textTertiary} />
						<AppText
							variant="footnote"
							tone="secondary"
							numberOfLines={1}
							style={{ flexShrink: 1 }}
						>
							{shift.locationName}
						</AppText>
					</View>
				</View>
			</View>

			{shift.myPickupStatus === "pending" ? (
				<Badge
					label="Requested · waiting for your Manager"
					tone="primary"
					dot
				/>
			) : shift.myPickupStatus === "approved" ? (
				<Badge
					label="Approved · this shift is yours"
					tone="success"
					icon="check"
				/>
			) : shift.myPickupStatus === "declined" ? (
				<Badge label="Pickup declined" tone="danger" />
			) : (
				<Button
					label="Request to pick up"
					icon="handRaised"
					loading={requestPickup.isPending}
					onPress={() =>
						confirmAction({
							title: "Pick up this shift?",
							message: `${relativeDayLabel(shift.date)}, ${range} · ${shift.positionName}. Your Manager will review the request.`,
							confirmLabel: "Request pickup",
							onConfirm: () =>
								requestPickup.mutate(shift.id, { onSuccess: tapSuccess }),
						})
					}
				/>
			)}
			{requestPickup.isError ? (
				<AppText variant="footnote" tone="danger" selectable>
					{friendlyMessage(requestPickup.error)}
				</AppText>
			) : null}
		</Card>
	);
}
