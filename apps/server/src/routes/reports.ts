import {
	attendanceMarks,
	db,
	employments,
	locations,
	profiles,
	schedules,
	scheduleVersions,
	timeEntries,
	timeEntryBreaks,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requireManager, requireSession } from "../context";
import { laborCents } from "../labor";

function csvEscape(value: string) {
	if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
	return value;
}

export const reportRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Reports"],
}).get(
	"/workplaces/:workplaceId/reports/hours.csv",
	async ({ headers, params, query, set }) => {
		const { profile } = await requireSession(headers.authorization);
		await requireManager(profile.id, params.workplaceId);
		const from = new Date(`${query.from}T00:00:00Z`);
		const to = new Date(`${query.to}T23:59:59Z`);

		const rows = await db
			.select({
				entry: timeEntries,
				name: profiles.fullName,
				email: profiles.email,
				wage: employments.hourlyWageCents,
				locationName: locations.name,
				overtimeWeeklyMinutes: workplaces.overtimeWeeklyMinutes,
			})
			.from(timeEntries)
			.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
			.innerJoin(workplaces, eq(workplaces.id, employments.workplaceId))
			.innerJoin(profiles, eq(profiles.id, employments.profileId))
			.innerJoin(
				versionShifts,
				eq(versionShifts.id, timeEntries.versionShiftId),
			)
			.innerJoin(
				scheduleVersions,
				eq(scheduleVersions.id, versionShifts.versionId),
			)
			.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
			.innerJoin(locations, eq(locations.id, schedules.locationId))
			.where(
				and(
					eq(employments.workplaceId, params.workplaceId),
					gte(timeEntries.clockedInAt, from),
					lte(timeEntries.clockedInAt, to),
				),
			);

		const breaks = await db.select().from(timeEntryBreaks);
		const breakByEntry = new Map<string, number>();
		for (const row of breaks) {
			if (!row.endedAt) continue;
			breakByEntry.set(
				row.timeEntryId,
				(breakByEntry.get(row.timeEntryId) ?? 0) +
					Math.max(
						0,
						Math.round(
							(row.endedAt.getTime() - row.startedAt.getTime()) / 60_000,
						),
					),
			);
		}

		const marks = await db.select().from(attendanceMarks);
		const markByShift = new Map(
			marks.map((row) => [row.versionShiftId, row.kind]),
		);

		const lines = [
			"worker,email,location,clocked_in,clocked_out,worked_minutes,break_minutes,labor_cents,approval,attendance",
		];
		for (const row of rows) {
			const out = row.entry.clockedOutAt ?? new Date();
			const raw = Math.round(
				(out.getTime() - row.entry.clockedInAt.getTime()) / 60_000,
			);
			const brk = breakByEntry.get(row.entry.id) ?? 0;
			const worked = Math.max(0, raw - brk);
			const labor = laborCents({
				minutes: worked,
				hourlyWageCents: row.wage ?? 0,
				overtimeWeeklyMinutes: row.overtimeWeeklyMinutes ?? 2400,
			});
			lines.push(
				[
					csvEscape(row.name ?? ""),
					csvEscape(row.email),
					csvEscape(row.locationName),
					row.entry.clockedInAt.toISOString(),
					row.entry.clockedOutAt?.toISOString() ?? "",
					String(worked),
					String(brk),
					String(labor.totalCents),
					row.entry.approvalStatus,
					markByShift.get(row.entry.versionShiftId) ?? "",
				].join(","),
			);
		}
		set.headers["content-type"] = "text/csv; charset=utf-8";
		set.headers["content-disposition"] =
			`attachment; filename="hours-${query.from}-${query.to}.csv"`;
		return lines.join("\n");
	},
	{
		headers: t.Object({ authorization: t.String() }),
		params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
		query: t.Object({
			from: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
			to: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
		}),
		detail: {
			summary: "Hours, labor, and attendance CSV (Manager)",
			security: [{ bearerAuth: [] }],
		},
	},
);
