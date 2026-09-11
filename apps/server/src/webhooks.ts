import { db, webhookDeliveries, webhookEndpoints } from "@SchedulesManager/db";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

const MAX_ATTEMPTS = 8;
const REQUEST_TIMEOUT_MS = 20_000;

/** Generates the signing secret handed to a Workplace once at endpoint creation. */
export function generateWebhookSecret(): string {
	return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function signWebhookPayload(rawBody: string, secret: string): string {
	return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * Verifies the `X-Jooling-Signature: sha256=<hmac>` header over the raw body.
 * Exported so consumers and tests can validate deliveries independently.
 */
export function verifyWebhookSignature(
	rawBody: string,
	signature: string | null | undefined,
	secret: string,
): boolean {
	if (!signature) return false;
	const [scheme, provided] = signature.split("=");
	if (scheme !== "sha256" || !provided) return false;
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	const providedBuffer = Buffer.from(provided, "hex");
	const expectedBuffer = Buffer.from(expected, "hex");
	return (
		providedBuffer.length === expectedBuffer.length &&
		timingSafeEqual(providedBuffer, expectedBuffer)
	);
}

/**
 * Queues one pending delivery per active endpoint matching the event. An
 * endpoint with an empty eventTypes list receives every event.
 */
export async function emitWebhookEvent(
	workplaceId: string,
	eventType: string,
	payload: Record<string, unknown>,
): Promise<{ queued: number }> {
	const endpoints = await db
		.select({
			id: webhookEndpoints.id,
			eventTypes: webhookEndpoints.eventTypes,
		})
		.from(webhookEndpoints)
		.where(
			and(
				eq(webhookEndpoints.workplaceId, workplaceId),
				eq(webhookEndpoints.active, true),
			),
		);

	const targets = endpoints.filter(
		(endpoint) =>
			endpoint.eventTypes.length === 0 ||
			endpoint.eventTypes.includes(eventType),
	);
	if (targets.length === 0) return { queued: 0 };

	await db.insert(webhookDeliveries).values(
		targets.map((endpoint) => ({
			endpointId: endpoint.id,
			eventType,
			payload,
		})),
	);
	return { queued: targets.length };
}

type ClaimedDelivery = {
	id: string;
	endpointId: string;
	eventType: string;
	payload: unknown;
	attempts: number;
};

async function recordFailure(
	item: ClaimedDelivery,
	message: string,
	responseStatus: number | null,
) {
	const failed = item.attempts >= MAX_ATTEMPTS;
	const delaySeconds = Math.min(3600, 30 * 2 ** Math.min(item.attempts, 7));
	await db
		.update(webhookDeliveries)
		.set({
			status: failed ? "failed" : "pending",
			responseStatus,
			lastError: message.slice(0, 2000),
			nextAttemptAt: failed ? null : new Date(Date.now() + delaySeconds * 1000),
		})
		.where(
			and(
				eq(webhookDeliveries.id, item.id),
				eq(webhookDeliveries.attempts, item.attempts),
			),
		);
	if (failed) {
		console.error(
			JSON.stringify({
				level: "error",
				message: "Webhook delivery failed permanently",
				deliveryId: item.id,
				endpointId: item.endpointId,
				eventType: item.eventType,
				attempts: item.attempts,
				error: message,
				timestamp: new Date().toISOString(),
			}),
		);
	}
}

/**
 * Claims due pending rows using the nextAttemptAt column as a lease, signs the
 * raw JSON body with each endpoint secret, and POSTs it. A 2xx response marks
 * the delivery delivered; anything else is retried with exponential backoff and
 * marked failed after MAX_ATTEMPTS. Mirrors push.ts / email-outbox.ts.
 */
export async function dispatchWebhookDeliveries(limit = 25) {
	const batchSize = Math.max(1, Math.min(50, Math.floor(limit)));
	const claimed = await db.transaction(async (tx) => {
		const result = await tx.execute<ClaimedDelivery>(sql`
			with claimable as (
				select id from webhook_deliveries
				where status = 'pending'
					and (next_attempt_at is null or next_attempt_at <= now())
				order by created_at
				for update skip locked
				limit ${batchSize}
			)
			update webhook_deliveries d
			set attempts = d.attempts + 1, next_attempt_at = now() + interval '5 minutes'
			from claimable c
			where d.id = c.id
			returning
				d.id,
				d.endpoint_id as "endpointId",
				d.event_type as "eventType",
				d.payload,
				d.attempts
		`);
		return result.rows;
	});

	for (const item of claimed) {
		const [endpoint] = await db
			.select()
			.from(webhookEndpoints)
			.where(eq(webhookEndpoints.id, item.endpointId))
			.limit(1);
		if (!endpoint) {
			await db
				.update(webhookDeliveries)
				.set({
					status: "failed",
					lastError: "Webhook endpoint no longer exists",
					nextAttemptAt: null,
				})
				.where(eq(webhookDeliveries.id, item.id));
			continue;
		}

		const rawBody = JSON.stringify(item.payload ?? null);
		try {
			const response = await fetch(endpoint.url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"X-Jooling-Event": item.eventType,
					"X-Jooling-Delivery": item.id,
					"X-Jooling-Signature": signWebhookPayload(rawBody, endpoint.secret),
				},
				body: rawBody,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			if (response.ok) {
				await db
					.update(webhookDeliveries)
					.set({
						status: "delivered",
						responseStatus: response.status,
						lastError: null,
						nextAttemptAt: null,
						deliveredAt: new Date(),
					})
					.where(
						and(
							eq(webhookDeliveries.id, item.id),
							eq(webhookDeliveries.attempts, item.attempts),
						),
					);
			} else {
				await recordFailure(
					item,
					`Webhook endpoint responded ${response.status}`,
					response.status,
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await recordFailure(item, message || "Webhook request failed", null);
		}
	}
	return { claimed: claimed.length };
}
