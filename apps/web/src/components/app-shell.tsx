import { Avatar, AvatarFallback } from "@SchedulesManager/ui/components/avatar";
import { buttonVariants } from "@SchedulesManager/ui/components/button";
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
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@SchedulesManager/ui/components/sheet";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@SchedulesManager/ui/components/tooltip";
import { cn } from "@SchedulesManager/ui/lib/utils";
import { Link, type LinkProps, Outlet } from "@tanstack/react-router";
import {
	BellIcon,
	LockIcon,
	LogOutIcon,
	type LucideIcon,
	MenuIcon,
	SearchIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import {
	AppShellAside,
	AppShellSearch,
	type ShellSearchLink,
} from "@/components/app-shell-panels";
import { DocsLink } from "@/components/docs-link";
import { LogoMark } from "@/components/logo-mark";
import { PilotFeedback } from "@/components/pilot-feedback";
import type { InboxNotification } from "@/lib/queries";

export type ShellLink = {
	to: LinkProps["to"];
	label: string;
	icon: LucideIcon;
};

export type ShellNavItem = ShellLink & {
	description: string;
	/** Path prefix (or exact path) used to decide whether the item is active. */
	match: string;
	exact?: boolean;
	locked?: boolean;
};

export type ShellNavGroup = { label: string; items: ShellNavItem[] };

export type ShellProfile = {
	displayName: string;
	email: string | null;
	initials: string;
	kind: string;
};

const isActive = (
	item: { match: string; exact?: boolean },
	pathname: string,
) => (item.exact ? pathname === item.match : pathname.startsWith(item.match));

const RAIL_BUTTON =
	"size-9 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const RAIL_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground";

function RailLink({
	link,
	active,
	badge,
	onClick,
}: {
	link: ShellLink;
	active: boolean;
	badge?: number;
	onClick?: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Link
						to={link.to}
						aria-label={link.label}
						aria-current={active ? "page" : undefined}
						onClick={onClick}
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							RAIL_BUTTON,
							"relative",
							active && RAIL_ACTIVE,
						)}
					/>
				}
			>
				<link.icon strokeWidth={1.5} />
				{badge ? (
					<span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 font-medium text-primary-foreground text-xs leading-4">
						{badge > 99 ? "99+" : badge}
					</span>
				) : null}
			</TooltipTrigger>
			<TooltipContent side="right">{link.label}</TooltipContent>
		</Tooltip>
	);
}

function RailButton({
	label,
	icon: Icon,
	onClick,
}: {
	label: string;
	icon: LucideIcon;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						aria-label={label}
						onClick={onClick}
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon" }),
							RAIL_BUTTON,
						)}
					/>
				}
			>
				<Icon strokeWidth={1.5} />
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}

function WorkplaceHeader({
	workplaceName,
	roleLabel,
}: {
	workplaceName: string;
	roleLabel: string;
}) {
	return (
		<div className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2">
			<LogoMark size={28} className="rounded-md" />
			<div className="grid min-w-0 flex-1 leading-tight">
				<span className="truncate font-semibold text-sm" title={workplaceName}>
					{workplaceName}
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{roleLabel}
				</span>
			</div>
		</div>
	);
}

