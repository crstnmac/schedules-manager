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
import { cn } from "@SchedulesManager/ui/lib/utils";
import { Link, type LinkProps, Outlet } from "@tanstack/react-router";
import {
	BellIcon,
	ChevronsUpDownIcon,
	LockIcon,
	LogOutIcon,
	type LucideIcon,
	MenuIcon,
	MoreHorizontalIcon,
	SearchIcon,
	Settings2Icon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import {
	AppShellSearch,
	type ShellSearchLink,
} from "@/components/app-shell-panels";
import { DocsLink } from "@/components/docs-link";
import { LogoMark } from "@/components/logo-mark";
import { PilotFeedback } from "@/components/pilot-feedback";

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

const ROW =
	"flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring [@media(hover:hover)]:hover:bg-sidebar-accent/70";
const ROW_ACTIVE =
	"bg-sidebar-accent font-medium text-sidebar-accent-foreground";

function WorkplaceHeader({
	workplaceName,
	roleLabel,
}: {
	workplaceName: string;
	roleLabel: string;
}) {
	return (
		<div className="flex items-center gap-2.5 px-1">
			<LogoMark size={32} className="rounded-lg" />
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

const NavLinkRow = memo(function NavLinkRow({
	item,
	active,
	onNavigate,
}: {
	item: ShellNavItem;
	active: boolean;
	onNavigate?: () => void;
}) {
	return (
		<Link
			to={item.to}
			aria-current={active ? "page" : undefined}
			onClick={onNavigate}
			className={cn(ROW, active && ROW_ACTIVE)}
		>
			<item.icon
				className={cn(
					"size-4 shrink-0",
					active ? "text-primary" : "text-muted-foreground",
				)}
				strokeWidth={1.75}
			/>
			<span className="min-w-0 flex-1 truncate">{item.label}</span>
			{item.locked ? (
				<LockIcon
					className="size-3.5 shrink-0 text-muted-foreground"
					aria-label="Needs the Operations plan"
				/>
			) : null}
		</Link>
	);
});

const NavList = memo(function NavList({
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
		<nav aria-label={label} className="grid gap-5">
			{groups.map((group) => (
				<div key={group.label} className="grid gap-1">
					<p className="px-2.5 font-medium text-muted-foreground text-xs">
						{group.label}
					</p>
					<ul className="grid gap-0.5">
						{group.items.map((item) => (
							<li key={item.match}>
								<NavLinkRow
									item={item}
									active={isActive(item, pathname)}
									onNavigate={onNavigate}
								/>
							</li>
						))}
					</ul>
				</div>
			))}
		</nav>
	);
});

const ProfileMenu = memo(function ProfileMenu({
	profile,
	isSigningOut,
	onSignOut,
	onTheme,
	variant,
}: {
	profile: ShellProfile;
	isSigningOut: boolean;
	onSignOut: () => void;
	onTheme: (theme: "light" | "dark" | "system") => void;
	/** `row` is the full-width sidebar footer; `avatar` is the compact top bar. */
	variant: "row" | "avatar";
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`Account: ${profile.displayName}`}
				render={
					<button
						type="button"
						className={cn(
							"outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
							variant === "row"
								? "flex w-full items-center gap-2.5 rounded-lg p-2 text-left [@media(hover:hover)]:hover:bg-sidebar-accent/70"
								: "rounded-full",
						)}
					/>
				}
			>
				<Avatar>
					<AvatarFallback>{profile.initials}</AvatarFallback>
				</Avatar>
				{variant === "row" ? (
					<>
						<span className="grid min-w-0 flex-1 leading-tight">
							<span className="truncate font-medium text-sm">
								{profile.displayName}
							</span>
							<span className="truncate text-muted-foreground text-xs">
								{profile.email ?? profile.kind}
							</span>
						</span>
						<ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
					</>
				) : null}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side={variant === "row" ? "top" : "bottom"}
				align={variant === "row" ? "start" : "end"}
				className="min-w-56"
			>
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
});

const MobileTabBar = memo(function MobileTabBar({
	items,
	pathname,
	onMore,
}: {
	items: ShellNavItem[];
	pathname: string;
	onMore: () => void;
}) {
	const tab =
		"flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 font-medium text-[0.6875rem] outline-none transition-colors focus-visible:bg-muted";
	return (
		<nav
			aria-label="Primary"
			className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
		>
			{items.map((item) => {
				const active = isActive(item, pathname);
				return (
					<Link
						key={item.match}
						to={item.to}
						aria-current={active ? "page" : undefined}
						className={cn(
							tab,
							active ? "text-primary" : "text-muted-foreground",
						)}
					>
						<item.icon className="size-5" strokeWidth={active ? 2 : 1.5} />
						<span className="max-w-full truncate">{item.label}</span>
					</Link>
				);
			})}
			<button
				type="button"
				onClick={onMore}
				className={cn(tab, "text-muted-foreground")}
			>
				<MoreHorizontalIcon className="size-5" strokeWidth={1.5} />
				More
			</button>
		</nav>
	);
});

/**
 * The shared workspace frame for managers and workers: one sidebar for
 * navigation and account, and a slim top bar for search, help, and
 * notifications. Every destination lives in exactly one place. Phones get the
 * sidebar as a drawer, plus a bottom tab bar when `mobileTabs` is set.
 */
export function AppShell({
	workplaceId,
	workplaceName,
	roleLabel,
	navLabel,
	pathname,
	routeId,
	groups,
	inbox,
	settings,
	profile,
	isSigningOut,
	onSignOut,
	onTheme,
	scheduleControls = false,
	mobileTabs,
}: {
	workplaceId: string;
	workplaceName: string;
	roleLabel: string;
	navLabel: string;
	pathname: string;
	routeId: string | undefined;
	groups: ShellNavGroup[];
	inbox: ShellLink & { match: string; unreadCount: number };
	settings?: ShellLink & { match: string };
	profile?: ShellProfile;
	isSigningOut: boolean;
	onSignOut: () => void;
	onTheme: (theme: "light" | "dark" | "system") => void;
	/** The schedule page portals its controls into the top bar. */
	scheduleControls?: boolean;
	/** Destinations for the phone bottom bar, in order. */
	mobileTabs?: ShellNavItem[];
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

	const searchLinks = useMemo<ShellSearchLink[]>(
		() => [
			...groups.flatMap((group) => group.items),
			{ ...inbox, description: "Notifications" },
			...(settings ? [{ ...settings, description: "Workplace settings" }] : []),
		],
		[groups, inbox, settings],
	);
	const openMenu = useCallback(() => setMenuOpen(true), []);
	const closeMenu = useCallback(() => setMenuOpen(false), []);
	const menuGroups = useMemo(
		() => [
			...groups,
			...(settings
				? [
						{
							label: "Workspace",
							items: [{ ...settings, description: "Workplace settings" }],
						},
					]
				: []),
		],
		[groups, settings],
	);
	const settingsActive = settings ? isActive(settings, pathname) : false;
	const inboxActive = isActive(inbox, pathname);

	return (
		<div className="flex h-svh min-h-0 flex-col bg-sidebar text-sidebar-foreground">
			<div className="flex min-h-0 flex-1">
				<aside
					data-sidebar="sidebar"
					className="hidden w-60 shrink-0 flex-col gap-4 p-3 md:flex"
				>
					<WorkplaceHeader
						workplaceName={workplaceName}
						roleLabel={roleLabel}
					/>
					<div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
						<NavList label={navLabel} groups={groups} pathname={pathname} />
					</div>
					<div className="grid gap-0.5 border-sidebar-border border-t pt-3">
						{settings ? (
							<Link
								to={settings.to}
								aria-current={settingsActive ? "page" : undefined}
								className={cn(ROW, settingsActive && ROW_ACTIVE)}
							>
								<Settings2Icon
									className={cn(
										"size-4 shrink-0",
										settingsActive ? "text-primary" : "text-muted-foreground",
									)}
									strokeWidth={1.75}
								/>
								{settings.label}
							</Link>
						) : null}
						<PilotFeedback
							variant="ghost"
							workplaceId={workplaceId}
							buttonClassName={cn(ROW, "w-full justify-start font-normal")}
						/>
						{profile ? (
							<ProfileMenu
								variant="row"
								profile={profile}
								isSigningOut={isSigningOut}
								onSignOut={onSignOut}
								onTheme={onTheme}
							/>
						) : null}
					</div>
				</aside>

				<div
					data-sidebar="inset"
					className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background md:rounded-tl-xl md:border-sidebar-border md:border-t md:border-l"
				>
					<header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:flex-nowrap md:px-4">
						<button
							type="button"
							aria-label="Open navigation"
							onClick={() => setMenuOpen(true)}
							className={cn(
								buttonVariants({ variant: "ghost", size: "icon" }),
								"-ml-1 md:hidden",
							)}
						>
							<MenuIcon />
						</button>
						<div className="min-w-0 truncate font-semibold text-sm md:hidden">
							{workplaceName}
						</div>
						<button
							type="button"
							onClick={() => setSearchOpen(true)}
							aria-label="Search pages"
							className={cn(
								"hidden h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-muted-foreground text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 md:flex [@media(hover:hover)]:hover:bg-muted",
								scheduleControls ? "w-9 justify-center px-0" : "w-64",
							)}
						>
							<SearchIcon className="size-4 shrink-0" strokeWidth={1.75} />
							{scheduleControls ? null : (
								<>
									<span className="flex-1 text-left">Search</span>
									<kbd className="rounded border bg-background px-1.5 font-sans text-xs">
										⌘K
									</kbd>
								</>
							)}
						</button>
						{scheduleControls ? (
							<div
								id="schedule-header-controls"
								className="order-last flex min-w-0 basis-full items-center gap-2 overflow-x-auto overscroll-x-contain md:order-none md:flex-1 md:basis-auto"
							/>
						) : (
							<div className="flex-1" />
						)}
						<div className="ml-auto flex shrink-0 items-center gap-1">
							<button
								type="button"
								aria-label="Search pages"
								onClick={() => setSearchOpen(true)}
								className={cn(
									buttonVariants({ variant: "ghost", size: "icon" }),
									"md:hidden",
								)}
							>
								<SearchIcon strokeWidth={1.5} />
							</button>
							<DocsLink
								className={cn(
									"hidden md:inline-flex",
									scheduleControls && "md:hidden 2xl:inline-flex",
								)}
							/>
							<Link
								to={inbox.to}
								aria-label={
									inbox.unreadCount > 0
										? `${inbox.label}, ${inbox.unreadCount} unread`
										: inbox.label
								}
								aria-current={inboxActive ? "page" : undefined}
								className={cn(
									buttonVariants({ variant: "ghost", size: "icon" }),
									"relative",
									inboxActive && "bg-muted",
								)}
							>
								<BellIcon strokeWidth={1.5} />
								{inbox.unreadCount > 0 ? (
									<span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 font-medium text-primary-foreground text-xs leading-4">
										{inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}
									</span>
								) : null}
							</Link>
							{profile ? (
								<div className="md:hidden">
									<ProfileMenu
										variant="avatar"
										profile={profile}
										isSigningOut={isSigningOut}
										onSignOut={onSignOut}
										onTheme={onTheme}
									/>
								</div>
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
					{mobileTabs ? (
						<MobileTabBar
							items={mobileTabs}
							pathname={pathname}
							onMore={openMenu}
						/>
					) : null}
				</div>
			</div>

			<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
				<SheetContent side="left">
					<SheetHeader>
						<SheetTitle>{workplaceName}</SheetTitle>
						<SheetDescription>{roleLabel}</SheetDescription>
					</SheetHeader>
					<div className="grid flex-1 content-start gap-4 overflow-y-auto p-3">
						<NavList
							label={`${navLabel} (menu)`}
							groups={menuGroups}
							pathname={pathname}
							onNavigate={closeMenu}
						/>
						<PilotFeedback
							variant="ghost"
							workplaceId={workplaceId}
							buttonClassName={cn(ROW, "w-full justify-start font-normal")}
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
