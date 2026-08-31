import {
	db,
	employments,
	invitationLocations,
	invitationPositions,
	invitations,
	locations,
	notifications,
	pilotFeedback,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shifts,
	workerDeliveries,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	requireManager,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { BadRequestError } from "../errors";
import { sendInvitationEmail } from "../mail";
import { writeAudit } from "../notify";

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

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
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/feedback",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
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
			headers: t.Object({ authorization: t.String() }),
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
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
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
			if (ids.length > 0)
				await db.insert(notifications).values(
					ids.map((employmentId) => ({
						employmentId,
						kind: "schedule_reminder",
						title: "Please review your schedule",
						body: "Your manager asked you to review and acknowledge the latest published schedule.",
					})),
				);
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "schedule.reminder",
				entityType: "workplace",
				entityId: params.workplaceId,
				summary: `Sent an in-app schedule reminder to ${ids.length} worker${ids.length === 1 ? "" : "s"}.`,
			});
			return { reminded: ids.length };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/invitations/import",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const normalized = body.rows.map((row) => ({
				...row,
				email: row.email.trim().toLowerCase(),
				position: row.position?.trim(),
				location: row.location?.trim(),
			}));
			if (
				new Set(normalized.map((row) => row.email)).size !== normalized.length
			)
				throw new BadRequestError(
					"The import contains duplicate email addresses",
				);
			const [locationRows, positionRows] = await Promise.all([
				db
					.select()
					.from(locations)
					.where(eq(locations.workplaceId, params.workplaceId)),
				db
					.select()
					.from(positions)
					.where(eq(positions.workplaceId, params.workplaceId)),
			]);
			const locationByName = new Map(
				locationRows.map((row) => [row.name.toLowerCase(), row.id]),
			);
			const positionByName = new Map(
				positionRows.map((row) => [row.name.toLowerCase(), row.id]),
			);
			for (const row of normalized) {
				if (row.location && !locationByName.has(row.location.toLowerCase()))
					throw new BadRequestError(`Unknown location: ${row.location}`);
				if (row.position && !positionByName.has(row.position.toLowerCase()))
					throw new BadRequestError(`Unknown position: ${row.position}`);
			}
			const created = await db.transaction(async (tx) => {
				const result = [];
				for (const row of normalized) {
					await tx
						.update(invitations)
						.set({ status: "revoked" })
						.where(
							and(
								eq(invitations.workplaceId, params.workplaceId),
								eq(invitations.email, row.email),
								eq(invitations.status, "pending"),
							),
						);
					const [invitation] = await tx
						.insert(invitations)
						.values({
							workplaceId: params.workplaceId,
							email: row.email,
							kind: "worker",
							invitedBy: profile.id,
							expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
						})
						.returning();
					if (!invitation) continue;
					const locationId = row.location
						? locationByName.get(row.location.toLowerCase())
						: undefined;
					const positionId = row.position
						? positionByName.get(row.position.toLowerCase())
						: undefined;
					if (locationId)
						await tx
							.insert(invitationLocations)
							.values({ invitationId: invitation.id, locationId });
					if (positionId)
						await tx
							.insert(invitationPositions)
							.values({ invitationId: invitation.id, positionId });
					result.push({ email: row.email, token: invitation.token });
				}
				return result;
			});
			const [workplace] = await db
				.select({ name: workplaces.name })
				.from(workplaces)
				.where(eq(workplaces.id, params.workplaceId))
				.limit(1);
			for (const invitation of created) {
				await sendInvitationEmail({
					email: invitation.email,
					token: invitation.token,
					workplaceName: workplace?.name ?? "your workplace",
					kind: "worker",
				});
			}
			return { invitations: created };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				rows: t.Array(
					t.Object({
						name: t.Optional(t.String({ maxLength: 160 })),
						email: t.String({ format: "email", maxLength: 200 }),
						phone: t.Optional(t.String({ maxLength: 40 })),
						position: t.Optional(t.String({ maxLength: 120 })),
						location: t.Optional(t.String({ maxLength: 160 })),
					}),
					{ minItems: 1, maxItems: 200 },
				),
			}),
		},
	);
