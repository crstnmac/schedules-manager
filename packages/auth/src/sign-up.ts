import type { User } from "better-auth";

export const DUPLICATE_EMAIL_MESSAGE =
	"An account with this email already exists. Sign in instead.";

export class AuthSignUpError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "AuthSignUpError";
	}
}

export type AuthClientError = {
	code?: string;
	message?: string;
	status?: number;
	statusText?: string;
};

export type EmailSignUpResult = { token: string | null; user: User };

export interface EmailSignUpClient {
	signUp: {
		email(input: { email: string; password: string; name: string }): Promise<{
			data: EmailSignUpResult | null;
			error: AuthClientError | null;
		}>;
	};
}

export function normalizeAuthSignUpError(error: AuthClientError): Error {
	const code = error.code?.toLowerCase() ?? "";
	const message = (
		error.message ??
		error.statusText ??
		"Sign up failed."
	).toLowerCase();
	if (
		code.includes("user_already_exists") ||
		code.includes("email_already") ||
		message.includes("already registered") ||
		message.includes("already exists")
	) {
		return new AuthSignUpError(DUPLICATE_EMAIL_MESSAGE, { cause: error });
	}
	return new AuthSignUpError(
		error.message ?? error.statusText ?? "Sign up failed.",
		{ cause: error },
	);
}

export async function signUpWithEmail(
	client: EmailSignUpClient,
	email: string,
	password: string,
	name: string,
): Promise<EmailSignUpResult> {
	const { data, error } = await client.signUp.email({
		email: email.trim().toLowerCase(),
		password,
		name: name.trim(),
	});
	if (error) throw normalizeAuthSignUpError(error);
	if (!data) throw new AuthSignUpError("Sign up failed.");
	return data;
}
