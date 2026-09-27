import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

import { AppText, Button, Icon, PressableScale } from "@/components/ui";
import { useDisplayPrefs } from "@/lib/display";
import { friendlyMessage } from "@/lib/friendly-message";
import { tapMedium, tapWarning } from "@/lib/haptics";
import type {
	MyScheduleResponse,
	useClockIn,
	useClockOut,
} from "@/lib/queries";
import {
	formatDuration,
	formatTimer,
	relativeDayLabel,
	startsIn,
} from "@/lib/time-format";
import { radius, spacing, useAppTheme } from "@/theme";

export type NextShift = NonNullable<MyScheduleResponse["nextShift"]>;

const CLOCK_IN_EARLY_MS = 15 * 60 * 1000;
const ON_BLUE = "#FFFFFF";
const ON_BLUE_MUTED = "rgba(255, 255, 255, 0.78)";

/**
 * The worker's anchor block (DESIGN.md "Next-shift hero"): when and where the
 * next Shift is, and the time clock for it. Always first on the home screen.
 */
export function NextShiftHero({
	shift,
	locationName,
	clockIn,
	clockOut,
	onOpen,
}: {
	shift: NextShift;
	locationName?: string | null;
	clockIn: ReturnType<typeof useClockIn>;
	clockOut: ReturnType<typeof useClockOut>;
	onOpen?: () => void;
}) {
	const { theme } = useAppTheme();
	const { formatShiftRange } = useDisplayPrefs();
	const [nowMs, setNowMs] = useState(() => Date.now());
	const entry = shift.timeEntry;
	const onClock = entry !== null && entry.clockedOutAt === null;

	// Tick every second on the clock (live timer), otherwise every 30s so the
	// "starts in" copy and the clock-in window stay current.
	useEffect(() => {
		const timer = setInterval(
			() => setNowMs(Date.now()),
			onClock ? 1000 : 30_000,
		);
		return () => clearInterval(timer);
	}, [onClock]);

	const countdown = startsIn(shift.startsAt, nowMs);
	const dayLabel = relativeDayLabel(shift.date);

	return (
		<View
			style={{
				borderRadius: radius.xl,
				borderCurve: "continuous",
				experimental_backgroundImage: theme.heroGradient,
				backgroundColor: theme.primary,
				boxShadow: theme.heroShadow,
				padding: spacing.xl,
				gap: spacing.lg,
			}}
		>
			<PressableScale
				disabled={!onOpen}
				onPress={onOpen}
				pressedScale={0.985}
				accessibilityRole={onOpen ? "button" : undefined}
				accessibilityHint={onOpen ? "Opens shift details" : undefined}
				style={{ gap: spacing.sm }}
			>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.sm,
					}}
				>
					<HeroPill>
						{onClock ? <LiveDot /> : null}
						<AppText variant="caption" weight="700" color={ON_BLUE}>
							{onClock ? "ON THE CLOCK" : dayLabel.toUpperCase()}
						</AppText>
					</HeroPill>
					{!onClock && countdown ? (
						<AppText variant="footnote" weight="500" color={ON_BLUE_MUTED}>
							Starts {countdown}
						</AppText>
					) : null}
					<View style={{ flex: 1 }} />
					{onOpen ? (
						<Icon name="chevronRight" size={14} color={ON_BLUE_MUTED} />
					) : null}
				</View>

				<AppText
					variant="display"
					color={ON_BLUE}
					numberOfLines={1}
					adjustsFontSizeToFit
					minimumFontScale={0.7}
				>
					{formatShiftRange(
						shift.startMinute,
						shift.endMinute,
						shift.overnight,
					)}
				</AppText>

				<View
					style={{
						flexDirection: "row",
						flexWrap: "wrap",
						columnGap: spacing.lg,
						rowGap: spacing.xs,
					}}
				>
					<HeroMeta icon="briefcase" label={shift.positionName} />
					{locationName ? (
						<HeroMeta icon="location" label={locationName} />
					) : null}
				</View>
			</PressableScale>

			<View
				style={{ height: 1, backgroundColor: "rgba(255, 255, 255, 0.18)" }}
			/>

			<TimeClock
				shift={shift}
				nowMs={nowMs}
				clockIn={clockIn}
				clockOut={clockOut}
			/>
		</View>
	);
}

function HeroPill({ children }: { children: React.ReactNode }) {
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 6,
				paddingHorizontal: spacing.sm + 2,
				paddingVertical: 4,
				borderRadius: radius.full,
				backgroundColor: "rgba(255, 255, 255, 0.18)",
			}}
		>
			{children}
		</View>
	);
}

function HeroMeta({
	icon,
	label,
}: {
	icon: "briefcase" | "location";
	label: string;
}) {
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 6,
				maxWidth: "100%",
			}}
		>
			<Icon name={icon} size={14} color={ON_BLUE_MUTED} />
			<AppText variant="subhead" weight="500" color={ON_BLUE} numberOfLines={1}>
				{label}
			</AppText>
		</View>
	);
}

