import { signUpWithEmail } from "@SchedulesManager/auth";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@SchedulesManager/ui/components/alert";
import { Badge } from "@SchedulesManager/ui/components/badge";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@SchedulesManager/ui/components/input-group";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@SchedulesManager/ui/components/tabs";
import { usePostHog } from "@posthog/react";
import {
	CalendarDaysIcon,
	EyeIcon,
	EyeOffIcon,
	MailIcon,
	UserIcon,
	UserPlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

const copy = {
	"sign-in": {
		title: "Welcome back",
		description:
			"Sign in with the email tied to your workplace — manager or worker.",
		submit: "Sign in",
		submitting: "Signing in…",
	},
	"sign-up": {
		title: "Create your account",
		description:
			"Managers use this to set up a workplace. Workers should use their invite link instead.",
		submit: "Create account",
		submitting: "Creating account…",
	},
} as const;

export function AuthForm({
	title,
	description,
	defaultEmail,
	defaultMode = "sign-in",
	invite,
}: {
	title?: string;
	description?: string;
	defaultEmail?: string;
	defaultMode?: Mode;
	invite?: {
		email: string;
		workplaceName: string;
		kind: "worker" | "manager";
	};
} = {}) {
	const [mode, setMode] = useState<Mode>(defaultMode);
	const lockedEmail = invite?.email ?? defaultEmail;
	const [email, setEmail] = useState(lockedEmail ?? "");
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [resetSending, setResetSending] = useState(false);
	const [resetSent, setResetSent] = useState(false);

	const posthog = usePostHog();
	const isInvite = Boolean(invite);
	const emailLocked = Boolean(lockedEmail) && isInvite;
	const activeCopy = copy[mode];
	useEffect(() => {
		document.title = `${mode === "sign-in" ? "Sign in" : "Create account"} · jooling`;
	}, [mode]);
	const inviteTitle = title ?? (invite ? `Join ${invite.workplaceName}` : null);
	const inviteDescription =
		description ??
		(invite
			? mode === "sign-up"
				? `Create an account with ${invite.email} to accept this ${invite.kind} invitation.`
				: `Sign in with ${invite.email} to accept this ${invite.kind} invitation.`
			: null);

	async function handleResetPassword() {
		if (resetSending) return;
		const target = (lockedEmail ?? email).trim();
		if (!target) {
			setError("Enter your email first, then tap Forgot password.");
			return;
		}
		setResetSending(true);
		setError(null);
		try {
			const { error: resetError } = await authClient.requestPasswordReset({
				email: target.toLowerCase(),
				redirectTo: `${window.location.origin}/reset-password`,
			});
			if (resetError) {
				setError(
					"Couldn't send the reset email right now. Check the address and try again.",
				);
				return;
			}
			setResetSent(true);
		} finally {
			setResetSending(false);
		}
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setMessage(null);
		setIsSubmitting(true);
		const submitEmail = (lockedEmail ?? email).trim().toLowerCase();
		try {
			if (mode === "sign-in") {
				const { data: authData, error: authError } =
					await authClient.signIn.email({
						email: submitEmail,
						password,
					});
				if (authError) throw new Error(authError.message ?? "Sign in failed.");
				if (authData.user) {
					posthog?.identify(authData.user.id, { email: authData.user.email });
					posthog?.capture("user_signed_in", {
						invite_flow: isInvite,
					});
				}
			} else {
				const data = await signUpWithEmail(
					authClient,
					submitEmail,
					password,
					name,
				);
				if (data.user) {
					posthog?.identify(data.user.id, { email: data.user.email });
					posthog?.capture("user_signed_up", {
						invite_flow: isInvite,
						email_confirmation_required: !data.token,
					});
				}
				if (!data.token) {
					setMessage("Check your email to confirm your account, then sign in.");
				}
			}
		} catch (caughtError) {
			setError(
				caughtError instanceof Error
					? caughtError.message
					: "Something went wrong. Please try again.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	function switchMode(nextMode: Mode) {
		setMode(nextMode);
		setError(null);
		setMessage(null);
	}

	return (
		<AuthShell>
			<h1 className="sr-only">
				{mode === "sign-in"
					? "Sign in to jooling"
					: "Create your jooling account"}
			</h1>
			<Card className="w-full max-w-md">
				<CardHeader className="flex flex-col gap-4">
					{isInvite ? (
						<div className="flex flex-col gap-2">
							<Badge variant="secondary">Workplace invite</Badge>
							<CardTitle>{inviteTitle}</CardTitle>
							<CardDescription>{inviteDescription}</CardDescription>
						</div>
					) : null}
					<Tabs
						value={mode}
						onValueChange={(value) => switchMode(value as Mode)}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="sign-in">Sign in</TabsTrigger>
							<TabsTrigger value="sign-up">Create account</TabsTrigger>
						</TabsList>
					</Tabs>
				</CardHeader>

				<CardContent className="flex flex-col gap-4">
					{!isInvite ? (
						<div className="flex flex-col gap-2">
							<CardTitle>{activeCopy.title}</CardTitle>
							<CardDescription>{activeCopy.description}</CardDescription>
						</div>
					) : null}
					{mode === "sign-up" && isInvite && invite ? (
						<Alert>
							<UserPlusIcon />
							<AlertTitle>Joining this workplace</AlertTitle>
							<AlertDescription>
								Use the invited email. After you create an account, you&apos;ll
								join {invite.workplaceName}.
							</AlertDescription>
						</Alert>
					) : null}
					{mode === "sign-up" && !isInvite ? (
						<Alert>
							<UserPlusIcon />
							<AlertTitle>Setting up as a manager</AlertTitle>
							<AlertDescription>
								After you create an account, you&apos;ll configure your first
								workplace, location, and position.
							</AlertDescription>
						</Alert>
					) : null}

					<form id="auth-form" onSubmit={submit}>
						<FieldGroup>
							{mode === "sign-up" ? (
								<Field>
									<FieldLabel htmlFor="name">Name</FieldLabel>
									<InputGroup>
										<InputGroupAddon align="inline-start">
											<UserIcon />
										</InputGroupAddon>
										<InputGroupInput
											id="name"
											autoComplete="name"
											value={name}
											onChange={(event) => setName(event.target.value)}
											required
										/>
									</InputGroup>
								</Field>
							) : null}
							<Field data-invalid={Boolean(error)}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<InputGroup>
									<InputGroupAddon align="inline-start">
										<MailIcon />
									</InputGroupAddon>
									<InputGroupInput
										id="email"
										type="email"
										autoComplete="email"
										placeholder="you@workplace.com"
										value={email}
										onChange={(event) => {
											if (!emailLocked) setEmail(event.target.value);
										}}
										required
										readOnly={emailLocked}
										aria-readonly={emailLocked || undefined}
										aria-invalid={Boolean(error)}
										aria-describedby={
											[
												error ? "auth-error" : null,
												emailLocked ? "invite-email-hint" : null,
											]
												.filter(Boolean)
												.join(" ") || undefined
										}
									/>
								</InputGroup>
								{emailLocked ? (
									<FieldDescription id="invite-email-hint">
										This invitation was sent to this address.
									</FieldDescription>
								) : null}
							</Field>

							<Field data-invalid={Boolean(error)}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<InputGroup>
									<InputGroupInput
										id="password"
										type={isPasswordVisible ? "text" : "password"}
										autoComplete={
											mode === "sign-in" ? "current-password" : "new-password"
										}
										placeholder={
											mode === "sign-up" ? "At least 8 characters" : undefined
										}
										minLength={mode === "sign-up" ? 8 : undefined}
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										required
										aria-invalid={Boolean(error)}
										aria-describedby={error ? "auth-error" : undefined}
									/>
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											aria-label={
												isPasswordVisible ? "Hide password" : "Show password"
											}
											aria-pressed={isPasswordVisible}
											onClick={() =>
												setIsPasswordVisible((visible) => !visible)
											}
										>
											{isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
										</InputGroupButton>
									</InputGroupAddon>
								</InputGroup>
								{mode === "sign-up" ? (
									<FieldDescription>
										Use at least 8 characters.
									</FieldDescription>
								) : null}
							</Field>

							{error ? <FieldError id="auth-error">{error}</FieldError> : null}
							{mode === "sign-in" ? (
								<Button
									type="button"
									variant="link"
									size="sm"
									className="-ml-2 self-start px-2"
									disabled={isSubmitting || resetSending}
									onClick={() => void handleResetPassword()}
								>
									{resetSending ? <Spinner data-icon="inline-start" /> : null}
									Forgot password?
								</Button>
							) : null}
							{resetSent ? (
								<Alert>
									<MailIcon />
									<AlertTitle>Check your email</AlertTitle>
									<AlertDescription>
										If an account exists for {email.trim()}, a password reset
										link is on its way. It can take a minute to arrive.
									</AlertDescription>
								</Alert>
							) : null}
							{message ? (
								<Alert>
									<CalendarDaysIcon />
									<AlertTitle>Confirm your email</AlertTitle>
									<AlertDescription>{message}</AlertDescription>
								</Alert>
							) : null}
						</FieldGroup>
					</form>
				</CardContent>

				<CardFooter>
					<Button
						className="w-full"
						disabled={isSubmitting}
						form="auth-form"
						type="submit"
					>
						{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
						{isSubmitting ? activeCopy.submitting : activeCopy.submit}
					</Button>
				</CardFooter>
			</Card>
		</AuthShell>
	);
}
