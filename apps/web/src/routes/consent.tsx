import { env } from "@SchedulesManager/env/web";
import { Button } from "@SchedulesManager/ui/components/button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@SchedulesManager/ui/components/card";
import { Spinner } from "@SchedulesManager/ui/components/spinner";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	OAuthConsentScopes,
	REQUIRED_OAUTH_SCOPES,
} from "@/components/oauth-consent-scopes";
import { useAuth } from "@/lib/auth";
import { oauthConsentRedirect } from "@/lib/oauth";

export const Route = createFileRoute("/consent")({
	validateSearch: (search: Record<string, unknown>) => ({
		client_id: typeof search.client_id === "string" ? search.client_id : "",
		scope: typeof search.scope === "string" ? search.scope : "",
	}),
	component: ConsentComponent,
});

function ConsentComponent() {
	const { isLoading, user } = useAuth();
	const search = Route.useSearch();
	const [decision, setDecision] = useState<"pending" | "working">("pending");
	const [error, setError] = useState<string | null>(null);
	const [denied, setDenied] = useState(false);

	const requestedScopes = (search.scope ?? "").split(" ").filter(Boolean);
	const [selectedScopes, setSelectedScopes] = useState(() => requestedScopes);

	function toggleScope(scope: string, selected: boolean) {
		if (REQUIRED_OAUTH_SCOPES.has(scope)) return;
		setSelectedScopes((current) =>
			selected
				? requestedScopes.filter(
						(requestedScope) =>
							requestedScope === scope || current.includes(requestedScope),
					)
				: current.filter((selectedScope) => selectedScope !== scope),
		);
	}

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
						scope: accept ? selectedScopes.join(" ") : undefined,
						oauth_query: window.location.search.slice(1),
					}),
				},
			);
			if (!response.ok) {
				throw new Error(`The server rejected the request (${response.status})`);
			}
			const result = (await response.json()) as {
				redirect_uri?: unknown;
				url?: unknown;
			};
			window.location.assign(oauthConsentRedirect(result));
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
						<OAuthConsentScopes
							requestedScopes={requestedScopes}
							selectedScopes={selectedScopes}
							onToggle={toggleScope}
						/>
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
