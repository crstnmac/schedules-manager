import { Button } from "@SchedulesManager/ui/components/button";
import { Separator } from "@SchedulesManager/ui/components/separator";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";

import { settingsGroups } from "@/components/settings/nav";

export const Route = createFileRoute("/dashboard/settings")({
	component: SettingsLayout,
});

function SettingsLayout() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<section className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
			<aside className="shrink-0 border-b bg-muted/30 md:w-56 md:overflow-y-auto md:border-r md:border-b-0 lg:w-60">
				<nav
					aria-label="Settings sections"
					className="flex gap-3 overflow-x-auto overscroll-x-contain p-3 md:flex-col md:gap-4 md:overflow-visible"
				>
					{settingsGroups.map((group, index) => (
						<div key={group.label} className="grid shrink-0 gap-1">
							{index > 0 ? (
								<Separator className="mb-2 hidden md:block" />
							) : null}
							<p className="hidden px-2 font-medium text-muted-foreground text-xs md:block">
								{group.label}
							</p>
							<ul className="flex gap-1 md:grid">
								{group.items.map((item) => {
									const active = pathname.startsWith(item.to);
									return (
										<li key={item.to}>
											<Button
												variant={active ? "secondary" : "ghost"}
												size="sm"
												aria-current={active ? "page" : undefined}
												className="w-auto justify-start md:w-full"
												nativeButton={false}
												render={
													<Link to={item.to} activeOptions={{ exact: true }} />
												}
											>
												{item.label}
											</Button>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>
			</aside>
			<div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
				<Outlet />
			</div>
		</section>
	);
}
