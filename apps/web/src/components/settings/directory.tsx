import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { SettingsSection } from "@/components/settings/page";

const DIRECTORY_LINKS = [
	{
		to: "/dashboard/workers" as const,
		label: "Workers",
		description: "Invite people and manage employments",
	},
	{
		to: "/dashboard/settings/locations" as const,
		label: "Locations",
		description: "Sites, time zones, and kiosk",
	},
	{
		to: "/dashboard/settings/positions" as const,
		label: "Positions",
		description: "Roles on the schedule",
	},
	{
		to: "/dashboard/settings/groups" as const,
		label: "Groups",
		description: "Team filters for scheduling",
	},
	{
		to: "/dashboard/settings/tags" as const,
		label: "Tags",
		description: "Labels you can apply to shifts",
	},
];

export function DirectoryCard() {
	return (
		<SettingsSection
			title="Directory"
			description="People, sites, and labels used when you build a week."
		>
			<ul className="-mx-(--card-spacing) divide-y">
				{DIRECTORY_LINKS.map((item) => (
					<li key={item.to}>
						<Link
							to={item.to}
							className="flex items-center justify-between gap-3 px-(--card-spacing) py-2.5 text-inherit no-underline hover:bg-muted/50"
						>
							<span className="min-w-0">
								<span className="block font-medium text-sm">{item.label}</span>
								<span className="block text-muted-foreground text-xs">
									{item.description}
								</span>
							</span>
							<ChevronRightIcon
								aria-hidden="true"
								className="size-4 shrink-0 text-muted-foreground"
							/>
						</Link>
					</li>
				))}
			</ul>
		</SettingsSection>
	);
}
