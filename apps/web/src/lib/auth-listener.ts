import type { AuthUser } from "@SchedulesManager/auth";
import type { QueryClient } from "@tanstack/react-query";
import type { PostHog } from "posthog-js";

export interface AuthSideEffectsDeps {
	posthog: PostHog | null;
	queryClient: QueryClient;
}

export function identifyAuthUser(user: AuthUser, deps: AuthSideEffectsDeps) {
	deps.posthog?.identify(user.id, { email: user.email });
}

export function clearAuthIdentity(deps: AuthSideEffectsDeps) {
	deps.posthog?.reset();
	deps.queryClient.clear();
}
