export type SettingsSection = {
	to:
		| "/dashboard/settings/workplace"
		| "/dashboard/settings/company"
		| "/dashboard/settings/locations"
		| "/dashboard/settings/positions"
		| "/dashboard/settings/schedule-policies"
		| "/dashboard/settings/policy-groups"
		| "/dashboard/settings/time-clock"
		| "/dashboard/settings/integrations"
		| "/dashboard/settings/patterns"
		| "/dashboard/settings/time-off-policies"
		| "/dashboard/settings/groups"
		| "/dashboard/settings/schedule-teams"
		| "/dashboard/settings/tags"
		| "/dashboard/settings/leave"
		| "/dashboard/settings/leave-policies"
		| "/dashboard/settings/time-blocks"
		| "/dashboard/settings/day-parts"
		| "/dashboard/settings/templates"
		| "/dashboard/settings/holidays"
		| "/dashboard/settings/preferences"
		| "/dashboard/settings/notifications"
		| "/dashboard/settings/subscription";
	label: string;
	description: string;
	/** Capability required to see the section. Omitted means everyone. */
	capability?: string;
};

export type SettingsGroup = {
	label: string;
	items: SettingsSection[];
};

export const settingsGroups: SettingsGroup[] = [
	{
		label: "Workplace",
		items: [
			{
				to: "/dashboard/settings/subscription",
				label: "Subscription",
				description: "Plan, billing, and invoices",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/workplace",
				label: "General",
				description: "Name, week, pay, and labor",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/company",
				label: "Company",
				description: "Messaging, announcements, and team visibility",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/locations",
				label: "Locations",
				description: "Sites, time zones, and kiosk",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/positions",
				label: "Positions",
				description: "Roles on the schedule",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/integrations",
				label: "Integrations",
				description: "API keys and webhooks",
				capability: "integrations.manage",
			},
		],
	},
	{
		label: "Policies",
		items: [
			{
				to: "/dashboard/settings/schedule-policies",
				label: "Schedule",
				description: "What workers see and how shifts are exchanged",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/policy-groups",
				label: "Approval policies",
				description: "Which requests need a Manager decision",
				capability: "policies.manage",
			},
			{
				to: "/dashboard/settings/time-clock",
				label: "Time clock",
				description: "Clock-in rules, geofence, and rounding",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/time-off-policies",
				label: "Time off",
				description: "Who can request time off and when caps reset",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/leave-policies",
				label: "Leave policies",
				description: "Accrual, carry-forward, and approval chains",
				capability: "settings.manage",
			},
		],
	},
	{
		label: "Team",
		items: [
			{
				to: "/dashboard/settings/groups",
				label: "Groups",
				description: "Team filters for scheduling",
				capability: "workers.manage",
			},
			{
				to: "/dashboard/settings/schedule-teams",
				label: "Schedule teams",
				description: "Parallel schedules per location",
				capability: "settings.manage",
			},
			{
				to: "/dashboard/settings/tags",
				label: "Tags",
				description: "Labels for shifts",
				capability: "schedule.manage",
			},
			{
				to: "/dashboard/settings/leave",
				label: "Leave types",
				description: "Vacation, sick, unpaid",
				capability: "settings.manage",
			},
		],
	},
	{
		label: "Schedule catalog",
		items: [
			{
				to: "/dashboard/settings/time-blocks",
				label: "Time blocks",
				description: "Named windows on the day",
				capability: "schedule.manage",
			},
			{
				to: "/dashboard/settings/day-parts",
				label: "Day parts",
				description: "Breakfast, lunch, dinner",
				capability: "schedule.manage",
			},
			{
				to: "/dashboard/settings/templates",
				label: "Shift templates",
				description: "Reusable shift shapes",
				capability: "schedule.manage",
			},
			{
				to: "/dashboard/settings/patterns",
				label: "Shift patterns",
				description: "Multi-week rotations to project onto drafts",
				capability: "schedule.manage",
			},
			{
				to: "/dashboard/settings/holidays",
				label: "Holidays",
				description: "Non-working days shown on the schedule",
				capability: "schedule.view",
			},
		],
	},
	{
		label: "You",
		items: [
			{
				to: "/dashboard/settings/preferences",
				label: "Preferences",
				description: "How names and times appear for you",
			},
			{
				to: "/dashboard/settings/notifications",
				label: "Notifications",
				description: "What you want to hear about",
			},
		],
	},
];

export const settingsSections: SettingsSection[] = settingsGroups.flatMap(
	(group) => group.items,
);

export function settingsSectionLabel(pathname: string): string | undefined {
	return settingsSections.find((section) => pathname.startsWith(section.to))
		?.label;
}
