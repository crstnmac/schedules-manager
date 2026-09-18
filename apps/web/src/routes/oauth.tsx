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
import { useEffect } from "react";
import { AuthForm } from "@/components/auth-form";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/oauth")({
	component: OAuthEntryComponent,
});

/**
 * Sign-in entry point for the MCP authorization flow. The API's OAuth
 * provider redirects here with the signed authorize query when the user is
 * not signed in. Once a session exists, the browser resumes the authorize
 * endpoint with the same query, which continues to consent.
 */
function OAuthEntryComponent() {
	const { isLoading, user } = useAuth();
	const search = Route.useSearch();

	const resumeAuthorize = () => {
		const query = new URLSearchParams(search as Record<string, string>);
		window.location.assign(
			`${env.VITE_SERVER_URL}/api/auth/oauth2/authorize?${query.toString()}`,
		);
	};

	useEffect(() => {
		if (!isLoading && user) resumeAuthorize();
		// biome-ignore lint/correctness/useExhaustiveDependencies: resume only
		// when the session settles; the query string is stable per navigation.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, user]);

	if (isLoading || user) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				className="grid min-h-svh place-items-center"
			>
				<Spinner />
				<span className="sr-only">Continuing authorization</span>
			</main>
		);
	}

	return (
		<main id="main-content" tabIndex={-1}>
			<AuthForm defaultMode="sign-in" />
			<Card className="mx-auto mt-4 w-full max-w-md">
				<CardHeader>
					<CardTitle>Why am I signing in?</CardTitle>
					<CardDescription>
						An application is asking for access to your jooling Workplace
						through the jooling assistant interface. Signing in lets you approve
						or deny that access.
					</CardDescription>
				</CardHeader>
				<CardFooter>
					<Button variant="ghost" size="sm" onClick={resumeAuthorize}>
						Skip to authorization
					</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
