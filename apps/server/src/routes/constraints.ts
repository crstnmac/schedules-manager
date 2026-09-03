import {
	db,
	employments,
	leaveTypes,
	locations,
	profiles,
	ptoBalances,
	timeOffRequests,
	unavailability,
	workPreferences,
} from "@SchedulesManager/db";
import { and, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	requireManager,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { describeLeaveWindow, resolveLeaveWindow } from "../leave";
import { managerEmploymentIds, notifyEmployments, writeAudit } from "../notify";
import { firstRow } from "../rows";
import { assertWorkplaceEnabled, loadWorkplace } from "../workplace-policy";

const minuteSchema = t.Integer({ minimum: 0, maximum: 1440 });
const dateSchema = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const leaveWindowBody = t.Object({
	startsAt: t.Optional(t.String({ format: "date-time" })),
	endsAt: t.Optional(t.String({ format: "date-time" })),
	startDate: t.Optional(dateSchema),
	endDate: t.Optional(dateSchema),
	allDay: t.Optional(t.Boolean()),
	startMinute: t.Optional(minuteSchema),
	endMinute: t.Optional(minuteSchema),
	reason: t.Optional(t.String({ maxLength: 300 })),
	leaveTypeId: t.Optional(t.String({ format: "uuid" })),
});

function unavailabilityKey(window: {
	kind: string;
	weekday: number | null;
	specificDate: string | null;
	startMinute: number;
	endMinute: number;
}) {
	return [
		window.kind,
		window.weekday ?? "",
		window.specificDate ?? "",
		window.startMinute,
		window.endMinute,
	].join(":");
}

function assertRange(startMinute: number, endMinute: number) {
	if (startMinute >= endMinute) {
		throw new BadRequestError("Start time must be before end time");
	}
}

async function workplaceTimeZone(workplaceId: string): Promise<string> {
	const [location] = await db
		.select({ timezone: locations.timezone })
		.from(locations)
		.where(eq(locations.workplaceId, workplaceId))
		.limit(1);
	return location?.timezone ?? "America/Chicago";
}

function resolveLeaveBody(
	body: {
		startsAt?: string;
		endsAt?: string;
		startDate?: string;
		endDate?: string;
		allDay?: boolean;
		startMinute?: number;
		endMinute?: number;
	},
	timeZone: string,
) {
	if (body.startDate) {
		return resolveLeaveWindow({
			startDate: body.startDate,
			endDate: body.endDate ?? body.startDate,
			allDay: body.allDay ?? true,
			startMinute: body.startMinute,
			endMinute: body.endMinute,
			timeZone,
		});
	}
	if (!body.startsAt || !body.endsAt) {
		throw new BadRequestError("Choose a start date");
	}
	const startsAt = new Date(body.startsAt);
	const endsAt = new Date(body.endsAt);
	if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
		throw new BadRequestError("Invalid date or time");
	}
	if (startsAt >= endsAt) {
		throw new BadRequestError("Start must be before end");
	}
	return {
		startsAt,
		endsAt,
		...describeLeaveWindow(startsAt, endsAt, timeZone),
	};
}

async function deductPto(
	employmentId: string,
	leaveTypeId: string,
	minutes: number,
) {
	if (minutes <= 0) return;
	await db
		.insert(ptoBalances)
		.values({
			employmentId,
			leaveTypeId,
			minutes: 0,
		})
		.onConflictDoNothing();
	await db
		.update(ptoBalances)
		.set({
			minutes: sql`greatest(${ptoBalances.minutes} - ${minutes}, 0)`,
		})
		.where(
			and(
				eq(ptoBalances.employmentId, employmentId),
				eq(ptoBalances.leaveTypeId, leaveTypeId),
			),
		);
}

async function restorePto(
	employmentId: string,
	leaveTypeId: string,
	minutes: number,
) {
	if (minutes <= 0) return;
	await db
		.insert(ptoBalances)
		.values({
			employmentId,
			leaveTypeId,
			minutes,
		})
		.onConflictDoUpdate({
			target: [ptoBalances.employmentId, ptoBalances.leaveTypeId],
			set: {
				minutes: sql`${ptoBalances.minutes} + ${minutes}`,
			},
		});
}

