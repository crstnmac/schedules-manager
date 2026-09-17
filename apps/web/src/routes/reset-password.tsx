import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@SchedulesManager/ui/components/field";
import { Input } from "@SchedulesManager/ui/components/input";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const navigate = useNavigate();
	const token = new URLSearchParams(window.location.search).get("token");
	const providerError = new URLSearchParams(window.location.search).get(
		"error",
	);
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [complete, setComplete] = useState(false);
	const passwordRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(
		providerError || !token
			? "This password reset link is invalid or expired."
			: null,
	);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || submitting) return;
		if (password.length < 8) {
			setError("Enter a password with at least 8 characters.");
			passwordRef.current?.focus();
			return;
		}
		setSubmitting(true);
		setError(null);
		const result = await authClient.resetPassword({
			newPassword: password,
			token,
		});
		setSubmitting(false);
		if (result.error) {
			setError(result.error.message ?? "Could not reset your password.");
			return;
		}
		setComplete(true);
	}

	return (
		<AuthShell>
			<h1 className="sr-only">Reset your password</h1>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Reset your password</CardTitle>
					<CardDescription>
						{complete
							? "Your password has been changed."
							: !token || providerError
								? "This password reset link is invalid or expired. Request a new link from the sign-in page."
								: "Choose a new password with at least 8 characters."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{complete || !token || providerError ? (
						<Button
							className="w-full"
							onClick={() => void navigate({ to: "/" })}
						>
							Return to sign in
						</Button>
					) : (
						<form className="flex flex-col gap-4" onSubmit={submit} noValidate>
							<FieldGroup>
								<Field data-invalid={Boolean(error)}>
									<FieldLabel htmlFor="new-password">New password</FieldLabel>
									<Input
										ref={passwordRef}
										id="new-password"
										type="password"
										autoComplete="new-password"
										value={password}
										onChange={(event) => {
											setPassword(event.target.value);
											setError(null);
										}}
										minLength={8}
										required
										aria-invalid={Boolean(error)}
										aria-describedby={error ? "password-error" : undefined}
										disabled={!token || submitting}
									/>
									{error ? (
										<FieldError id="password-error">{error}</FieldError>
									) : null}
								</Field>
							</FieldGroup>
							<Button className="w-full" disabled={!token || submitting}>
								{submitting ? "Updating…" : "Update password"}
							</Button>
						</form>
					)}
				</CardContent>
			</Card>
		</AuthShell>
	);
}
