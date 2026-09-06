import type { AuthResponse, SupabaseClient } from "@supabase/supabase-js";

export const DUPLICATE_EMAIL_MESSAGE =
	"An account with this email already exists. Sign in instead.";

export class AuthSignUpError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "AuthSignUpError";
	}
}

export function isDuplicateSignUpResponse(
	data: {
		session?: unknown;
		user?: { identities?: readonly unknown[] | null } | null;
	} | null,
): boolean {
	const identities = data?.user?.identities;
	return Boolean(data?.user && identities && identities.length === 0);
}

export function normalizeAuthSignUpError(error: {
	name?: string;
	message: string;
	status?: number;
}): Error {
	const message = error.message.toLowerCase();
	if (
		message.includes("already registered") ||
		message.includes("already exists") ||
		message.includes("user already registered")
	) {
		return new AuthSignUpError(DUPLICATE_EMAIL_MESSAGE, { cause: error });
	}

	if (error instanceof Error) {
		return error;
	}

	return new Error(error.message);
}

export async function signUpWithEmail(
	supabase: SupabaseClient,
	email: string,
	password: string,
): Promise<AuthResponse["data"]> {
	const normalizedEmail = email.trim().toLowerCase();
	const { data, error } = await supabase.auth.signUp({
		email: normalizedEmail,
		password,
	});

	if (error) {
		throw normalizeAuthSignUpError(error);
	}

	if (isDuplicateSignUpResponse(data)) {
		throw new AuthSignUpError(DUPLICATE_EMAIL_MESSAGE);
	}

	return data;
}
