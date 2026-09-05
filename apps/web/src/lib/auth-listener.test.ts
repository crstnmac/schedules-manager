import { describe, expect, mock, test } from "bun:test";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import type { PostHog } from "posthog-js";

import {
	type AuthSideEffectsDeps,
	applyAuthSideEffects,
} from "./auth-listener";

type MeCache = { profile: { id: string }; employments: unknown[] };

const userAMe: MeCache = {
	profile: { id: "user-a" },
	employments: [],
};

function makeSession(user?: { id: string; email?: string }): Session | null {
	return user ? ({ user } as unknown as Session) : null;
}

function makePosthog() {
	const identify =
		mock<(id: string, properties?: Record<string, unknown>) => void>();
	const reset = mock<() => void>();
	return {
		identify,
		reset,
		posthog: { identify, reset } as unknown as PostHog,
	};
}

describe("applyAuthSideEffects", () => {
	test("identifies the signed-in user and preserves the query cache", () => {
		const { identify, reset, posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData<MeCache>(["me"], userAMe);

		applyAuthSideEffects(
			"SIGNED_IN",
			makeSession({ id: "u-1", email: "a@x.com" }),
			{ posthog, queryClient },
		);

		expect(identify).toHaveBeenCalledTimes(1);
		expect(identify).toHaveBeenCalledWith("u-1", { email: "a@x.com" });
		expect(reset).not.toHaveBeenCalled();
		const cached = queryClient.getQueryData<MeCache>(["me"]);
		expect(cached).toEqual(userAMe);
	});

	test("identifies the user when the session is refreshed (TOKEN_REFRESHED)", () => {
		const { identify, reset, posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData<MeCache>(["me"], userAMe);

		applyAuthSideEffects(
			"TOKEN_REFRESHED",
			makeSession({ id: "u-1", email: "a@x.com" }),
			{ posthog, queryClient },
		);

		expect(identify).toHaveBeenCalledTimes(1);
		expect(reset).not.toHaveBeenCalled();
		expect(queryClient.getQueryData<MeCache>(["me"])).toEqual(userAMe);
	});

	test("clears the whole query cache on SIGNED_OUT so the next user sees no stale data", () => {
		const { identify, reset, posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData<MeCache>(["me"], userAMe);
		queryClient.setQueryData(["workplaces", "w-1", "workers"], { workers: [] });
		queryClient.setQueryData(["schedule", "l-1", "2026-01-05"], { shifts: [] });

		applyAuthSideEffects("SIGNED_OUT", makeSession(), { posthog, queryClient });

		expect(reset).toHaveBeenCalledTimes(1);
		expect(identify).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(["me"])).toBeUndefined();
		expect(
			queryClient.getQueryData(["workplaces", "w-1", "workers"]),
		).toBeUndefined();
		expect(
			queryClient.getQueryData(["schedule", "l-1", "2026-01-05"]),
		).toBeUndefined();
	});

	test("clears user-scoped cache for a cross-tab / refresh-failure SIGNED_OUT (regression)", () => {
		const { posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData<MeCache>(["me"], userAMe);

		applyAuthSideEffects("SIGNED_OUT", makeSession(), { posthog, queryClient });

		expect(queryClient.getQueryData(["me"])).toBeUndefined();
	});

	test("does not reset posthog or clear the cache on a non-SIGNED_OUT event without a user", () => {
		const events: AuthChangeEvent[] = [
			"INITIAL_SESSION",
			"PASSWORD_RECOVERY",
			"USER_UPDATED",
		];
		for (const event of events) {
			const { identify, reset, posthog } = makePosthog();
			const queryClient = new QueryClient();
			queryClient.setQueryData<MeCache>(["me"], userAMe);

			applyAuthSideEffects(event, makeSession(), { posthog, queryClient });

			expect(identify).not.toHaveBeenCalled();
			expect(reset).not.toHaveBeenCalled();
			expect(queryClient.getQueryData<MeCache>(["me"])).toEqual(userAMe);
		}
	});

	test("still clears the cache on SIGNED_OUT when posthog is absent", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData<MeCache>(["me"], userAMe);

		applyAuthSideEffects("SIGNED_OUT", makeSession(), {
			posthog: null,
			queryClient,
		});

		expect(queryClient.getQueryData(["me"])).toBeUndefined();
	});

	test("clearing is idempotent across repeated SIGNED_OUT events", () => {
		const { reset, posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData<MeCache>(["me"], userAMe);

		const deps: AuthSideEffectsDeps = { posthog, queryClient };
		applyAuthSideEffects("SIGNED_OUT", makeSession(), deps);
		applyAuthSideEffects("SIGNED_OUT", makeSession(), deps);

		expect(reset).toHaveBeenCalledTimes(2);
		expect(queryClient.getQueryData(["me"])).toBeUndefined();
	});

	test("signing back in after a sign-out starts from an empty cache", () => {
		const { identify, posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData<MeCache>(["me"], userAMe);

		applyAuthSideEffects("SIGNED_OUT", makeSession(), { posthog, queryClient });
		applyAuthSideEffects(
			"SIGNED_IN",
			makeSession({ id: "u-2", email: "b@x.com" }),
			{ posthog, queryClient },
		);

		expect(identify).toHaveBeenCalledWith("u-2", { email: "b@x.com" });
		expect(queryClient.getQueryData(["me"])).toBeUndefined();
	});
});
