import { db, emailDeliveries, emailWebhookEvents } from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { AuthenticationError } from "../auth";
import { requireManager, requireSession } from "../context";
import { BadRequestError } from "../errors";
import {
	clientIpFromRequest,
	consumeRateLimitOrThrow,
} from "../rate-limit";
import {
	parseZeptoMailEvents,
	verifyZeptoMailWebhook,
} from "../zeptomail-webhook";

export const emailDeliveryRoutes = new Elysia({ prefix: "/v1" })
	.get(
		"/workplaces/:workplaceId/email-deliveries",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			// Explicit projection prevents invitation tokens and email bodies leaking into delivery reports.
			const deliveries = await db
				.select({
					id: emailDeliveries.id,
					invitationId: emailDeliveries.invitationId,
					email: emailDeliveries.email,
					status: emailDeliveries.status,
					attempts: emailDeliveries.attempts,
					availableAt: emailDeliveries.availableAt,
					providerMessageId: emailDeliveries.providerMessageId,
					lastError: emailDeliveries.lastError,
					sentAt: emailDeliveries.sentAt,
					deliveredAt: emailDeliveries.deliveredAt,
					bouncedAt: emailDeliveries.bouncedAt,
					createdAt: emailDeliveries.createdAt,
				})
				.from(emailDeliveries)
				.where(eq(emailDeliveries.workplaceId, params.workplaceId))
				.orderBy(desc(emailDeliveries.createdAt))
				.limit(100);
			return { deliveries };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
		},
	)
	.post(
		"/webhooks/zeptomail",
		async ({ body, request }) => {
			consumeRateLimitOrThrow(
				`zeptomail.webhook:${clientIpFromRequest(request)}`,
				"zeptomailWebhook",
			);
			if (typeof body !== "string" || body.length > 256_000)
				throw new BadRequestError("Invalid webhook body");
			const verified = verifyZeptoMailWebhook(
				body,
				request.headers.get("producer-signature"),
				env.ZEPTOMAIL_WEBHOOK_SECRET,
			);
			if (!verified) throw new AuthenticationError("Invalid webhook signature");
			const event = parseZeptoMailEvents(verified);
			if (!event) throw new BadRequestError("Invalid webhook event");
			await db.transaction(async (tx) => {
				const inserted = await tx
					.insert(emailWebhookEvents)
					.values({ id: event.id })
					.onConflictDoNothing()
					.returning();
				if (inserted.length === 0 || !event.status) return;
				for (const message of event.messages) {
					if (!message.deliveryId) continue;
					await tx
						.update(emailDeliveries)
						.set({
							status: event.status,
							lastError:
								event.status === "bounced"
									? event.softBounce
										? "Provider reported a soft bounce"
										: "Provider reported a hard bounce"
									: null,
							...(message.providerMessageId
								? { providerMessageId: message.providerMessageId }
								: {}),
							...(event.status === "delivered"
								? { deliveredAt: new Date() }
								: { bouncedAt: new Date() }),
						})
						.where(
							and(
								eq(emailDeliveries.id, message.deliveryId),
								event.status === "delivered"
									? or(
											ne(emailDeliveries.status, "bounced"),
											eq(
												emailDeliveries.lastError,
												"Provider reported a soft bounce",
											),
										)
									: event.softBounce
										? and(
												ne(emailDeliveries.status, "delivered"),
												or(
													ne(emailDeliveries.status, "bounced"),
													eq(
														emailDeliveries.lastError,
														"Provider reported a soft bounce",
													),
												),
											)
										: undefined,
							),
						);
				}
			});
			return { received: true };
		},
		{ parse: "text" },
	);
