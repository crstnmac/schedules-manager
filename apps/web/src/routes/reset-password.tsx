import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Input } from "@SchedulesManager/ui/components/input";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

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
	const [error, setError] = useState<string | null>(
		providerError || !token
			? "This password reset link is invalid or expired."
			: null,
	);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!token || submitting) return;
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
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Reset your password</CardTitle>
					<CardDescription>
						{complete
							? "Your password has been changed."
							: "Choose a new password with at least 8 characters."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{complete ? (
						<Button
							className="w-full"
							onClick={() => void navigate({ to: "/" })}
						>
							Return to sign in
						</Button>
					) : (
						<form className="space-y-4" onSubmit={submit}>
							<Input
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder="New password"
								minLength={8}
								required
								disabled={!token || submitting}
							/>
							{error ? (
								<p className="text-destructive text-sm" role="alert">
									{error}
								</p>
							) : null}
							<Button
								className="w-full"
								disabled={!token || password.length < 8 || submitting}
							>
								{submitting ? "Updating…" : "Update password"}
							</Button>
						</form>
					)}
				</CardContent>
			</Card>
		</AuthShell>
	);
}
