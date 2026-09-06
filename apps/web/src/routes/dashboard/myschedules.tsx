import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/myschedules")({
	component: () => <Navigate to="/dashboard/schedule" replace />,
});
