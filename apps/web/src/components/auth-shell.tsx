import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { StaticMeshGradient } from "@paper-design/shaders-react";
import { BellIcon, CalendarDaysIcon, UsersIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

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

const MESH_COLORS = ["#F3F8FD", "#BBD7F6", "#006EDC", "#DCEBFB"];

function useWebgl2(): boolean {
	const [supported, setSupported] = useState(false);
	useEffect(() => {
		try {
			const canvas = document.createElement("canvas");
			setSupported(Boolean(canvas.getContext("webgl2")));
		} catch {
			setSupported(false);
		}
	}, []);
	return supported;
}

export function AuthShell({ children }: { children: ReactNode }) {
	const webgl2 = useWebgl2();

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="light relative flex min-h-svh flex-col overflow-hidden text-foreground lg:grid lg:grid-cols-2"
		>
			<div
				aria-hidden="true"
				className="auth-canvas pointer-events-none absolute inset-0"
			>
				{webgl2 ? (
					<StaticMeshGradient
						className="absolute inset-0"
						width="100%"
						height="100%"
						colors={MESH_COLORS}
						positions={3}
						waveX={0.6}
						waveXShift={0.2}
						waveY={0.9}
						waveYShift={0.5}
						mixing={0.85}
						grainOverlay={0.05}
						scale={1}
						fit="cover"
						minPixelRatio={1.5}
						speed={0}
					/>
				) : (
					<div className="auth-fallback-gradient absolute inset-0" />
				)}
				<div className="absolute inset-0 bg-sidebar/45" />
				<div className="absolute inset-0 hidden bg-gradient-to-r from-sidebar via-sidebar/55 to-transparent lg:block" />
			</div>

			<section
				aria-hidden="true"
				className="relative z-10 hidden overflow-hidden p-10 text-foreground lg:flex lg:flex-col lg:justify-between"
			>
				<div className="relative z-10 flex flex-col gap-10">
					<div className="flex items-center gap-3">
						<LogoMark size={44} />
						<div className="flex flex-col gap-0.5">
							<span className="font-semibold text-lg tracking-tight">
								jooling
							</span>
							<span className="text-foreground/60 text-xs">
								Fast scheduling for hourly teams
							</span>
						</div>
					</div>
					<div className="flex max-w-md flex-col gap-3">
						<h2 className="font-semibold text-2xl tracking-tight">
							The schedule board for your team
						</h2>
						<p className="text-foreground/70 text-sm leading-relaxed">
							Plan the week, fill open shifts, and keep your team informed when
							work changes.
						</p>
					</div>
					<ItemGroup className="max-w-md">
						{highlights.map((highlight) => (
							<Item
								key={highlight.title}
								size="sm"
								className="border-foreground/10 bg-background/55 backdrop-blur-sm"
							>
								<ItemMedia
									variant="icon"
									className="bg-primary/10 text-primary"
								>
									<highlight.icon />
								</ItemMedia>
								<ItemContent>
									<ItemTitle className="text-foreground">
										{highlight.title}
									</ItemTitle>
									<ItemDescription className="text-foreground/70">
										{highlight.description}
									</ItemDescription>
								</ItemContent>
							</Item>
						))}
					</ItemGroup>
				</div>
				<p className="relative z-10 text-foreground/50 text-xs">
					Managers set up workplaces. Workers join through an invite.
				</p>
			</section>

			<section className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10">
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
