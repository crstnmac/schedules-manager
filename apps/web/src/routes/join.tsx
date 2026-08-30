import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@SchedulesManager/ui/components/item";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute, Navigate } from "@tanstack/react-router";

import { CurrentProfile } from "@/components/current-profile";
import { useAuth } from "@/lib/auth";
import { homePath } from "@/lib/home-path";
import {
	useAcceptInvitation,
	useMe,
	usePendingInvitations,
} from "@/lib/queries";

export const Route = createFileRoute("/join")({
	component: JoinPage,
});

function JoinPage() {
	const { user, signOut } = useAuth();
	const me = useMe(Boolean(user));
	const pending = usePendingInvitations(Boolean(user));
	const accept = useAcceptInvitation();

	if (!user) return <Navigate to="/" replace />;
	if (me.data && me.data.employments.length > 0) {
		return (
			<Navigate
				to={homePath({
					employments: me.data.employments,
					pendingInvitationCount: 0,
				})}
				replace
			/>
		);
	}

	if (me.isLoading || pending.isLoading) {
		return (
			<main className="grid min-h-svh place-items-center">
				<Spinner />
				<span className="sr-only">Loading invitations</span>
			</main>
		);
	}

	const invitations = pending.data?.invitations ?? [];

	if (invitations.length === 0) {
		return <Navigate to="/" replace />;
	}

	return (
		<main className="grid min-h-svh place-items-center bg-muted/35 px-4 py-10">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>You've been invited</CardTitle>
					<CardDescription>
						Accept an invitation to join your workplace. Workers don't create a
						workplace — a manager invites you.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{me.data?.profile ? (
						<CurrentProfile profile={me.data.profile} />
					) : null}
					<ItemGroup>
						{invitations.map((invitation) => (
							<Item key={invitation.id} variant="outline" role="listitem">
								<ItemContent>
									<ItemTitle>{invitation.workplaceName}</ItemTitle>
									<ItemDescription>
										Invited as {invitation.kind} · expires{" "}
										{new Date(invitation.expiresAt).toLocaleDateString()}
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									<Button
										size="sm"
										disabled={accept.isPending}
										onClick={() => accept.mutate(invitation.token)}
									>
										{accept.isPending ? (
											<Spinner data-icon="inline-start" />
										) : null}
										Accept
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
					{accept.isError ? (
						<p className="text-destructive text-sm">
							{(accept.error as Error).message}
						</p>
					) : null}
					<Button variant="outline" onClick={() => void signOut()}>
						Sign out
					</Button>
				</CardContent>
			</Card>
		</main>
	);
}
