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
import { type ReactNode, useEffect, useRef, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { CurrentProfile } from "@/components/current-profile";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
	useAcceptInvitation,
	useInvitationPreview,
	useMe,
} from "@/lib/queries";
import {
	isVerificationRequiredError,
	resendVerificationEmail,
} from "@/lib/verify-email";

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

	// Signing out clears the query cache but not the mounted mutation
	// observer, so its error state goes stale. Reset it whenever the
	// signed-in account changes so acceptance can be re-attempted.
	const signedInUserId = user?.id ?? null;
	const lastSignedInUserId = useRef(signedInUserId);
	useEffect(() => {
		if (lastSignedInUserId.current !== signedInUserId) {
			lastSignedInUserId.current = signedInUserId;
			accept.reset();
		}
	}, [accept, signedInUserId]);

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
		const status =
			preview.error instanceof ApiError ? preview.error.status : null;
		if (
			preview.isError &&
			status !== null &&
			status !== 404 &&
			status !== 410
		) {
			return (
				<InviteMessage
					title="Couldn’t load this invitation"
					description="Check your connection and try again."
					action={
						<Button
							variant="outline"
							disabled={preview.isFetching}
							onClick={() => void preview.refetch()}
						>
							{preview.isFetching ? <Spinner data-icon="inline-start" /> : null}
							Try again
						</Button>
					}
				/>
			);
		}
		return (
			<InviteMessage
				title="Invitation not found"
				description="This invite link is invalid. Ask your manager to send a new one."
				action={
					<Button nativeButton={false} render={<Link to="/" />}>
						Sign in
					</Button>
				}
			/>
		);
	}

	if (invitation.status === "expired") {
		return (
			<InviteMessage
				title="This invitation expired"
				description="Ask your manager to resend an invite to your email."
				action={
					<Button nativeButton={false} render={<Link to="/" />}>
						Sign in
					</Button>
				}
			/>
		);
	}

	if (invitation.status === "revoked") {
		return (
			<InviteMessage
				title="This invitation was revoked"
				description="Ask your manager to send a new invite if you still need access."
				action={
					<Button nativeButton={false} render={<Link to="/" />}>
						Sign in
					</Button>
				}
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
		const error = accept.error as Error;
		if (user && isVerificationRequiredError(error)) {
			return (
				<VerifyEmailPanel
					email={user.email}
					profile={me.data?.profile}
					onRetry={() => accept.reset()}
					onSwitchAccount={() => void signOut()}
				/>
			);
		}
		return (
			<InviteMessage
				title="Could not accept this invitation"
				description={error.message}
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

function VerifyEmailPanel({
	email,
	profile,
	onRetry,
	onSwitchAccount,
}: {
	email: string;
	profile?: {
		id: string;
		email: string;
		fullName: string | null;
	};
	onRetry: () => void;
	onSwitchAccount: () => void;
}) {
	const [sending, setSending] = useState(false);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [sendFailed, setSendFailed] = useState(false);

	const resend = async () => {
		setSending(true);
		setSendFailed(false);
		try {
			const result = await resendVerificationEmail(email);
			if (result && typeof result === "object" && "error" in result) {
				if (result.error) {
					setSendFailed(true);
					return;
				}
			}
			setSentTo(email);
		} catch {
			setSendFailed(true);
		} finally {
			setSending(false);
		}
	};

	return (
		<InviteMessage
			title="Verify your email address"
			description="Confirm your email to accept this invitation. We sent a verification link when you signed up — open it, then continue here."
			profile={profile}
			action={
				<>
					{sentTo ? (
						<p className="text-muted-foreground text-sm">
							Verification email sent to {sentTo}.
						</p>
					) : sendFailed ? (
						<p className="text-destructive text-sm">
							Couldn’t send the verification email. Try again.
						</p>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button disabled={sending} onClick={() => void resend()}>
							{sending ? <Spinner data-icon="inline-start" /> : null}
							{sentTo ? "Resend verification email" : "Send verification email"}
						</Button>
						{sentTo ? (
							<Button variant="outline" onClick={onRetry}>
								I’ve verified — continue
							</Button>
						) : null}
						<Button variant="outline" onClick={onSwitchAccount}>
							Sign in with a different account
						</Button>
					</div>
				</>
			}
		/>
	);
}
