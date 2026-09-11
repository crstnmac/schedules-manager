import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTabTheme } from "@/components/tab-theme";

import { usePushRegistration, usePushResponseNavigation } from "@/lib/push";
import { useCurrentEmployment, useNotifications } from "@/lib/queries";

export default function TabLayout() {
	const material = useTabTheme();
	const { isManager, canReview, employment } = useCurrentEmployment();
	const inbox = useNotifications(employment?.workplace.id);
	const unreadCount = isManager ? 0 : (inbox.data?.unreadCount ?? 0);
	usePushRegistration();
	usePushResponseNavigation();

	return (
		<NativeTabs
			backBehavior="history"
			backgroundColor={material.surfaceContainer}
			indicatorColor={material.secondaryContainer}
			rippleColor={material.primaryContainer}
			iconColor={{
				default: material.onSurfaceVariant,
				selected: material.primary,
			}}
			labelStyle={{
				default: { color: material.onSurfaceVariant, fontSize: 11 },
				selected: { color: material.primary, fontSize: 11, fontWeight: "600" },
			}}
			labelVisibilityMode="labeled"
			tabBarRespectsIMEInsets={false}
		>
			<NativeTabs.Trigger name="index">
				<NativeTabs.Trigger.Icon
					md={isManager ? "dashboard" : "calendar_month"}
					sf={isManager ? "square.grid.2x2" : "calendar"}
				/>
				<NativeTabs.Trigger.Label>
					{isManager ? "Overview" : "Schedule"}
				</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="myschedules" hidden={isManager}>
				<NativeTabs.Trigger.Icon md="date_range" sf="calendar.badge.clock" />
				<NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="availability" hidden>
				<NativeTabs.Trigger.Icon md="schedule" sf="clock" />
				<NativeTabs.Trigger.Label>Availability</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="openshifts" hidden={isManager}>
				<NativeTabs.Trigger.Icon md="work_outline" sf="calendar.badge.plus" />
				<NativeTabs.Trigger.Label>Open shifts</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="inbox">
				<NativeTabs.Trigger.Icon md="notifications" sf="bell" />
				{unreadCount > 0 ? (
					<NativeTabs.Trigger.Badge>
						{unreadCount > 20 ? "20+" : String(unreadCount)}
					</NativeTabs.Trigger.Badge>
				) : null}
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

			<NativeTabs.Trigger name="manager-requests" hidden={!canReview}>
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
