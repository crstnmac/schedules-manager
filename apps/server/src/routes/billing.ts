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
	planChangeTiming,
	polarClient,
	purchaseLocationSeats,
	requireSeatBasedProduct,
} from "../billing";
import { requirePrivilege, requireSession } from "../context";
import {
	BadRequestError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
} from "../errors";

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

/**
 * The fallback path parses the raw payload, which uses snake_case. Normalize
 * the fields the handler reads so it can treat both paths identically.
 */
function normalizeWebhookEvent(raw: {
	type: string;
	timestamp?: unknown;
	data?: Record<string, unknown>;
}) {
	const data = raw.data ?? {};
	const customer = (data.customer ?? {}) as Record<string, unknown>;
	return {
		...raw,
		data: {
			...data,
			id: data.id,
			status: data.status,
			seats: data.seats,
			productId: data.productId ?? data.product_id,
			customerId: data.customerId ?? data.customer_id,
			currentPeriodEnd: data.currentPeriodEnd ?? data.current_period_end,
			cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? data.cancel_at_period_end,
			customer: {
				...customer,
				externalId: customer.externalId ?? customer.external_id,
			},
		},
	};
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

async function providerPlanState(
	subscription: typeof workplaceSubscriptions.$inferSelect,
) {
	const remote = await polarClient().subscriptions.get({
		id: subscription.polarSubscriptionId,
	});
	const current = billingProduct(remote.productId);
	const pending = remote.pendingUpdate;
	const pendingProduct = pending?.productId
		? billingProduct(pending.productId)
		: null;
	return {
		productId: remote.productId,
		plan: current?.plan ?? null,
		billingInterval: current?.interval ?? null,
		status: remote.status,
		cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
		currentPeriodEnd: remote.currentPeriodEnd.toISOString(),
		trialEnd: remote.trialEnd?.toISOString() ?? null,
		seats: remote.seats ?? subscription.locationCount,
		pendingChange: pending
			? {
					id: pending.id,
					productId: pending.productId,
					plan: pendingProduct?.plan ?? null,
					billingInterval: pendingProduct?.interval ?? null,
					seats: pending.seats,
					appliesAt: pending.appliesAt.toISOString(),
				}
			: null,
	};
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
				locationCount: locationTotal?.value ?? 0,
				paidLocationCount: subscription?.locationCount ?? null,
				catalog: {
					schedule: {
						month: billingCatalog.schedule.month.unitAmount,
						year: billingCatalog.schedule.year.unitAmount,
					},
					operations: {
						month: billingCatalog.operations.month.unitAmount,
						year: billingCatalog.operations.year.unitAmount,
					},
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Get Workplace subscription",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/billing/plan-state",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const [subscription] = await db
				.select()
				.from(workplaceSubscriptions)
				.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
				.limit(1);
			if (!subscription) throw new NotFoundError("Subscription not found");
			return providerPlanState(subscription);
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Get live plan and scheduled change",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/billing/plan-change",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			return db.transaction(async (tx) => {
				const [subscription] = await tx
					.select()
					.from(workplaceSubscriptions)
					.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
					.for("update")
					.limit(1);
				if (!subscription) throw new NotFoundError("Subscription not found");
				const remote = await polarClient().subscriptions.get({
					id: subscription.polarSubscriptionId,
				});
				if (remote.productId !== body.expectedProductId) {
					throw new ConflictError(
						"Your subscription changed. Refresh billing before trying again.",
					);
				}
				if (remote.pendingUpdate) {
					throw new ConflictError(
						"A plan change is already scheduled. Cancel it before choosing a new plan.",
					);
				}
				if (remote.status !== "active" || remote.cancelAtPeriodEnd) {
					throw new ForbiddenError(
						"Plan changes are unavailable during a trial, payment recovery, or scheduled cancellation. Manage billing to resolve this first.",
					);
				}
				const current = billingProduct(remote.productId);
				if (!current)
					throw new ConflictError(
						"Your current plan is not in the supported catalog.",
					);
				const timing = planChangeTiming(
					current.plan,
					current.interval,
					body.plan,
					body.billingInterval,
				);
				if (!timing)
					throw new BadRequestError("This is already your current plan.");
				const target = billingCatalog[body.plan][body.billingInterval];
				const product = await requireSeatBasedProduct(target.productId);
				if (
					!product.prices.some(
						(price) =>
							price.amountType === "seat_based" &&
							price.priceCurrency === remote.currency,
					)
				) {
					throw new BadRequestError(
						"The target plan must use the same billing currency.",
					);
				}
				const updated = await polarClient().subscriptions.update({
					id: subscription.polarSubscriptionId,
					subscriptionUpdate: {
						productId: target.productId,
						prorationBehavior: timing === "renewal" ? "next_period" : "prorate",
					},
				});
				if (timing === "renewal") {
					if (updated.pendingUpdate?.productId !== target.productId) {
						throw new ConflictError(
							"Polar did not confirm the scheduled plan change. Check billing before retrying.",
						);
					}
				} else {
					if (updated.productId !== target.productId) {
						throw new ConflictError(
							"Polar did not confirm the new plan. Check billing before retrying.",
						);
					}
					await tx
						.update(workplaceSubscriptions)
						.set({
							polarProductId: target.productId,
							plan: body.plan,
							billingInterval: body.billingInterval,
							updatedAt: new Date(),
						})
						.where(eq(workplaceSubscriptions.id, subscription.id));
				}
				return {
					timing,
					pendingChange: updated.pendingUpdate
						? {
								appliesAt: updated.pendingUpdate.appliesAt.toISOString(),
								plan: body.plan,
								billingInterval: body.billingInterval,
							}
						: null,
				};
			});
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				plan: t.Union([t.Literal("schedule"), t.Literal("operations")]),
				billingInterval: t.Union([t.Literal("month"), t.Literal("year")]),
				expectedProductId: t.String(),
			}),
			detail: {
				summary: "Change or schedule a subscription plan",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/billing/plan-change/cancel",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			return db.transaction(async (tx) => {
				const [subscription] = await tx
					.select()
					.from(workplaceSubscriptions)
					.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
					.for("update")
					.limit(1);
				if (!subscription) throw new NotFoundError("Subscription not found");
				const remote = await polarClient().subscriptions.get({
					id: subscription.polarSubscriptionId,
				});
				if (
					!remote.pendingUpdate ||
					remote.pendingUpdate.id !== body.expectedPendingUpdateId
				) {
					throw new ConflictError(
						"The scheduled change has already changed. Refresh billing.",
					);
				}
				if (
					!remote.pendingUpdate.productId ||
					remote.pendingUpdate.seats != null
				) {
					throw new ConflictError(
						"This pending update also changes seats. Manage billing to review it.",
					);
				}
				const updated = await polarClient().subscriptions.update({
					id: subscription.polarSubscriptionId,
					subscriptionUpdate: { pendingUpdate: null },
				});
				if (updated.pendingUpdate)
					throw new ConflictError(
						"Polar did not clear the scheduled change. Refresh billing.",
					);
				return { canceled: true };
			});
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({ expectedPendingUpdateId: t.String() }),
			detail: {
				summary: "Cancel a scheduled plan change",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/billing/location-seats",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			return purchaseLocationSeats(
				params.workplaceId,
				body.expectedPaidLocationCount,
				body.quantity,
			);
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				expectedPaidLocationCount: t.Integer({ minimum: 1 }),
				quantity: t.Integer({ minimum: 1, maximum: 1000 }),
			}),
			detail: {
				summary: "Purchase additional location seats",
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
			await requireSeatBasedProduct(selected.productId);
			const checkout = await polarClient().checkouts.create({
				products: [selected.productId],
				seats: locationCount,
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
				...(existing
					? {}
					: { trialInterval: "day" as const, trialIntervalCount: 30 }),
				allowDiscountCodes: true,
				requireBillingAddress: true,
				successUrl: `${env.APP_URL}/dashboard/settings/subscription?checkout=success&checkout_id={CHECKOUT_ID}`,
				returnUrl: `${env.APP_URL}/dashboard/settings/subscription`,
			});

			return { url: checkout.url };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
				.select({
					id: workplaceSubscriptions.id,
					polarCustomerId: workplaceSubscriptions.polarCustomerId,
				})
				.from(workplaceSubscriptions)
				.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
				.limit(1);
			if (!subscription)
				throw new BadRequestError("This Workplace has no subscription yet");
			const session = await polarClient().customerSessions.create({
				customerId: subscription.polarCustomerId,
				returnUrl: `${env.APP_URL}/dashboard/settings/subscription`,
			});
			return { url: session.customerPortalUrl };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
				event = normalizeWebhookEvent(JSON.parse(rawBody)) as ReturnType<
					typeof validateEvent
				>;
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
			const metadataWorkplaceId = subscription.metadata.workplace_id;
			const workplaceId =
				typeof metadataWorkplaceId === "string" && metadataWorkplaceId
					? metadataWorkplaceId
					: subscription.customer.externalId;
			if (!workplaceId || !subscription.productId) return { accepted: true };
			const product = billingProduct(subscription.productId);
			if (!product) return { accepted: true };
			const [knownWorkplace] = await db
				.select({ id: workplaces.id })
				.from(workplaces)
				.where(eq(workplaces.id, workplaceId))
				.limit(1);
			if (!knownWorkplace) return { accepted: true };
			const rawTimestamp = event.timestamp as unknown;
			const eventTimestamp =
				rawTimestamp instanceof Date
					? rawTimestamp
					: new Date(String(rawTimestamp));
			const eventId =
				request.headers.get("webhook-id") ??
				`${event.type}:${subscription.id}:${eventTimestamp.toISOString()}`;
			const metadataLocationCount = Number(
				subscription.metadata.location_count ?? 1,
			);
			const locationCount =
				typeof subscription.seats === "number" && subscription.seats > 0
					? subscription.seats
					: metadataLocationCount;
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
