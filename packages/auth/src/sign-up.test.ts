import { describe, expect, test } from "bun:test";

import {
	DUPLICATE_EMAIL_MESSAGE,
	isDuplicateSignUpResponse,
	normalizeAuthSignUpError,
} from "./sign-up";

describe("isDuplicateSignUpResponse", () => {
	test("detects empty identities as an existing account", () => {
		expect(
			isDuplicateSignUpResponse({
				user: { identities: [] },
				session: null,
			}),
		).toBe(true);
	});

	test("allows a new account with identities", () => {
		expect(
			isDuplicateSignUpResponse({
				user: { identities: [{ id: "identity-1" }] },
				session: null,
			}),
		).toBe(false);
	});
});

describe("normalizeAuthSignUpError", () => {
	test("maps duplicate registration errors to a friendly message", () => {
		const error = normalizeAuthSignUpError({
			name: "AuthApiError",
			message: "User already registered",
			status: 400,
		});

		expect(error.message).toBe(DUPLICATE_EMAIL_MESSAGE);
	});
});
