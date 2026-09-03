import {
	db,
	emailDeliveries,
	invitations,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, sql } from "drizzle-orm";
import { sendInvitationEmail } from "./mail";

type Writer = Pick<typeof db, "insert" | "select">;

/** Call with the same transaction that creates or refreshes the invitation. */
export async function enqueueInvitationEmail(
	writer: Writer,
	invitation: typeof invitations.$inferSelect,
) {
	const [workplace] = await writer
		.select({ name: workplaces.name })
		.from(workplaces)
		.where(eq(workplaces.id, invitation.workplaceId))
		.limit(1);
	await writer.insert(emailDeliveries).values({
		workplaceId: invitation.workplaceId,
		invitationId: invitation.id,
		token: invitation.token,
		email: invitation.email,
		kind: invitation.kind,
		workplaceName: workplace?.name ?? "your workplace",
	});
}

export async function processEmailOutboxBatch(
	limit = 10,
	send = sendInvitationEmail,
) {
	const leaseId = crypto.randomUUID();
	// A serial batch must finish inside the five-minute lease (send timeout is 20s).
	const batchSize = Math.max(1, Math.min(10, Math.floor(limit)));
	const claimed = await db.transaction(async (tx) => {
		const result = await tx.execute<{ id: string }>(sql`
			with claimable as (
				select id from email_deliveries
				where (status = 'queued' or (status = 'sending' and locked_at < now() - interval '5 minutes'))
				and available_at <= now()
				order by created_at for update skip locked limit ${batchSize}
			)
			update email_deliveries d set status = 'sending', locked_at = now(), lease_id = ${leaseId}::uuid, attempts = attempts + 1
			from claimable c where d.id = c.id returning d.id
		`);
		return result.rows;
	});
	for (const claim of claimed) {
		const [item] = await db
			.select()
			.from(emailDeliveries)
			.where(eq(emailDeliveries.id, claim.id))
			.limit(1);
		if (!item) continue;
		const owned = and(
			eq(emailDeliveries.id, item.id),
			eq(emailDeliveries.leaseId, leaseId),
			eq(emailDeliveries.status, "sending"),
		);
		try {
			const [invitation] = await db
				.select()
				.from(invitations)
				.where(eq(invitations.id, item.invitationId))
				.limit(1);
			if (
				invitation?.status !== "pending" ||
				invitation.token !== item.token ||
				invitation.expiresAt.getTime() <= Date.now()
			) {
				await db
					.update(emailDeliveries)
					.set({
						status: "cancelled",
						lockedAt: null,
						leaseId: null,
						lastError: "Invitation no longer pending, current, or valid",
					})
					.where(owned);
				continue;
			}
			const result = await send({
				email: item.email,
				token: item.token,
				workplaceName: item.workplaceName,
				kind: item.kind,
				deliveryId: item.id,
			});
			// A webhook can arrive before this update. Never downgrade a terminal provider outcome.
			await db
				.update(emailDeliveries)
				.set({
					providerMessageId: result.providerMessageId,
					sentAt: new Date(),
					lockedAt: null,
					leaseId: null,
					lastError: sql`case when ${emailDeliveries.status} in ('delivered', 'bounced') then ${emailDeliveries.lastError} else null end`,
					status: sql`case when ${emailDeliveries.status} in ('delivered', 'bounced') then ${emailDeliveries.status} else 'sent'::email_delivery_status end`,
				})
				.where(
					and(
						eq(emailDeliveries.id, item.id),
						eq(emailDeliveries.leaseId, leaseId),
					),
				);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const safeMessage = message.startsWith("ZeptoMail ")
				? message.slice(0, 200)
				: "Email provider request failed; delivery may be retried";
			// Provider errors may contain the recipient and invitation URL. Do not persist them unless they are our coded ZeptoMail summary.
			await db
				.update(emailDeliveries)
				.set({
					status: item.attempts >= 8 ? "failed" : "queued",
					lockedAt: null,
					leaseId: null,
					lastError: safeMessage,
					availableAt: new Date(
						Date.now() +
							Math.min(3600, 30 * 2 ** Math.min(item.attempts, 7)) * 1000,
					),
				})
				.where(owned);
			console.error(
				JSON.stringify({
					level: "error",
					message: "Email delivery deferred for retry",
					deliveryId: item.id,
					attempt: item.attempts,
					error: safeMessage,
					timestamp: new Date().toISOString(),
				}),
			);
		}
	}
	return { claimed: claimed.length };
}
