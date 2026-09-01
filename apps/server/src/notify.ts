import {
	auditEvents,
	db,
	employments,
	notifications,
	pushTokens,
} from "@SchedulesManager/db";
import { and, eq, inArray } from "drizzle-orm";
import { type ExpoPushMessage, sendExpoPush } from "./push";

export async function notifyEmployments(
	employmentIds: string[],
	payload: { kind: string; title: string; body: string },
) {
	const unique = [
		...new Set(employmentIds.filter((id) => typeof id === "string" && id)),
	];
	if (unique.length === 0) return;
	await db.insert(notifications).values(
		unique.map((employmentId) => ({
			employmentId,
			kind: payload.kind,
			title: payload.title,
			body: payload.body,
		})),
	);
	await deliverPushes(unique, payload);
}

export async function deliverPushes(
	employmentIds: string[],
	payload: { kind: string; title: string; body: string },
) {
	if (employmentIds.length === 0) return;

	try {
		const tokens = await db
			.select({ token: pushTokens.expoPushToken })
			.from(pushTokens)
			.where(inArray(pushTokens.employmentId, employmentIds));
		if (tokens.length === 0) return;

		const messages: ExpoPushMessage[] = tokens.map((row) => ({
			to: row.token,
			title: payload.title,
			body: payload.body,
			sound: "default",
			channelId: "default",
			data: { kind: payload.kind },
		}));

		const { invalidTokens } = await sendExpoPush(messages);
		if (invalidTokens.length > 0) {
			await db
				.delete(pushTokens)
				.where(inArray(pushTokens.expoPushToken, invalidTokens));
		}
	} catch (error) {
		console.error(
			JSON.stringify({
				level: "error",
				message: "Push delivery failed",
				kind: payload.kind,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
			}),
		);
	}
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

export async function writeAudit(input: {
	workplaceId: string;
	actorProfileId: string | null;
	action: string;
	entityType: string;
	entityId?: string | null;
	summary: string;
}) {
	await db.insert(auditEvents).values({
		workplaceId: input.workplaceId,
		actorProfileId: input.actorProfileId,
		action: input.action,
		entityType: input.entityType,
		entityId: input.entityId ?? null,
		summary: input.summary,
	});
}
