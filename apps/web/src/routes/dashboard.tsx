import { Avatar, AvatarFallback } from "@SchedulesManager/ui/components/avatar";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Separator } from "@SchedulesManager/ui/components/separator";
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
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from "@SchedulesManager/ui/components/sidebar";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
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

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon">
				<SidebarHeader>
					<div className="flex min-h-12 items-center gap-3 px-2 group-data-[collapsible=icon]:justify-center">
						<div className="grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary font-bold text-sidebar-primary-foreground">
							S
						</div>
						<div className="min-w-0 group-data-[collapsible=icon]:hidden">
							<p className="truncate font-semibold text-sm">{workplace.name}</p>
							<p className="text-sidebar-foreground/60 text-xs">
								Manager workspace
							</p>
						</div>
					</div>
				</SidebarHeader>
				<Separator className="bg-sidebar-border" />
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
													<Badge variant="secondary" className="ml-auto">
														{unreadCount}
													</Badge>
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
					{profile ? (
						<div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
							<Avatar size="sm">
								<AvatarFallback>{profileInitials(profile)}</AvatarFallback>
							</Avatar>
							<div className="min-w-0 group-data-[collapsible=icon]:hidden">
								<p className="truncate font-medium text-sm">
									{profile.fullName ?? profile.email}
								</p>
								<p className="truncate text-sidebar-foreground/60 text-xs">
									{profile.fullName ? profile.email : null}
									{kind ? `${profile.fullName ? " · " : ""}${kind}` : null}
								</p>
							</div>
						</div>
					) : null}
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								tooltip="Sign out"
								disabled={isSigningOut}
								onClick={() => void handleSignOut()}
							>
								{isSigningOut ? <Spinner /> : <LogOutIcon />}
								<span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			<SidebarInset>
				<header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
					<div className="flex items-center gap-2">
						<SidebarTrigger />
						<Separator orientation="vertical" className="h-4" />
						<p className="font-medium text-sm">SchedulesManager</p>
						<Badge variant="secondary" className="hidden sm:inline-flex">
							Austin pilot
						</Badge>
					</div>
					<ModeToggle />
				</header>
				<div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
