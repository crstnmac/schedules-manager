import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

/**
 * Accepting an invitation is blocked until the signed-in account has verified
 * its email address; the server says so with a 403 carrying this message.
 */
export function isVerificationRequiredError(error: unknown): boolean {
	return (
		error instanceof ApiError &&
		error.status === 403 &&
		/verify your email/i.test(error.message)
	);
}

/**
 * Asks the server to send (or resend) the verification email for the given
 * account via Better Auth's /send-verification-email endpoint. The callback
 * returns the user to this web origin after the verification link is opened
 * (the web origin is a trusted origin in the server auth config).
 */
export function resendVerificationEmail(email: string): Promise<unknown> {
	return authClient.sendVerificationEmail({
		email,
		callbackURL: window.location.origin,
	});
}
