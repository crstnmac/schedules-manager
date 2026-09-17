import { Alert, AlertDescription } from "@SchedulesManager/ui/components/alert";
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
import { usePostHog } from "@posthog/react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { CurrentProfile } from "@/components/current-profile";
import { useAuth } from "@/lib/auth";
import { homePath } from "@/lib/home-path";
import {
	useAcceptInvitation,
	useMe,
	usePendingInvitations,
} from "@/lib/queries";
import {
	isVerificationRequiredError,
	resendVerificationEmail,
} from "@/lib/verify-email";

export const Route = createFileRoute("/join")({
	component: JoinPage,
});

function JoinPage() {
	const { user, signOut } = useAuth();
	const posthog = usePostHog();
	const me = useMe(Boolean(user));
	const pending = usePendingInvitations(Boolean(user));
	const accept = useAcceptInvitation();
	const [resendState, setResendState] = useState<
		"idle" | "sending" | "sent" | "failed"
	>("idle");
	const acceptError = accept.isError ? (accept.error as Error) : null;
	const needsVerification =
		acceptError !== null && isVerificationRequiredError(acceptError);

	const resend = async () => {
		if (!user?.email) return;
		setResendState("sending");
		try {
			const result = await resendVerificationEmail(user.email);
			setResendState(
				result &&
					typeof result === "object" &&
					"error" in result &&
					result.error
					? "failed"
					: "sent",
			);
		} catch {
			setResendState("failed");
		}
	};

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
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
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
		<AuthShell>
			<h1 className="sr-only">Join a workplace</h1>
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
										disabled={accept.isPending || accept.isSuccess}
										onClick={() => {
											posthog?.capture("invitation_accepted", {
												invitee_role: invitation.kind,
											});
											accept.mutate(invitation.token);
										}}
									>
										{accept.isPending &&
										accept.variables === invitation.token ? (
											<Spinner data-icon="inline-start" />
										) : null}
										Accept
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
					{acceptError ? (
						<Alert variant="destructive">
							<AlertDescription className="flex flex-col gap-2">
								<span>{acceptError.message}</span>
								{needsVerification && user?.email ? (
									<Button
										size="sm"
										variant="outline"
										disabled={resendState === "sending"}
										onClick={() => void resend()}
									>
										{resendState === "sending" ? (
											<Spinner data-icon="inline-start" />
										) : null}
										{resendState === "sent"
											? "Verification email sent"
											: "Send verification email"}
									</Button>
								) : null}
							</AlertDescription>
						</Alert>
					) : null}
					<Button variant="outline" onClick={() => void signOut()}>
						Sign out
					</Button>
				</CardContent>
			</Card>
		</AuthShell>
	);
}
