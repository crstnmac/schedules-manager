import { describe, expect, mock, test } from "bun:test";

import {
	DUPLICATE_EMAIL_MESSAGE,
	normalizeAuthSignUpError,
	signUpWithEmail,
} from "./sign-up";

describe("normalizeAuthSignUpError", () => {
	test("maps duplicate registration errors to a friendly message", () => {
		const error = normalizeAuthSignUpError({
			code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
			message: "User already registered",
			status: 400,
		});

		expect(error.message).toBe(DUPLICATE_EMAIL_MESSAGE);
	});
});

describe("signUpWithEmail", () => {
	test("normalizes email and name before calling Better Auth", async () => {
		const email = mock(async () => ({
			data: { token: "token", user: { id: "u-1" } },
			error: null,
		}));
		await signUpWithEmail(
			{ signUp: { email } } as never,
			" Person@Example.com ",
			"password",
			" Person ",
		);
		expect(email).toHaveBeenCalledWith({
			email: "person@example.com",
			password: "password",
			name: "Person",
		});
	});
});
