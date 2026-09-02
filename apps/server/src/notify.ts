import {
	auditEvents,
	db,
	employments,
	notificationOutbox,
	notifications,
	pushDeliveries,
	pushTokens,
} from "@SchedulesManager/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
	type ExpoPushMessage,
	expoError,
	getExpoReceipts,
	sendExpoPush,
} from "./push";

type NotificationWriter = Pick<typeof db, "insert">;

export async function notifyEmployments(
	employmentIds: string[],
	payload: { kind: string; title: string; body: string },
	writer: NotificationWriter = db,
): Promise<void> {
	const unique = [
		...new Set(employmentIds.filter((id) => typeof id === "string" && id)),
	];
	if (unique.length === 0) return;
	if (writer === db) {
		await db.transaction((tx) => notifyEmployments(unique, payload, tx));
		return;
	}
	const created = await writer
		.insert(notifications)
		.values(
			unique.map((employmentId) => ({
				employmentId,
				kind: payload.kind,
				title: payload.title,
				body: payload.body,
			})),
		)
		.returning({ id: notifications.id });
	await writer
		.insert(notificationOutbox)
		.values(
			created.map((notification) => ({ notificationId: notification.id })),
		);
}

export async function deliverPushes(
	employmentIds: string[],
	payload: { kind: string; title: string; body: string },
	outboxId: string,
) {
	if (employmentIds.length === 0) return;

	const tokens = await db
		.select({ token: pushTokens.expoPushToken })
		.from(pushTokens)
		.where(inArray(pushTokens.employmentId, employmentIds));
	if (tokens.length === 0) return;

	const previous = await db
		.select({ token: pushDeliveries.token })
		.from(pushDeliveries)
		.where(eq(pushDeliveries.outboxId, outboxId));
	const sentTokens = new Set(previous.map((row) => row.token));
	const messages: ExpoPushMessage[] = tokens
		.filter((row) => !sentTokens.has(row.token))
		.map((row) => ({
			to: row.token,
			title: payload.title,
			body: payload.body,
			sound: "default",
			channelId: "default",
			data: { kind: payload.kind },
		}));

	for (let offset = 0; offset < messages.length; offset += 100) {
		const { invalidTokens, tickets, errors } = await sendExpoPush(
			messages.slice(offset, offset + 100),
		);
		if (tickets.length)
			await db
				.insert(pushDeliveries)
				.values(
					tickets.map((ticket) => ({
						outboxId,
						token: ticket.token,
						ticketId: ticket.id,
						availableAt: new Date(Date.now() + 15 * 60_000),
					})),
				)
				.onConflictDoNothing();
		if (invalidTokens.length > 0) {
			await db
				.delete(pushTokens)
				.where(inArray(pushTokens.expoPushToken, invalidTokens));
		}
		if (errors.length)
			throw new Error(`Expo rejected push tickets: ${errors.join("; ")}`);
	}
}

type ClaimedNotification = {
	outboxId: string;
	employmentId: string;
	kind: string;
	title: string;
	body: string;
	attempts: number;
};

export async function processNotificationOutboxBatch(limit = 50) {
	const claimed = await db.transaction(async (tx) => {
		const result = await tx.execute<ClaimedNotification>(sql`
			with claimable as (
				select o.id
				from notification_outbox o
				where o.processed_at is null
					and o.available_at <= now()
					and (o.locked_at is null or o.locked_at < now() - interval '5 minutes')
				order by o.created_at
				for update skip locked
				limit ${limit}
			), claimed as (
				update notification_outbox o
				set locked_at = now(), attempts = o.attempts + 1
				from claimable c
				where o.id = c.id
				returning o.id, o.notification_id, o.attempts
			)
			select
				c.id as "outboxId",
				n.employment_id as "employmentId",
				n.kind,
				n.title,
				n.body,
				c.attempts
			from claimed c
			join notifications n on n.id = c.notification_id
		`);
		return result.rows;
	});

	await Promise.all(
		claimed.map(async (item) => {
			try {
				await deliverPushes([item.employmentId], item, item.outboxId);
				await db
					.update(notificationOutbox)
					.set({ processedAt: new Date(), lockedAt: null, lastError: null })
					.where(
						and(
							eq(notificationOutbox.id, item.outboxId),
							eq(notificationOutbox.attempts, item.attempts),
						),
					);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const delaySeconds = Math.min(3600, 2 ** Math.min(item.attempts, 10));
				await db
					.update(notificationOutbox)
					.set({
						lockedAt: null,
						lastError: message.slice(0, 2000),
						availableAt: new Date(Date.now() + delaySeconds * 1000),
					})
					.where(
						and(
							eq(notificationOutbox.id, item.outboxId),
							eq(notificationOutbox.attempts, item.attempts),
						),
					);
				console.error(
					JSON.stringify({
						level: "error",
						message: "Push delivery deferred for retry",
						outboxId: item.outboxId,
						error: message,
						timestamp: new Date().toISOString(),
					}),
				);
			}
		}),
	);
	return { claimed: claimed.length };
}

