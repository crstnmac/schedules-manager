export type SettingsSection = {
	to:
		| "/dashboard/settings/workplace"
		| "/dashboard/settings/locations"
		| "/dashboard/settings/positions"
		| "/dashboard/settings/groups"
		| "/dashboard/settings/tags"
		| "/dashboard/settings/leave"
		| "/dashboard/settings/time-blocks"
		| "/dashboard/settings/day-parts"
		| "/dashboard/settings/templates";
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
				description: "Name, pay period, and clock rules",
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
		label: "Team",
		items: [
			{
				to: "/dashboard/settings/groups",
				label: "Groups",
				description: "Team filters for scheduling",
			},
			{
				to: "/dashboard/settings/tags",
				label: "Shift tags",
				description: "Labels for shifts",
			},
			{
				to: "/dashboard/settings/leave",
				label: "Leave types",
				description: "Reasons for time off",
			},
		],
	},
	{
		label: "Schedule",
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
				label: "Shift templates",
				description: "Reusable shift shapes",
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