async function loadWorkplaceTimeOff(workplaceId: string, requestId: string) {
	const [row] = await db
		.select({
			request: timeOffRequests,
			workplaceId: employments.workplaceId,
		})
		.from(timeOffRequests)
		.innerJoin(employments, eq(employments.id, timeOffRequests.employmentId))
		.where(eq(timeOffRequests.id, requestId))
		.limit(1);
	if (!row || row.workplaceId !== workplaceId) {
		throw new NotFoundError("Time-off request not found");
	}
	return row.request;
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

			const timeZone = await workplaceTimeZone(params.workplaceId);
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
					status: row.status,
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
						leaveTypeId: row.leaveTypeId,
						...describeLeaveWindow(row.startsAt, row.endsAt, timeZone),
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
			const workplace = await loadWorkplace(params.workplaceId);
			const requiresApproval = workplace.unavailabilityRequiresApproval;

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
				const submitted = [
					...body.recurring.map((item) => ({
						employmentId: employment.id,
						kind: "recurring" as const,
						weekday: item.weekday,
						specificDate: null as string | null,
						startMinute: item.startMinute,
						endMinute: item.endMinute,
						note: item.note ?? null,
					})),
					...body.dates.map((item) => ({
						employmentId: employment.id,
						kind: "date" as const,
						weekday: null as number | null,
						specificDate: item.date,
						startMinute: item.startMinute,
						endMinute: item.endMinute,
						note: item.note ?? null,
					})),
				];

				if (!requiresApproval) {
					await tx
						.delete(unavailability)
						.where(eq(unavailability.employmentId, employment.id));
					if (submitted.length > 0) {
						await tx.insert(unavailability).values(
							submitted.map((row) => ({
								...row,
								status: "approved" as const,
							})),
						);
					}
					return { saved: submitted.length, pending: 0 };
				}

				const existing = await tx
					.select()
					.from(unavailability)
					.where(eq(unavailability.employmentId, employment.id));
				const approved = existing.filter((row) => row.status === "approved");
				const approvedKeys = new Set(approved.map(unavailabilityKey));
				const submittedKeys = new Set(
					submitted.map((row) =>
						unavailabilityKey({
							kind: row.kind,
							weekday: row.weekday,
							specificDate: row.specificDate,
							startMinute: row.startMinute,
							endMinute: row.endMinute,
						}),
					),
				);

				await tx
					.delete(unavailability)
					.where(
						and(
							eq(unavailability.employmentId, employment.id),
							eq(unavailability.status, "pending"),
						),
					);

				const pendingRows = submitted.filter(
					(row) =>
						!approvedKeys.has(
							unavailabilityKey({
								kind: row.kind,
								weekday: row.weekday,
								specificDate: row.specificDate,
								startMinute: row.startMinute,
								endMinute: row.endMinute,
							}),
						),
				);
				if (pendingRows.length > 0) {
					await tx.insert(unavailability).values(
						pendingRows.map((row) => ({
							...row,
							status: "pending" as const,
						})),
					);
					await notifyEmployments(
						await managerEmploymentIds(params.workplaceId),
						{
							kind: "unavailability_requested",
							title: "Unavailability needs approval",
							body: "A worker submitted Unavailability that is waiting for approval.",
						},
					);
				}

				return {
					saved: submittedKeys.size,
					pending: pendingRows.length,
				};
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
	.post(
		"/workplaces/:workplaceId/unavailability/:unavailabilityId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const [row] = await db
				.select({
					window: unavailability,
					workplaceId: employments.workplaceId,
				})
				.from(unavailability)
				.innerJoin(employments, eq(employments.id, unavailability.employmentId))
				.where(eq(unavailability.id, params.unavailabilityId))
				.limit(1);
			if (!row || row.workplaceId !== params.workplaceId) {
				throw new NotFoundError("Unavailability not found");
			}
			if (row.window.status !== "pending") {
				throw new ConflictError("Only pending Unavailability can be decided");
			}

			if (body.decision === "declined") {
				await db
					.delete(unavailability)
					.where(eq(unavailability.id, row.window.id));
				return { ok: true as const, status: "declined" as const };
			}

			await db
				.update(unavailability)
				.set({ status: "approved" })
				.where(eq(unavailability.id, row.window.id));
			return { ok: true as const, status: "approved" as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				unavailabilityId: t.String({ format: "uuid" }),
			}),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
			}),
			detail: {
				summary: "Approve or decline pending Unavailability (Manager)",
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
			await assertWorkplaceEnabled(
				params.workplaceId,
				"workersCanRequestTimeOff",
				"Workers cannot request time off at this Workplace",
			);
			const window = resolveLeaveBody(
				body,
				await workplaceTimeZone(params.workplaceId),
			);

			const request = firstRow(
				await db
					.insert(timeOffRequests)
					.values({
						employmentId: employment.id,
						startsAt: window.startsAt,
						endsAt: window.endsAt,
						reason: body.reason ?? null,
						leaveTypeId: body.leaveTypeId ?? null,
					})
					.returning(),
			);

			await notifyEmployments(await managerEmploymentIds(params.workplaceId), {
				kind: "time_off_requested",
				title: "Time-off request",
				body: "Someone submitted a time-off request.",
			});

			return {
				request: {
					id: request.id,
					startsAt: request.startsAt.toISOString(),
					endsAt: request.endsAt.toISOString(),
					status: request.status,
					...describeLeaveWindow(
						request.startsAt,
						request.endsAt,
						await workplaceTimeZone(params.workplaceId),
					),
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: leaveWindowBody,
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
			const timeZone = await workplaceTimeZone(params.workplaceId);

			const rows = await db
				.select({
					request: timeOffRequests,
					email: profiles.email,
					fullName: profiles.fullName,
					kind: employments.kind,
					leaveTypeName: leaveTypes.name,
					leaveTypePaid: leaveTypes.paid,
					remainingMinutes: ptoBalances.minutes,
				})
				.from(timeOffRequests)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.leftJoin(leaveTypes, eq(leaveTypes.id, timeOffRequests.leaveTypeId))
				.leftJoin(
					ptoBalances,
					and(
						eq(ptoBalances.employmentId, timeOffRequests.employmentId),
						eq(ptoBalances.leaveTypeId, timeOffRequests.leaveTypeId),
					),
				)
				.where(eq(employments.workplaceId, params.workplaceId));

			const pendingUnavailability = await db
				.select({
					window: unavailability,
					email: profiles.email,
					fullName: profiles.fullName,
					employmentId: unavailability.employmentId,
				})
				.from(unavailability)
				.innerJoin(employments, eq(employments.id, unavailability.employmentId))
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(
					and(
						eq(employments.workplaceId, params.workplaceId),
						eq(unavailability.status, "pending"),
					),
				);

			return {
				timezone: timeZone,
				pendingUnavailability: pendingUnavailability.map((row) => ({
					id: row.window.id,
					employmentId: row.employmentId,
					worker: { email: row.email, fullName: row.fullName },
					kind: row.window.kind,
					weekday: row.window.weekday,
					date: row.window.specificDate,
					startMinute: row.window.startMinute,
					endMinute: row.window.endMinute,
					note: row.window.note,
					status: row.window.status,
				})),
				requests: rows
					.map((row) => {
						const window = describeLeaveWindow(
							row.request.startsAt,
							row.request.endsAt,
							timeZone,
						);
						return {
							id: row.request.id,
							employmentId: row.request.employmentId,
							kind: row.kind,
							worker: { email: row.email, fullName: row.fullName },
							startsAt: row.request.startsAt.toISOString(),
							endsAt: row.request.endsAt.toISOString(),
							reason: row.request.reason,
							status: row.request.status,
							decisionReason: row.request.decisionReason,
							decidedAt: row.request.decidedAt?.toISOString() ?? null,
							createdAt: row.request.createdAt.toISOString(),
							leaveTypeId: row.request.leaveTypeId,
							leaveTypeName: row.leaveTypeName,
							leaveTypePaid: row.leaveTypePaid ?? null,
							remainingMinutes: row.remainingMinutes ?? 0,
							...window,
						};
					})
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
		"/workplaces/:workplaceId/time-off",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const [member] = await db
				.select({
					id: employments.id,
					workplaceId: employments.workplaceId,
					kind: employments.kind,
					status: employments.status,
				})
				.from(employments)
				.where(eq(employments.id, body.employmentId))
				.limit(1);
			if (
				!member ||
				member.workplaceId !== params.workplaceId ||
				member.status !== "active"
			) {
				throw new NotFoundError("Employment not found");
			}

			const timeZone = await workplaceTimeZone(params.workplaceId);
			const window = resolveLeaveBody(body, timeZone);
			const request = firstRow(
				await db
					.insert(timeOffRequests)
					.values({
						employmentId: member.id,
						startsAt: window.startsAt,
						endsAt: window.endsAt,
						reason: body.reason ?? null,
						leaveTypeId: body.leaveTypeId ?? null,
						status: "approved",
						decidedBy: profile.id,
						decidedAt: new Date(),
					})
					.returning(),
			);

			if (body.leaveTypeId) {
				await deductPto(member.id, body.leaveTypeId, window.chargeMinutes);
			}

			await notifyEmployments([member.id], {
				kind: "time_off_approved",
				title: "Time off recorded",
				body:
					body.reason?.trim() ||
					"Your manager recorded time off on the schedule.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.recorded",
				entityType: "time_off_request",
				entityId: request.id,
				summary: "Recorded approved time off for a worker",
			});

			return {
				request: {
					id: request.id,
					status: request.status,
					startsAt: request.startsAt.toISOString(),
					endsAt: request.endsAt.toISOString(),
					...describeLeaveWindow(request.startsAt, request.endsAt, timeZone),
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				employmentId: t.String({ format: "uuid" }),
				startsAt: t.Optional(t.String({ format: "date-time" })),
				endsAt: t.Optional(t.String({ format: "date-time" })),
				startDate: t.Optional(dateSchema),
				endDate: t.Optional(dateSchema),
				allDay: t.Optional(t.Boolean()),
				startMinute: t.Optional(minuteSchema),
				endMinute: t.Optional(minuteSchema),
				reason: t.Optional(t.String({ maxLength: 300 })),
				leaveTypeId: t.Optional(t.String({ format: "uuid" })),
			}),
			detail: {
				summary: "Record approved time off for a worker (Manager)",
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

			if (body.decision === "approved" && request.request.leaveTypeId) {
				const window = describeLeaveWindow(
					request.request.startsAt,
					request.request.endsAt,
					await workplaceTimeZone(params.workplaceId),
				);
				await deductPto(
					request.request.employmentId,
					request.request.leaveTypeId,
					window.chargeMinutes,
				);
			}

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
	)
	.patch(
		"/workplaces/:workplaceId/time-off/:requestId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const existing = await loadWorkplaceTimeOff(
				params.workplaceId,
				params.requestId,
			);
			if (existing.status === "declined") {
				throw new ConflictError(
					"Declined leave cannot be edited. Delete it and create a new request.",
				);
			}

			const timeZone = await workplaceTimeZone(params.workplaceId);
			const previous = describeLeaveWindow(
				existing.startsAt,
				existing.endsAt,
				timeZone,
			);
			const next = resolveLeaveBody(body, timeZone);
			const nextLeaveTypeId =
				body.leaveTypeId === undefined
					? existing.leaveTypeId
					: body.leaveTypeId;
			const nextReason =
				body.reason === undefined
					? existing.reason
					: body.reason.trim() || null;

			const updated = firstRow(
				await db
					.update(timeOffRequests)
					.set({
						startsAt: next.startsAt,
						endsAt: next.endsAt,
						leaveTypeId: nextLeaveTypeId,
						reason: nextReason,
					})
					.where(eq(timeOffRequests.id, existing.id))
					.returning(),
			);

			if (existing.status === "approved") {
				const leaveTypeChanged =
					(existing.leaveTypeId ?? null) !== (nextLeaveTypeId ?? null);
				const chargeChanged = previous.chargeMinutes !== next.chargeMinutes;
				if (leaveTypeChanged || chargeChanged) {
					if (existing.leaveTypeId) {
						await restorePto(
							existing.employmentId,
							existing.leaveTypeId,
							previous.chargeMinutes,
						);
					}
					if (nextLeaveTypeId) {
						await deductPto(
							existing.employmentId,
							nextLeaveTypeId,
							next.chargeMinutes,
						);
					}
				}
			}

			await notifyEmployments([existing.employmentId], {
				kind: "time_off_approved",
				title: "Time off updated",
				body: "Your manager updated a time-off entry.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.updated",
				entityType: "time_off_request",
				entityId: updated.id,
				summary: "Updated a time-off entry",
			});

			return {
				request: {
					id: updated.id,
					status: updated.status,
					startsAt: updated.startsAt.toISOString(),
					endsAt: updated.endsAt.toISOString(),
					...describeLeaveWindow(updated.startsAt, updated.endsAt, timeZone),
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				requestId: t.String({ format: "uuid" }),
			}),
			body: leaveWindowBody,
			detail: {
				summary: "Edit a Time-off Request (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/time-off/:requestId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const existing = await loadWorkplaceTimeOff(
				params.workplaceId,
				params.requestId,
			);
			const timeZone = await workplaceTimeZone(params.workplaceId);
			const window = describeLeaveWindow(
				existing.startsAt,
				existing.endsAt,
				timeZone,
			);

			if (existing.status === "approved" && existing.leaveTypeId) {
				await restorePto(
					existing.employmentId,
					existing.leaveTypeId,
					window.chargeMinutes,
				);
			}

			await db
				.delete(timeOffRequests)
				.where(eq(timeOffRequests.id, existing.id));

			await notifyEmployments([existing.employmentId], {
				kind: "time_off_declined",
				title: "Time off removed",
				body: "Your manager removed a time-off entry.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.deleted",
				entityType: "time_off_request",
				entityId: existing.id,
				summary: "Deleted a time-off entry",
			});

			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				requestId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary: "Delete a Time-off Request (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/workplaces/:workplaceId/my/time-off/:requestId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [existing] = await db
				.select()
				.from(timeOffRequests)
				.where(
					and(
						eq(timeOffRequests.id, params.requestId),
						eq(timeOffRequests.employmentId, employment.id),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Time-off request not found");
			if (existing.status !== "pending") {
				throw new ConflictError("Only pending requests can be edited");
			}

			const timeZone = await workplaceTimeZone(params.workplaceId);
			const next = resolveLeaveBody(body, timeZone);
			const updated = firstRow(
				await db
					.update(timeOffRequests)
					.set({
						startsAt: next.startsAt,
						endsAt: next.endsAt,
						leaveTypeId:
							body.leaveTypeId === undefined
								? existing.leaveTypeId
								: body.leaveTypeId,
						reason:
							body.reason === undefined
								? existing.reason
								: body.reason.trim() || null,
					})
					.where(eq(timeOffRequests.id, existing.id))
					.returning(),
			);

			return {
				request: {
					id: updated.id,
					status: updated.status,
					startsAt: updated.startsAt.toISOString(),
					endsAt: updated.endsAt.toISOString(),
					...describeLeaveWindow(updated.startsAt, updated.endsAt, timeZone),
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				requestId: t.String({ format: "uuid" }),
			}),
			body: leaveWindowBody,
			detail: {
				summary: "Edit a pending Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	);
