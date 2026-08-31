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
	SidebarRail,
	SidebarTrigger,
} from "@SchedulesManager/ui/components/sidebar";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { cn } from "@SchedulesManager/ui/lib/utils";
import {
	createFileRoute,
	Link,
	Navigate,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import {
	BellIcon,
	CalendarDaysIcon,
	ChevronsUpDownIcon,
	Clock3Icon,
	LayoutDashboardIcon,
	LogOutIcon,
	Settings2Icon,
	UsersIcon,
	WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";

import { profileInitials } from "@/components/current-profile";
import { ModeToggle } from "@/components/mode-toggle";
import { PilotFeedback } from "@/components/pilot-feedback";
import { useAuth } from "@/lib/auth";
import { useMe, useNotifications } from "@/lib/queries";
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
	{ to: "/dashboard/schedule", label: "Schedule", icon: CalendarDaysIcon },
	{ to: "/dashboard/workers", label: "Workers", icon: UsersIcon },
	{ to: "/dashboard/timeoff", label: "Time off", icon: Clock3Icon },
	{ to: "/dashboard/coverage", label: "Coverage", icon: WorkflowIcon },
	{ to: "/dashboard/activity", label: "Activity", icon: BellIcon },
	{ to: "/dashboard/settings", label: "Settings", icon: Settings2Icon },
] as const;

function DashboardLayout() {
	const { isSigningOut, user, signOut } = useAuth();
	const me = useMe();
	const { isLoading, workplace, kind } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const unreadCount = inbox.data?.unreadCount ?? 0;
	const profile = me.data?.profile;
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const handleSignOut = async () => {
		try {
			await signOut();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not sign out",
			);
		}
	};

	if (!user) return <Navigate to="/" replace />;
	if (isLoading)
		return (
			<main className="grid min-h-svh place-items-center">
				<Spinner />
				<span className="sr-only">Loading workspace</span>
			</main>
		);
	if (!workplace) return <Navigate to="/" replace />;
	if (kind === "worker") return <Navigate to="/worker" replace />;

	const isSchedule = pathname.startsWith("/dashboard/schedule");
	const activePage =
		navigation.find((item) =>
			"exact" in item && item.exact
				? pathname === item.to
				: pathname.startsWith(item.to),
		)?.label ?? "Overview";

	return (
		<SidebarProvider>
			<Sidebar variant="inset" collapsible="icon">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="lg" tooltip={workplace.name}>
								<div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
									J
								</div>
								<div className="grid flex-1 text-left leading-tight">
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
							<SidebarMenu>
								{navigation.map((item) => {
									const active =
										"exact" in item && item.exact
											? pathname === item.to
											: pathname.startsWith(item.to);
									return (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton
												isActive={active}
												tooltip={item.label}
												render={<Link to={item.to} />}
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
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:flex-col">
						<div className="group-data-[collapsible=icon]:hidden">
							<PilotFeedback
								workplaceId={workplace.id}
								buttonClassName="border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring/30 dark:bg-sidebar-accent/40 dark:hover:bg-sidebar-accent"
							/>
						</div>
						<ModeToggle buttonClassName="border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring/30 dark:bg-sidebar-accent/40 dark:hover:bg-sidebar-accent" />
					</div>
					<SidebarMenu>
						{profile ? (
							<SidebarMenuItem>
								<DropdownMenu>
									<DropdownMenuTrigger
										render={<SidebarMenuButton size="lg" tooltip="Account" />}
									>
										<Avatar size="sm">
											<AvatarFallback>
												{profileInitials(profile)}
											</AvatarFallback>
										</Avatar>
										<div className="grid flex-1 text-left leading-tight">
											<span className="truncate font-medium">
												{profile.fullName ?? profile.email}
											</span>
											<span className="truncate text-xs">{profile.email}</span>
										</div>
										<ChevronsUpDownIcon className="ml-auto" />
									</DropdownMenuTrigger>
									<DropdownMenuContent
										side="right"
										align="end"
										className="min-w-56"
									>
										<DropdownMenuGroup>
											<DropdownMenuLabel>
												<p className="truncate">
													{profile.fullName ?? profile.email}
												</p>
												<p className="truncate font-normal text-muted-foreground text-xs">
													{kind}
												</p>
											</DropdownMenuLabel>
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
				<SidebarRail />
			</Sidebar>
			<SidebarInset
				className={cn(
					"flex h-svh min-h-0! min-w-0 flex-col overflow-hidden md:h-[calc(100svh-1rem)]",
					isSchedule && "bg-muted/20",
				)}
			>
				<header
					className={cn(
						"sticky top-0 z-40 flex h-14 min-h-14 shrink-0 items-center gap-2 border-b bg-background px-3 shadow-xs",
						isSchedule && "h-auto flex-wrap py-1.5 sm:h-14 sm:flex-nowrap",
					)}
				>
					<SidebarTrigger className="-ml-1 shrink-0" />
					<span className="shrink-0 font-medium text-sm">{activePage}</span>
					{isSchedule ? (
						<div
							id="schedule-header-controls"
							className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-nowrap"
						/>
					) : null}
				</header>
				<div
					className={cn(
						"flex min-h-0 min-w-0 flex-1 flex-col",
						isSchedule
							? "overflow-hidden p-0!"
							: "gap-6 overflow-auto p-4 md:p-6 lg:p-8",
					)}
				>
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
