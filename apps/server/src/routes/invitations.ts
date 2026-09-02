import {
	db,
	employmentLocations,
	employmentPositions,
	employments,
	invitationLocations,
	invitationPositions,
	invitations,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requireSession } from "../context";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import { firstRow } from "../rows";

export const invitationsRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Invitation"],
})
	.get(
		"/invitations/pending",
		async ({ headers }) => {
			const { profile } = await requireSession(headers.authorization);

			const rows = await db
				.select({
					invitation: invitations,
					workplaceName: workplaces.name,
				})
				.from(invitations)
				.innerJoin(workplaces, eq(workplaces.id, invitations.workplaceId))
				.where(
					and(
						eq(invitations.email, profile.email.toLowerCase()),
						eq(invitations.status, "pending"),
					),
				);

			return {
				invitations: rows
					.filter((row) => row.invitation.expiresAt.getTime() > Date.now())
					.map((row) => ({
						id: row.invitation.id,
						token: row.invitation.token,
						kind: row.invitation.kind,
						workplaceName: row.workplaceName,
						expiresAt: row.invitation.expiresAt.toISOString(),
					})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			detail: {
				summary: "List unexpired pending invitations for the signed-in person",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/invitations/:token",
		async ({ params }) => {
			const [row] = await db
				.select({
					invitation: invitations,
					workplaceName: workplaces.name,
				})
				.from(invitations)
				.innerJoin(workplaces, eq(workplaces.id, invitations.workplaceId))
				.where(eq(invitations.token, params.token))
				.limit(1);

			if (!row) throw new NotFoundError("Invitation not found");

			const expired =
				row.invitation.status === "pending" &&
				row.invitation.expiresAt.getTime() <= Date.now();

			return {
				email: row.invitation.email,
				kind: row.invitation.kind,
				workplaceName: row.workplaceName,
				status: expired ? ("expired" as const) : row.invitation.status,
				expiresAt: row.invitation.expiresAt.toISOString(),
			};
		},
		{
			params: t.Object({ token: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Look up an invitation by token without signing in",
			},
		},
	)
	.post(
		"/invitations/accept",
		async ({ headers, body }) => {
			const { profile } = await requireSession(headers.authorization);

			return withIdempotency({
				actorProfileId: profile.id,
				scope: "invitation.accept",
				key: headers["idempotency-key"],
				request: { token: body.token },
				execute: async () => {
					const [invitation] = await db
						.select()
						.from(invitations)
						.where(eq(invitations.token, body.token))
						.limit(1)
						.for("update");

					if (!invitation) throw new NotFoundError("Invitation not found");
					if (invitation.status !== "pending") {
						throw new ConflictError("Invitation is no longer pending");
					}
					if (invitation.expiresAt.getTime() <= Date.now()) {
						throw new ConflictError("Invitation has expired");
					}
					if (invitation.email !== profile.email.toLowerCase()) {
						throw new ForbiddenError(
							"This invitation was issued to a different email address",
						);
					}

					const [existingEmployment] = await db
						.select({ id: employments.id })
						.from(employments)
						.where(
							and(
								eq(employments.workplaceId, invitation.workplaceId),
								eq(employments.profileId, profile.id),
							),
						)
						.limit(1);

					if (existingEmployment) {
						await db
							.update(invitations)
							.set({
								status: "accepted",
								acceptedAt: new Date(),
								acceptedProfileId: profile.id,
								acceptedEmploymentId: existingEmployment.id,
							})
							.where(eq(invitations.id, invitation.id));

						const workplace = firstRow(
							await db
								.select()
								.from(workplaces)
								.where(eq(workplaces.id, invitation.workplaceId))
								.limit(1),
						);

						return {
							employment: {
								id: existingEmployment.id,
								kind: invitation.kind === "manager" ? "manager" : "worker",
								workplace: { id: workplace.id, name: workplace.name },
							},
						};
					}

					const employment = firstRow(
						await db
							.insert(employments)
							.values({
								workplaceId: invitation.workplaceId,
								profileId: profile.id,
								kind: invitation.kind === "manager" ? "manager" : "worker",
							})
							.returning(),
					);

					const scopedLocations = await db
						.select({ locationId: invitationLocations.locationId })
						.from(invitationLocations)
						.where(eq(invitationLocations.invitationId, invitation.id));

					if (scopedLocations.length > 0) {
						await db.insert(employmentLocations).values(
							scopedLocations.map((row) => ({
								employmentId: employment.id,
								locationId: row.locationId,
							})),
						);
					}

					const scopedPositions = await db
						.select({ positionId: invitationPositions.positionId })
						.from(invitationPositions)
						.where(eq(invitationPositions.invitationId, invitation.id));

					if (scopedPositions.length > 0) {
						await db.insert(employmentPositions).values(
							scopedPositions.map((row) => ({
								employmentId: employment.id,
								positionId: row.positionId,
							})),
						);
					}

					await db
						.update(invitations)
						.set({
							status: "accepted",
							acceptedAt: new Date(),
							acceptedProfileId: profile.id,
							acceptedEmploymentId: employment.id,
						})
						.where(eq(invitations.id, invitation.id));

					const workplace = firstRow(
						await db
							.select()
							.from(workplaces)
							.where(eq(workplaces.id, invitation.workplaceId))
							.limit(1),
					);

					return {
						employment: {
							id: employment.id,
							kind: employment.kind,
							workplace: { id: workplace.id, name: workplace.name },
						},
					};
				},
			});
		},
		{
			headers: t.Object({
				authorization: t.String(),
				"idempotency-key": t.Optional(
					t.String({ minLength: 8, maxLength: 200 }),
				),
			}),
			body: t.Object({ token: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Accept a single-use invitation with its token, creating an Employment",
				security: [{ bearerAuth: [] }],
			},
		},
	);
