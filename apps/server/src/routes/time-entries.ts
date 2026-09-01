import {
	db,
	employments,
	positions,
	timeEntries,
	versionShifts,
} from "@SchedulesManager/db";
import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requireSession, requireWorkplaceMember } from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { writeAudit } from "../notify";

const CLOCK_IN_EARLY_WINDOW_MS = 15 * 60 * 1000;

type MyShift = {
	id: string;
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
			employmentId: versionShifts.employmentId,
			startsAt: versionShifts.startsAt,
			endsAt: versionShifts.endsAt,
			workplaceId: employments.workplaceId,
		})
		.from(versionShifts)
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
	};
}

export const timeEntryRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Time Entries"],
})
	.post(
		"/my/shifts/:versionShiftId/clock-in",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const { shift, workplaceId } = await myVersionShift(
				profile.id,
				params.versionShiftId,
			);

			const now = new Date();
			if (now.getTime() < shift.startsAt.getTime() - CLOCK_IN_EARLY_WINDOW_MS) {
				throw new BadRequestError(
					"You can start this shift up to 15 minutes before it begins",
				);
			}
			if (now.getTime() > shift.endsAt.getTime()) {
				throw new BadRequestError("This shift has already ended");
			}

			const [entry] = await db
				.insert(timeEntries)
				.values({
					versionShiftId: shift.id,
					employmentId: shift.employmentId,
					clockedInAt: now,
				})
				.onConflictDoNothing({ target: timeEntries.versionShiftId })
				.returning();

			if (!entry) {
				throw new ConflictError("You already started this shift");
			}

			await writeAudit({
				workplaceId,
				actorProfileId: profile.id,
				action: "time_entry.clocked_in",
				entityType: "time_entry",
				entityId: entry.id,
				summary: "Worker started a shift",
			});

			return { timeEntry: toPayload(entry) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ versionShiftId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Start work on an assigned shift (Time Entry)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/my/shifts/:versionShiftId/clock-out",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const { shift, workplaceId } = await myVersionShift(
				profile.id,
				params.versionShiftId,
			);

			const [entry] = await db
				.select()
				.from(timeEntries)
				.where(eq(timeEntries.versionShiftId, shift.id))
				.limit(1);
			if (!entry) throw new NotFoundError("No Time Entry for this shift");
			if (entry.clockedOutAt) return { timeEntry: toPayload(entry) };

			const [updated] = await db
				.update(timeEntries)
				.set({ clockedOutAt: new Date() })
				.where(eq(timeEntries.id, entry.id))
				.returning();
			if (!updated) throw new NotFoundError("Time Entry not found");

			await writeAudit({
				workplaceId,
				actorProfileId: profile.id,
				action: "time_entry.clocked_out",
				entityType: "time_entry",
				entityId: entry.id,
				summary: "Worker finished a shift",
			});

			return { timeEntry: toPayload(updated) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ versionShiftId: t.String({ format: "uuid" }) }),
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
	);
