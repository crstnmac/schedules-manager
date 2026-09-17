import { afterEach, describe, expect, test } from "bun:test";

import {
	clientIpFromRequest,
	consumeRateLimitOrThrow,
	RateLimitError,
	resetRateLimitState,
	setRateLimitPoliciesForTests,
	sweepExpiredRateLimits,
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

	test("sweepExpiredRateLimits deletes only expired buckets", () => {
		const now = 3_000_000;
		const policy = { limit: 1, windowMs: 10_000 };
		tryConsumeRateLimit("expired", policy, now);
		tryConsumeRateLimit("live", policy, now + 5_000);
		expect(sweepExpiredRateLimits(now + 10_000)).toBe(1);
		// The live bucket must survive the sweep with its budget intact.
		expect(tryConsumeRateLimit("live", policy, now + 10_000).allowed).toBe(
			false,
		);
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

	test("clientIpFromRequest keys on the last (trusted-proxy-appended) x-forwarded-for hop", () => {
		// The trusted proxy appends the real client IP as the final hop; earlier
		// entries are client-supplied and must not influence the limit key.
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/webhooks/zeptomail", {
					headers: {
						"x-forwarded-for": "203.0.113.9, 10.0.0.1",
						"x-real-ip": "10.0.0.1",
					},
				}),
			),
		).toBe("10.0.0.1");
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/kiosk/clock", {
					headers: {
						"x-forwarded-for": "203.0.113.9, 198.51.100.7, 10.0.0.1",
					},
				}),
			),
		).toBe("10.0.0.1");
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/webhooks/zeptomail"),
			),
		).toBe("unknown");
	});

	test("clientIpFromRequest falls back to x-real-ip when x-forwarded-for is absent", () => {
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/kiosk/clock", {
					headers: { "x-real-ip": "198.51.100.42" },
				}),
			),
		).toBe("198.51.100.42");
		// Whitespace is trimmed, matching the helper's contract.
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/kiosk/clock", {
					headers: { "x-real-ip": "  198.51.100.42  " },
				}),
			),
		).toBe("198.51.100.42");
		// An empty x-forwarded-for value still falls through to x-real-ip.
		expect(
			clientIpFromRequest(
				new Request("http://localhost/v1/kiosk/clock", {
					headers: {
						"x-forwarded-for": "",
						"x-real-ip": "198.51.100.42",
					},
				}),
			),
		).toBe("198.51.100.42");
	});
});
