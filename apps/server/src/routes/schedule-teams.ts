import { db, locations, scheduleTeams } from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requirePrivilege, requireSession } from "../context";
import { ConflictError, NotFoundError } from "../errors";

const uuid = t.String({ format: "uuid" });
const authHeaders = t.Object(
	{ authorization: t.Optional(t.String()) },
	{ additionalProperties: true },
);

export interface ScheduleTeamDto {
	id: string;
	name: string;
	color: string | null;
	locationId: string;
}

function serializeTeam(
	team: typeof scheduleTeams.$inferSelect,
): ScheduleTeamDto {
	return {
		id: team.id,
		name: team.name,
		color: team.color,
		locationId: team.locationId,
	};
}

async function locationWithSettings(profileId: string, locationId: string) {
	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, locationId))
		.limit(1);
	if (!location) throw new NotFoundError("Location not found");
	await requirePrivilege(profileId, location.workplaceId, "settings.manage");
	return location;
}

export const scheduleTeamRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Schedule Teams"],
})
	.get(
		"/locations/:locationId/schedule-teams",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const location = await locationWithSettings(
				profile.id,
				params.locationId,
			);
			const teams = await db
				.select()
				.from(scheduleTeams)
				.where(eq(scheduleTeams.locationId, location.id))
				.orderBy(scheduleTeams.name);
			return { teams: teams.map(serializeTeam) };
		},
		{
			headers: authHeaders,
			params: t.Object({ locationId: uuid }),
			detail: {
				summary: "List a Location's schedule teams (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedule-teams",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const location = await locationWithSettings(
				profile.id,
				params.locationId,
			);
			const [created] = await db
				.insert(scheduleTeams)
				.values({
					workplaceId: location.workplaceId,
					locationId: location.id,
					name: body.name.trim(),
					color: body.color?.trim() || null,
				})
				.onConflictDoNothing({
					target: [scheduleTeams.locationId, scheduleTeams.name],
				})
				.returning();
			if (!created) {
				throw new ConflictError(
					"A schedule team with that name already exists",
				);
			}
			return { team: serializeTeam(created) };
		},
		{
			headers: authHeaders,
			params: t.Object({ locationId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 60 }),
				color: t.Optional(t.Union([t.String({ maxLength: 32 }), t.Null()])),
			}),
			detail: {
				summary: "Create a schedule team for a Location (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/locations/:locationId/schedule-teams/:teamId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const location = await locationWithSettings(
				profile.id,
				params.locationId,
			);
			const name = body.name?.trim();
			if (name) {
				const [clash] = await db
					.select({ id: scheduleTeams.id })
					.from(scheduleTeams)
					.where(
						and(
							eq(scheduleTeams.locationId, location.id),
							eq(scheduleTeams.name, name),
						),
					)
					.limit(1);
				if (clash && clash.id !== params.teamId) {
					throw new ConflictError(
						"A schedule team with that name already exists",
					);
				}
			}
			const [updated] = await db
				.update(scheduleTeams)
				.set({
					name,
					color:
						body.color === undefined ? undefined : body.color?.trim() || null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(scheduleTeams.id, params.teamId),
						eq(scheduleTeams.locationId, location.id),
					),
				)
				.returning();
			if (!updated) throw new NotFoundError("Schedule team not found");
			return { team: serializeTeam(updated) };
		},
		{
			headers: authHeaders,
			params: t.Object({ locationId: uuid, teamId: uuid }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 60 })),
				color: t.Optional(t.Union([t.String({ maxLength: 32 }), t.Null()])),
			}),
			detail: {
				summary: "Update a schedule team (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/locations/:locationId/schedule-teams/:teamId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const location = await locationWithSettings(
				profile.id,
				params.locationId,
			);
			await db
				.delete(scheduleTeams)
				.where(
					and(
						eq(scheduleTeams.id, params.teamId),
						eq(scheduleTeams.locationId, location.id),
					),
				);
			return { ok: true as const };
		},
		{
			headers: authHeaders,
			params: t.Object({ locationId: uuid, teamId: uuid }),
			detail: {
				summary: "Delete a schedule team and its schedules (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
