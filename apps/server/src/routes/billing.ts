import {
	db,
	locations,
	polarWebhookEvents,
	workplaceSubscriptions,
	workplaces,
} from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
	validateEvent,
	WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";

import { count, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	type BillingInterval,
	type BillingPlan,
	billingCatalog,
	billingProduct,
	hasActiveSubscription,
	planAllows,
	polarClient,
} from "../billing";
import { requirePrivilege, requireSession } from "../context";
import { BadRequestError, ForbiddenError, NotFoundError } from "../errors";

function clientIp(request: Request) {
	const forwarded = request.headers
		.get("x-forwarded-for")
		?.split(",")[0]
		?.trim();
	return request.headers.get("cf-connecting-ip") ?? forwarded ?? undefined;
}

/**
 * Polar secrets created on/after 2026-09-08 use the Standard Webhooks
 * signature (HMAC over `id.timestamp.body` with the base64-decoded `whsec_`
 * secret). The pinned `@polar-sh/sdk@0.49.0` only verifies the legacy Polar
 * HMAC key, so we verify Standard Webhooks here as a fallback.
 */
function verifyStandardWebhook(
	rawBody: string,
	headers: Record<string, string>,
	secret: string,
): boolean {
	const id = headers["webhook-id"];
	const timestamp = headers["webhook-timestamp"];
	const signatureHeader = headers["webhook-signature"];
	if (!id || !timestamp || !signatureHeader) return false;
	const base64Key = secret.startsWith("whsec_")
		? secret.slice("whsec_".length)
		: secret;
	const key = Buffer.from(base64Key, "base64");
	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${rawBody}`)
		.digest("base64");
	for (const versioned of signatureHeader.split(" ")) {
		const [version, signature] = versioned.split(",");
		if (version !== "v1" || !signature) continue;
		const provided = Buffer.from(signature);
		const computed = Buffer.from(expected);
		if (
			provided.length === computed.length &&
			timingSafeEqual(provided, computed)
		) {
			return true;
		}
	}
	return false;
}

function subscriptionPayload(
	row: typeof workplaceSubscriptions.$inferSelect | undefined,
) {
	return row
		? {
				plan: row.plan,
				billingInterval: row.billingInterval,
				status: row.status,
				locationCount: row.locationCount,
				currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
				cancelAtPeriodEnd: row.cancelAtPeriodEnd,
				canManage:
					hasActiveSubscription(row.status) || row.status === "past_due",
			}
		: null;
}

export const billingRoutes = new Elysia({ prefix: "/v1", tags: ["Billing"] })
	.get(
		"/workplaces/:workplaceId/billing",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const [subscription] = await db
				.select()
				.from(workplaceSubscriptions)
				.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
				.limit(1);
			const [locationTotal] = await db
				.select({ value: count() })
				.from(locations)
				.where(eq(locations.workplaceId, params.workplaceId));

			return {
				subscription: subscriptionPayload(subscription),
				capabilities: {
					scheduling: Boolean(
						subscription && hasActiveSubscription(subscription.status),
					),
					operations: Boolean(
						subscription &&
							hasActiveSubscription(subscription.status) &&
							planAllows(subscription.plan, "time_clock"),
					),
				},
				locationCount: Math.max(1, locationTotal?.value ?? 1),
				catalog: {
					schedule: { month: 3900, year: 37200 },
					operations: { month: 7900, year: 75600 },
				},
			};
		},
		{
			headers: t.Object({ authorization: t.Optional(t.String()) }, { additionalProperties: true }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Get Workplace subscription",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/billing/checkout",
		async ({ headers, params, body, request }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const [existing] = await db
				.select()
				.from(workplaceSubscriptions)
				.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
				.limit(1);
			if (
				existing &&
				(hasActiveSubscription(existing.status) ||
					existing.status === "past_due")
			) {
				throw new ForbiddenError(
					"Manage your existing subscription in the billing portal",
				);
			}

			const [workplace] = await db
				.select()
				.from(workplaces)
				.where(eq(workplaces.id, params.workplaceId))
				.limit(1);
			if (!workplace) throw new NotFoundError("Workplace not found");
			const [locationTotal] = await db
				.select({ value: count() })
				.from(locations)
				.where(eq(locations.workplaceId, params.workplaceId));
			const locationCount = Math.max(1, locationTotal?.value ?? 1);
			const selected = billingCatalog[body.plan][body.billingInterval];
			const checkout = await polarClient().checkouts.create({
				products: [selected.productId],
				prices: {
					[selected.productId]: [
						{
							amountType: "fixed",
							priceAmount: selected.unitAmount * locationCount,
							priceCurrency: "usd",
						},
					],
				},
				externalCustomerId: params.workplaceId,
				customerEmail: profile.email,
				customerName: workplace.name,
				isBusinessCustomer: true,
				customerIpAddress: clientIp(request),
				metadata: {
					workplace_id: params.workplaceId,
					plan: body.plan,
					billing_interval: body.billingInterval,
					location_count: locationCount,
				},
				trialInterval: "day",
				trialIntervalCount: 30,
				allowDiscountCodes: true,
				requireBillingAddress: true,
				successUrl: `${env.APP_URL}/dashboard/settings/subscription?checkout=success&checkout_id={CHECKOUT_ID}`,
				returnUrl: `${env.APP_URL}/dashboard/settings/subscription`,
			});

			return { url: checkout.url };
		},
		{
			headers: t.Object({ authorization: t.Optional(t.String()) }, { additionalProperties: true }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				plan: t.Union([t.Literal("schedule"), t.Literal("operations")]),
				billingInterval: t.Union([t.Literal("month"), t.Literal("year")]),
			}),
			detail: {
				summary: "Create a Polar checkout",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/billing/portal",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const [subscription] = await db
				.select({ id: workplaceSubscriptions.id })
				.from(workplaceSubscriptions)
				.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
				.limit(1);
			if (!subscription)
				throw new BadRequestError("This Workplace has no subscription yet");
			const session = await polarClient().customerSessions.create({
				externalCustomerId: params.workplaceId,
				returnUrl: `${env.APP_URL}/dashboard/settings/subscription`,
			});
			return { url: session.customerPortalUrl };
		},
		{
			headers: t.Object({ authorization: t.Optional(t.String()) }, { additionalProperties: true }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Open the Polar customer portal",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/webhooks/polar",
		async ({ request, set }) => {
			if (!env.POLAR_WEBHOOK_SECRET)
				throw new Error("Polar webhook is not configured");
			const rawBody = await request.text();
			const webhookHeaders = Object.fromEntries(request.headers.entries());
			let event: ReturnType<typeof validateEvent>;
			try {
				event = validateEvent(
					rawBody,
					webhookHeaders,
					env.POLAR_WEBHOOK_SECRET,
				);
			} catch (error) {
				if (!(error instanceof WebhookVerificationError)) throw error;
				if (
					!verifyStandardWebhook(
						rawBody,
						webhookHeaders,
						env.POLAR_WEBHOOK_SECRET,
					)
				) {
					set.status = 403;
					return { accepted: false };
				}
				event = JSON.parse(rawBody) as ReturnType<typeof validateEvent>;
			}

			switch (event.type) {
				case "subscription.created":
				case "subscription.updated":
				case "subscription.active":
				case "subscription.canceled":
				case "subscription.uncanceled":
				case "subscription.revoked":
				case "subscription.past_due":
					break;
				default:
					return { accepted: true };
			}
			const subscription = event.data;
			const workplaceId = subscription.customer.externalId;
			if (!workplaceId || !subscription.productId) return { accepted: true };
			const product = billingProduct(subscription.productId);
			if (!product) return { accepted: true };
			const rawTimestamp = event.timestamp as unknown;
			const eventTimestamp =
				rawTimestamp instanceof Date
					? rawTimestamp
					: new Date(String(rawTimestamp));
			const eventId =
				request.headers.get("webhook-id") ??
				`${event.type}:${subscription.id}:${eventTimestamp.toISOString()}`;
			const locationCount = Number(subscription.metadata.location_count ?? 1);
			const currentPeriodEnd = subscription.currentPeriodEnd
				? new Date(subscription.currentPeriodEnd)
				: null;

			await db.transaction(async (tx) => {
				const inserted = await tx
					.insert(polarWebhookEvents)
					.values({ id: eventId, type: event.type })
					.onConflictDoNothing()
					.returning({ id: polarWebhookEvents.id });
				if (inserted.length === 0) return;
				await tx
					.insert(workplaceSubscriptions)
					.values({
						workplaceId,
						polarSubscriptionId: subscription.id,
						polarCustomerId: subscription.customerId,
						polarProductId: subscription.productId,
						plan: product.plan as BillingPlan,
						billingInterval: product.interval as BillingInterval,
						status: subscription.status,
						locationCount:
							Number.isInteger(locationCount) && locationCount > 0
								? locationCount
								: 1,
						currentPeriodEnd,
						cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
					})
					.onConflictDoUpdate({
						target: workplaceSubscriptions.workplaceId,
						set: {
							polarSubscriptionId: subscription.id,
							polarCustomerId: subscription.customerId,
							polarProductId: subscription.productId,
							plan: product.plan,
							billingInterval: product.interval,
							status: subscription.status,
							locationCount:
								Number.isInteger(locationCount) && locationCount > 0
									? locationCount
									: 1,
							currentPeriodEnd,
							cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
							updatedAt: new Date(),
						},
					});
			});

			set.status = 202;
			return { accepted: true };
		},
		{
			parse: "none",
			detail: { summary: "Receive signed Polar subscription events" },
		},
	);
