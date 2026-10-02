import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { usePostHog } from "@posthog/react";
import {
	createFileRoute,
	Navigate,
	useRouterState,
} from "@tanstack/react-router";
import {
	AlarmClockIcon,
	BarChart3Icon,
	BellIcon,
	CalendarDaysIcon,
	ClipboardListIcon,
	Clock3Icon,
	LayoutDashboardIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	Settings2Icon,
	TimerIcon,
	UsersIcon,
	WorkflowIcon,
} from "lucide-react";

import { useEffect } from "react";
import { toast } from "sonner";

import {
	AppShell,
	type ShellNavGroup,
	type ShellNavItem,
} from "@/components/app-shell";
import { profileInitials } from "@/components/current-profile";
import { settingsSectionLabel } from "@/components/settings/nav";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth";
import { hasCapability } from "@/lib/privileges";
import { useBilling, useMe, useNotifications } from "@/lib/queries";
import { useDisplayPrefs } from "@/lib/use-display-prefs";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/dashboard")({
	component: DashboardLayout,
});

const navigation = [
	{
		to: "/dashboard",
		label: "Overview",
		description: "Today at a glance",
		icon: LayoutDashboardIcon,
		exact: true,
		group: "Plan",
	},
	{
		to: "/dashboard/clock",
		label: "Clock",
		description: "Who is on the clock now",
		icon: AlarmClockIcon,
		operations: true,
		group: "Time",
	},
	{
		to: "/dashboard/schedule",
		label: "Schedule",
		description: "Build and publish the week",
		icon: CalendarDaysIcon,
		group: "Plan",
		capability: "schedule.view",
	},
	{
		to: "/dashboard/roster",
		label: "Roster",
		description: "Who works each day",
		icon: ClipboardListIcon,
		group: "Plan",
	},
	{
		to: "/dashboard/workers",
		label: "Workers",
		description: "People, pay, and access",
		icon: UsersIcon,
		group: "Team",
		capability: "workers.manage",
	},
	{
		to: "/dashboard/timeoff",
		label: "Time off",
		description: "Review requests",
		icon: Clock3Icon,
		group: "Team",
		capability: "approvals.review",
	},
	{
		to: "/dashboard/timesheets",
		label: "Timesheets",
		description: "Approve hours worked",
		icon: TimerIcon,
		operations: true,
		group: "Time",
		capability: "approvals.review",
	},
	{
		to: "/dashboard/coverage",
		label: "Coverage",
		description: "Swaps, releases, open shifts",
		icon: WorkflowIcon,
		group: "Plan",
		capability: "approvals.review",
	},
	{
		to: "/dashboard/messages",
		label: "Messages",
		description: "Conversations with your team",
		icon: MessageSquareIcon,
		group: "Team",
	},
	{
		to: "/dashboard/announcements",
		label: "Announcements",
		description: "Notices to every worker",
		icon: MegaphoneIcon,
		group: "Team",
		capability: "settings.manage",
	},
	{
		to: "/dashboard/reports",
		label: "Reports",
		description: "Attendance and labor",
		icon: BarChart3Icon,
		operations: true,
		group: "Time",
		capability: "reports.view",
	},
	{
		to: "/dashboard/activity",
		label: "Activity",
		description: "Notifications and alerts",
		icon: BellIcon,
		group: "Workspace",
		capability: "reports.view",
	},
	{
		to: "/dashboard/settings/workplace",
		label: "Settings",
		description: "Workplace settings",
		icon: Settings2Icon,
		group: "Workspace",
		match: "/dashboard/settings",
		anyCapability: [
			"settings.manage",
			"policies.manage",
			"integrations.manage",
			"schedule.manage",
			"workers.manage",
		],
	},
] as const;

const navigationGroups = [
	{ label: "Plan" },
	{ label: "Team" },
	{ label: "Time" },
] as const;

/** Reachable from the left rail instead of the sidebar. */
const railOnly: string[] = [
	"/dashboard/activity",
	"/dashboard/settings/workplace",
];

/** Shortcuts shown in the right sidebar. */
const quickLinkTargets: string[] = [
	"/dashboard/schedule",
	"/dashboard/timeoff",
	"/dashboard/workers",
	"/dashboard/announcements",
];