function NavList({
	label,
	groups,
	pathname,
	onNavigate,
}: {
	label: string;
	groups: ShellNavGroup[];
	pathname: string;
	onNavigate?: () => void;
}) {
	return (
		<nav aria-label={label} className="grid gap-4">
			{groups.map((group) => (
				<div key={group.label} className="grid gap-1">
					<p className="px-2 font-medium text-muted-foreground text-xs">
						{group.label}
					</p>
					<ul className="grid gap-0.5">
						{group.items.map((item) => {
							const active = isActive(item, pathname);
							return (
								<li key={item.match}>
									<Link
										to={item.to}
										aria-current={active ? "page" : undefined}
										onClick={onNavigate}
										className={cn(
											"flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sidebar-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring [@media(hover:hover)]:hover:bg-sidebar-accent/70",
											active &&
												"bg-sidebar-accent text-sidebar-accent-foreground",
										)}
									>
										<span
											className={cn(
												"grid size-8 shrink-0 place-items-center rounded-full border border-sidebar-border bg-background text-muted-foreground",
												active && "text-foreground",
											)}
										>
											<item.icon className="size-4" strokeWidth={1.75} />
										</span>
										<span className="grid min-w-0 flex-1 leading-tight">
											<span className="truncate font-medium text-sm">
												{item.label}
											</span>
											<span className="truncate text-muted-foreground text-xs">
												{item.description}
											</span>
										</span>
										{item.locked ? (
											<LockIcon
												className="size-3.5 shrink-0 text-muted-foreground"
												aria-label="Needs the Operations plan"
											/>
										) : null}
									</Link>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</nav>
	);
}

function PageTabs({
	label,
	items,
	pathname,
}: {
	label: string;
	items: ShellNavItem[];
	pathname: string;
}) {
	return (
		<nav
			aria-label={label}
			className="inline-flex shrink-0 overflow-hidden rounded-lg border bg-background"
		>
			{items.map((item) => {
				const active = isActive(item, pathname);
				return (
					<Link
						key={item.match}
						to={item.to}
						aria-current={active ? "page" : undefined}
						className={cn(
							"inline-flex h-8 items-center gap-1.5 whitespace-nowrap border-r px-3.5 font-medium text-muted-foreground text-sm outline-none transition-colors last:border-r-0 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset [@media(hover:hover)]:hover:text-foreground",
							active && "bg-muted text-foreground",
						)}
					>
						{item.label}
						{item.locked ? <LockIcon className="size-3" /> : null}
					</Link>
				);
			})}
		</nav>
	);
}

function ProfileMenu({
	profile,
	isSigningOut,
	onSignOut,
	onTheme,
	side,
}: {
	profile: ShellProfile;
	isSigningOut: boolean;
	onSignOut: () => void;
	onTheme: (theme: "light" | "dark" | "system") => void;
	side: "right" | "bottom";
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Account: ${profile.displayName}`}
				render={
					<button
						type="button"
						className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
					/>
				}
			>
				<Avatar>
					<AvatarFallback>{profile.initials}</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent side={side} align="end" className="min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						<p className="truncate" title={profile.displayName}>
							{profile.displayName}
						</p>
						<p
							className="truncate font-normal text-muted-foreground text-xs"
							title={profile.email ?? undefined}
						>
							{profile.email ?? profile.kind}
						</p>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						Theme
					</DropdownMenuLabel>
					<DropdownMenuItem onClick={() => onTheme("light")}>
						Light
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onTheme("dark")}>
						Dark
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onTheme("system")}>
						System
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem disabled={isSigningOut} onClick={onSignOut}>
					{isSigningOut ? <Spinner /> : <LogOutIcon />}
					{isSigningOut ? "Signing out…" : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * The shared workspace frame for managers and workers: a left rail of global
 * shortcuts, a contextual sidebar, a tabbed main column, an optional right
 * sidebar, and a status bar along the bottom.
 */
export function AppShell({
	workplaceId,
	workplaceName,
	roleLabel,
	navLabel,
	pathname,
	routeId,
	groups,
	home,
	inbox,
	settings,
	profile,
	isSigningOut,
	onSignOut,
	onTheme,
	title,
	scheduleControls = false,
	quickLinks = [],
	notifications = [],
}: {
	workplaceId: string;
	workplaceName: string;
	roleLabel: string;
	navLabel: string;
	pathname: string;
	routeId: string | undefined;
	groups: ShellNavGroup[];
	home: ShellLink & { match: string };
	inbox: ShellLink & { match: string; unreadCount: number };
	settings?: ShellLink & { match: string };
	profile?: ShellProfile;
	isSigningOut: boolean;
	onSignOut: () => void;
	onTheme: (theme: "light" | "dark" | "system") => void;
	/** Page heading shown in the top bar when the section has no tabs. */
	title: ReactNode;
	/** The schedule page portals its controls into the top bar. */
	scheduleControls?: boolean;
	quickLinks?: ShellLink[];
	notifications?: InboxNotification[];
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setSearchOpen((open) => !open);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const activeGroup = groups.find((group) =>
		group.items.some((item) => isActive(item, pathname)),
	);
	const tabs =
		activeGroup && activeGroup.items.length > 1 ? activeGroup.items : null;
	const searchLinks: ShellSearchLink[] = [
		{ ...home, description: "Your starting page" },
		{ ...inbox, description: "Notifications" },
		...groups.flatMap((group) => group.items),
		...(settings ? [{ ...settings, description: "Workplace settings" }] : []),
	];
	const homeActive = isActive({ ...home, exact: true }, pathname);
	const inboxActive = isActive(inbox, pathname);
	const settingsActive = settings ? isActive(settings, pathname) : false;

	return (
		<div className="flex h-svh min-h-0 flex-col bg-sidebar text-sidebar-foreground">
			<div className="flex min-h-0 flex-1">
				<div
					data-sidebar="sidebar"
					className="hidden w-14 shrink-0 flex-col items-center gap-1 border-sidebar-border border-r py-3 md:flex"
				>
					<RailLink link={home} active={homeActive} />
					<RailButton
						label="Search"
						icon={SearchIcon}
						onClick={() => setSearchOpen(true)}
					/>
					<RailLink
						link={inbox}
						active={inboxActive}
						badge={inbox.unreadCount}
					/>
					<div className="mt-auto grid justify-items-center gap-1">
						<DocsLink className={RAIL_BUTTON} />
						{settings ? (
							<RailLink link={settings} active={settingsActive} />
						) : null}
						{profile ? (
							<div className="mt-2">
								<ProfileMenu
									profile={profile}
									isSigningOut={isSigningOut}
									onSignOut={onSignOut}
									onTheme={onTheme}
									side="right"
								/>
							</div>
						) : null}
					</div>
				</div>

				<aside
					data-sidebar="sidebar"
					className="hidden w-64 shrink-0 flex-col gap-4 overflow-y-auto border-sidebar-border border-r p-3 lg:flex"
				>
					<WorkplaceHeader
						workplaceName={workplaceName}
						roleLabel={roleLabel}
					/>
					<NavList label={navLabel} groups={groups} pathname={pathname} />
				</aside>

				<div
					data-sidebar="inset"
					className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:rounded-tl-xl md:border-sidebar-border md:border-t md:border-l"
				>
					<header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 md:px-4">
						<button
							type="button"
							aria-label="Open navigation"
							onClick={() => setMenuOpen(true)}
							className={cn(
								buttonVariants({ variant: "ghost", size: "icon" }),
								"-ml-1 lg:hidden",
							)}
						>
							<MenuIcon />
						</button>
						{tabs ? (
							<PageTabs
								label={`${activeGroup?.label ?? "Section"} pages`}
								items={tabs}
								pathname={pathname}
							/>
						) : scheduleControls ? null : (
							<div className="min-w-0 font-medium text-sm">{title}</div>
						)}
						{scheduleControls ? (
							<div
								id="schedule-header-controls"
								className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain"
							/>
						) : (
							<div className="flex-1" />
						)}
						<div className="flex items-center gap-1 md:hidden">
							<Link
								to={inbox.to}
								aria-label={inbox.label}
								className={cn(
									buttonVariants({ variant: "ghost", size: "icon" }),
									"relative",
								)}
							>
								<BellIcon strokeWidth={1.5} />
								{inbox.unreadCount > 0 ? (
									<span className="absolute top-1 right-1 size-2 rounded-full bg-primary" />
								) : null}
							</Link>
							{profile ? (
								<ProfileMenu
									profile={profile}
									isSigningOut={isSigningOut}
									onSignOut={onSignOut}
									onTheme={onTheme}
									side="bottom"
								/>
							) : null}
						</div>
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
				</div>

				{scheduleControls ? null : (
					<AppShellAside
						inbox={inbox}
						notifications={notifications}
						quickLinks={quickLinks}
					/>
				)}
			</div>

			<footer className="flex h-9 shrink-0 items-center gap-3 border-sidebar-border border-t px-3 text-muted-foreground text-xs print:hidden">
				<span className="flex min-w-0 items-center gap-2">
					<span
						aria-hidden="true"
						className="size-1.5 shrink-0 rounded-full bg-success"
					/>
					<span className="truncate">
						{workplaceName} · {roleLabel}
					</span>
				</span>
				<span className="ml-auto hidden items-center gap-1 sm:flex">
					Search
					<kbd className="rounded border bg-background px-1.5 font-sans text-xs">
						Ctrl K
					</kbd>
				</span>
				<PilotFeedback
					workplaceId={workplaceId}
					buttonClassName="h-6 px-2 text-xs ml-auto sm:ml-0"
				/>
			</footer>

			<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
				<SheetContent side="left">
					<SheetHeader>
						<SheetTitle>{workplaceName}</SheetTitle>
						<SheetDescription>{roleLabel}</SheetDescription>
					</SheetHeader>
					<div className="grid flex-1 content-start gap-4 overflow-y-auto p-3">
						<NavList
							label={`${navLabel} (menu)`}
							groups={[
								...groups,
								...(settings
									? [
											{
												label: "Workspace",
												items: [
													{
														...settings,
														description: "Workplace settings",
													},
												],
											},
										]
									: []),
							]}
							pathname={pathname}
							onNavigate={() => setMenuOpen(false)}
						/>
					</div>
				</SheetContent>
			</Sheet>

			<AppShellSearch
				open={searchOpen}
				onOpenChange={setSearchOpen}
				links={searchLinks}
			/>
		</div>
	);
}
