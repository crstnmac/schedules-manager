import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { usePostHog } from "@posthog/react";
import {
	createFileRoute,
	Navigate,
	useRouterState,
} from "@tanstack/react-router";
import {
	BellIcon,
	CalendarDaysIcon,
	Clock3Icon,
	InboxIcon,
	type LucideIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	TimerIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";

import { AppShell, type ShellNavGroup } from "@/components/app-shell";
import { profileInitials } from "@/components/current-profile";
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
	description: string;
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
				description: "Your upcoming shifts",
				icon: CalendarDaysIcon,
				exact: true,
			},
			{
				to: "/worker/timecard",
				label: "Timecard",
				description: "Hours you have worked",
				icon: TimerIcon,
				operations: true,
			},
			{
				to: "/worker/openshifts",
				label: "Open shifts",
				description: "Pick up extra work",
				icon: InboxIcon,
			},
		],
	},
	{
		label: "Requests",
		items: [
			{
				to: "/worker/availability",
				label: "Time off & availability",
				description: "Requests and unavailability",
				icon: Clock3Icon,
			},
		],
	},
	{
		label: "Team",
		items: [
			{
				to: "/worker/messages",
				label: "Messages",
				description: "Conversations with your team",
				icon: MessageSquareIcon,
			},
			{
				to: "/worker/announcements",
				label: "Announcements",
				description: "Notices from your managers",
				icon: MegaphoneIcon,
			},
			{
				to: "/worker/inbox",
				label: "Inbox",
				description: "Notifications and alerts",
				icon: BellIcon,
			},
		],
	},
];

const navigation = navigationGroups.flatMap((group) => group.items);

const primaryTabs = [
	"/worker",
	"/worker/openshifts",
	"/worker/availability",
	"/worker/messages",
];
const shortTabLabels: Record<string, string> = {
	"/worker": "Schedule",
	"/worker/availability": "Requests",
};

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
	const handleSignOut = useCallback(() => {
		void signOut().catch((error: unknown) => {
			toast.error(
				error instanceof Error ? error.message : "Could not sign out",
			);
		});
	}, [signOut]);
	const sidebarGroups = useMemo<ShellNavGroup[]>(
		() =>
			navigationGroups
				.map((group) => ({
					label: group.label,
					items: group.items
						.filter(
							(item) =>
								item.to !== "/worker/inbox" &&
								(!item.operations || showTimecard),
						)
						.map((item) => ({
							to: item.to,
							label: item.label,
							description: item.description,
							icon: item.icon,
							match: item.to,
							exact: item.exact,
						})),
				}))
				.filter((group) => group.items.length > 0),
		[showTimecard],
	);
	const mobileTabs = useMemo(
		() =>
			primaryTabs
				.map((to) =>
					sidebarGroups.flatMap((g) => g.items).find((i) => i.to === to),
				)
				.filter((item): item is NonNullable<typeof item> => Boolean(item))
				.map((item) => ({
					...item,
					label: shortTabLabels[String(item.to)] ?? item.label,
				})),
		[sidebarGroups],
	);
	const inboxLink = useMemo(
		() => ({
			to: "/worker/inbox" as const,
			label: "Inbox",
			icon: BellIcon,
			match: "/worker/inbox",
			unreadCount,
		}),
		[unreadCount],
	);
	const shellProfile = useMemo(
		() =>
			profile
				? {
						displayName,
						email: profile.fullName ? profile.email : null,
						initials: profileInitials(profile),
						kind: "Worker",
					}
				: undefined,
		[profile, displayName],
	);

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
		<AppShell
			workplaceId={workplace.id}
			workplaceName={workplace.name}
			roleLabel="Worker"
			navLabel="Worker navigation"
			pathname={pathname}
			routeId={routeId}
			groups={sidebarGroups}
			inbox={inboxLink}
			profile={shellProfile}
			isSigningOut={isSigningOut}
			onSignOut={handleSignOut}
			onTheme={setTheme}
			mobileTabs={mobileTabs}
		/>
	);
}
