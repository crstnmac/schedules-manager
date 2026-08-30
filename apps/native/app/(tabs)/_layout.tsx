import { useMaterialColors } from "@expo/ui/jetpack-compose";
import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useCurrentEmployment } from "@/lib/queries";
import { useColorScheme } from "@/lib/use-color-scheme";

export default function TabLayout() {
	const { colorScheme } = useColorScheme();
	const material = useMaterialColors({ colorScheme });
	const { isManager } = useCurrentEmployment();

	return (
		<NativeTabs
			backBehavior="history"
			backgroundColor={material.surfaceContainer}
			indicatorColor={material.secondaryContainer}
			rippleColor={material.primaryContainer}
			iconColor={{ default: material.onSurfaceVariant, selected: material.primary }}
			labelStyle={{ default: { color: material.onSurfaceVariant, fontSize: 11 }, selected: { color: material.primary, fontSize: 11, fontWeight: "600" } }}
			labelVisibilityMode="labeled"
			tabBarRespectsIMEInsets={false}
		>
			<NativeTabs.Trigger name="index">
				<NativeTabs.Trigger.Icon md={isManager ? "dashboard" : "calendar_month"} sf={isManager ? "square.grid.2x2" : "calendar"} />
				<NativeTabs.Trigger.Label>{isManager ? "Overview" : "Schedule"}</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="availability" hidden>
				<NativeTabs.Trigger.Icon md="schedule" sf="clock" />
				<NativeTabs.Trigger.Label>Availability</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="openshifts" hidden={isManager}>
				<NativeTabs.Trigger.Icon md="pan_tool" sf="hand.raised" />
				<NativeTabs.Trigger.Label>Open shifts</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="inbox">
				<NativeTabs.Trigger.Icon md="notifications" sf="bell" />
				<NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="manager-schedule" hidden={!isManager}>
				<NativeTabs.Trigger.Icon md="calendar_month" sf="calendar" />
				<NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="manager-team" hidden>
				<NativeTabs.Trigger.Icon md="groups" sf="person.2" />
				<NativeTabs.Trigger.Label>Team</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="manager-requests" hidden={!isManager}>
				<NativeTabs.Trigger.Icon md="task_alt" sf="checkmark.circle" />
				<NativeTabs.Trigger.Label>Requests</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="more">
				<NativeTabs.Trigger.Icon md="menu" sf="ellipsis" />
				<NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
