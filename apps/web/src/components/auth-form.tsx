import { Alert, AlertDescription } from "@SchedulesManager/ui/components/alert";
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
import { Input } from "@SchedulesManager/ui/components/input";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { supabase } from "@/lib/supabase";

type Mode = "sign-in" | "sign-up";

export function AuthForm({
	title,
	description,
	defaultEmail,
}: {
	title?: string;
	description?: string;
	defaultEmail?: string;
} = {}) {
	const [mode, setMode] = useState<Mode>("sign-in");
	const [email, setEmail] = useState(defaultEmail ?? "");
	const [password, setPassword] = useState("");
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setMessage(null);
		setIsSubmitting(true);
		try {
			if (mode === "sign-in") {
				const { error: authError } = await supabase.auth.signInWithPassword({
					email: email.trim(),
					password,
				});
				if (authError) throw authError;
			} else {
				const { data, error: authError } = await supabase.auth.signUp({
					email: email.trim(),
					password,
				});
				if (authError) throw authError;
				if (!data.session)
					setMessage("Check your email to confirm your account, then sign in.");
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

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="grid min-h-svh place-items-center bg-muted/35 px-4 py-10"
		>
			<h1 className="sr-only">
				{mode === "sign-in"
					? "Sign in to jooling"
					: "Create your jooling account"}
			</h1>
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>
						{title ??
							(mode === "sign-in" ? "Welcome back" : "Create your account")}
					</CardTitle>
					<CardDescription>
						{description ??
							(mode === "sign-in"
								? "Managers set up a workplace. Workers sign in with the invited email."
								: "Use the email from your invite, or create a manager account.")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form id="auth-form" onSubmit={submit}>
						<FieldGroup>
							<Field data-invalid={Boolean(error)}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									autoComplete="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									required
									aria-invalid={Boolean(error)}
									aria-describedby={error ? "auth-error" : undefined}
								/>
							</Field>
							<Field data-invalid={Boolean(error)}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<div className="relative">
									<Input
										id="password"
										type={isPasswordVisible ? "text" : "password"}
										autoComplete={
											mode === "sign-in" ? "current-password" : "new-password"
										}
										className="pr-9"
										minLength={6}
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										required
										aria-invalid={Boolean(error)}
										aria-describedby={error ? "auth-error" : undefined}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="absolute top-0 right-0 text-muted-foreground hover:text-foreground"
										onClick={() => setIsPasswordVisible((visible) => !visible)}
										aria-label={
											isPasswordVisible ? "Hide password" : "Show password"
										}
										aria-pressed={isPasswordVisible}
									>
										{isPasswordVisible ? <EyeOff /> : <Eye />}
									</Button>
								</div>
								<FieldDescription>At least 6 characters.</FieldDescription>
							</Field>
							{error ? <FieldError id="auth-error">{error}</FieldError> : null}
							{message ? (
								<Alert>
									<AlertDescription>{message}</AlertDescription>
								</Alert>
							) : null}
						</FieldGroup>
					</form>
				</CardContent>
				<CardFooter className="flex-col gap-3">
					<Button
						className="w-full"
						disabled={isSubmitting}
						form="auth-form"
						type="submit"
					>
						{isSubmitting ? <Spinner data-icon="inline-start" /> : null}
						{isSubmitting
							? "Please wait…"
							: mode === "sign-in"
								? "Sign in"
								: "Create account"}
					</Button>
					<p className="text-center text-muted-foreground text-sm">
						{mode === "sign-in" ? "New here?" : "Already have an account?"}{" "}
						<Button
							variant="link"
							className="h-auto px-1 py-0"
							type="button"
							onClick={() => {
								setMode(mode === "sign-in" ? "sign-up" : "sign-in");
								setError(null);
								setMessage(null);
							}}
						>
							{mode === "sign-in" ? "Create an account" : "Sign in"}
						</Button>
					</p>
				</CardFooter>
			</Card>
		</main>
	);
}
