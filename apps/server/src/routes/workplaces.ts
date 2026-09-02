import {
	db,
	employments,
	invitations,
	locations,
	positions,
	profiles,
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
import { fillPlaceFromAddress } from "../geocode";
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
			const filled = await fillPlaceFromAddress({
				addressLine: body.location.addressLine,
				latitude: body.location.latitude,
				longitude: body.location.longitude,
			});
			const timezone =
				body.location.timezone ?? filled.timezone ?? "America/Chicago";
			assertTimeZone(timezone);

			return db.transaction(async (tx) => {
				const [lockedProfile] = await tx
					.select({ id: profiles.id })
					.from(profiles)
					.where(eq(profiles.id, profile.id))
					.limit(1)
					.for("update");
				if (!lockedProfile) {
					throw new ForbiddenError("Profile could not be resolved");
				}

				const [existingEmployment] = await tx
					.select({ id: employments.id })
					.from(employments)
					.where(eq(employments.profileId, profile.id))
					.limit(1);
				if (existingEmployment) {
					throw new ForbiddenError(
						"You already belong to a Workplace. Workers join by invitation.",
					);
				}

				const [pendingInvite] = await tx
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
							addressLine: body.location.addressLine?.trim() || null,
							latitude: filled.latitude,
							longitude: filled.longitude,
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
					addressLine: t.Optional(t.String({ maxLength: 200 })),
					latitude: t.Optional(t.Union([t.String(), t.Null()])),
					longitude: t.Optional(t.Union([t.String(), t.Null()])),
				}),
				position: t.Object({
					name: t.String({ minLength: 1, maxLength: 120 }),
				}),
			}),
			detail: {
				summary:
					"Create the first Workplace when the caller has no Employment and no pending invitation. Additional workplaces are joined by invitation.",
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
					weekStartDay: workplace.weekStartDay,
					payPeriodType: workplace.payPeriodType,
					payPeriodAnchor: workplace.payPeriodAnchor,
					earlyClockInMinutes: workplace.earlyClockInMinutes,
					clockRoundMinutes: workplace.clockRoundMinutes,
					autoClockOutGraceMinutes: workplace.autoClockOutGraceMinutes,
					overtimeWeeklyMinutes: workplace.overtimeWeeklyMinutes,
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
						weekStartDay: body.weekStartDay ?? existing.weekStartDay,
						payPeriodType: body.payPeriodType ?? existing.payPeriodType,
						payPeriodAnchor:
							body.payPeriodAnchor === undefined
								? existing.payPeriodAnchor
								: body.payPeriodAnchor,
						earlyClockInMinutes:
							body.earlyClockInMinutes ?? existing.earlyClockInMinutes,
						clockRoundMinutes:
							body.clockRoundMinutes ?? existing.clockRoundMinutes,
						autoClockOutGraceMinutes:
							body.autoClockOutGraceMinutes ??
							existing.autoClockOutGraceMinutes,
						overtimeWeeklyMinutes:
							body.overtimeWeeklyMinutes ?? existing.overtimeWeeklyMinutes,
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
					weekStartDay: updated.weekStartDay,
					payPeriodType: updated.payPeriodType,
					payPeriodAnchor: updated.payPeriodAnchor,
					earlyClockInMinutes: updated.earlyClockInMinutes,
					clockRoundMinutes: updated.clockRoundMinutes,
					autoClockOutGraceMinutes: updated.autoClockOutGraceMinutes,
					overtimeWeeklyMinutes: updated.overtimeWeeklyMinutes,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
				noticeWindowHours: t.Optional(t.Integer({ minimum: 0, maximum: 336 })),
				weekStartDay: t.Optional(t.Integer({ minimum: 0, maximum: 6 })),
				payPeriodType: t.Optional(
					t.Union([
						t.Literal("weekly"),
						t.Literal("biweekly"),
						t.Literal("semimonthly"),
						t.Literal("monthly"),
					]),
				),
				payPeriodAnchor: t.Optional(
					t.Union([t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), t.Null()]),
				),
				earlyClockInMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 180 }),
				),
				clockRoundMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 30 })),
				autoClockOutGraceMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 720 }),
				),
				overtimeWeeklyMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 10_080 }),
				),
			}),
			detail: {
				summary:
					"Update Workplace settings, including the Notice Window for late Material Schedule Changes (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
