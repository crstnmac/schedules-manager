import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/workers")({
	component: WorkersLayout,
});

function WorkersLayout() {
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<Outlet />
		</div>
	);
}
