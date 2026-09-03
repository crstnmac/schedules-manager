import {
	db,
	employments,
	locations,
	positions,
	schedules,
	scheduleVersions,
	timeEntries,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	requireManager,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { assertClockInGeofence, roundToMinutes } from "../geo";
import { withIdempotency } from "../idempotency";
import { writeAudit } from "../notify";

type MyShift = {
	id: string;
	shiftId: string | null;
	versionId: string;
	scheduleId: string;
	employmentId: string;
	startsAt: Date;
	endsAt: Date;
};

async function myVersionShift(
	profileId: string,
	versionShiftId: string,
): Promise<{ shift: MyShift; workplaceId: string }> {
	const [row] = await db
		.select({
			id: versionShifts.id,
			shiftId: versionShifts.shiftId,
			versionId: versionShifts.versionId,
			scheduleId: scheduleVersions.scheduleId,
			employmentId: versionShifts.employmentId,
			startsAt: versionShifts.startsAt,
			endsAt: versionShifts.endsAt,
			workplaceId: employments.workplaceId,
		})
		.from(versionShifts)
		.innerJoin(
			scheduleVersions,
			eq(scheduleVersions.id, versionShifts.versionId),
		)
		.innerJoin(employments, eq(employments.id, versionShifts.employmentId))
		.where(
			and(
				eq(versionShifts.id, versionShiftId),
				eq(employments.profileId, profileId),
				eq(employments.status, "active"),
			),
		)
		.limit(1);
	if (!row?.employmentId) throw new NotFoundError("Shift not found");
	return {
		shift: {
			id: row.id,
			shiftId: row.shiftId,
			versionId: row.versionId,
			scheduleId: row.scheduleId,
			employmentId: row.employmentId,
			startsAt: row.startsAt,
			endsAt: row.endsAt,
		},
		workplaceId: row.workplaceId,
	};
}

function toPayload(entry: typeof timeEntries.$inferSelect) {
	return {
		id: entry.id,
		versionShiftId: entry.versionShiftId,
		clockedInAt: entry.clockedInAt.toISOString(),
		clockedOutAt: entry.clockedOutAt?.toISOString() ?? null,
		workerNote: entry.workerNote,
	};
}

async function clockIn(
	profileId: string,
	versionShiftId: string,
	coords?: { latitude?: number; longitude?: number },
) {
	const { shift, workplaceId } = await myVersionShift(
		profileId,
		versionShiftId,
	);
	const now = new Date();
	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.id, workplaceId))
		.limit(1);
	const earlyMs = (workplace?.earlyClockInMinutes ?? 15) * 60_000;
	await db
		.select({ id: schedules.id })
		.from(schedules)
		.where(eq(schedules.id, shift.scheduleId))
		.for("share");
	const [latestVersion] = await db
		.select({ id: scheduleVersions.id })
		.from(scheduleVersions)
		.where(eq(scheduleVersions.scheduleId, shift.scheduleId))
		.orderBy(desc(scheduleVersions.versionNumber))
		.limit(1);
	if (latestVersion?.id !== shift.versionId) {
		throw new ConflictError(
			"This shift belongs to an outdated Schedule Version",
		);
	}
	if (now.getTime() < shift.startsAt.getTime() - earlyMs) {
		throw new BadRequestError(
			`You can start this shift up to ${workplace?.earlyClockInMinutes ?? 15} minutes before it begins`,
		);
	}
	if (now.getTime() > shift.endsAt.getTime()) {
		throw new BadRequestError("This shift has already ended");
	}

	const [location] = await db
		.select()
		.from(locations)
		.innerJoin(schedules, eq(schedules.locationId, locations.id))
		.where(eq(schedules.id, shift.scheduleId))
		.limit(1);
	const loc = location?.locations;
	assertClockInGeofence({
		geofenceRequired: workplace?.geofenceRequired ?? false,
		latitude: loc?.latitude ?? null,
		longitude: loc?.longitude ?? null,
		geofenceRadiusMeters: loc?.geofenceRadiusMeters ?? null,
		coords,
	});
	const clockedInAt = roundToMinutes(now, workplace?.clockRoundMinutes ?? 0);
	await db.execute(
		sql`select pg_advisory_xact_lock(hashtextextended(${`clock:${shift.shiftId ?? shift.id}`}, 0))`,
	);
	if (shift.shiftId) {
		const [previousPunch] = await db
			.select({ id: timeEntries.id })
			.from(timeEntries)
			.innerJoin(
				versionShifts,
				eq(versionShifts.id, timeEntries.versionShiftId),
			)
			.where(eq(versionShifts.shiftId, shift.shiftId))
			.limit(1);
		if (previousPunch)
			throw new ConflictError("You already started this shift");
	}

	const [entry] = await db
		.insert(timeEntries)
		.values({
			versionShiftId: shift.id,
			employmentId: shift.employmentId,
			clockedInAt,
		})
		.onConflictDoNothing({ target: timeEntries.versionShiftId })
		.returning();
	if (!entry) throw new ConflictError("You already started this shift");

	await writeAudit({
		workplaceId,
		actorProfileId: profileId,
		action: "time_entry.clocked_in",
		entityType: "time_entry",
		entityId: entry.id,
		summary: "Worker started a shift",
	});
	return { timeEntry: toPayload(entry) };
}

