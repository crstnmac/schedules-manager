import {
	auditEvents,
	db,
	notifications,
	profiles,
	pushTokens,
} from "@SchedulesManager/db";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	requirePrivilege,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { NotFoundError } from "../errors";

function csvCell(value: string) {
	if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
	return value;
}

export const notificationsRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Notifications"],
})
	.get(
		"/workplaces/:workplaceId/my/notifications",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
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
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
			const { profile } = await requireSession(headers);
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
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
			const { profile } = await requireSession(headers);
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
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Mark every unread notification as read",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/my/push-token",
		async ({ body, headers, params }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			await db
				.insert(pushTokens)
				.values({
					employmentId: employment.id,
					expoPushToken: body.token,
					platform: body.platform,
				})
				.onConflictDoUpdate({
					target: [pushTokens.employmentId, pushTokens.expoPushToken],
					set: { platform: body.platform, lastSeenAt: new Date() },
				});

			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				token: t.String({ minLength: 10, maxLength: 256 }),
				platform: t.Union([t.Literal("ios"), t.Literal("android")]),
			}),
			detail: {
				summary: "Register this device's Expo push token for the employment",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/my/push-token",
		async ({ body, headers, params }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			await db
				.delete(pushTokens)
				.where(
					and(
						eq(pushTokens.employmentId, employment.id),
						eq(pushTokens.expoPushToken, body.token),
					),
				);

			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({ token: t.String({ minLength: 10, maxLength: 256 }) }),
			detail: {
				summary: "Remove this device's Expo push token for the employment",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/audit",
		async ({ headers, params, query, set }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");

			const hasQuery = Boolean(
				query.from ||
					query.to ||
					query.action ||
					query.actorProfileId ||
					query.limit ||
					query.offset ||
					query.format,
			);
			const limit = Math.min(
				Math.max(Number(query.limit ?? 100) || 100, 1),
				200,
			);
			const offset = Math.max(Number(query.offset ?? 0) || 0, 0);

			const conditions = [eq(auditEvents.workplaceId, params.workplaceId)];
			if (query.from)
				conditions.push(
					gte(auditEvents.createdAt, new Date(`${query.from}T00:00:00Z`)),
				);
			if (query.to)
				conditions.push(
					lte(auditEvents.createdAt, new Date(`${query.to}T23:59:59Z`)),
				);
			if (query.action) conditions.push(eq(auditEvents.action, query.action));
			if (query.actorProfileId)
				conditions.push(eq(auditEvents.actorProfileId, query.actorProfileId));

			const rows = await db
				.select({
					event: auditEvents,
					actorEmail: profiles.email,
					actorName: profiles.fullName,
				})
				.from(auditEvents)
				.leftJoin(profiles, eq(profiles.id, auditEvents.actorProfileId))
				.where(and(...conditions))
				.orderBy(desc(auditEvents.createdAt))
				.limit(limit)
				.offset(offset);

			if (query.format === "csv") {
				const lines = ["created_at,action,entity_type,entity_id,actor,summary"];
				for (const row of rows) {
					lines.push(
						[
							row.event.createdAt.toISOString(),
							row.event.action,
							row.event.entityType,
							row.event.entityId ?? "",
							row.actorName ?? row.actorEmail ?? "",
							row.event.summary,
						]
							.map(csvCell)
							.join(","),
					);
				}
				set.headers["content-type"] = "text/csv; charset=utf-8";
				set.headers["content-disposition"] =
					`attachment; filename="audit-${params.workplaceId}.csv"`;
				return lines.join("\n");
			}

			const events = rows.map((row) => ({
				id: row.event.id,
				action: row.event.action,
				entityType: row.event.entityType,
				entityId: row.event.entityId,
				summary: row.event.summary,
				actorName: row.actorName ?? row.actorEmail ?? null,
				createdAt: row.event.createdAt.toISOString(),
			}));

			if (!hasQuery) return { events };

			const [countRow] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(auditEvents)
				.where(and(...conditions));

			return {
				events,
				total: Number(countRow?.count ?? 0),
				limit,
				offset,
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			query: t.Object({
				from: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
				to: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
				action: t.Optional(t.String({ maxLength: 200 })),
				actorProfileId: t.Optional(t.String({ format: "uuid" })),
				limit: t.Optional(t.String({ pattern: "^\\d+$" })),
				offset: t.Optional(t.String({ pattern: "^\\d+$" })),
				format: t.Optional(t.Literal("csv")),
			}),
			detail: {
				summary: "Manager audit trail for Workplace actions",
				security: [{ bearerAuth: [] }],
			},
		},
	);