/** Breathing dot that signals a running timer. */
function LiveDot() {
	const reduceMotion = useReducedMotion();
	const pulse = useSharedValue(1);
	useEffect(() => {
		if (reduceMotion) return;
		pulse.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
	}, [pulse, reduceMotion]);
	const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
	return (
		<Animated.View
			style={[
				{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
				style,
			]}
		/>
	);
}

function TimeClock({
	shift,
	nowMs,
	clockIn,
	clockOut,
}: {
	shift: NextShift;
	nowMs: number;
	clockIn: ReturnType<typeof useClockIn>;
	clockOut: ReturnType<typeof useClockOut>;
}) {
	const { formatClockTime } = useDisplayPrefs();
	const router = useRouter();
	const entry = shift.timeEntry;
	const onClock = entry !== null && entry.clockedOutAt === null;
	const worked = entry !== null && entry.clockedOutAt !== null;
	const startsAt = new Date(shift.startsAt).getTime();
	const endsAt = new Date(shift.endsAt).getTime();
	const canStart =
		!shift.planned &&
		entry === null &&
		nowMs >= startsAt - CLOCK_IN_EARLY_MS &&
		nowMs <= endsAt;

	function confirmClockOut() {
		if (!entry) return;
		const elapsed = formatDuration(
			Date.now() - new Date(entry.clockedInAt).getTime(),
		);
		Alert.alert(
			"Finish your shift?",
			`You worked ${elapsed}. This records your Time Entry as it is.`,
			[
				{ text: "Keep working", style: "cancel" },
				{
					text: "Clock out",
					style: "destructive",
					onPress: () => {
						tapWarning();
						clockOut.mutate(shift.id);
					},
				},
			],
		);
	}

	const error = clockIn.error ?? clockOut.error;

	return (
		<View style={{ gap: spacing.md }}>
			{onClock && entry ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "flex-end",
						justifyContent: "space-between",
					}}
				>
					<View style={{ gap: 2 }}>
						<AppText variant="footnote" color={ON_BLUE_MUTED}>
							Clocked in at {formatClockTime(entry.clockedInAt)}
						</AppText>
						<AppText
							variant="title1"
							color={ON_BLUE}
							tabular
							accessibilityLiveRegion="polite"
							accessibilityLabel={`Time on the clock ${formatDuration(nowMs - new Date(entry.clockedInAt).getTime())}`}
						>
							{formatTimer(nowMs - new Date(entry.clockedInAt).getTime())}
						</AppText>
					</View>
				</View>
			) : null}

			{worked && entry ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.sm,
					}}
				>
					<Icon name="checkCircle" size={18} color="#4ADE80" />
					<AppText
						variant="subhead"
						weight="500"
						color={ON_BLUE}
						style={{ flex: 1 }}
					>
						Worked{" "}
						{formatDuration(
							new Date(entry.clockedOutAt ?? "").getTime() -
								new Date(entry.clockedInAt).getTime(),
						)}{" "}
						· {formatClockTime(entry.clockedInAt)}–
						{formatClockTime(entry.clockedOutAt ?? undefined)}
					</AppText>
				</View>
			) : null}

			{!onClock && !worked && !canStart ? (
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: spacing.sm,
					}}
				>
					<Icon name="clock" size={16} color={ON_BLUE_MUTED} />
					<AppText variant="footnote" color={ON_BLUE_MUTED} style={{ flex: 1 }}>
						{shift.planned
							? "Planned — not published yet. Clock-in opens once it’s published."
							: nowMs > endsAt
								? "This shift has ended."
								: `Clock-in opens at ${formatClockTime(
										new Date(startsAt - CLOCK_IN_EARLY_MS).toISOString(),
									)}, 15 minutes before your shift.`}
					</AppText>
				</View>
			) : null}

			<View style={{ flexDirection: "row", gap: spacing.sm }}>
				{canStart ? (
					<Button
						label="Clock in"
						icon="play"
						size="lg"
						variant="inverse"
						loading={clockIn.isPending}
						onPress={() => {
							tapMedium();
							clockIn.mutate(shift.id);
						}}
						style={{ flex: 1 }}
					/>
				) : null}
				{onClock ? (
					<Button
						label="Clock out"
						icon="stop"
						size="lg"
						variant="inverse"
						loading={clockOut.isPending}
						onPress={confirmClockOut}
						style={{ flex: 1 }}
					/>
				) : null}
				<Button
					label="Timecard"
					icon="stopwatch"
					size={canStart || onClock ? "lg" : "md"}
					variant="inverseSubtle"
					onPress={() => router.push("/timecard")}
					style={canStart || onClock ? undefined : { flex: 1 }}
				/>
			</View>

			{error ? (
				<AppText
					variant="footnote"
					color={ON_BLUE}
					accessibilityRole="alert"
					selectable
				>
					{friendlyMessage(error)}
				</AppText>
			) : null}
		</View>
	);
}