async function clockOut(
	profileId: string,
	versionShiftId: string,
	options?: { workerNote?: string },
) {
	const { shift, workplaceId } = await myVersionShift(
		profileId,
		versionShiftId,
	);
	const [entry] = await db
		.select()
		.from(timeEntries)
		.where(eq(timeEntries.versionShiftId, shift.id))
		.limit(1);
	if (!entry) throw new NotFoundError("No Time Entry for this shift");
	if (entry.clockedOutAt) return { timeEntry: toPayload(entry) };

	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.id, workplaceId))
		.limit(1);
	const clockedOutAt = roundToMinutes(
		new Date(),
		workplace?.clockRoundMinutes ?? 0,
	);

	let workerNote = entry.workerNote;
	const noteInput = options?.workerNote?.trim();
	if (noteInput) {
		if (!workplace?.timesheetNotesEnabled) {
			throw new BadRequestError(
				"Timesheet notes are disabled for this workplace",
			);
		}
		if (noteInput.length > 500) {
			throw new BadRequestError("Timesheet note must be 500 characters or fewer");
		}
		workerNote = noteInput;
	}

	const [updated] = await db
		.update(timeEntries)
		.set({ clockedOutAt, workerNote })
		.where(and(eq(timeEntries.id, entry.id), isNull(timeEntries.clockedOutAt)))
		.returning();
	if (!updated) {
		const [completed] = await db
			.select()
			.from(timeEntries)
			.where(eq(timeEntries.id, entry.id));
		if (!completed) throw new NotFoundError("Time Entry not found");
		return { timeEntry: toPayload(completed) };
	}

	await writeAudit({
		workplaceId,
		actorProfileId: profileId,
		action: "time_entry.clocked_out",
		entityType: "time_entry",
		entityId: entry.id,
		summary: "Worker finished a shift",
	});
	return { timeEntry: toPayload(updated) };
}