function navigationVisibleFor(
	item: (typeof navigation)[number],
	subject: {
		kind: "manager" | "worker" | "viewer";
		privileges: string[] | null;
	},
): boolean {
	if (!("capability" in item) || !item.capability) {
		if (!("anyCapability" in item) || !item.anyCapability) return true;
		return item.anyCapability.some((key) => hasCapability(subject, key));
	}
	return hasCapability(subject, item.capability);
}

function DashboardLayout() {
	const posthog = usePostHog();
	const { isLoading: authLoading, isSigningOut, user, signOut } = useAuth();
	const { setTheme } = useTheme();
	const me = useMe(Boolean(user));
	const { formatPerson } = useDisplayPrefs();
	const { isLoading, workplace, kind, privileges } = useWorkplace();
	const billing = useBilling(
		kind === "manager" || kind === "viewer" ? workplace?.id : undefined,
	);
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
	const isSchedule = pathname.startsWith("/dashboard/schedule");
	const isSettings = pathname.startsWith("/dashboard/settings");
	const isSubscription = pathname.startsWith(
		"/dashboard/settings/subscription",
	);
	const operationsRoute =
		pathname.startsWith("/dashboard/clock") ||
		pathname.startsWith("/dashboard/timesheets") ||
		pathname.startsWith("/dashboard/reports") ||
		pathname.startsWith("/dashboard/settings/time-clock");
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
	const subject = kind ? { kind, privileges: privileges ?? null } : null;
	const visibleNavigation = subject
		? navigation.filter((item) => navigationVisibleFor(item, subject))
		: navigation;

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
	if (billing.isLoading) {
		return (
			<main id="main-content" className="grid min-h-svh place-items-center">
				<Spinner />
				<span className="sr-only">Checking subscription</span>
			</main>
		);
	}
	if (!isSubscription && !billing.data?.capabilities.scheduling) {
		return <Navigate to="/dashboard/settings/subscription" replace />;
	}
	if (operationsRoute && !billing.data?.capabilities.operations) {
		return <Navigate to="/dashboard/settings/subscription" replace />;
	}

	const operationsLocked = !billing.data?.capabilities.operations;
	const sidebarGroups: ShellNavGroup[] = navigationGroups
		.map((group) => ({
			label: group.label,
			items: visibleNavigation
				.filter(
					(item) => item.group === group.label && !railOnly.includes(item.to),
				)
				.map((item): ShellNavItem => {
					const locked =
						"operations" in item && item.operations && operationsLocked;
					return {
						to: locked ? "/dashboard/settings/subscription" : item.to,
						label: item.label,
						description: item.description,
						icon: item.icon,
						match: "match" in item && item.match ? item.match : item.to,
						exact: "exact" in item && item.exact ? true : undefined,
						locked: locked || undefined,
					};
				}),
		}))
		.filter((group) => group.items.length > 0);
	const canSeeSettings = visibleNavigation.some(
		(item) => item.to === "/dashboard/settings/workplace",
	);
	const quickLinks = visibleNavigation
		.filter((item) => quickLinkTargets.includes(item.to))
		.map((item) => ({ to: item.to, label: item.label, icon: item.icon }));

	return (
		<AppShell
			workplaceId={workplace.id}
			workplaceName={workplace.name}
			roleLabel="Manager workspace"
			navLabel="Manager navigation"
			pathname={pathname}
			routeId={routeId}
			groups={sidebarGroups}
			home={{
				to: "/dashboard",
				label: "Overview",
				icon: LayoutDashboardIcon,
				match: "/dashboard",
			}}
			inbox={{
				to: "/dashboard/activity",
				label: "Activity",
				icon: BellIcon,
				match: "/dashboard/activity",
				unreadCount,
			}}
			settings={
				canSeeSettings
					? {
							to: "/dashboard/settings/workplace",
							label: "Settings",
							icon: Settings2Icon,
							match: "/dashboard/settings",
						}
					: undefined
			}
			profile={
				profile
					? {
							displayName,
							email: profile.fullName ? profile.email : null,
							initials: profileInitials(profile),
							kind: kind ?? "manager",
						}
					: undefined
			}
			isSigningOut={isSigningOut}
			onSignOut={() => void handleSignOut()}
			onTheme={setTheme}
			title={headerLabel}
			scheduleControls={isSchedule}
			quickLinks={quickLinks}
			notifications={inbox.data?.notifications}
		/>
	);
}
