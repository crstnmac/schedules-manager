import { randomUUID } from "expo-crypto";
import { getServerUrl } from "./server-url";
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
	/** Reuse for an intentional replay of the same command and payload. */
	idempotencyKey?: string;
}

export async function api<T>(
	path: string,
	options: ApiOptions = {},
): Promise<T> {
	const idempotencyKey =
		options.method === "POST"
			? (options.idempotencyKey ?? randomUUID())
			: undefined;
	const { data } = await supabase.auth.getSession();
	const session = data.session;

	if (!session) {
		throw new ApiError(401, "You are not signed in.");
	}

	const baseUrl = getServerUrl();
	let response: Response;
	try {
		response = await fetch(`${baseUrl}${path}`, {
			method: options.method ?? "GET",
			cache: "no-store",
			headers: {
				Authorization: `Bearer ${session.access_token}`,
				...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
				...(options.body === undefined
					? {}
					: { "Content-Type": "application/json" }),
			},
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
		});
	} catch {
		throw new ApiError(
			0,
			`Could not reach ${baseUrl}. Make sure this phone is on the same Wi-Fi as your computer.`,
		);
	}

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
