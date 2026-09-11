import { describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { PostHog } from "posthog-js";

import { clearAuthIdentity, identifyAuthUser } from "./auth-listener";

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

describe("Better Auth session side effects", () => {
	test("identifies the active user without clearing cached data", () => {
		const { identify, reset, posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData(["me"], { profile: { id: "u-1" } });
		identifyAuthUser(
			{
				id: "u-1",
				email: "a@x.com",
				name: "A",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{ posthog, queryClient },
		);
		expect(identify).toHaveBeenCalledWith("u-1", { email: "a@x.com" });
		expect(reset).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(["me"])).toBeDefined();
	});

	test("clears identity and all user-scoped queries on sign out", () => {
		const { reset, posthog } = makePosthog();
		const queryClient = new QueryClient();
		queryClient.setQueryData(["me"], { profile: { id: "u-1" } });
		queryClient.setQueryData(["schedule", "l-1"], { shifts: [] });
		clearAuthIdentity({ posthog, queryClient });
		expect(reset).toHaveBeenCalledTimes(1);
		expect(queryClient.getQueryData(["me"])).toBeUndefined();
		expect(queryClient.getQueryData(["schedule", "l-1"])).toBeUndefined();
	});
});
