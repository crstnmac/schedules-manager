import {
	db,
	employments,
	timeEntries,
	timeEntryBreaks,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { roundToMinutes } from "./geo";
import { notifyEmployments, writeAudit } from "./notify";

/**
 * Close open Time Entries past published shift end + workplace grace.
 * Effective out time is endsAt + grace (rounded), not "when the job ran".
 * Leaves approvalStatus pending for manager review.
 */
export async function processAutoClockOutBatch(limit = 50): Promise<number> {
	const now = new Date();
	// Ends before now; grace applied per workplace in the loop.
	const openRows = await db
		.select({
			entryId: timeEntries.id,
			employmentId: timeEntries.employmentId,
			clockedInAt: timeEntries.clockedInAt,
			workplaceId: employments.workplaceId,
			endsAt: versionShifts.endsAt,
			graceMinutes: workplaces.autoClockOutGraceMinutes,
			roundMinutes: workplaces.clockRoundMinutes,
		})
		.from(timeEntries)
		.innerJoin(versionShifts, eq(versionShifts.id, timeEntries.versionShiftId))
		.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
		.innerJoin(workplaces, eq(workplaces.id, employments.workplaceId))
		.where(
			and(
				isNull(timeEntries.clockedOutAt),
				gt(workplaces.autoClockOutGraceMinutes, 0),
				lt(versionShifts.endsAt, now),
			),
		)
		.limit(limit * 3);

	const candidates = openRows
		.filter(
			(row) =>
				row.endsAt.getTime() + row.graceMinutes * 60_000 <= now.getTime(),
		)
		.slice(0, limit);

	let closed = 0;
	for (const row of candidates) {
		const graceMs = row.graceMinutes * 60_000;
		const target = new Date(row.endsAt.getTime() + graceMs);
		let clockedOutAt = roundToMinutes(target, row.roundMinutes);
		if (clockedOutAt.getTime() <= row.clockedInAt.getTime()) {
			clockedOutAt = new Date(row.clockedInAt.getTime() + 60_000);
		}
		if (clockedOutAt.getTime() > now.getTime()) {
			clockedOutAt = now;
		}

		const updated = await db.transaction(async (tx) => {
			const [entry] = await tx
				.update(timeEntries)
				.set({
					clockedOutAt,
					autoClosedAt: now,
				})
				.where(
					and(
						eq(timeEntries.id, row.entryId),
						isNull(timeEntries.clockedOutAt),
					),
				)
				.returning({ id: timeEntries.id });
			if (!entry) return null;

			await tx
				.update(timeEntryBreaks)
				.set({
					endedAt: sql`GREATEST(${clockedOutAt}, ${timeEntryBreaks.startedAt})`,
				})
				.where(
					and(
						eq(timeEntryBreaks.timeEntryId, entry.id),
						isNull(timeEntryBreaks.endedAt),
					),
				);

			await writeAudit(
				{
					workplaceId: row.workplaceId,
					actorProfileId: null,
					action: "time_entry.auto_clocked_out",
					entityType: "time_entry",
					entityId: entry.id,
					summary: `System closed an open Time Entry ${row.graceMinutes} minutes after shift end`,
				},
				tx,
			);
			return entry;
		});

		if (!updated) continue;
		closed += 1;
		await notifyEmployments([row.employmentId], {
			kind: "time_entry.auto_clocked_out",
			title: "You were clocked out",
			body: "Your Time Entry was closed after the shift ended. A manager will review it.",
		}).catch(() => undefined);
	}
	return closed;
}
