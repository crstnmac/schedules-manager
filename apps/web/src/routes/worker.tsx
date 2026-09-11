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
import { PageFade } from "@SchedulesManager/ui/components/motion";
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
import { usePostHog } from "@posthog/react";
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
	InboxIcon,
	LogOutIcon,
	type LucideIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	TimerIcon,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { profileInitials } from "@/components/current-profile";
import { LogoMark } from "@/components/logo-mark";
import { NextShiftBar } from "@/components/next-shift-bar";
import { PilotFeedback } from "@/components/pilot-feedback";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth";
import { useMe, useNotifications } from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker")({
	component: WorkerLayout,
});

type WorkerNavItem = {
	to:
		| "/worker"
		| "/worker/timecard"
		| "/worker/openshifts"
		| "/worker/availability"
		| "/worker/messages"
		| "/worker/announcements"
		| "/worker/inbox";
	label: string;
	icon: LucideIcon;
	exact?: boolean;
	operations?: boolean;
};

const navigationGroups: { label: string; items: WorkerNavItem[] }[] = [
	{
		label: "My work",
		items: [
			{
				to: "/worker",
				label: "My schedule",
				icon: CalendarDaysIcon,
				exact: true,
			},
			{
				to: "/worker/timecard",
				label: "Timecard",
				icon: TimerIcon,
				operations: true,
			},
			{ to: "/worker/openshifts", label: "Open shifts", icon: InboxIcon },
		],
	},
	{
		label: "Requests",
		items: [
			{
				to: "/worker/availability",
				label: "Time off & availability",
				icon: Clock3Icon,
			},
		],
	},
	{
		label: "Team",
		items: [
			{ to: "/worker/messages", label: "Messages", icon: MessageSquareIcon },
			{
				to: "/worker/announcements",
				label: "Announcements",
				icon: MegaphoneIcon,
			},
			{ to: "/worker/inbox", label: "Inbox", icon: BellIcon },
		],
	},
];

const navigation = navigationGroups.flatMap((group) => group.items);

function WorkerLayout() {
	const posthog = usePostHog();
	const { isLoading: authLoading, isSigningOut, user, signOut } = useAuth();
	const { setTheme } = useTheme();
	const me = useMe(Boolean(user));
	const { formatPerson } = useDisplayPrefs();
	const { isLoading, workplace, kind, capabilities } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const unreadCount = inbox.data?.unreadCount ?? 0;
	const profile = me.data?.profile;
	const displayName = profile
		? formatPerson(profile.fullName, profile.email)
		: "";
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const routeId = useRouterState({
		select: (state) => state.matches.at(-1)?.routeId,
	});
	const showTimecard = capabilities.operations;
	const activePage = pathname.startsWith("/worker/history")
		? "Published version"
		: (navigation.find((item) =>
				item.exact ? pathname === item.to : pathname.startsWith(item.to),
			)?.label ?? "My schedule");

	useEffect(() => {
		document.title = `${activePage} · jooling`;
	}, [activePage]);
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
				<span className="sr-only">Loading</span>
			</main>
		);
	}
	if (!user) return <Navigate to="/" replace />;
	if (isLoading) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
				<Spinner />
				<span className="sr-only">Loading</span>
			</main>
		);
	}
	if (!workplace) return <Navigate to="/" replace />;
	if (kind === "manager") return <Navigate to="/dashboard" replace />;
	if (pathname.startsWith("/worker/timecard") && !showTimecard) {
		return <Navigate to="/worker" replace />;
	}

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
									<span className="truncate text-xs">Worker</span>
								</div>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					{navigationGroups.map((group) => {
						const items = group.items.filter(
							(item) => !item.operations || showTimecard,
						);
						if (items.length === 0) return null;
						return (
							<SidebarGroup key={group.label}>
								<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
								<SidebarGroupContent>
									<nav aria-label={group.label}>
										<SidebarMenu>
											{items.map((item) => {
												const active = item.exact
													? pathname === item.to
													: pathname.startsWith(item.to);
												return (
													<SidebarMenuItem key={item.to}>
														<SidebarMenuButton
															isActive={active}
															aria-current={active ? "page" : undefined}
															tooltip={item.label}
															render={
																<Link
																	to={item.to}
																	activeOptions={{ exact: Boolean(item.exact) }}
																/>
															}
														>
															<item.icon />
															<span>{item.label}</span>
															{item.to === "/worker/inbox" &&
															unreadCount > 0 ? (
																<SidebarMenuBadge>
																	{unreadCount}
																</SidebarMenuBadge>
															) : null}
														</SidebarMenuButton>
													</SidebarMenuItem>
												);
											})}
										</SidebarMenu>
									</nav>
								</SidebarGroupContent>
							</SidebarGroup>
						);
					})}
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
												<p className="truncate font-normal text-muted-foreground text-xs">
													Worker
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
			<SidebarInset className="flex h-svh min-h-0! min-w-0 flex-col overflow-hidden md:h-[calc(100svh-1rem)]">
				<header className="sticky top-0 z-40 flex h-14 min-h-14 shrink-0 items-center gap-2 border-b bg-background px-3 shadow-xs">
					<SidebarTrigger className="-ml-1 shrink-0" />
					<span className="shrink-0 font-medium text-sm">{activePage}</span>
					{pathname === "/worker" ? (
						<div className="ml-auto min-w-0">
							<NextShiftBar />
						</div>
					) : null}
				</header>
				<main
					id="main-content"
					tabIndex={-1}
					className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0!"
				>
					<PageFade
						key={routeId}
						className="flex min-h-0 min-w-0 flex-1 flex-col"
					>
						<Outlet />
					</PageFade>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