// Expo receipts acknowledge acceptance by APNs/FCM, not display on a device.
export async function processPushReceiptBatch(limit = 100) {
	const claimed = await db.execute<{
		id: string;
		token: string;
		ticketId: string;
		attempts: number;
		createdAt: Date;
	}>(sql`
		with candidates as (
			select id from push_deliveries
			where status = 'sent' and available_at <= now()
			and (locked_at is null or locked_at < now() - interval '5 minutes')
			order by available_at for update skip locked limit ${limit}
		)
		update push_deliveries d set locked_at = now(), attempts = d.attempts + 1
		from candidates c where d.id = c.id
		returning d.id, d.token, d.ticket_id as "ticketId", d.attempts, d.created_at as "createdAt"
	`);
	if (!claimed.rows.length) return { claimed: 0 };
	try {
		const receipts = await getExpoReceipts(
			claimed.rows.map((row) => row.ticketId),
		);
		for (const row of claimed.rows) {
			const receipt = receipts[row.ticketId];
			const expired =
				Date.now() - new Date(row.createdAt).getTime() >= 23 * 60 * 60_000;
			const failure = receipt ? receipt.status !== "ok" : expired;
			const lastError =
				receipt && failure
					? expoError(receipt)
					: expired
						? "ReceiptUnavailable"
						: null;
			await db.transaction(async (tx) => {
				const updated = await tx
					.update(pushDeliveries)
					.set({
						status: receipt
							? failure
								? "failed"
								: "delivered"
							: expired
								? "failed"
								: "sent",
						lockedAt: null,
						lastError,
						availableAt: new Date(Date.now() + 5 * 60_000),
					})
					.where(
						and(
							eq(pushDeliveries.id, row.id),
							eq(pushDeliveries.attempts, row.attempts),
						),
					)
					.returning({ id: pushDeliveries.id });
				if (updated.length && lastError === "DeviceNotRegistered")
					await tx
						.delete(pushTokens)
						.where(eq(pushTokens.expoPushToken, row.token));
			});
		}
	} catch (error) {
		for (const row of claimed.rows)
			await db
				.update(pushDeliveries)
				.set({
					lockedAt: null,
					lastError:
						error instanceof Error
							? error.message.slice(0, 2000)
							: "Receipt request failed",
					availableAt: new Date(Date.now() + 5 * 60_000),
				})
				.where(
					and(
						eq(pushDeliveries.id, row.id),
						eq(pushDeliveries.attempts, row.attempts),
					),
				);
	}
	return { claimed: claimed.rows.length };
}

export async function managerEmploymentIds(
	workplaceId: string,
): Promise<string[]> {
	const rows = await db
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				eq(employments.kind, "manager"),
				eq(employments.status, "active"),
			),
		);
	return rows.map((row) => row.id);
}

export async function workerEmploymentIds(
	workplaceId: string,
): Promise<string[]> {
	const rows = await db
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				eq(employments.kind, "worker"),
				eq(employments.status, "active"),
			),
		);
	return rows.map((row) => row.id);
}

export async function writeAudit(
	input: {
		workplaceId: string;
		actorProfileId: string | null;
		action: string;
		entityType: string;
		entityId?: string | null;
		summary: string;
	},
	writer: NotificationWriter = db,
) {
	await writer.insert(auditEvents).values({
		workplaceId: input.workplaceId,
		actorProfileId: input.actorProfileId,
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId ?? null,
		summary: input.summary,
	});
}
