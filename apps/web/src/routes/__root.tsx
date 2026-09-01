import { Toaster } from "@SchedulesManager/ui/components/sonner";
import { TooltipProvider } from "@SchedulesManager/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth";

import "../index.css";

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
				content: "jooling is a workforce scheduling application",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});

function RootComponent() {
	return (
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
}
