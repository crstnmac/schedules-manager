import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useRequestQueue } from "@/components/manager/requests/use-request-queue";
import { usePushRegistration, usePushResponseNavigation } from "@/lib/push";
import { useCurrentEmployment, useNotifications } from "@/lib/queries";
import { useAppTheme } from "@/theme";

export default function TabLayout() {
	const { theme } = useAppTheme();
	const { isManager, canReview, employment } = useCurrentEmployment();
	const inbox = useNotifications(employment?.workplace.id);
	const unreadCount = isManager ? 0 : (inbox.data?.unreadCount ?? 0);
	// Shares query cache with the Requests screen, so the badge is free once loaded.
	const requestCount = useRequestQueue(
		canReview ? employment?.workplace.id : undefined,
	).queue.length;
	usePushRegistration();
	usePushResponseNavigation();

	// iOS keeps the system tab bar material (liquid glass on iOS 26); only the
	// tint is branded. Android gets a surface bar with a soft brand indicator.
	const androidChrome =
		process.env.EXPO_OS === "android"
			? {
					backgroundColor: theme.surface,
					indicatorColor: theme.primarySoft,
					rippleColor: theme.primarySoft,
					iconColor: { default: theme.textSecondary, selected: theme.tint },
					labelStyle: {
						default: { color: theme.textSecondary, fontSize: 12 },
						selected: {
							color: theme.tint,
							fontSize: 12,
							fontWeight: "600" as const,
						},
					},
					labelVisibilityMode: "labeled" as const,
				}
			: {};

	return (
		<NativeTabs
			backBehavior="history"
			tintColor={theme.tint}
			tabBarRespectsIMEInsets={false}
			{...androidChrome}
		>
			<NativeTabs.Trigger name="(home)">
				<NativeTabs.Trigger.Icon
					md={isManager ? "dashboard" : "today"}
					sf={
						isManager
							? { default: "square.grid.2x2", selected: "square.grid.2x2.fill" }
							: { default: "sun.max", selected: "sun.max.fill" }
					}
				/>
				<NativeTabs.Trigger.Label>
					{isManager ? "Overview" : "Today"}
				</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="myschedules" hidden={isManager}>
				<NativeTabs.Trigger.Icon md="calendar_month" sf="calendar" />
				<NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="openshifts" hidden={isManager}>
				<NativeTabs.Trigger.Icon
					md="work_outline"
					sf={{ default: "hand.raised", selected: "hand.raised.fill" }}
				/>
				<NativeTabs.Trigger.Label>Open Shifts</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="manager-schedule" hidden={!isManager}>
				<NativeTabs.Trigger.Icon md="calendar_month" sf="calendar" />
				<NativeTabs.Trigger.Label>Schedule</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="manager-requests" hidden={!canReview}>
				<NativeTabs.Trigger.Icon
					md="task_alt"
					sf={{
						default: "checkmark.circle",
						selected: "checkmark.circle.fill",
					}}
				/>
				{requestCount > 0 ? (
					<NativeTabs.Trigger.Badge>
						{requestCount > 20 ? "20+" : String(requestCount)}
					</NativeTabs.Trigger.Badge>
				) : null}
				<NativeTabs.Trigger.Label>Requests</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="inbox">
				<NativeTabs.Trigger.Icon
					md="notifications"
					sf={{ default: "bell", selected: "bell.fill" }}
				/>
				{unreadCount > 0 ? (
					<NativeTabs.Trigger.Badge>
						{unreadCount > 20 ? "20+" : String(unreadCount)}
					</NativeTabs.Trigger.Badge>
				) : null}
				<NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="more">
				<NativeTabs.Trigger.Icon
					md="menu"
					sf={{ default: "ellipsis.circle", selected: "ellipsis.circle.fill" }}
				/>
				<NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
