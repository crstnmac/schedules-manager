import {
	db,
	employmentLocations,
	employmentPositions,
	employments,
	invitationLocations,
	invitationPositions,
	invitations,
	locations,
	positions,
	profiles,
} from "@SchedulesManager/db";
import { and, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requireManager, requireSession } from "../context";
import { enqueueInvitationEmail } from "../email-outbox";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import { consumeRateLimitOrThrow } from "../rate-limit";
import { firstRow } from "../rows";

const INVITATION_TTL_DAYS = 14;

const emailSchema = t.String({
	format: "email",
	maxLength: 200,
});

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function assertDeliverableInvitationEmail(email: string) {
	const domain = email.split("@").at(-1) ?? "";
	if (
		domain === "example.com" ||
		domain === "example.net" ||
		domain === "example.org" ||
		domain.endsWith(".invalid") ||
		domain.endsWith(".localhost") ||
		domain.endsWith(".test")
	) {
		throw new BadRequestError(
			"Use a deliverable email address so the person can create an account and accept the invitation",
		);
	}
}

export const workersRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Worker"],
})
	.get(
		"/workplaces/:workplaceId/workers",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const employmentRows = await db
				.select({
					employment: employments,
					profile: profiles,
				})
				.from(employments)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, params.workplaceId));

			const employmentIds = employmentRows.map((row) => row.employment.id);

			const locationRows = employmentIds.length
				? await db
						.select()
						.from(employmentLocations)
						.where(inArray(employmentLocations.employmentId, employmentIds))
				: [];
			const positionRows = employmentIds.length
				? await db
						.select()
						.from(employmentPositions)
						.where(inArray(employmentPositions.employmentId, employmentIds))
				: [];

			const invitationRows = await db
				.select()
				.from(invitations)
				.where(eq(invitations.workplaceId, params.workplaceId));

			return {
				workers: employmentRows.map(({ employment, profile: person }) => ({
					employmentId: employment.id,
					kind: employment.kind,
					status: employment.status,
					joinedAt: employment.createdAt.toISOString(),
					profile: {
						id: person.id,
						email: person.email,
						fullName: person.fullName,
					},
					locationIds: locationRows
						.filter((row) => row.employmentId === employment.id)
						.map((row) => row.locationId),
					positionIds: positionRows
						.filter((row) => row.employmentId === employment.id)
						.map((row) => row.positionId),
				})),
				invitations: invitationRows.map((invitation) => ({
					id: invitation.id,
					email: invitation.email,
					kind: invitation.kind,
					status: invitation.status,
					createdAt: invitation.createdAt.toISOString(),
					expiresAt: invitation.expiresAt.toISOString(),
					token:
						invitation.status === "pending" &&
						invitation.expiresAt.getTime() > Date.now()
							? invitation.token
							: null,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"List the Worker directory and invitations for a Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/invitations",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const email = normalizeEmail(body.email);
			assertDeliverableInvitationEmail(email);
			const requestedLocationIds = body.locationIds ?? [];
			const requestedPositionIds = body.positionIds ?? [];

			return withIdempotency({
				actorProfileId: profile.id,
				scope: `invitation.create:${params.workplaceId}`,
				key: headers["idempotency-key"],
				request: {
					email,
					kind: body.kind,
					locationIds: requestedLocationIds,
					positionIds: requestedPositionIds,
				},
				execute: async () => {
					consumeRateLimitOrThrow(
						`invitation.create:${profile.id}`,
						"invitationCreate",
					);
					const [existingProfile] = await db
						.select({ id: profiles.id })
						.from(profiles)
						.where(eq(profiles.email, email))
						.limit(1);

					if (existingProfile) {
						const [existingEmployment] = await db
							.select({ id: employments.id })
							.from(employments)
							.where(
								and(
									eq(employments.workplaceId, params.workplaceId),
									eq(employments.profileId, existingProfile.id),
									eq(employments.status, "active"),
								),
							)
							.limit(1);

						if (existingEmployment) {
							throw new ConflictError(
								"This person already has an active Employment at this Workplace",
							);
						}
					}

					if (requestedLocationIds.length > 0) {
						const found = await db
							.select({ id: locations.id })
							.from(locations)
							.where(
								and(
									eq(locations.workplaceId, params.workplaceId),
									inArray(locations.id, requestedLocationIds),
								),
							);
						if (found.length !== requestedLocationIds.length) {
							throw new NotFoundError("One or more Locations were not found");
						}
					}

					if (requestedPositionIds.length > 0) {
						const found = await db
							.select({ id: positions.id })
							.from(positions)
							.where(
								and(
									eq(positions.workplaceId, params.workplaceId),
									inArray(positions.id, requestedPositionIds),
								),
							);
						if (found.length !== requestedPositionIds.length) {
							throw new NotFoundError("One or more Positions were not found");
						}
					}

					const expiresAt = new Date(
						Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
					);

					const result = await db.transaction(async (tx) => {
						await tx
							.update(invitations)
							.set({ status: "revoked" })
							.where(
								and(
									eq(invitations.workplaceId, params.workplaceId),
									eq(invitations.email, email),
									eq(invitations.status, "pending"),
								),
							);

						const invitation = firstRow(
							await tx
								.insert(invitations)
								.values({
									workplaceId: params.workplaceId,
									email,
									kind: body.kind,
									invitedBy: profile.id,
									expiresAt,
								})
								.returning(),
						);

						if (requestedLocationIds.length > 0) {
							await tx.insert(invitationLocations).values(
								requestedLocationIds.map((locationId) => ({
									invitationId: invitation.id,
									locationId,
								})),
							);
						}

						if (requestedPositionIds.length > 0) {
							await tx.insert(invitationPositions).values(
								requestedPositionIds.map((positionId) => ({
									invitationId: invitation.id,
									positionId,
								})),
							);
						}

						await enqueueInvitationEmail(tx, invitation);
						return {
							invitation: {
								id: invitation.id,
								email: invitation.email,
								kind: invitation.kind,
								status: invitation.status,
								token: invitation.token,
								expiresAt: invitation.expiresAt.toISOString(),
							},
						};
					});

					return result;
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
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				email: emailSchema,
				kind: t.Union([t.Literal("worker"), t.Literal("manager")], {
					default: "worker",
				}),
				locationIds: t.Optional(t.Array(t.String({ format: "uuid" }))),
				positionIds: t.Optional(t.Array(t.String({ format: "uuid" }))),
			}),
			detail: {
				summary: "Invite a Worker or Manager by email (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/invitations/:invitationId/resend",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			return withIdempotency({
				actorProfileId: profile.id,
				scope: `invitation.resend:${params.invitationId}`,
				key: headers["idempotency-key"],
				request: {
					workplaceId: params.workplaceId,
					invitationId: params.invitationId,
				},
				execute: async () => {
					consumeRateLimitOrThrow(
						`invitation.resend:${profile.id}`,
						"invitationResend",
					);
					const [invitation] = await db
						.select()
						.from(invitations)
						.where(
							and(
								eq(invitations.id, params.invitationId),
								eq(invitations.workplaceId, params.workplaceId),
							),
						)
						.limit(1);

					if (!invitation) throw new NotFoundError("Invitation not found");
					if (invitation.status !== "pending") {
						throw new ConflictError("Only pending invitations can be resent");
					}

					const expiresAt = new Date(
						Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
					);

					const updated = await db.transaction(async (tx) => {
						const refreshed = firstRow(
							await tx
								.update(invitations)
								.set({ token: crypto.randomUUID(), expiresAt })
								.where(
									and(
										eq(invitations.id, invitation.id),
										eq(invitations.status, "pending"),
									),
								)
								.returning(),
						);
						await enqueueInvitationEmail(tx, refreshed);
						return refreshed;
					});

					return {
						invitation: {
							id: updated.id,
							email: updated.email,
							status: updated.status,
							token: updated.token,
							expiresAt: updated.expiresAt.toISOString(),
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
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				invitationId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary: "Resend a pending invitation with a fresh token (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/invitations/:invitationId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const [invitation] = await db
				.select()
				.from(invitations)
				.where(
					and(
						eq(invitations.id, params.invitationId),
						eq(invitations.workplaceId, params.workplaceId),
					),
				)
				.limit(1);

			if (!invitation) throw new NotFoundError("Invitation not found");

			await db
				.update(invitations)
				.set({ status: "revoked" })
				.where(eq(invitations.id, invitation.id));

			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				invitationId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary: "Revoke an invitation (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/employments/:employmentId/deactivate",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			if (params.employmentId === params.workplaceId) {
				throw new BadRequestError("Invalid employment");
			}

			const [employment] = await db
				.select()
				.from(employments)
				.where(
					and(
						eq(employments.id, params.employmentId),
						eq(employments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);

			if (!employment) throw new NotFoundError("Employment not found");
			if (employment.profileId === profile.id) {
				throw new ConflictError("You cannot deactivate your own Employment");
			}
			if (employment.status === "deactivated") {
				throw new ConflictError("Employment is already deactivated");
			}

			const updated = firstRow(
				await db
					.update(employments)
					.set({ status: "deactivated", deactivatedAt: new Date() })
					.where(eq(employments.id, employment.id))
					.returning(),
			);

			return { employmentId: updated.id, status: updated.status };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				employmentId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary:
					"Deactivate an Employment so the person immediately loses access (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
