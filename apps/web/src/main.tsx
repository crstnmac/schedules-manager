import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Data is considered fresh for a short window so remounts and tab
			// focus do not storm the API; volatile screens opt out per hook.
			staleTime: 30_000,
			// Keep inactive data around so back/forward and tab switches paint
			// instantly from cache while a background refetch runs.
			gcTime: 10 * 60_000,
			retry: 1,
			refetchOnMount: true,
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
		},
	},
});

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	// Hovering/touching a link warms the route chunk; treat it as fresh briefly.
	defaultPreloadDelay: 50,
	defaultPreloadStaleTime: 30_000,
	scrollRestoration: true,
	defaultPendingComponent: () => <Loader />,
	context: { queryClient },
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}