export const timeEntryRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Time Entries"],
})
	.post(
		"/my/shifts/:versionShiftId/clock-in",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `time-entry.clock-in:${params.versionShiftId}`,
				key: headers["idempotency-key"],
				request: { versionShiftId: params.versionShiftId, ...body },
				execute: () =>
					clockIn(profile.id, params.versionShiftId, {
						latitude: body?.latitude,
						longitude: body?.longitude,
					}),
			});
		},
		{
			headers: t.Object({
				authorization: t.String(),
				"idempotency-key": t.Optional(
					t.String({ minLength: 8, maxLength: 200 }),
				),
			}),
			params: t.Object({ versionShiftId: t.String({ format: "uuid" }) }),
			body: t.Optional(
				t.Object({
					latitude: t.Optional(t.Number()),
					longitude: t.Optional(t.Number()),
				}),
			),
			detail: {
				summary: "Start work on an assigned shift (Time Entry)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/my/shifts/:versionShiftId/clock-out",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `time-entry.clock-out:${params.versionShiftId}`,
				key: headers["idempotency-key"],
				request: { versionShiftId: params.versionShiftId, ...body },
				execute: () =>
					clockOut(profile.id, params.versionShiftId, {
						workerNote: body?.workerNote,
					}),
			});
		},
		{
			headers: t.Object({
				authorization: t.String(),
				"idempotency-key": t.Optional(
					t.String({ minLength: 8, maxLength: 200 }),
				),
			}),
			params: t.Object({ versionShiftId: t.String({ format: "uuid" }) }),
			body: t.Optional(
				t.Object({
					workerNote: t.Optional(t.String({ maxLength: 500 })),
				}),
			),
			detail: {
				summary: "Finish work on an assigned shift (Time Entry)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/my/time-entries",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const rows = await db
				.select({
					id: timeEntries.id,
					versionShiftId: timeEntries.versionShiftId,
					clockedInAt: timeEntries.clockedInAt,
					clockedOutAt: timeEntries.clockedOutAt,
					workerNote: timeEntries.workerNote,
					positionName: positions.name,
					shiftStartsAt: versionShifts.startsAt,
					shiftEndsAt: versionShifts.endsAt,
				})
				.from(timeEntries)
				.innerJoin(
					versionShifts,
					eq(versionShifts.id, timeEntries.versionShiftId),
				)
				.innerJoin(positions, eq(positions.id, versionShifts.positionId))
				.where(eq(timeEntries.employmentId, employment.id))
				.orderBy(desc(timeEntries.clockedInAt))
				.limit(50);

			return {
				timeEntries: rows.map((row) => ({
					id: row.id,
					versionShiftId: row.versionShiftId,
					positionName: row.positionName,
					shiftStartsAt: row.shiftStartsAt.toISOString(),
					shiftEndsAt: row.shiftEndsAt.toISOString(),
					clockedInAt: row.clockedInAt.toISOString(),
					clockedOutAt: row.clockedOutAt?.toISOString() ?? null,
					workerNote: row.workerNote,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Recent Time Entries for the signed-in employment",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/workplaces/:workplaceId/version-shifts/:versionShiftId/time-entry",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `time-entry.edit:${params.versionShiftId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const reason = body.reason.trim();
					if (reason.length < 3) {
						throw new BadRequestError("Record why this Time Entry is changing");
					}
					const clockedInAt = new Date(body.clockedInAt);
					const clockedOutAt =
						body.clockedOutAt === null ? null : new Date(body.clockedOutAt);
					if (Number.isNaN(clockedInAt.getTime())) {
						throw new BadRequestError("Clock-in time is not valid");
					}
					if (clockedOutAt !== null && Number.isNaN(clockedOutAt.getTime())) {
						throw new BadRequestError("Clock-out time is not valid");
					}
					if (clockedOutAt && clockedOutAt.getTime() <= clockedInAt.getTime()) {
						throw new BadRequestError("Clock-out must be after clock-in");
					}

					const [row] = await db
						.select({
							versionShift: versionShifts,
							employmentId: versionShifts.employmentId,
							workplaceId: locations.workplaceId,
						})
						.from(versionShifts)
						.innerJoin(
							scheduleVersions,
							eq(scheduleVersions.id, versionShifts.versionId),
						)
						.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
						.innerJoin(locations, eq(locations.id, schedules.locationId))
						.where(
							and(
								eq(versionShifts.id, params.versionShiftId),
								eq(locations.workplaceId, params.workplaceId),
							),
						)
						.limit(1);
					if (!row?.employmentId) {
						throw new NotFoundError("Published shift not found");
					}

					const [existing] = await db
						.select()
						.from(timeEntries)
						.where(eq(timeEntries.versionShiftId, params.versionShiftId))
						.limit(1);

					const values = {
						clockedInAt,
						clockedOutAt,
						editedAt: new Date(),
						editedByProfileId: profile.id,
						editReason: reason,
					};

					const [entry] = existing
						? await db
								.update(timeEntries)
								.set(values)
								.where(eq(timeEntries.id, existing.id))
								.returning()
						: await db
								.insert(timeEntries)
								.values({
									versionShiftId: params.versionShiftId,
									employmentId: row.employmentId,
									...values,
								})
								.returning();
					if (!entry) throw new ConflictError("Time Entry could not be saved");

					await writeAudit({
						workplaceId: row.workplaceId,
						actorProfileId: profile.id,
						action: "time_entry.edited",
						entityType: "time_entry",
						entityId: entry.id,
						summary: `Edited a Time Entry: ${reason}`,
					});
					return { timeEntry: toPayload(entry) };
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
				versionShiftId: t.String({ format: "uuid" }),
			}),
			body: t.Object({
				clockedInAt: t.String(),
				clockedOutAt: t.Union([t.String(), t.Null()]),
				reason: t.String({ minLength: 3, maxLength: 240 }),
			}),
			detail: {
				summary:
					"Create or correct a Time Entry on a published Shift, with a reason (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
