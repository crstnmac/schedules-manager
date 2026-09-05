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
import { computeLaborByEntry, type ReportRow } from "../reports-labor";

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
				locationTimezone: locations.timezone,
				weekStartDay: workplaces.weekStartDay,
				overtimeWeeklyMinutes: workplaces.overtimeWeeklyMinutes,
				overtimeDailyMinutes: workplaces.overtimeDailyMinutes,
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
					Math.round(
						(row.endedAt.getTime() - row.startedAt.getTime()) / 60_000,
					),
			);
		}

		const marks = await db.select().from(attendanceMarks);
		const markByShift = new Map(
			marks.map((row) => [row.versionShiftId, row.kind]),
		);

		// Build per-row worked minutes (after breaks) plus the inputs the
		// labor aggregation needs. Weekly + daily overtime are computed by
		// aggregating per (employment, workplace-week) so the CSV matches the
		// laborCents contract used by the scheduling endpoints.
		const reportRows: ReportRow[] = [];
		const perRow = rows.map((row) => {
			const out = row.entry.clockedOutAt ?? new Date();
			const raw = Math.round(
				(out.getTime() - row.entry.clockedInAt.getTime()) / 60_000,
			);
			const brk = breakByEntry.get(row.entry.id) ?? 0;
			const worked = Math.max(0, raw - brk);
			reportRows.push({
				entryId: row.entry.id,
				employmentId: row.entry.employmentId,
				intervalStart: row.entry.clockedInAt,
				intervalEnd: out,
				timezone: row.locationTimezone,
				worked,
				hourlyWageCents: row.wage ?? 0,
				overtimeWeeklyMinutes: row.overtimeWeeklyMinutes,
				overtimeDailyMinutes: row.overtimeDailyMinutes,
			});
			return { row, brk, worked };
		});

		const laborByEntry = computeLaborByEntry(
			reportRows,
			rows[0]?.weekStartDay ?? 1,
		);

		const lines = [
			"worker,email,location,clocked_in,clocked_out,worked_minutes,break_minutes,labor_cents,approval,attendance",
		];
		for (const item of perRow) {
			const { row } = item;
			lines.push(
				[
					csvEscape(row.name ?? ""),
					csvEscape(row.email),
					csvEscape(row.locationName),
					row.entry.clockedInAt.toISOString(),
					row.entry.clockedOutAt?.toISOString() ?? "",
					String(item.worked),
					String(item.brk),
					String(laborByEntry.get(row.entry.id) ?? 0),
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
