import {
	db,
	employments,
	invitations,
	locations,
	positions,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, gt } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	listActiveEmployments,
	requireManager,
	requireSession,
} from "../context";
import { BadRequestError, ForbiddenError, NotFoundError } from "../errors";
import { firstRow } from "../rows";

function assertTimeZone(timezone: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
	} catch {
		throw new BadRequestError(`Unknown IANA time zone: ${timezone}`);
	}
}

export const workplacesRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Workplace"],
})
	.get(
		"/workplaces",
		async ({ headers }) => {
			const { profile } = await requireSession(headers.authorization);
			const memberships = await listActiveEmployments(profile.id);

			return {
				workplaces: memberships.map(({ employment, workplace }) => ({
					id: workplace.id,
					name: workplace.name,
					kind: employment.kind,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			detail: {
				summary: "List workplaces connected through active Employments",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces",
		async ({ headers, body }) => {
			const { profile } = await requireSession(headers.authorization);

			const memberships = await listActiveEmployments(profile.id);
			if (memberships.length > 0) {
				throw new ForbiddenError(
					"You already belong to a Workplace. Workers join by invitation.",
				);
			}

			const [pendingInvite] = await db
				.select({ id: invitations.id })
				.from(invitations)
				.where(
					and(
						eq(invitations.email, profile.email.toLowerCase()),
						eq(invitations.status, "pending"),
						gt(invitations.expiresAt, new Date()),
					),
				)
				.limit(1);

			if (pendingInvite) {
				throw new ForbiddenError(
					"Accept your invitation instead of creating a Workplace.",
				);
			}

			const timezone = body.location.timezone ?? "America/Chicago";
			assertTimeZone(timezone);

			return db.transaction(async (tx) => {
				const workplace = firstRow(
					await tx.insert(workplaces).values({ name: body.name }).returning(),
				);

				await tx.insert(employments).values({
					workplaceId: workplace.id,
					profileId: profile.id,
					kind: "manager",
				});

				const location = firstRow(
					await tx
						.insert(locations)
						.values({
							workplaceId: workplace.id,
							name: body.location.name,
							timezone,
						})
						.returning(),
				);

				const position = firstRow(
					await tx
						.insert(positions)
						.values({
							workplaceId: workplace.id,
							name: body.position.name,
						})
						.returning(),
				);

				return {
					workplace: { id: workplace.id, name: workplace.name },
					location: {
						id: location.id,
						name: location.name,
						timezone: location.timezone,
					},
					position: { id: position.id, name: position.name },
				};
			});
		},
		{
			headers: t.Object({ authorization: t.String() }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 120 }),
				location: t.Object({
					name: t.String({ minLength: 1, maxLength: 120 }),
					timezone: t.Optional(t.String({ default: "America/Chicago" })),
				}),
				position: t.Object({
					name: t.String({ minLength: 1, maxLength: 120 }),
				}),
			}),
			detail: {
				summary:
					"Create a Workplace with its first Location and Position, granting the caller a Manager Employment",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const [workplace] = await db
				.select()
				.from(workplaces)
				.where(eq(workplaces.id, params.workplaceId))
				.limit(1);
			if (!workplace) throw new NotFoundError("Workplace not found");

			return {
				workplace: {
					id: workplace.id,
					name: workplace.name,
					noticeWindowHours: workplace.noticeWindowHours,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Return Workplace settings (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/workplaces/:workplaceId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const [existing] = await db
				.select()
				.from(workplaces)
				.where(eq(workplaces.id, params.workplaceId))
				.limit(1);
			if (!existing) throw new NotFoundError("Workplace not found");

			const updated = firstRow(
				await db
					.update(workplaces)
					.set({
						name: body.name ?? existing.name,
						noticeWindowHours:
							body.noticeWindowHours ?? existing.noticeWindowHours,
						updatedAt: new Date(),
					})
					.where(eq(workplaces.id, existing.id))
					.returning(),
			);

			return {
				workplace: {
					id: updated.id,
					name: updated.name,
					noticeWindowHours: updated.noticeWindowHours,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
				noticeWindowHours: t.Optional(t.Integer({ minimum: 0, maximum: 336 })),
			}),
			detail: {
				summary:
					"Update Workplace settings, including the Notice Window for late Material Schedule Changes (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
