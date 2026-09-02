import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
	parseZeptoMailEvents,
	verifyZeptoMailWebhook,
} from "../src/zeptomail-webhook";

describe("ZeptoMail webhook verification", () => {
	const secret = "test-webhook-secret";
	const now = 1_800_000_000_000;
	const payload = JSON.stringify({
		webhook_request_id: "event-1",
		event_name: ["hardbounce"],
		event_message: [
			{
				request_id: "message-1",
				email_info: {
					client_reference:
						"email-delivery:11111111-1111-4111-8111-111111111111",
				},
			},
		],
	});
	const digest = createHmac("sha256", secret).update(payload).digest("base64");
	const signature = `ts=${now};s=${encodeURIComponent(digest)};s-algorithm=HmacSHA256`;
	test("verifies signed form payload and parses delivery identity", () => {
		const verified = verifyZeptoMailWebhook(
			new URLSearchParams({ data: payload }).toString(),
			signature,
			secret,
			now,
		);
		expect(parseZeptoMailEvents(verified)).toEqual({
			id: "event-1",
			status: "bounced",
			softBounce: false,
			messages: [
				{
					deliveryId: "11111111-1111-4111-8111-111111111111",
					providerMessageId: "message-1",
				},
			],
		});
	});
	test("rejects tampering, stale timestamps, missing secrets and invalid signatures", () => {
		expect(
			verifyZeptoMailWebhook(`${payload} `, signature, secret, now),
		).toBeNull();
		expect(
			verifyZeptoMailWebhook(payload, signature, secret, now + 301_000),
		).toBeNull();
		expect(
			verifyZeptoMailWebhook(payload, signature, undefined, now),
		).toBeNull();
		expect(
			verifyZeptoMailWebhook(
				payload,
				"ts=bad;s=%;s-algorithm=HmacSHA256",
				secret,
				now,
			),
		).toBeNull();
	});
	test("does not treat opens or provider acceptance as delivered", () => {
		expect(
			parseZeptoMailEvents({
				webhook_request_id: "event-2",
				event_name: ["email_open"],
			})?.status,
		).toBeNull();
		expect(
			parseZeptoMailEvents({
				webhook_request_id: "event-3",
				event_name: ["delivered"],
			})?.status,
		).toBe("delivered");
		expect(parseZeptoMailEvents({})).toBeNull();
	});
});
