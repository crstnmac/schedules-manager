import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import type { PostHog } from "posthog-js";

export interface AuthSideEffectsDeps {
	posthog: PostHog | null;
	queryClient: QueryClient;
}

export function applyAuthSideEffects(
	event: AuthChangeEvent,
	session: Session | null,
	deps: AuthSideEffectsDeps,
) {
	if (session?.user) {
		deps.posthog?.identify(session.user.id, {
			email: session.user.email,
		});
	} else if (event === "SIGNED_OUT") {
		deps.posthog?.reset();
		deps.queryClient.clear();
	}
}
