import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/scheduling")({
	component: SchedulingRedirect,
});

function SchedulingRedirect() {
	return <Navigate to="/dashboard/settings/time-blocks" replace />;
}
