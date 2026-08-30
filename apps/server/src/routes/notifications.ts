import { auditEvents, db, notifications, profiles } from "@SchedulesManager/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	requireManager,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { NotFoundError } from "../errors";

export const notificationsRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Notifications"],
})
	.get(
		"/workplaces/:workplaceId/my/notifications",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const [unreadRow, rows] = await Promise.all([
				db
					.select({
						count: sql<number>`count(*)::int`,
					})
					.from(notifications)
					.where(
						and(
							eq(notifications.employmentId, employment.id),
							isNull(notifications.readAt),
						),
					),
				db
					.select()
					.from(notifications)
					.where(eq(notifications.employmentId, employment.id))
					.orderBy(desc(notifications.createdAt))
					.limit(50),
			]);

			return {
				unreadCount: Number(unreadRow[0]?.count ?? 0),
				notifications: rows.map((row) => ({
					id: row.id,
					kind: row.kind,
					title: row.title,
					body: row.body,
					readAt: row.readAt?.toISOString() ?? null,
					createdAt: row.createdAt.toISOString(),
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "In-app notification inbox for the signed-in employment",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/my/notifications/:notificationId/read",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const [row] = await db
				.select()
				.from(notifications)
				.where(
					and(
						eq(notifications.id, params.notificationId),
						eq(notifications.employmentId, employment.id),
					),
				)
				.limit(1);
			if (!row) throw new NotFoundError("Notification not found");

			if (!row.readAt) {
				await db
					.update(notifications)
					.set({ readAt: new Date() })
					.where(eq(notifications.id, row.id));
			}

			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				notificationId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary: "Mark one notification as read",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/my/notifications/read-all",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			await db
				.update(notifications)
				.set({ readAt: new Date() })
				.where(
					and(
						eq(notifications.employmentId, employment.id),
						isNull(notifications.readAt),
					),
				);

			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Mark every unread notification as read",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/audit",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const rows = await db
				.select({
					event: auditEvents,
					actorEmail: profiles.email,
					actorName: profiles.fullName,
				})
				.from(auditEvents)
				.leftJoin(profiles, eq(profiles.id, auditEvents.actorProfileId))
				.where(eq(auditEvents.workplaceId, params.workplaceId))
				.orderBy(desc(auditEvents.createdAt))
				.limit(100);

			return {
				events: rows.map((row) => ({
					id: row.event.id,
					action: row.event.action,
					entityType: row.event.entityType,
					entityId: row.event.entityId,
					summary: row.event.summary,
					actorName: row.actorName ?? row.actorEmail ?? null,
					createdAt: row.event.createdAt.toISOString(),
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Manager audit trail for Workplace actions",
				security: [{ bearerAuth: [] }],
			},
		},
	);
