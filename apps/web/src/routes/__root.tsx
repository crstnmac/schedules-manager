import { Toaster } from "@SchedulesManager/ui/components/sonner";
import { TooltipProvider } from "@SchedulesManager/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { PostHogProvider } from "@posthog/react";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth";

import "../index.css";

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined;

if (import.meta.env.DEV && !posthogToken) {
	console.error(
		"VITE_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, " +
		"this causes events to be silently missed. This error stops appearing once " +
		"VITE_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
	);
}

export interface RouterAppContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{
				title: "jooling",
			},
			{
				name: "description",
				content: "jooling is fast scheduling for hourly teams",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.svg",
				type: "image/svg+xml",
			},
		],
	}),
});

function RootComponent() {
	const inner = (
		<>
			<HeadContent />
			<a
				href="#main-content"
				className="sr-only fixed top-2 left-2 z-[100] rounded-md bg-background px-3 py-2 font-medium text-foreground shadow-lg focus:not-sr-only focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				Skip to main content
			</a>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				disableTransitionOnChange
				enableSystem
				storageKey="vite-ui-theme"
			>
				<TooltipProvider>
					<AuthProvider>
						<div className="min-h-svh">
							<Outlet />
						</div>
					</AuthProvider>
				</TooltipProvider>
				<Toaster richColors />
			</ThemeProvider>
			{/* <TanStackRouterDevtools position="bottom-left" /> */}
		</>
	);

	if (!posthogToken) return inner;

	return (
		<PostHogProvider
			apiKey={posthogToken}
			options={{
				api_host: "/ingest",
				ui_host: posthogHost,
				defaults: "2026-01-30",
				capture_exceptions: true,
				debug: import.meta.env.DEV,
			}}
		>
			{inner}
		</PostHogProvider>
	);
}
