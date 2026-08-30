import {
	auditEvents,
	db,
	employments,
	notifications,
} from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";

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
