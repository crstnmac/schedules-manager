import { env } from "@SchedulesManager/env/web";

import { supabase } from "./supabase";

// The access token is cached in memory and kept current via auth state
// changes, so each request does not pay a session-storage read.
let cachedToken: string | null = null;
let tokenPromise: Promise<string | null> | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
	cachedToken = session?.access_token ?? null;
});

async function accessToken(): Promise<string | null> {
	if (cachedToken) return cachedToken;
	if (!tokenPromise) {
		tokenPromise = supabase.auth
			.getSession()
			.then(({ data }) => {
				cachedToken = data.session?.access_token ?? null;
				return cachedToken;
			})
			.finally(() => {
				tokenPromise = null;
			});
	}
	return tokenPromise;
}

export class ApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

interface ApiOptions {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	/** Reuse for an intentional replay of the same command and payload. */
	idempotencyKey?: string;
}

export async function api<T>(
	path: string,
	options: ApiOptions = {},
): Promise<T> {
	const method = options.method ?? "GET";
	const idempotencyKey =
		method === "POST"
			? (options.idempotencyKey ?? crypto.randomUUID())
			: undefined;
	const token = await accessToken();

	if (!token) {
		throw new ApiError(401, "You are not signed in.");
	}

	const response = await fetch(`${env.VITE_SERVER_URL}${path}`, {
		method,
		// GETs may use the browser HTTP cache; writes stay uncacheable.
		cache: method === "GET" ? "default" : "no-store",
		headers: {
			Authorization: `Bearer ${token}`,
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
			...(options.body === undefined
				? {}
				: { "Content-Type": "application/json" }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});

	if (!response.ok) {
		let message = `Request failed (${response.status}).`;
		try {
			const payload = (await response.json()) as { message?: string };
			if (payload.message) message = payload.message;
		} catch {
			// keep default message
		}
		throw new ApiError(response.status, message);
	}

	return (await response.json()) as T;
}

export async function publicApi<T>(
	path: string,
	options: ApiOptions = {},
): Promise<T> {
	const method = options.method ?? "GET";
	const idempotencyKey =
		method === "POST"
			? (options.idempotencyKey ?? crypto.randomUUID())
			: undefined;
	const response = await fetch(`${env.VITE_SERVER_URL}${path}`, {
		method,
		cache: method === "GET" ? "default" : "no-store",
		headers: {
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
			...(options.body === undefined
				? {}
				: { "Content-Type": "application/json" }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});

	if (!response.ok) {
		let message = `Request failed (${response.status}).`;
		try {
			const payload = (await response.json()) as { message?: string };
			if (payload.message) message = payload.message;
		} catch {
			// keep default message
		}
		throw new ApiError(response.status, message);
	}

	return (await response.json()) as T;
}
