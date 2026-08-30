import {
	db,
	employments,
	profiles,
	timeOffRequests,
	unavailability,
	workPreferences,
} from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	requireManager,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { managerEmploymentIds, notifyEmployments, writeAudit } from "../notify";
import { firstRow } from "../rows";

const minuteSchema = t.Integer({ minimum: 0, maximum: 1440 });
const dateSchema = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

function assertRange(startMinute: number, endMinute: number) {
	if (startMinute >= endMinute) {
		throw new BadRequestError("Start time must be before end time");
	}
}

export const constraintsRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Availability"],
})
	.get(
		"/workplaces/:workplaceId/my/constraints",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const [unavailabilityRows, preferenceRows, timeOffRows] =
				await Promise.all([
					db
						.select()
						.from(unavailability)
						.where(eq(unavailability.employmentId, employment.id)),
					db
						.select()
						.from(workPreferences)
						.where(eq(workPreferences.employmentId, employment.id))
						.limit(1),
					db
						.select()
						.from(timeOffRequests)
						.where(eq(timeOffRequests.employmentId, employment.id)),
				]);

			return {
				unavailability: unavailabilityRows.map((row) => ({
					id: row.id,
					kind: row.kind,
					weekday: row.kind === "recurring" ? row.weekday : null,
					date: row.kind === "date" ? row.specificDate : null,
					startMinute: row.startMinute,
					endMinute: row.endMinute,
					note: row.note,
				})),
				preference: preferenceRows[0]?.note ?? null,
				timeOff: timeOffRows
					.map((row) => ({
						id: row.id,
						startsAt: row.startsAt.toISOString(),
						endsAt: row.endsAt.toISOString(),
						reason: row.reason,
						status: row.status,
						decisionReason: row.decisionReason,
					}))
					.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Return the caller's Unavailability, Work Preference, and Time-off Requests",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/workplaces/:workplaceId/my/unavailability",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			for (const window of [
				...body.recurring.map((item) => ({
					...item,
					kind: "recurring" as const,
				})),
				...body.dates.map((item) => ({ ...item, kind: "date" as const })),
			]) {
				assertRange(window.startMinute, window.endMinute);
			}

			return db.transaction(async (tx) => {
				await tx
					.delete(unavailability)
					.where(eq(unavailability.employmentId, employment.id));

				const rows = [
					...body.recurring.map((item) => ({
						employmentId: employment.id,
						kind: "recurring" as const,
						weekday: item.weekday,
						startMinute: item.startMinute,
						endMinute: item.endMinute,
						note: item.note ?? null,
					})),
					...body.dates.map((item) => ({
						employmentId: employment.id,
						kind: "date" as const,
						specificDate: item.date,
						startMinute: item.startMinute,
						endMinute: item.endMinute,
						note: item.note ?? null,
					})),
				];

				if (rows.length > 0) {
					await tx.insert(unavailability).values(rows);
				}

				return { saved: rows.length };
			});
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				recurring: t.Array(
					t.Object({
						weekday: t.Integer({ minimum: 0, maximum: 6 }),
						startMinute: minuteSchema,
						endMinute: minuteSchema,
						note: t.Optional(t.String({ maxLength: 200 })),
					}),
					{ maxItems: 50 },
				),
				dates: t.Array(
					t.Object({
						date: dateSchema,
						startMinute: minuteSchema,
						endMinute: minuteSchema,
						note: t.Optional(t.String({ maxLength: 200 })),
					}),
					{ maxItems: 100 },
				),
			}),
			detail: {
				summary:
					"Replace the caller's Unavailability windows with the submitted set",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/workplaces/:workplaceId/my/preference",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			if (body.note === null || body.note.trim() === "") {
				await db
					.delete(workPreferences)
					.where(eq(workPreferences.employmentId, employment.id));
				return { preference: null };
			}

			const [existing] = await db
				.select()
				.from(workPreferences)
				.where(eq(workPreferences.employmentId, employment.id))
				.limit(1);

			if (existing) {
				await db
					.update(workPreferences)
					.set({ note: body.note.trim(), updatedAt: new Date() })
					.where(eq(workPreferences.id, existing.id));
			} else {
				await db.insert(workPreferences).values({
					employmentId: employment.id,
					note: body.note.trim(),
				});
			}

			return { preference: body.note.trim() };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				note: t.Union([t.String({ maxLength: 500 }), t.Null()]),
			}),
			detail: {
				summary: "Set or clear the caller's non-binding Work Preference note",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/my/time-off",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const startsAt = new Date(body.startsAt);
			const endsAt = new Date(body.endsAt);

			if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
				throw new BadRequestError("Invalid date or time");
			}
			if (startsAt >= endsAt) {
				throw new BadRequestError("Start must be before end");
			}

			const request = firstRow(
				await db
					.insert(timeOffRequests)
					.values({
						employmentId: employment.id,
						startsAt,
						endsAt,
						reason: body.reason ?? null,
					})
					.returning(),
			);

			await notifyEmployments(await managerEmploymentIds(params.workplaceId), {
				kind: "time_off_requested",
				title: "Time-off request",
				body: "A worker submitted a time-off request.",
			});

			return {
				request: {
					id: request.id,
					startsAt: request.startsAt.toISOString(),
					endsAt: request.endsAt.toISOString(),
					status: request.status,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				startsAt: t.String({ format: "date-time" }),
				endsAt: t.String({ format: "date-time" }),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
			detail: {
				summary: "Submit a Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/my/time-off/:requestId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const [request] = await db
				.select()
				.from(timeOffRequests)
				.where(
					and(
						eq(timeOffRequests.id, params.requestId),
						eq(timeOffRequests.employmentId, employment.id),
					),
				)
				.limit(1);

			if (!request) throw new NotFoundError("Time-off request not found");
			if (request.status !== "pending") {
				throw new ConflictError("Only pending requests can be cancelled");
			}

			await db
				.delete(timeOffRequests)
				.where(eq(timeOffRequests.id, request.id));

			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				requestId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary: "Cancel a pending Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/time-off",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const rows = await db
				.select({
					request: timeOffRequests,
					email: profiles.email,
					fullName: profiles.fullName,
				})
				.from(timeOffRequests)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, params.workplaceId));

			return {
				requests: rows
					.map((row) => ({
						id: row.request.id,
						worker: { email: row.email, fullName: row.fullName },
						startsAt: row.request.startsAt.toISOString(),
						endsAt: row.request.endsAt.toISOString(),
						reason: row.request.reason,
						status: row.request.status,
						decisionReason: row.request.decisionReason,
						createdAt: row.request.createdAt.toISOString(),
					}))
					.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "List Time-off Requests for the Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off/:requestId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const [request] = await db
				.select({
					request: timeOffRequests,
					workplaceId: employments.workplaceId,
				})
				.from(timeOffRequests)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.where(eq(timeOffRequests.id, params.requestId))
				.limit(1);

			if (!request || request.workplaceId !== params.workplaceId) {
				throw new NotFoundError("Time-off request not found");
			}
			if (request.request.status !== "pending") {
				throw new ConflictError("This request has already been decided");
			}

			const updated = firstRow(
				await db
					.update(timeOffRequests)
					.set({
						status: body.decision,
						decidedBy: profile.id,
						decisionReason: body.reason ?? null,
						decidedAt: new Date(),
					})
					.where(eq(timeOffRequests.id, request.request.id))
					.returning(),
			);

			await notifyEmployments([request.request.employmentId], {
				kind:
					body.decision === "approved"
						? "time_off_approved"
						: "time_off_declined",
				title:
					body.decision === "approved"
						? "Time off approved"
						: "Time off declined",
				body:
					body.reason?.trim() ||
					"Your manager made a decision on your time-off request.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: `time_off.${body.decision}`,
				entityType: "time_off_request",
				entityId: updated.id,
				summary: `${body.decision === "approved" ? "Approved" : "Declined"} a time-off request`,
			});

			return {
				request: {
					id: updated.id,
					status: updated.status,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				requestId: t.String({ format: "uuid" }),
			}),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
			detail: {
				summary: "Approve or decline a Time-off Request (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
