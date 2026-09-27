import { useRouter } from "expo-router";
import { View } from "react-native";

import { AppText, Badge, Card, Icon } from "@/components/ui";
import { useDisplayPrefs } from "@/lib/display";
import { positionColor } from "@/lib/position-color";
import type { PublishedWeek } from "@/lib/queries";
import { formatDuration } from "@/lib/time-format";
import { radius, spacing, useAppTheme } from "@/theme";

export type WeekShift = PublishedWeek["shifts"][number];

/**
 * One Shift, scannable in a glance: times on the left, position (with its
 * category colour) and place on the right, and a worded status badge.
 * `leading="date"` swaps the time column for a calendar leaf, for lists that
 * aren't already grouped by day.
 */
export function ShiftCard({
	shift,
	locationName,
	leading = "time",
	onPress,
}: {
	shift: WeekShift;
	locationName?: string | null;
	leading?: "time" | "date";
	onPress?: () => void;
}) {
	const { theme } = useAppTheme();
	const { formatMinute, formatShiftRange } = useDisplayPrefs();
	const accent = positionColor(shift.positionName);
	const entry = shift.timeEntry;
	const past = new Date(shift.endsAt).getTime() < Date.now();
	const planned = Boolean(shift.planned);
	const dimmed = planned || (past && !entry);
	const date = new Date(`${shift.date}T12:00:00`);

	const status = shiftStatus(shift, past);

	const body = (
		<View
			style={{ flexDirection: "row", alignItems: "stretch", gap: spacing.md }}
		>
			{leading === "time" ? (
				<View style={{ width: 70, justifyContent: "center", gap: 2 }}>
					<AppText variant="callout" weight="600" tabular numberOfLines={1}>
						{formatMinute(shift.startMinute)}
					</AppText>
					<AppText
						variant="footnote"
						tone="secondary"
						tabular
						numberOfLines={1}
					>
						{formatMinute(shift.endMinute)}
						{shift.overnight ? " +1" : ""}
					</AppText>
				</View>
			) : (
				<View
					style={{
						width: 52,
						paddingVertical: spacing.xs + 2,
						borderRadius: radius.md,
						borderCurve: "continuous",
						backgroundColor: theme.surfaceMuted,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<AppText variant="caption" weight="600" tone="secondary">
						{date
							.toLocaleDateString(undefined, { weekday: "short" })
							.toUpperCase()}
					</AppText>
					<AppText variant="title3" weight="700" tabular>
						{date.getDate()}
					</AppText>
				</View>
			)}

			<View
				style={{
					width: 3,
					borderRadius: 2,
					backgroundColor: accent,
					opacity: planned ? 0.45 : 1,
				}}
			/>

			<View style={{ flex: 1, gap: 3, justifyContent: "center" }}>
				<AppText variant="headline" numberOfLines={1}>
					{shift.positionName}
				</AppText>
				{leading === "date" ? (
					<AppText
						variant="footnote"
						tone="secondary"
						tabular
						numberOfLines={1}
					>
						{formatShiftRange(
							shift.startMinute,
							shift.endMinute,
							shift.overnight,
						)}
					</AppText>
				) : null}
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.xs,
					}}
				>
					<Icon
						name={shift.isMine ? "location" : "person"}
						size={12}
						color={theme.textTertiary}
					/>
					<AppText
						variant="footnote"
						tone="secondary"
						numberOfLines={1}
						style={{ flexShrink: 1 }}
					>
						{shift.isMine
							? (locationName ?? "Location")
							: `${shift.workerName ?? "Coworker"}${locationName ? ` · ${locationName}` : ""}`}
					</AppText>
				</View>
				{shift.note ? (
					<AppText variant="footnote" tone="tertiary" numberOfLines={2}>
						{shift.note}
					</AppText>
				) : null}
				{status ? (
					<View style={{ marginTop: 3 }}>
						<Badge {...status} />
					</View>
				) : null}
			</View>

			{onPress ? (
				<View style={{ justifyContent: "center" }}>
					<Icon name="chevronRight" size={13} color={theme.textTertiary} />
				</View>
			) : null}
		</View>
	);

	const a11yLabel = [
		planned ? "Planned, not yet published." : null,
		shift.positionName,
		formatShiftRange(shift.startMinute, shift.endMinute, shift.overnight),
		shift.isMine ? locationName : shift.workerName,
		status?.label,
	]
		.filter(Boolean)
		.join(", ");

	return (
		<View style={{ opacity: dimmed ? 0.6 : 1 }}>
			<Card
				onPress={onPress}
				accessibilityLabel={a11yLabel}
				accessibilityHint={onPress ? "Opens shift details" : undefined}
				style={{ paddingVertical: spacing.md + 2 }}
			>
				{body}
			</Card>
		</View>
	);
}

function shiftStatus(
	shift: WeekShift,
	past: boolean,
): {
	label: string;
	tone: "neutral" | "primary" | "success" | "warning";
	dot?: boolean;
} | null {
	const entry = shift.timeEntry;
	if (shift.planned) return { label: "Planned · may change", tone: "neutral" };
	if (entry && entry.clockedOutAt === null)
		return { label: "On the clock", tone: "primary", dot: true };
	if (entry?.clockedOutAt)
		return {
			label: `Worked ${formatDuration(
				new Date(entry.clockedOutAt).getTime() -
					new Date(entry.clockedInAt).getTime(),
			)}`,
			tone: "success",
		};
	if (shift.releaseStatus === "pending")
		return { label: "Release pending", tone: "warning" };
	if (past && shift.isMine) return { label: "No punch", tone: "neutral" };
	return null;
}

/** Day heading used above a group of ShiftCards. */
export function DayHeading({
	dateKey,
	isToday,
	trailing,
}: {
	dateKey: string;
	isToday: boolean;
	trailing?: string;
}) {
	const date = new Date(`${dateKey}T12:00:00`);
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: spacing.sm,
				paddingHorizontal: spacing.xs,
				paddingTop: spacing.xs,
			}}
		>
			<AppText
				variant="overline"
				tone={isToday ? "tint" : "secondary"}
				accessibilityRole="header"
			>
				{isToday
					? "Today"
					: date.toLocaleDateString(undefined, { weekday: "long" })}
			</AppText>
			<AppText variant="footnote" tone="tertiary">
				{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
			</AppText>
			<View style={{ flex: 1 }} />
			{trailing ? (
				<AppText variant="footnote" tone="tertiary" tabular>
					{trailing}
				</AppText>
			) : null}
		</View>
	);
}

/** Push the shift detail route for a Shift (planned shifts have no detail). */
export function useOpenShift() {
	const router = useRouter();
	return (shift: WeekShift, locationName?: string | null) =>
		router.push({
			pathname: "/shift-detail",
			params: {
				shift: JSON.stringify(shift),
				locationName: locationName ?? "",
			},
		});
}
