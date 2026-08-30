import { env } from "@SchedulesManager/env/web";

import { supabase } from "./supabase";

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
}

export async function api<T>(
	path: string,
	options: ApiOptions = {},
): Promise<T> {
	const { data } = await supabase.auth.getSession();
	const session = data.session;

	if (!session) {
		throw new ApiError(401, "You are not signed in.");
	}

	const response = await fetch(`${env.VITE_SERVER_URL}${path}`, {
		method: options.method ?? "GET",
		cache: "no-store",
		headers: {
			Authorization: `Bearer ${session.access_token}`,
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
	const response = await fetch(`${env.VITE_SERVER_URL}${path}`, {
		method: options.method ?? "GET",
		cache: "no-store",
		headers:
			options.body === undefined
				? undefined
				: { "Content-Type": "application/json" },
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
