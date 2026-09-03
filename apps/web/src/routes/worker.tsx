import { Badge } from "@SchedulesManager/ui/components/badge";
import { usePostHog } from "@posthog/react";
import { Button } from "@SchedulesManager/ui/components/button";
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
	InboxIcon,
	LogOutIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	TimerIcon,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { CurrentProfile } from "@/components/current-profile";
import { ModeToggle } from "@/components/mode-toggle";
import { useAuth } from "@/lib/auth";
import { useMe, useNotifications } from "@/lib/queries";
import { useWorkplace } from "@/lib/use-workplace";

export const Route = createFileRoute("/worker")({
	component: WorkerLayout,
});

const navigation = [
	{ to: "/worker", label: "My schedule", icon: CalendarDaysIcon, exact: true },
	{ to: "/worker/availability", label: "Time off", icon: Clock3Icon },
	{ to: "/worker/openshifts", label: "Open shifts", icon: InboxIcon },
	{ to: "/worker/timecard", label: "Timecard", icon: TimerIcon },
	{ to: "/worker/messages", label: "Messages", icon: MessageSquareIcon },
	{ to: "/worker/announcements", label: "Announcements", icon: MegaphoneIcon },
	{ to: "/worker/inbox", label: "Inbox", icon: BellIcon },
] as const;

function WorkerLayout() {
	const posthog = usePostHog();
	const { isSigningOut, user, signOut } = useAuth();
	const me = useMe(Boolean(user));
	const { isLoading, workplace, kind } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const unreadCount = inbox.data?.unreadCount ?? 0;
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const activePage =
		navigation.find((item) =>
			"exact" in item && item.exact
				? pathname === item.to
				: pathname.startsWith(item.to),
		)?.label ?? "My schedule";
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

	return (
		<div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
			<header className="shrink-0 border-b">
				<div className="flex flex-col gap-3 px-4 py-3">
					<div className="flex items-center justify-between gap-2 sm:gap-3">
						<div className="min-w-0">
							<p className="truncate font-medium text-lg">{workplace.name}</p>
							<p className="text-muted-foreground text-sm">Your schedule</p>
						</div>
						<div className="flex items-center gap-2">
							<ModeToggle />
							<Button
								aria-label={isSigningOut ? "Signing out" : "Sign out"}
								variant="outline"
								size="icon-sm"
								className="sm:w-auto sm:px-3"
								disabled={isSigningOut}
								onClick={() => void handleSignOut()}
							>
								{isSigningOut ? (
									<Spinner data-icon="inline-start" />
								) : (
									<LogOutIcon data-icon="inline-start" />
								)}
								<span className="hidden sm:inline">
									{isSigningOut ? "Signing out…" : "Sign out"}
								</span>
							</Button>
						</div>
					</div>
					{me.data?.profile ? (
						<CurrentProfile profile={me.data.profile} kind="worker" />
					) : null}
					<nav aria-label="Worker navigation" className="flex flex-wrap gap-1">
						{navigation.map((item) => {
							const active =
								"exact" in item && item.exact
									? pathname === item.to
									: pathname.startsWith(item.to);
							return (
								<Button
									key={item.to}
									size="sm"
									variant={active ? "secondary" : "ghost"}
									aria-current={active ? "page" : undefined}
									nativeButton={false}
									render={<Link to={item.to} />}
								>
									<item.icon data-icon="inline-start" />
									{item.label}
									{item.to === "/worker/inbox" && unreadCount > 0 ? (
										<Badge variant="secondary">{unreadCount}</Badge>
									) : null}
								</Button>
							);
						})}
					</nav>
				</div>
			</header>
			<main
				id="main-content"
				tabIndex={-1}
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			>
				<Outlet />
			</main>
		</div>
	);
}
