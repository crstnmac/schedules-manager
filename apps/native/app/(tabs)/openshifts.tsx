import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

import {
	AppScreen,
	Badge,
	Card,
	Hint,
	PageHeader,
	PrimaryButton,
	useAppTheme,
} from "@/components/ui";
import { useDisplayPrefs } from "@/lib/display";
import { useMe, useOpenShifts, useRequestPickup } from "@/lib/queries";
import { useSelectedWorkplaceId } from "@/lib/workplace-store";

export default function OpenShiftsScreen() {
	const { theme } = useAppTheme();
	const { formatShiftRange } = useDisplayPrefs();
	const me = useMe();
	const { selected } = useSelectedWorkplaceId();
	const workplaceId =
		me.data?.employments.find((e) => e.workplace.id === selected)?.workplace
			.id ?? me.data?.employments[0]?.workplace.id;
	const openShifts = useOpenShifts(workplaceId);
	const requestPickup = useRequestPickup();

	return (
		<AppScreen>
			<PageHeader
				title="Open Shifts"
				description="A Shift that needs a Worker. Request a Shift Pickup — your Manager approves it."
			/>

			{openShifts.isLoading ? (
				<ActivityIndicator color={theme.primary} />
			) : null}

			{!openShifts.isLoading &&
			(openShifts.data?.openShifts.length ?? 0) === 0 ? (
				<Card>
					<Text style={[s.title, { color: theme.text }]}>No Open Shifts</Text>
					<Text style={[s.body, { color: theme.muted }]}>
						When a Manager creates an Open Shift or a Worker’s Shift Release is
						approved, it appears here.
					</Text>
				</Card>
			) : null}

			{(openShifts.data?.openShifts ?? []).map((sh) => (
				<Card key={sh.id}>
					<View style={s.headerRow}>
						<Text style={[s.shiftTitle, { color: theme.text }]}>
							{formatDay(sh.startsAt)} ·{" "}
							{formatShiftRange(sh.startMinute, sh.endMinute, sh.overnight)}
						</Text>
						<Badge label="Open Shift" variant="amber" />
					</View>
					<Text style={[s.meta, { color: theme.muted }]}>
						{sh.positionName} · {sh.locationName}
					</Text>

					{sh.myPickupStatus === "pending" ? (
						<Badge
							label="Pickup requested — waiting for Manager"
							variant="outline"
						/>
					) : sh.myPickupStatus === "approved" ? (
						<Badge
							label="Pickup approved — this Shift is yours"
							variant="success"
						/>
					) : sh.myPickupStatus === "declined" ? (
						<Badge label="Pickup declined" variant="danger" />
					) : (
						<PrimaryButton
							label="Request pickup"
							disabled={requestPickup.isPending}
							onPress={() => requestPickup.mutate(sh.id)}
						/>
					)}
					{requestPickup.isError ? (
						<Text style={[s.error, { color: theme.notification }]}>
							{(requestPickup.error as Error).message}
						</Text>
					) : null}
					<Hint>
						Eligible Workers only. Your Manager reviews every Shift Pickup.
					</Hint>
				</Card>
			))}
		</AppScreen>
	);
}

function formatDay(iso: string) {
	return new Date(iso).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

const s = StyleSheet.create({
	title: { fontSize: 17, fontWeight: "700" },
	body: { fontSize: 14, lineHeight: 21 },
	meta: { fontSize: 13, lineHeight: 19 },
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 8,
	},
	shiftTitle: {
		fontSize: 16,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
		flex: 1,
	},
	error: { fontSize: 13 },
});
