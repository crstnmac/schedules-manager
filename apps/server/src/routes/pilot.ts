import {
	db,
	employments,
	invitations,
	locations,
	pilotFeedback,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shifts,
	workerDeliveries,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	requirePrivilege,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { csvAttachment } from "../csv-import";
import { withIdempotency } from "../idempotency";
import { notifyEmployments, writeAudit } from "../notify";
import { consumeRateLimitOrThrow } from "../rate-limit";
import {
	importWorkerInvitations,
	WORKER_IMPORT_TEMPLATE,
} from "../worker-import";

async function latestVersionIds(scheduleIds: string[]) {
	if (scheduleIds.length === 0) return [];
	const rows = await db
		.select({
			id: scheduleVersions.id,
			scheduleId: scheduleVersions.scheduleId,
			versionNumber: scheduleVersions.versionNumber,
		})
		.from(scheduleVersions)
		.where(inArray(scheduleVersions.scheduleId, scheduleIds))
		.orderBy(desc(scheduleVersions.versionNumber));
	const latest = new Map<string, string>();
	for (const row of rows)
		if (!latest.has(row.scheduleId)) latest.set(row.scheduleId, row.id);
	return [...latest.values()];
}

export const pilotRoutes = new Elysia({ prefix: "/v1", tags: ["Pilot"] })
	.get(
		"/workplaces/:workplaceId/pilot-status",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");

			const [
				locationRows,
				positionRows,
				employmentRows,
				invitationRows,
				scheduleRows,
				feedbackRows,
			] = await Promise.all([
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(locations)
					.where(eq(locations.workplaceId, params.workplaceId)),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(positions)
					.where(eq(positions.workplaceId, params.workplaceId)),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(employments)
					.where(
						and(
							eq(employments.workplaceId, params.workplaceId),
							eq(employments.kind, "worker"),
							eq(employments.status, "active"),
						),
					),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(invitations)
					.where(
						and(
							eq(invitations.workplaceId, params.workplaceId),
							eq(invitations.status, "pending"),
						),
					),
				db
					.select({ id: schedules.id })
					.from(schedules)
					.innerJoin(locations, eq(locations.id, schedules.locationId))
					.where(eq(locations.workplaceId, params.workplaceId)),
				db
					.select({
						id: pilotFeedback.id,
						category: pilotFeedback.category,
						message: pilotFeedback.message,
						page: pilotFeedback.page,
						createdAt: pilotFeedback.createdAt,
						reporter: profiles.fullName,
						email: profiles.email,
					})
					.from(pilotFeedback)
					.leftJoin(profiles, eq(profiles.id, pilotFeedback.profileId))
					.where(eq(pilotFeedback.workplaceId, params.workplaceId))
					.orderBy(desc(pilotFeedback.createdAt))
					.limit(20),
			]);

			const scheduleIds = scheduleRows.map((row) => row.id);
			const latestIds = await latestVersionIds(scheduleIds);
			const [versionRows, shiftRows, pendingDeliveryRows] = scheduleIds.length
				? await Promise.all([
						db
							.select({ count: sql<number>`count(*)::int` })
							.from(scheduleVersions)
							.where(inArray(scheduleVersions.scheduleId, scheduleIds)),
						db
							.select({ count: sql<number>`count(*)::int` })
							.from(shifts)
							.where(inArray(shifts.scheduleId, scheduleIds)),
						latestIds.length
							? db
									.select({ count: sql<number>`count(*)::int` })
									.from(workerDeliveries)
									.where(
										and(
											inArray(workerDeliveries.versionId, latestIds),
											isNull(workerDeliveries.acknowledgedAt),
										),
									)
							: Promise.resolve([{ count: 0 }]),
					])
				: [[{ count: 0 }], [{ count: 0 }], [{ count: 0 }]];

			return {
				counts: {
					locations: Number(locationRows[0]?.count ?? 0),
					positions: Number(positionRows[0]?.count ?? 0),
					activeWorkers: Number(employmentRows[0]?.count ?? 0),
					pendingInvitations: Number(invitationRows[0]?.count ?? 0),
					draftShifts: Number(shiftRows[0]?.count ?? 0),
					publishedVersions: Number(versionRows[0]?.count ?? 0),
					unacknowledgedDeliveries: Number(pendingDeliveryRows[0]?.count ?? 0),
				},
				feedback: feedbackRows.map((row) => ({
					...row,
					createdAt: row.createdAt.toISOString(),
					reporter: row.reporter ?? row.email ?? null,
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/feedback",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const [feedback] = await db
				.insert(pilotFeedback)
				.values({
					workplaceId: params.workplaceId,
					profileId: profile.id,
					category: body.category,
					message: body.message.trim(),
					page: body.page ?? null,
				})
				.returning();
			return { feedback: { id: feedback?.id } };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				category: t.Union([
					t.Literal("problem"),
					t.Literal("idea"),
					t.Literal("question"),
				]),
				message: t.String({ minLength: 3, maxLength: 2000 }),
				page: t.Optional(t.String({ maxLength: 300 })),
			}),
		},
	)
	.post(
		"/workplaces/:workplaceId/reminders/unacknowledged",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"schedule.publish",
			);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `schedule.reminder:${params.workplaceId}`,
				key: headers["idempotency-key"],
				request: { workplaceId: params.workplaceId },
				execute: async () => {
					const scheduleIds = (
						await db
							.select({ id: schedules.id })
							.from(schedules)
							.innerJoin(locations, eq(locations.id, schedules.locationId))
							.where(eq(locations.workplaceId, params.workplaceId))
					).map((row) => row.id);
					if (scheduleIds.length === 0) return { reminded: 0 };
					const latestIds = await latestVersionIds(scheduleIds);
					const rows = latestIds.length
						? await db
								.select({ employmentId: workerDeliveries.employmentId })
								.from(workerDeliveries)
								.where(
									and(
										inArray(workerDeliveries.versionId, latestIds),
										isNull(workerDeliveries.acknowledgedAt),
									),
								)
						: [];
					const ids = [...new Set(rows.map((row) => row.employmentId))];
					if (ids.length > 0) {
						await notifyEmployments(
							ids,
							{
								kind: "schedule_reminder",
								title: "Please review your schedule",
								body: "Your manager asked you to review and acknowledge the latest published schedule.",
							},
							db,
						);
					}
					await writeAudit({
						workplaceId: params.workplaceId,
						actorProfileId: profile.id,
						action: "schedule.reminder",
						entityType: "workplace",
						entityId: params.workplaceId,
						summary: `Sent a schedule reminder to ${ids.length} worker${ids.length === 1 ? "" : "s"}.`,
					});
					return { reminded: ids.length };
				},
			});
		},
		{
			headers: t.Object(
				{
					authorization: t.Optional(t.String()),
					"idempotency-key": t.Optional(
						t.String({ minLength: 8, maxLength: 200 }),
					),
				},
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/invitations/import",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "workers.manage");
			const dryRun = body.dryRun ?? false;
			if (dryRun) {
				return {
					import: await importWorkerInvitations({
						workplaceId: params.workplaceId,
						profileId: profile.id,
						csv: body.csv,
						dryRun: true,
					}),
				};
			}
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `invitation.import:${params.workplaceId}`,
				key: headers["idempotency-key"],
				request: { csv: body.csv },
				execute: async () => {
					consumeRateLimitOrThrow(
						`invitation.import:${profile.id}`,
						"invitationImport",
					);
					return {
						import: await importWorkerInvitations({
							workplaceId: params.workplaceId,
							profileId: profile.id,
							csv: body.csv,
							dryRun: false,
						}),
					};
				},
			});
		},
		{
			headers: t.Object(
				{
					authorization: t.Optional(t.String()),
					"idempotency-key": t.Optional(
						t.String({ minLength: 8, maxLength: 200 }),
					),
				},
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				csv: t.String({ minLength: 1, maxLength: 2_000_000 }),
				dryRun: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Import worker invitations from CSV (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/invitations/import/template.csv",
		async ({ headers, params, set }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "workers.manage");
			csvAttachment(set, "worker-import-template.csv");
			return WORKER_IMPORT_TEMPLATE;
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Download the worker import CSV template (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
