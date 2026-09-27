import { Badge } from "@SchedulesManager/ui/components/badge";
import { Card, CardContent } from "@SchedulesManager/ui/components/card";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { BellIcon, CalendarDaysIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/logo-mark";

const highlights = [
	{
		icon: CalendarDaysIcon,
		title: "Everyone sees the latest schedule",
		description:
			"Publish the week and let your team know whenever their shifts change.",
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
			"See who has viewed the schedule and review requests for time off or extra shifts.",
	},
] as const;

const PREVIEW_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

type PreviewShift = {
	time: string;
	tone: "blue" | "violet" | "green" | "open";
} | null;

const PREVIEW_ROWS: { name: string; shifts: PreviewShift[] }[] = [
	{
		name: "Ana R.",
		shifts: [
			{ time: "9a–5p", tone: "blue" },
			{ time: "9a–5p", tone: "blue" },
			null,
			{ time: "12p–8p", tone: "violet" },
			{ time: "9a–5p", tone: "blue" },
		],
	},
	{
		name: "Marcus L.",
		shifts: [
			null,
			{ time: "7a–3p", tone: "green" },
			{ time: "7a–3p", tone: "green" },
			{ time: "7a–3p", tone: "green" },
			null,
		],
	},
	{
		name: "Open shifts",
		shifts: [
			null,
			null,
			{ time: "4p–10p", tone: "open" },
			null,
			{ time: "10a–6p", tone: "open" },
		],
	},
];

const TONE_CLASS = {
	blue: "bg-category-1 text-category-1-foreground",
	violet: "bg-category-2 text-category-2-foreground",
	green: "bg-category-3 text-category-3-foreground",
	open: "border border-warning-border bg-warning text-warning-foreground",
} as const;

/** A static miniature of the manager week board, drawn from the app's own primitives. */
function BoardPreview() {
	return (
		<Card className="w-full max-w-lg gap-0 py-0">
			<div className="flex items-center justify-between gap-3 border-b px-4 py-3">
				<div className="flex flex-col">
					<span className="font-heading font-semibold text-sm">
						Week of Sep 28
					</span>
					<span className="text-muted-foreground text-xs">Downtown</span>
				</div>
				<Badge
					variant="outline"
					className="border-success/30 bg-success-muted text-success-foreground"
				>
					Published v3
				</Badge>
			</div>
			<CardContent className="px-0">
				<div className="grid grid-cols-[5.5rem_repeat(5,minmax(0,1fr))] text-xs">
					<div className="border-b bg-muted/60 px-3 py-2 text-muted-foreground">
						Staff
					</div>
					{PREVIEW_DAYS.map((day) => (
						<div
							key={day}
							className="border-b border-l bg-muted/60 px-2 py-2 text-center text-muted-foreground"
						>
							{day}
						</div>
					))}
					{PREVIEW_ROWS.map((row) => (
						<div key={row.name} className="contents">
							<div
								className={cn(
									"flex items-center border-b px-3 py-2.5 font-medium last:border-b-0",
									row.name === "Open shifts" &&
										"bg-warning/60 text-warning-foreground",
								)}
							>
								<span className="truncate">{row.name}</span>
							</div>
							{row.shifts.map((shift, index) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: static preview grid
									key={index}
									className={cn(
										"border-b border-l p-1",
										row.name === "Open shifts" && "bg-warning/25",
									)}
								>
									{shift ? (
										<div
											className={cn(
												"rounded-md px-1.5 py-1 font-semibold tabular-nums",
												TONE_CLASS[shift.tone],
											)}
										>
											{shift.time}
										</div>
									) : null}
								</div>
							))}
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="light grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
		>
			<section className="flex flex-col gap-8 px-4 py-6 md:px-10 md:py-8">
				<div className="flex items-center gap-2.5">
					<LogoMark size={32} className="rounded-lg" />
					<div className="flex flex-col">
						<span className="font-heading font-semibold text-base leading-tight tracking-tight">
							jooling
						</span>
						<span className="text-muted-foreground text-xs">
							Fast scheduling for hourly teams
						</span>
					</div>
				</div>
				<div className="flex flex-1 flex-col items-center justify-center pb-8">
					{children}
				</div>
				<p className="text-center text-muted-foreground text-xs lg:text-left">
					Managers set up workplaces. Workers join through an invite.
				</p>
			</section>

			<section
				aria-hidden="true"
				className="relative hidden flex-col justify-center gap-10 overflow-hidden border-l bg-muted/50 p-12 lg:flex xl:p-16"
			>
				<div className="flex max-w-lg flex-col gap-3">
					<h2 className="font-heading font-semibold text-3xl tracking-tight">
						The schedule board for your team
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						Plan the week, fill open shifts, and keep your team informed when
						work changes.
					</p>
				</div>
				<BoardPreview />
				<ul className="grid max-w-lg gap-5">
					{highlights.map((highlight) => (
						<li key={highlight.title} className="flex gap-3">
							<span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-primary shadow-xs [&_svg]:size-4">
								<highlight.icon />
							</span>
							<div className="flex flex-col gap-0.5">
								<span className="font-medium text-sm">{highlight.title}</span>
								<span className="text-muted-foreground text-sm">
									{highlight.description}
								</span>
							</div>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
}
