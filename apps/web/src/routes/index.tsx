import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute, Navigate } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth-form";
import { useAuth } from "@/lib/auth";
import { homePath } from "@/lib/home-path";
import { useMe, usePendingInvitations } from "@/lib/queries";

export const Route = createFileRoute("/")({ component: HomeComponent });

function HomeComponent() {
	const { isLoading: authLoading, user, signOut } = useAuth();
	const me = useMe(Boolean(user));
	const pending = usePendingInvitations(Boolean(user));

	if (authLoading || (user && (me.isLoading || pending.isLoading))) {
		return (
			<main className="grid min-h-svh place-items-center">
				<Spinner />
				<span className="sr-only">Loading</span>
			</main>
		);
	}

	if (!user) return <AuthForm />;

	if (me.isError) {
		return (
			<main className="grid min-h-svh place-items-center px-4 py-16">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Something went wrong</CardTitle>
						<CardDescription>{(me.error as Error).message}</CardDescription>
					</CardHeader>
					<CardFooter>
						<Button variant="outline" onClick={() => signOut()}>
							Sign out
						</Button>
					</CardFooter>
				</Card>
			</main>
		);
	}

	return (
		<Navigate
			to={homePath({
				employments: me.data?.employments ?? [],
				pendingInvitationCount: pending.data?.invitations.length ?? 0,
			})}
			replace
		/>
	);
}
