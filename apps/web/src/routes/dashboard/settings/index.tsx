import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/")({
	component: SettingsIndex,
});

function SettingsIndex() {
	return <Navigate to="/dashboard/settings/workplace" replace />;
}
