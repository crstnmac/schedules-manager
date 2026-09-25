import { RateLimitError } from "./errors";

export type RateLimitPolicy = {
	limit: number;
	windowMs: number;
};

export { RateLimitError };

export const defaultRateLimitPolicies = {
	invitationCreate: { limit: 30, windowMs: 10 * 60 * 1000 },
	invitationResend: { limit: 20, windowMs: 10 * 60 * 1000 },
	invitationImport: { limit: 10, windowMs: 10 * 60 * 1000 },
	directoryImport: { limit: 10, windowMs: 10 * 60 * 1000 },
	salesImport: { limit: 10, windowMs: 10 * 60 * 1000 },
	zeptomailWebhook: { limit: 120, windowMs: 60 * 1000 },
	placeSearch: { limit: 40, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof defaultRateLimitPolicies;

type Bucket = {
	count: number;
	resetAt: number;
};

const buckets = new Map<string, Bucket>();
let policies: Record<RateLimitPolicyName, RateLimitPolicy> = {
	...defaultRateLimitPolicies,
};

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
	return policies[name];
}

export function setRateLimitPoliciesForTests(
	overrides: Partial<Record<RateLimitPolicyName, RateLimitPolicy>>,
): void {
	policies = { ...defaultRateLimitPolicies, ...overrides };
}

export function resetRateLimitState(): void {
	buckets.clear();
	policies = { ...defaultRateLimitPolicies };
}

export function clientIpFromRequest(request: Request): string {
	// Only the LAST x-forwarded-for hop is appended by our trusted proxy
	// (Traefik); every earlier entry is client-supplied, so keying on the
	// first hop would let a caller rotate its own rate-limit bucket. The
	// proxy must always set x-forwarded-for for this to hold — it does by
	// default, and x-real-ip is only consulted when no proxy is present.
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const hops = forwarded
			.split(",")
			.map((hop) => hop.trim())
			.filter(Boolean);
		const last = hops[hops.length - 1];
		if (last) return last;
	}
	const realIp = request.headers.get("x-real-ip")?.trim();
	if (realIp) return realIp;
	return "unknown";
}

/** Deletes expired buckets so unique keys cannot accumulate forever. */
export function sweepExpiredRateLimits(now = Date.now()): number {
	let swept = 0;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) {
			buckets.delete(key);
			swept += 1;
		}
	}
	return swept;
}

/** Fixed-window counter. Returns false when the key has already used its limit. */
export function tryConsumeRateLimit(
	key: string,
	policy: RateLimitPolicy,
	now = Date.now(),
):
	| { allowed: true; remaining: number; resetAt: number }
	| {
			allowed: false;
			remaining: 0;
			resetAt: number;
	  } {
	const existing = buckets.get(key);
	if (!existing || existing.resetAt <= now) {
		const resetAt = now + policy.windowMs;
		buckets.set(key, { count: 1, resetAt });
		return { allowed: true, remaining: policy.limit - 1, resetAt };
	}
	if (existing.count >= policy.limit) {
		return { allowed: false, remaining: 0, resetAt: existing.resetAt };
	}
	existing.count += 1;
	return {
		allowed: true,
		remaining: policy.limit - existing.count,
		resetAt: existing.resetAt,
	};
}

export function consumeRateLimitOrThrow(
	key: string,
	policyName: RateLimitPolicyName,
	now = Date.now(),
): void {
	const result = tryConsumeRateLimit(key, getRateLimitPolicy(policyName), now);
	if (!result.allowed) {
		throw new RateLimitError();
	}
}
