import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { BellIcon, CalendarDaysIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/logo-mark";

const highlights = [
	{
		icon: CalendarDaysIcon,
		title: "Versioned weekly schedules",
		description:
			"Publish immutable schedule snapshots and notify workers when plans change.",
	},
	{
		icon: UsersIcon,
		title: "Coverage you can scan",
		description:
			"See staffing gaps, open shifts, and handoffs across every location.",
	},
	{
		icon: BellIcon,
		title: "Clear worker responses",
		description:
			"Track acknowledgements, time-off requests, and pickup activity in one place.",
	},
] as const;

export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="min-h-svh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
		>
			<section
				aria-hidden="true"
				className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex"
			>
				<div className="flex flex-col gap-10">
					<div className="flex items-center gap-3">
						<LogoMark size={44} />
						<div className="flex flex-col gap-0.5">
							<span className="font-semibold text-lg tracking-tight">
								jooling
							</span>
							<span className="text-sidebar-foreground/70 text-xs">
								Fast scheduling for hourly teams
							</span>
						</div>
					</div>
					<div className="flex max-w-md flex-col gap-3">
						<h2 className="font-semibold text-2xl tracking-tight">
							The schedule board for your team
						</h2>
						<p className="text-sidebar-foreground/70 text-sm leading-relaxed">
							Build, publish, and operate schedules from one operational
							workspace — with explicit status for every shift change.
						</p>
					</div>
					<ItemGroup className="max-w-md">
						{highlights.map((highlight) => (
							<Item key={highlight.title} variant="muted" size="sm">
								<ItemMedia variant="icon">
									<highlight.icon />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>{highlight.title}</ItemTitle>
									<ItemDescription className="text-sidebar-foreground/70">
										{highlight.description}
									</ItemDescription>
								</ItemContent>
							</Item>
						))}
					</ItemGroup>
				</div>
				<p className="text-sidebar-foreground/50 text-xs">
					Managers set up workplaces. Workers join through an invite.
				</p>
			</section>

			<section className="flex flex-col items-center justify-center bg-muted/35 px-4 py-10">
				<div className="mb-8 flex items-center gap-3 lg:hidden">
					<LogoMark size={40} />
					<div className="flex flex-col gap-0.5">
						<span className="font-semibold text-base tracking-tight">
							jooling
						</span>
						<span className="text-muted-foreground text-xs">
							Fast scheduling for hourly teams
						</span>
					</div>
				</div>
				{children}
			</section>
		</main>
	);
}
