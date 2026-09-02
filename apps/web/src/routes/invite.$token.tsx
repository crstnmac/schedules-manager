import { Button } from "@SchedulesManager/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@SchedulesManager/ui/components/empty";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { MailWarningIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { AuthForm } from "@/components/auth-form";
import { CurrentProfile } from "@/components/current-profile";
import { useAuth } from "@/lib/auth";
import {
	useAcceptInvitation,
	useInvitationPreview,
	useMe,
} from "@/lib/queries";

export const Route = createFileRoute("/invite/$token")({
	component: InvitePage,
});

function InvitePage() {
	const { token } = Route.useParams();
	const { isLoading: authLoading, user, signOut } = useAuth();
	const me = useMe(Boolean(user));
	const preview = useInvitationPreview(token);
	const accept = useAcceptInvitation();
	const { mutate, isPending, isSuccess, isError } = accept;

	const invitation = preview.data;
	const canAccept = Boolean(user) && invitation?.status === "pending";

	useEffect(() => {
		if (!canAccept || isPending || isSuccess || isError) {
			return;
		}
		mutate(token);
	}, [canAccept, isError, isPending, isSuccess, mutate, token]);

	if (authLoading || preview.isLoading) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
				<Spinner />
				<span className="sr-only">Loading invitation</span>
			</main>
		);
	}

	if (preview.isError || !invitation) {
		return (
			<InviteMessage
				title="Invitation not found"
				description="This invite link is invalid. Ask your manager to send a new one."
			/>
		);
	}

	if (invitation.status === "expired") {
		return (
			<InviteMessage
				title="This invitation expired"
				description="Ask your manager to resend an invite to your email."
			/>
		);
	}

	if (invitation.status === "revoked") {
		return (
			<InviteMessage
				title="This invitation was revoked"
				description="Ask your manager to send a new invite if you still need access."
			/>
		);
	}

	if (invitation.status === "accepted" || isSuccess) {
		if (user) return <Navigate to="/" replace />;
		return (
			<InviteMessage
				title="Invitation already accepted"
				description="Sign in with the invited email to open the workplace."
				action={
					<Button nativeButton={false} render={<Link to="/" />}>
						Sign in
					</Button>
				}
			/>
		);
	}

	if (!user) {
		return (
			<AuthForm
				invite={{
					email: invitation.email,
					workplaceName: invitation.workplaceName,
					kind: invitation.kind === "manager" ? "manager" : "worker",
				}}
			/>
		);
	}

	if (isError) {
		return (
			<InviteMessage
				title="Could not accept this invitation"
				description={(accept.error as Error).message}
				profile={me.data?.profile}
				action={
					<Button variant="outline" onClick={() => void signOut()}>
						Sign in with a different account
					</Button>
				}
			/>
		);
	}

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="grid min-h-svh place-items-center"
		>
			<Spinner />
			<span className="sr-only">Accepting invitation</span>
		</main>
	);
}

function InviteMessage({
	title,
	description,
	action,
	profile,
}: {
	title: string;
	description: string;
	action?: ReactNode;
	profile?: {
		id: string;
		email: string;
		fullName: string | null;
	};
}) {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="grid min-h-svh place-items-center px-4 py-10"
		>
			<Empty className="max-w-md border border-dashed">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MailWarningIcon />
					</EmptyMedia>
					<EmptyTitle>{title}</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
				{profile || action ? (
					<EmptyContent>
						{profile ? <CurrentProfile profile={profile} /> : null}
						{action}
					</EmptyContent>
				) : null}
			</Empty>
		</main>
	);
}
