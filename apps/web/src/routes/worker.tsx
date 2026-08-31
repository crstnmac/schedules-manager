import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import { Separator } from "@SchedulesManager/ui/components/separator";
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
} from "lucide-react";
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
	{ to: "/worker/availability", label: "Availability", icon: Clock3Icon },
	{ to: "/worker/openshifts", label: "Open shifts", icon: InboxIcon },
	{ to: "/worker/inbox", label: "Inbox", icon: BellIcon },
] as const;

function WorkerLayout() {
	const { isSigningOut, user, signOut } = useAuth();
	const me = useMe(Boolean(user));
	const { isLoading, workplace, kind } = useWorkplace();
	const inbox = useNotifications(workplace?.id);
	const unreadCount = inbox.data?.unreadCount ?? 0;
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
	if (isLoading) {
		return (
			<main className="grid min-h-svh place-items-center">
				<Spinner />
				<span className="sr-only">Loading</span>
			</main>
		);
	}
	if (!workplace) return <Navigate to="/" replace />;
	if (kind === "manager") return <Navigate to="/dashboard" replace />;

	return (
		<div className="flex min-h-svh flex-col bg-background">
			<header className="border-b">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
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
					<nav className="flex flex-wrap gap-1">
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
			<Separator />
			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-6">
				<Outlet />
			</main>
		</div>
	);
}
