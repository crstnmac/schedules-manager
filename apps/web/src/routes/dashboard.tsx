import { Avatar, AvatarFallback } from "@SchedulesManager/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@SchedulesManager/ui/components/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@SchedulesManager/ui/components/sidebar";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { usePostHog } from "@posthog/react";
import {
	createFileRoute,
	Link,
	Navigate,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import {
	AlarmClockIcon,
	BellIcon,
	CalendarDaysIcon,
	ChevronsUpDownIcon,
	ClipboardListIcon,
	Clock3Icon,
	LayoutDashboardIcon,
	LogOutIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	Settings2Icon,
	TimerIcon,
	UsersIcon,
	WorkflowIcon,
} from "lucide-react";

import { useEffect } from "react";
import { toast } from "sonner";

import { profileInitials } from "@/components/current-profile";
import { LogoMark } from "@/components/logo-mark";
import { PilotFeedback } from "@/components/pilot-feedback";
import { settingsSectionLabel } from "@/components/settings/nav";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth";
import { useMe, useNotifications } from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard")({
	component: DashboardLayout,
});

const navigation = [
	{
		to: "/dashboard",
		label: "Overview",
		icon: LayoutDashboardIcon,
		exact: true,
	},
	{ to: "/dashboard/clock", label: "Clock", icon: AlarmClockIcon },
	{ to: "/dashboard/schedule", label: "Schedule", icon: CalendarDaysIcon },
	{ to: "/dashboard/roster", label: "Roster", icon: ClipboardListIcon },
	{ to: "/dashboard/workers", label: "Workers", icon: UsersIcon },
	{ to: "/dashboard/timeoff", label: "Time off", icon: Clock3Icon },
	{ to: "/dashboard/timesheets", label: "Timesheets", icon: TimerIcon },
	{ to: "/dashboard/coverage", label: "Coverage", icon: WorkflowIcon },
	{ to: "/dashboard/messages", label: "Messages", icon: MessageSquareIcon },
	{
		to: "/dashboard/announcements",
		label: "Announcements",
		icon: MegaphoneIcon,
	},
	{ to: "/dashboard/reports", label: "Reports", icon: Settings2Icon },
	{ to: "/dashboard/activity", label: "Activity", icon: BellIcon },
	{
		to: "/dashboard/settings/workplace",
		label: "Settings",
		icon: Settings2Icon,
		match: "/dashboard/settings",
	},
] as const;

