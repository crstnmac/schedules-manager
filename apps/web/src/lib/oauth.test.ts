import { describe, expect, test } from "vitest";

import { oauthConsentRedirect } from "./oauth";

describe("oauthConsentRedirect", () => {
	test("reads the raw Better Auth redirect envelope", () => {
		expect(
			oauthConsentRedirect({
				url: "https://client.example/callback?code=abc&state=123",
			}),
		).toBe("https://client.example/callback?code=abc&state=123");
	});

	test("supports the typed redirect_uri response shape", () => {
		expect(
			oauthConsentRedirect({
				redirect_uri: "http://127.0.0.1:43123/callback?code=abc",
			}),
		).toBe("http://127.0.0.1:43123/callback?code=abc");
	});

	test("rejects a missing callback instead of navigating to undefined", () => {
		expect(() => oauthConsentRedirect({})).toThrow("no callback URL");
	});

	test("allows registered native-app callback schemes", () => {
		expect(
			oauthConsentRedirect({ url: "com.example.app:/oauth/callback" }),
		).toBe("com.example.app:/oauth/callback");
	});

	test("rejects relative and executable callback values", () => {
		expect(() => oauthConsentRedirect({ url: "undefined" })).toThrow(
			"invalid callback URL",
		);
		expect(() => oauthConsentRedirect({ url: "javascript:alert(1)" })).toThrow(
			"invalid callback URL",
		);
	});
});
