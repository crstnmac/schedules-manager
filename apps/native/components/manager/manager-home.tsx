import { useRouter } from "expo-router";
import { View } from "react-native";
import { Metric } from "@/components/manager/metric";
import { useRequestQueue } from "@/components/manager/requests/use-request-queue";
import {
	Appear,
	AppText,
	ListGroup,
	ListRow,
	Screen,
	Section,
} from "@/components/ui";
import { NextShiftHero } from "@/components/worker/next-shift-hero";
import {
	useClockIn,
	useClockOut,
	useCurrentEmployment,
	useManagerWorkers,
	useMySchedule,
} from "@/lib/queries";
import { spacing } from "@/theme";

/** Manager overview: operational truth, not marketing. */
export function ManagerHome() {
	const router = useRouter();
	const { employment, workplaceId } = useCurrentEmployment();
	const workers = useManagerWorkers(workplaceId);
	// Same source as the Requests tab and its badge, so the numbers agree.
	const requests = useRequestQueue(workplaceId);
	const schedule = useMySchedule(workplaceId);
	const clockIn = useClockIn();
	const clockOut = useClockOut();
	const nextShift = schedule.data?.nextShift ?? null;

	const active =
		workers.data?.workers.filter(
			(w) => w.status === "active" && w.kind === "worker",
		).length ?? 0;
	const pendingInvites =
		workers.data?.invitations.filter((i) => i.status === "pending").length ?? 0;
	const pendingRequests = requests.queue.length;

	return (
		<Screen
			onRefresh={() =>
				Promise.all([workers.refetch(), requests.refetch(), schedule.refetch()])
			}
		>
			<AppText
				variant="subhead"
				tone="secondary"
				style={{ paddingHorizontal: spacing.xs, marginTop: -spacing.xs }}
			>
				{employment?.workplace.name ?? "Workplace"}
			</AppText>

			{nextShift ? (
				<Appear>
					<NextShiftHero
						shift={nextShift}
						clockIn={clockIn}
						clockOut={clockOut}
					/>
				</Appear>
			) : null}

			<Appear index={1}>
				<Section title="Workplace">
					<View style={{ flexDirection: "row", gap: spacing.md }}>
						<Metric icon="people" value={active} label="Active workers" />
						<Metric
							icon="envelope"
							value={pendingInvites}
							label="Pending invites"
						/>
						<Metric
							icon="checkAll"
							value={pendingRequests}
							label="Open requests"
							tone={pendingRequests > 0 ? "warning" : "primary"}
						/>
					</View>
				</Section>
			</Appear>

			<Appear index={2}>
				<Section title="Next steps">
					<ListGroup>
						<ListRow
							icon="checkAll"
							iconTone={pendingRequests > 0 ? "warning" : "success"}
							title="Review requests"
							subtitle="Time off and agreed Shift Swaps, before you publish"
							onPress={() => router.push("/manager-requests")}
						/>
						<ListRow
							icon="calendar"
							title="Cover open shifts"
							subtitle="Open Shifts with no Worker still need coverage"
							onPress={() => router.push("/manager-schedule")}
						/>
						<ListRow
							icon="people"
							title="Team"
							subtitle="People, roles, and invitations"
							onPress={() => router.push("/team")}
						/>
					</ListGroup>
					<AppText
						variant="footnote"
						tone="secondary"
						style={{ paddingHorizontal: spacing.xs }}
					>
						Draft and publish the week on the web Schedule grid.
					</AppText>
				</Section>
			</Appear>
		</Screen>
	);
}
