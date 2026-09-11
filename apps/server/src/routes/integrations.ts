import type { ApiKey, WebhookEndpoint } from "@SchedulesManager/db";
import {
	apiKeys,
	db,
	locations,
	schedules,
	scheduleVersions,
	versionShifts,
	webhookDeliveries,
	webhookEndpoints,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { generateApiKey, requireApiKey } from "../api-key-auth";
import { requirePrivilege, requireSession } from "../context";
import { BadRequestError, ForbiddenError, NotFoundError } from "../errors";
import { firstRow } from "../rows";
import { generateWebhookSecret } from "../webhooks";

const uuid = t.String({ format: "uuid" });
const dateKey = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const apiKeyScope = t.Union([
	t.Literal("schedule.read"),
	t.Literal("schedule.write"),
	t.Literal("workers.read"),
	t.Literal("reports.read"),
	t.Literal("requests.read"),
	t.Literal("requests.write"),
]);

function serializeApiKey(row: ApiKey) {
	return {
		id: row.id,
		name: row.name,
		keyPrefix: row.keyPrefix,
		scopes: row.scopes,
		lastUsedAt: row.lastUsedAt,
		expiresAt: row.expiresAt,
		revokedAt: row.revokedAt,
		createdAt: row.createdAt,
	};
}

function serializeEndpoint(row: WebhookEndpoint) {
	return {
		id: row.id,
		name: row.name,
		url: row.url,
		eventTypes: row.eventTypes,
		active: row.active,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export const integrationRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Integrations"],
})
	.get(
		"/workplaces/:workplaceId/api-keys",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const keys = await db
				.select({
					id: apiKeys.id,
					name: apiKeys.name,
					keyPrefix: apiKeys.keyPrefix,
					scopes: apiKeys.scopes,
					lastUsedAt: apiKeys.lastUsedAt,
					expiresAt: apiKeys.expiresAt,
					revokedAt: apiKeys.revokedAt,
					createdAt: apiKeys.createdAt,
				})
				.from(apiKeys)
				.where(eq(apiKeys.workplaceId, params.workplaceId))
				.orderBy(desc(apiKeys.createdAt));
			return { apiKeys: keys };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "List API keys for a Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/api-keys",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
			if (expiresAt && Number.isNaN(expiresAt.getTime())) {
				throw new BadRequestError("expiresAt must be a valid date");
			}
			const generated = generateApiKey();
			const apiKey = firstRow(
				await db
					.insert(apiKeys)
					.values({
						workplaceId: params.workplaceId,
						name: body.name.trim(),
						keyPrefix: generated.prefix,
						keyHash: generated.hash,
						scopes: body.scopes,
						createdBy: profile.id,
						expiresAt,
					})
					.returning(),
			);
			return { apiKey: serializeApiKey(apiKey), token: generated.token };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 120 }),
				scopes: t.Array(apiKeyScope),
				expiresAt: t.Optional(t.String()),
			}),
			detail: {
				summary: "Create an API key (Manager, token shown once)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/api-keys/:keyId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const [apiKey] = await db
				.update(apiKeys)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(apiKeys.id, params.keyId),
						eq(apiKeys.workplaceId, params.workplaceId),
					),
				)
				.returning();
			if (!apiKey) throw new NotFoundError("API key not found");
			return { apiKey: serializeApiKey(apiKey) };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, keyId: uuid }),
			detail: {
				summary: "Revoke an API key (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/webhook-endpoints",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const endpoints = await db
				.select({
					id: webhookEndpoints.id,
					name: webhookEndpoints.name,
					url: webhookEndpoints.url,
					eventTypes: webhookEndpoints.eventTypes,
					active: webhookEndpoints.active,
					createdAt: webhookEndpoints.createdAt,
					updatedAt: webhookEndpoints.updatedAt,
				})
				.from(webhookEndpoints)
				.where(eq(webhookEndpoints.workplaceId, params.workplaceId))
				.orderBy(desc(webhookEndpoints.createdAt));
			return { endpoints };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "List webhook endpoints for a Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/webhook-endpoints",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const secret = generateWebhookSecret();
			const endpoint = firstRow(
				await db
					.insert(webhookEndpoints)
					.values({
						workplaceId: params.workplaceId,
						name: body.name.trim(),
						url: body.url.trim(),
						eventTypes: body.eventTypes,
						active: body.active ?? true,
						secret,
					})
					.returning(),
			);
			return {
				endpoint: { ...serializeEndpoint(endpoint), secret },
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 120 }),
				url: t.String({ format: "uri", maxLength: 2048 }),
				eventTypes: t.Array(t.String({ minLength: 1, maxLength: 120 })),
				active: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Create a webhook endpoint (Manager, secret shown once)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/workplaces/:workplaceId/webhook-endpoints/:endpointId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const [endpoint] = await db
				.update(webhookEndpoints)
				.set({
					name: body.name?.trim(),
					url: body.url?.trim(),
					eventTypes: body.eventTypes,
					active: body.active,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(webhookEndpoints.id, params.endpointId),
						eq(webhookEndpoints.workplaceId, params.workplaceId),
					),
				)
				.returning();
			if (!endpoint) throw new NotFoundError("Webhook endpoint not found");
			return { endpoint: serializeEndpoint(endpoint) };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, endpointId: uuid }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
				url: t.Optional(t.String({ format: "uri", maxLength: 2048 })),
				eventTypes: t.Optional(
					t.Array(t.String({ minLength: 1, maxLength: 120 })),
				),
				active: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Update a webhook endpoint (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/webhook-endpoints/:endpointId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const deleted = await db
				.delete(webhookEndpoints)
				.where(
					and(
						eq(webhookEndpoints.id, params.endpointId),
						eq(webhookEndpoints.workplaceId, params.workplaceId),
					),
				)
				.returning({ id: webhookEndpoints.id });
			if (deleted.length === 0) {
				throw new NotFoundError("Webhook endpoint not found");
			}
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, endpointId: uuid }),
			detail: {
				summary: "Delete a webhook endpoint (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/webhook-deliveries",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const limit = Math.min(100, Math.max(1, query.limit ?? 100));
			const deliveries = await db
				.select({
					id: webhookDeliveries.id,
					endpointId: webhookDeliveries.endpointId,
					endpointName: webhookEndpoints.name,
					eventType: webhookDeliveries.eventType,
					status: webhookDeliveries.status,
					attempts: webhookDeliveries.attempts,
					responseStatus: webhookDeliveries.responseStatus,
					lastError: webhookDeliveries.lastError,
					nextAttemptAt: webhookDeliveries.nextAttemptAt,
					deliveredAt: webhookDeliveries.deliveredAt,
					createdAt: webhookDeliveries.createdAt,
				})
				.from(webhookDeliveries)
				.innerJoin(
					webhookEndpoints,
					eq(webhookEndpoints.id, webhookDeliveries.endpointId),
				)
				.where(
					and(
						eq(webhookEndpoints.workplaceId, params.workplaceId),
						query.endpointId
							? eq(webhookDeliveries.endpointId, query.endpointId)
							: undefined,
					),
				)
				.orderBy(desc(webhookDeliveries.createdAt))
				.limit(limit);
			return { deliveries };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			query: t.Object({
				endpointId: t.Optional(uuid),
				limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
			}),
			detail: {
				summary: "List recent webhook deliveries (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	// Read endpoint proving the scoped API key mechanism end to end.
	.get(
		"/integration/schedule",
		async ({ headers, query }) => {
			const { apiKey } = await requireApiKey(headers, "schedule.read");
			if (query.workplaceId !== apiKey.workplaceId) {
				throw new ForbiddenError(
					"This API key is scoped to a different Workplace",
				);
			}
			const scheduleRows = await db
				.select({ id: schedules.id, locationId: schedules.locationId })
				.from(schedules)
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.where(
					and(
						eq(locations.workplaceId, query.workplaceId),
						eq(schedules.weekStartDate, query.weekStart),
					),
				);
			if (scheduleRows.length === 0) {
				return {
					workplaceId: query.workplaceId,
					weekStart: query.weekStart,
					schedules: [],
				};
			}
			const versionRows = await db
				.select()
				.from(scheduleVersions)
				.where(
					inArray(
						scheduleVersions.scheduleId,
						scheduleRows.map((row) => row.id),
					),
				)
				.orderBy(desc(scheduleVersions.versionNumber));
			const latestBySchedule = new Map<string, (typeof versionRows)[number]>();
			for (const version of versionRows) {
				if (!latestBySchedule.has(version.scheduleId)) {
					latestBySchedule.set(version.scheduleId, version);
				}
			}
			const versionIds = [...latestBySchedule.values()].map((v) => v.id);
			const shifts = versionIds.length
				? await db
						.select()
						.from(versionShifts)
						.where(inArray(versionShifts.versionId, versionIds))
				: [];
			return {
				workplaceId: query.workplaceId,
				weekStart: query.weekStart,
				schedules: scheduleRows.map((row) => ({
					locationId: row.locationId,
					version: latestBySchedule.get(row.id) ?? null,
					shifts: shifts.filter(
						(shift) => shift.versionId === latestBySchedule.get(row.id)?.id,
					),
				})),
			};
		},
		{
			headers: t.Object(
				{
					authorization: t.Optional(t.String()),
					"x-api-key": t.Optional(t.String()),
				},
				{ additionalProperties: true },
			),
			query: t.Object({ workplaceId: uuid, weekStart: dateKey }),
			detail: {
				summary: "Read the published Schedule with a scoped API key",
				description:
					"Requires an API key with the schedule.read scope. Send it as `Authorization: Bearer jl_live_...` or `X-API-Key`.",
			},
		},
	);
