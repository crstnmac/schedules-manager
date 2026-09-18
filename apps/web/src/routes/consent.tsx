import { env } from "@SchedulesManager/env/web";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Checkbox } from "@SchedulesManager/ui/components/checkbox";
import { Label } from "@SchedulesManager/ui/components/label";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/consent")({
	validateSearch: (search: Record<string, unknown>) => ({
		client_id: typeof search.client_id === "string" ? search.client_id : "",
		scope: typeof search.scope === "string" ? search.scope : "",
	}),
	component: ConsentComponent,
});

const SCOPE_LABELS: Record<string, string> = {
	openid: "Confirm who you are",
	profile: "See your basic profile",
	email: "See your email address",
	offline_access: "Stay connected without asking again",
	"schedule.read": "View published schedules and drafts",
	"schedule.write": "Create and change draft schedules, and publish them",
	"workers.read": "View workers, availability, and wage rates",
	"reports.read": "View labor hours and cost reports",
	"requests.read": "View time-off requests",
	"requests.write": "Submit and update time-off requests",
};

function ConsentComponent() {
	const { isLoading, user } = useAuth();
	const search = Route.useSearch();
	const [decision, setDecision] = useState<"pending" | "working">("pending");
	const [error, setError] = useState<string | null>(null);
	const [denied, setDenied] = useState(false);

	const requestedScopes = (search.scope ?? "").split(" ").filter(Boolean);

	async function respond(accept: boolean) {
		setDecision("working");
		setError(null);
		try {
			const response = await fetch(
				`${env.VITE_SERVER_URL}/api/auth/oauth2/consent`,
				{
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						accept,
						oauth_query: window.location.search.slice(1),
					}),
				},
			);
			if (!response.ok) {
				throw new Error(`The server rejected the request (${response.status})`);
			}
			const result = (await response.json()) as { redirect_uri: string };
			window.location.assign(result.redirect_uri);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Something went wrong.",
			);
			setDecision("pending");
			if (!accept) setDenied(true);
		}
	}

	if (isLoading) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
				<Spinner />
			</main>
		);
	}

	if (!user) {
		// The authorize flow guarantees a session before consent; if it was
		// lost, restart the flow.
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center px-4"
			>
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Sign in required</CardTitle>
						<CardDescription>
							Your session expired. Restart the connection from the application
							that asked for access.
						</CardDescription>
					</CardHeader>
				</Card>
			</main>
		);
	}

	if (denied) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center px-4"
			>
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Access denied</CardTitle>
						<CardDescription>
							The application was not given access. You can close this window.
						</CardDescription>
					</CardHeader>
				</Card>
			</main>
		);
	}

	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="grid min-h-svh place-items-center px-4 py-16"
		>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Authorize access?</CardTitle>
					<CardDescription>
						An application wants to connect to your jooling Workplace as{" "}
						{user.name || user.email}. Review what it can do:
					</CardDescription>
				</CardHeader>
				<CardFooter className="flex-col items-start gap-4">
					<fieldset
						className="w-full space-y-3"
						disabled={decision === "working"}
					>
						{requestedScopes.map((scope) => (
							<div key={scope} className="flex items-start gap-3">
								<Checkbox id={`scope-${scope}`} defaultChecked disabled />
								<Label
									htmlFor={`scope-${scope}`}
									className="font-normal leading-snug"
								>
									{SCOPE_LABELS[scope] ?? scope}
								</Label>
							</div>
						))}
					</fieldset>
					{error ? <p className="text-destructive text-sm">{error}</p> : null}
					<div className="flex w-full gap-2">
						<Button
							variant="outline"
							className="flex-1"
							disabled={decision === "working"}
							onClick={() => {
								void respond(false);
							}}
						>
							Deny
						</Button>
						<Button
							className="flex-1"
							disabled={decision === "working"}
							onClick={() => {
								void respond(true);
							}}
						>
							{decision === "working" ? "Working…" : "Allow access"}
						</Button>
					</div>
				</CardFooter>
			</Card>
		</main>
	);
}
