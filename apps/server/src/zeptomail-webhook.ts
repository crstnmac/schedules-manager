import { createHmac, timingSafeEqual } from "node:crypto";

/** ZeptoMail signs the decoded JSON value in its form-encoded request, not the form wrapper. */
export function verifyZeptoMailWebhook(
	raw: string,
	signature: string | null,
	secret: string | undefined,
	now = Date.now(),
) {
	if (!secret || !signature) return null;
	try {
		const fields = Object.fromEntries(
			signature.split(";").map((entry) => {
				const separator = entry.indexOf("=");
				return [entry.slice(0, separator).trim(), entry.slice(separator + 1)];
			}),
		);
		if (
			fields["s-algorithm"] !== "HmacSHA256" ||
			!fields.ts ||
			!fields.s ||
			!Number.isFinite(Number(fields.ts)) ||
			Math.abs(now - Number(fields.ts)) > 5 * 60_000
		)
			return null;
		const payload = raw.trimStart().startsWith("{")
			? raw
			: [...new URLSearchParams(raw).values()][0];
		if (!payload) return null;
		const expected = createHmac("sha256", secret).update(payload).digest();
		const actual = Buffer.from(decodeURIComponent(fields.s), "base64");
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
			return null;
		return JSON.parse(payload) as unknown;
	} catch {
		return null;
	}
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function parseZeptoMailEvents(payload: unknown) {
	const body = record(payload);
	if (
		typeof body.webhook_request_id !== "string" ||
		body.webhook_request_id.length === 0 ||
		body.webhook_request_id.length > 200
	)
		return null;
	const names = Array.isArray(body.event_name)
		? body.event_name
		: [body.event_name];
	const status: "bounced" | "delivered" | null =
		names.includes("hardbounce") || names.includes("softbounce")
			? "bounced"
			: names.includes("delivered")
				? "delivered"
				: null;
	const messages = Array.isArray(body.event_message)
		? body.event_message
		: [body.event_message];
	return {
		id: body.webhook_request_id,
		status,
		softBounce: !names.includes("hardbounce") && names.includes("softbounce"),
		messages: messages.map((message) => {
			const event = record(message);
			const reference = record(event.email_info).client_reference;
			return {
				deliveryId:
					typeof reference === "string" &&
					/^email-delivery:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
						reference,
					)
						? reference.slice("email-delivery:".length)
						: null,
				providerMessageId:
					typeof event.request_id === "string" ? event.request_id : null,
			};
		}),
	};
}
