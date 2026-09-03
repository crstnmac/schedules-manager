import { afterEach, describe, expect, test } from "bun:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("sendInvitationEmail", () => {
	test("surfaces ZeptoMail error codes without requiring a request id", async () => {
		process.env.SKIP_ENV_VALIDATION = "1";
		process.env.DATABASE_URL ??=
			"postgresql://postgres:postgres@127.0.0.1:54322/postgres";
		process.env.DATABASE_POOL_MAX ??= "5";
		process.env.CORS_ORIGIN ??= "http://localhost:3001";
		process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
		process.env.APP_URL ??= "http://localhost:3001";
		process.env.ZEPTOMAIL_TOKEN ??= "Zoho-enczapikey test-token";
		process.env.ZEPTOMAIL_FROM_ADDRESS ??= "noreply@example.com";
		process.env.ZEPTOMAIL_FROM_NAME ??= "jooling";
		process.env.ZEPTOMAIL_API_URL ??= "https://api.zeptomail.in/v1.1/email";

		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					error: {
						code: "TM_103",
						message: "Domain not verified",
					},
					request_id: "req-1",
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			)) as typeof fetch;

		const { sendInvitationEmail } = await import("../src/mail");
		await expect(
			sendInvitationEmail({
				email: "worker@example.test",
				token: "invite-token",
				workplaceName: "Test Shop",
				kind: "worker",
				deliveryId: crypto.randomUUID(),
			}),
		).rejects.toThrow("ZeptoMail TM_103: Domain not verified");
	});
});