function DashboardLayout() {
	const posthog = usePostHog();
	const { isLoading: authLoading, isSigningOut, user, signOut } = useAuth();
	const { setTheme } = useTheme();
	const me = useMe(Boolean(user));
	const { formatPerson } = useDisplayPrefs();
	const { isLoading, workplace, kind } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const unreadCount = inbox.data?.unreadCount ?? 0;
	const profile = me.data?.profile;
	const displayName = profile
		? formatPerson(profile.fullName, profile.email)
		: "";
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const isSchedule = pathname.startsWith("/dashboard/schedule");
	const isSettings = pathname.startsWith("/dashboard/settings");
	const settingsLabel = isSettings ? settingsSectionLabel(pathname) : undefined;
	const activePage =
		navigation.find((item) => {
			const matchPath = "match" in item && item.match ? item.match : item.to;
			return "exact" in item && item.exact
				? pathname === matchPath
				: pathname.startsWith(matchPath);
		})?.label ?? "Overview";
	const headerLabel =
		isSettings && settingsLabel ? `Settings / ${settingsLabel}` : activePage;

	useEffect(() => {
		document.title = `${headerLabel} · jooling`;
	}, [headerLabel]);
	useEffect(() => {
		if (!workplace || !kind) return;
		posthog?.group("workplace", workplace.id, { name: workplace.name });
		posthog?.register({ workplace_id: workplace.id, employment_kind: kind });
	}, [kind, posthog, workplace]);
	const handleSignOut = async () => {
		try {
			await signOut();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not sign out",
			);
		}
	};

	if (authLoading) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
				<Spinner />
				<span className="sr-only">Loading workspace</span>
			</main>
		);
	}
	if (!user) return <Navigate to="/" replace />;
	if (isLoading)
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
				<Spinner />
				<span className="sr-only">Loading workspace</span>
			</main>
		);
	if (!workplace) return <Navigate to="/" replace />;
	if (kind === "worker") return <Navigate to="/worker" replace />;

	return (
		<SidebarProvider>
			<Sidebar variant="inset" collapsible="icon">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="lg" tooltip={workplace.name}>
								<LogoMark size={32} className="rounded-lg" />
								<div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:sr-only">
									<span className="truncate font-semibold">
										{workplace.name}
									</span>
									<span className="truncate text-xs">Manager workspace</span>
								</div>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Operations</SidebarGroupLabel>
						<SidebarGroupContent>
							<nav aria-label="Manager navigation">
								<SidebarMenu>
									{navigation.map((item) => {
										const exact = "exact" in item && item.exact;
										const matchPath =
											"match" in item && item.match ? item.match : item.to;
										const active = exact
											? pathname === matchPath
											: pathname.startsWith(matchPath);
										return (
											<SidebarMenuItem key={item.to}>
												<SidebarMenuButton
													isActive={active}
													aria-current={active ? "page" : undefined}
													tooltip={item.label}
													render={
														<Link
															to={item.to}
															activeOptions={{ exact: Boolean(exact) }}
														/>
													}
												>
													<item.icon />
													<span>{item.label}</span>
													{item.to === "/dashboard/activity" &&
													unreadCount > 0 ? (
														<SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>
													) : null}
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</nav>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<div className="px-1 group-data-[collapsible=icon]:hidden">
						<PilotFeedback
							workplaceId={workplace.id}
							buttonClassName="w-full border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring/30 dark:bg-sidebar-accent/40 dark:hover:bg-sidebar-accent"
						/>
					</div>
					<SidebarMenu>
						{profile ? (
							<SidebarMenuItem>
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<SidebarMenuButton size="lg" tooltip={displayName} />
										}
									>
										<Avatar className="shrink-0">
											<AvatarFallback>
												{profileInitials(profile)}
											</AvatarFallback>
										</Avatar>
										<div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
											<span className="truncate font-medium">
												{displayName}
											</span>
											{profile.fullName ? (
												<span className="truncate text-xs">
													{profile.email}
												</span>
											) : (
												<span className="truncate text-xs capitalize">
													{kind}
												</span>
											)}
										</div>
										<ChevronsUpDownIcon className="ml-auto group-data-[collapsible=icon]:hidden" />
									</DropdownMenuTrigger>
									<DropdownMenuContent
										side="right"
										align="end"
										className="min-w-56"
									>
										<DropdownMenuGroup>
											<DropdownMenuLabel>
												<p className="truncate">{displayName}</p>
												<p className="truncate font-normal text-muted-foreground text-xs capitalize">
													{kind}
												</p>
											</DropdownMenuLabel>
										</DropdownMenuGroup>
										<DropdownMenuSeparator />
										<DropdownMenuGroup>
											<DropdownMenuLabel className="text-muted-foreground text-xs">
												Theme
											</DropdownMenuLabel>
											<DropdownMenuItem onClick={() => setTheme("light")}>
												Light
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => setTheme("dark")}>
												Dark
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => setTheme("system")}>
												System
											</DropdownMenuItem>
										</DropdownMenuGroup>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											disabled={isSigningOut}
											onClick={() => void handleSignOut()}
										>
											{isSigningOut ? <Spinner /> : <LogOutIcon />}
											{isSigningOut ? "Signing out…" : "Sign out"}
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</SidebarMenuItem>
						) : null}
					</SidebarMenu>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset
				className={cn(
					"flex h-svh min-h-0! min-w-0 flex-col overflow-hidden md:h-[calc(100svh-1rem)]",
					isSchedule && "bg-muted/20",
				)}
			>
				<header className="sticky top-0 z-40 flex h-14 min-h-14 shrink-0 items-center gap-2 border-b bg-background px-3 shadow-xs">
					<SidebarTrigger className="-ml-1 shrink-0" />
					{isSchedule ? null : (
						<span className="shrink-0 font-medium text-sm">{headerLabel}</span>
					)}
					{isSchedule ? (
						<div
							id="schedule-header-controls"
							className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain"
						/>
					) : null}
				</header>
				<main
					id="main-content"
					tabIndex={-1}
					className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0!"
				>
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
