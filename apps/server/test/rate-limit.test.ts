import { afterEach, describe, expect, test } from "bun:test";

import {
	RateLimitError,
	clientIpFromRequest,
	consumeRateLimitOrThrow,
	resetRateLimitState,
	setRateLimitPoliciesForTests,
	tryConsumeRateLimit,
} from "../src/rate-limit";

afterEach(() => {
	resetRateLimitState();
});

describe("rate limit", () => {
	test("allows up to the limit and rejects the next consume in the window", () => {
		const now = 1_000_000;
		const policy = { limit: 3, windowMs: 60_000 };
		expect(tryConsumeRateLimit("actor:a", policy, now).allowed).toBe(true);
		expect(tryConsumeRateLimit("actor:a", policy, now + 1).allowed).toBe(true);
		expect(tryConsumeRateLimit("actor:a", policy, now + 2).allowed).toBe(true);
		expect(tryConsumeRateLimit("actor:a", policy, now + 3)).toEqual({
			allowed: false,
			remaining: 0,
			resetAt: now + 60_000,
		});
	});

	test("tracks keys independently and resets after the window", () => {
		const now = 2_000_000;
		const policy = { limit: 1, windowMs: 10_000 };
		expect(tryConsumeRateLimit("a", policy, now).allowed).toBe(true);
		expect(tryConsumeRateLimit("b", policy, now).allowed).toBe(true);
		expect(tryConsumeRateLimit("a", policy, now + 1).allowed).toBe(false);
		expect(tryConsumeRateLimit("a", policy, now + 10_000).allowed).toBe(true);
	});

	test("consumeRateLimitOrThrow uses named policies and throws RateLimitError", () => {
		setRateLimitPoliciesForTests({
			invitationCreate: { limit: 2, windowMs: 60_000 },
		});
		consumeRateLimitOrThrow("manager:1", "invitationCreate");
		consumeRateLimitOrThrow("manager:1", "invitationCreate");
		expect(() =>
			consumeRateLimitOrThrow("manager:1", "invitationCreate"),
		).toThrow(RateLimitError);
	});

	test("clientIpFromRequest prefers the first x-forwarded-for hop", () => {
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/webhooks/zeptomail", {
					headers: {
						"x-forwarded-for": "203.0.113.9, 10.0.0.1",
						"x-real-ip": "10.0.0.1",
					},
				}),
			),
		).toBe("203.0.113.9");
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/webhooks/zeptomail"),
			),
		).toBe("unknown");
	});
});
