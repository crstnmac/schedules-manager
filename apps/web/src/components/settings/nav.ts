export type SettingsSection = {
	to:
		| "/dashboard/settings/workplace"
		| "/dashboard/settings/company"
		| "/dashboard/settings/locations"
		| "/dashboard/settings/positions"
		| "/dashboard/settings/schedule-policies"
		| "/dashboard/settings/time-clock"
		| "/dashboard/settings/time-off-policies"
		| "/dashboard/settings/groups"
		| "/dashboard/settings/tags"
		| "/dashboard/settings/leave"
		| "/dashboard/settings/time-blocks"
		| "/dashboard/settings/day-parts"
		| "/dashboard/settings/templates"
		| "/dashboard/settings/preferences"
		| "/dashboard/settings/notifications";
	label: string;
	description: string;
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
				to: "/dashboard/settings/workplace",
				label: "General",
				description: "Name, week, pay, and labor",
			},
			{
				to: "/dashboard/settings/company",
				label: "Company",
				description: "Messaging, announcements, and team visibility",
			},
			{
				to: "/dashboard/settings/locations",
				label: "Locations",
				description: "Sites, time zones, and kiosk",
			},
			{
				to: "/dashboard/settings/positions",
				label: "Positions",
				description: "Roles on the schedule",
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
			},
			{
				to: "/dashboard/settings/time-clock",
				label: "Time clock",
				description: "Clock-in rules, geofence, and rounding",
			},
			{
				to: "/dashboard/settings/time-off-policies",
				label: "Time off",
				description: "Who can request time off and when caps reset",
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
			},
			{
				to: "/dashboard/settings/tags",
				label: "Tags",
				description: "Labels for shifts",
			},
			{
				to: "/dashboard/settings/leave",
				label: "Leave types",
				description: "Vacation, sick, unpaid",
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
			},
			{
				to: "/dashboard/settings/day-parts",
				label: "Day parts",
				description: "Breakfast, lunch, dinner",
			},
			{
				to: "/dashboard/settings/templates",
				label: "Templates",
				description: "Reusable shift shapes",
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
