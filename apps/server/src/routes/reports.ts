import {
	attendanceMarks,
	db,
	employments,
	locationSales,
	locations,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	timeEntries,
	timeEntryBreaks,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requireSubscriptionCapability } from "../billing";
import { requireManager, requireSession } from "../context";
import { laborPercent } from "../labor";
import { computeLaborByEntry, distributeByWeight } from "../reports-labor";
import { minutesByZonedDate } from "../time";

function csvEscape(value: string) {
	if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
	return value;
}

type ReportEntry = {
	entryId: string;
	employmentId: string;
	name: string | null;
	email: string;
	locationName: string;
	timezone: string;
	positionId: string;
	positionName: string;
	clockedInAt: Date;
	clockedOutAt: Date | null;
	worked: number;
	breakMinutes: number;
	laborCents: number;
	approvalStatus: string;
	attendance: string | null;
};

/**
 * Load every time entry in range for a workplace with its worked minutes
 * (after breaks), per-entry labor cents (weekly + daily overtime prorated the
 * same way the scheduling endpoints do), and attendance mark. The CSV export
 * and the JSON summary are two projections of this one dataset.
 */
async function loadReportEntries(input: {
	workplaceId: string;
	from: Date;
	to: Date;
}): Promise<ReportEntry[]> {
	const rows = await db
		.select({
			entry: timeEntries,
			name: profiles.fullName,
			email: profiles.email,
			wage: employments.hourlyWageCents,
			locationName: locations.name,
			locationTimezone: locations.timezone,
			positionId: versionShifts.positionId,
			positionName: positions.name,
			weekStartDay: workplaces.weekStartDay,
			overtimeWeeklyMinutes: workplaces.overtimeWeeklyMinutes,
			overtimeDailyMinutes: workplaces.overtimeDailyMinutes,
		})
		.from(timeEntries)
		.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
		.innerJoin(workplaces, eq(workplaces.id, employments.workplaceId))
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.innerJoin(versionShifts, eq(versionShifts.id, timeEntries.versionShiftId))
		.innerJoin(positions, eq(positions.id, versionShifts.positionId))
		.innerJoin(
			scheduleVersions,
			eq(scheduleVersions.id, versionShifts.versionId),
		)
		.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.where(
			and(
				eq(employments.workplaceId, input.workplaceId),
				gte(timeEntries.clockedInAt, input.from),
				lte(timeEntries.clockedInAt, input.to),
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

	// Build per-row worked minutes (after breaks) plus the inputs the labor
	// aggregation needs. Weekly + daily overtime are computed by aggregating
	// per (employment, workplace-week) so the export matches the laborCents
	// contract used by the scheduling endpoints.
	const reportRows = rows.map((row) => {
		const out = row.entry.clockedOutAt ?? new Date();
		const raw = Math.round(
			(out.getTime() - row.entry.clockedInAt.getTime()) / 60_000,
		);
		const brk = breakByEntry.get(row.entry.id) ?? 0;
		const worked = Math.max(0, raw - brk);
		return {
			entryId: row.entry.id,
			employmentId: row.entry.employmentId,
			intervalStart: row.entry.clockedInAt,
			intervalEnd: out,
			timezone: row.locationTimezone,
			worked,
			hourlyWageCents: row.wage ?? 0,
			overtimeWeeklyMinutes: row.overtimeWeeklyMinutes,
			overtimeDailyMinutes: row.overtimeDailyMinutes,
		};
	});

	const laborByEntry = computeLaborByEntry(
		reportRows,
		rows[0]?.weekStartDay ?? 1,
	);

	return rows.map((row, index) => ({
		entryId: row.entry.id,
		employmentId: row.entry.employmentId,
		name: row.name,
		email: row.email,
		locationName: row.locationName,
		timezone: row.locationTimezone,
		positionId: row.positionId,
		positionName: row.positionName,
		clockedInAt: row.entry.clockedInAt,
		clockedOutAt: row.entry.clockedOutAt,
		worked: reportRows[index]?.worked ?? 0,
		breakMinutes: breakByEntry.get(row.entry.id) ?? 0,
		laborCents: laborByEntry.get(row.entry.id) ?? 0,
		approvalStatus: row.entry.approvalStatus,
		attendance: markByShift.get(row.entry.versionShiftId) ?? null,
	}));
}

/** Inclusive list of `YYYY-MM-DD` keys from `from` to `to`. */
function dateKeys(from: string, to: string): string[] {
	const keys: string[] = [];
	const cursor = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	while (cursor.getTime() <= end.getTime()) {
		keys.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return keys;
}

export const reportRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Reports"],
})
	.get(
		"/workplaces/:workplaceId/reports/hours.csv",
		async ({ headers, params, query, set }) => {
			const { profile } = await requireSession(headers);
			await requireManager(profile.id, params.workplaceId);
			await requireSubscriptionCapability(params.workplaceId, "labor_reports");
			const from = new Date(`${query.from}T00:00:00Z`);
			const to = new Date(`${query.to}T23:59:59Z`);

			const entries = await loadReportEntries({
				workplaceId: params.workplaceId,
				from,
				to,
			});

			const lines = [
				"worker,email,location,clocked_in,clocked_out,worked_minutes,break_minutes,labor_cents,approval,attendance",
			];
			for (const entry of entries) {
				lines.push(
					[
						csvEscape(entry.name ?? ""),
						csvEscape(entry.email),
						csvEscape(entry.locationName),
						entry.clockedInAt.toISOString(),
						entry.clockedOutAt?.toISOString() ?? "",
						String(entry.worked),
						String(entry.breakMinutes),
						String(entry.laborCents),
						entry.approvalStatus,
						entry.attendance ?? "",
					].join(","),
				);
			}
			set.headers["content-type"] = "text/csv; charset=utf-8";
			set.headers["content-disposition"] =
				`attachment; filename="hours-${query.from}-${query.to}.csv"`;
			return lines.join("\n");
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
	)
	.get(
		"/workplaces/:workplaceId/reports/summary",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			await requireManager(profile.id, params.workplaceId);
			await requireSubscriptionCapability(params.workplaceId, "labor_reports");
			const from = new Date(`${query.from}T00:00:00Z`);
			const to = new Date(`${query.to}T23:59:59Z`);

			const entries = await loadReportEntries({
				workplaceId: params.workplaceId,
				from,
				to,
			});

			const salesRows = await db
				.select({
					date: locationSales.saleDate,
					amountCents:
						sql<number>`coalesce(sum(${locationSales.amountCents}), 0)::int`.as(
							"amount_cents",
						),
				})
				.from(locationSales)
				.innerJoin(locations, eq(locations.id, locationSales.locationId))
				.where(
					and(
						eq(locations.workplaceId, params.workplaceId),
						gte(locationSales.saleDate, query.from),
						lte(locationSales.saleDate, query.to),
					),
				)
				.groupBy(locationSales.saleDate);

			const salesByDate = new Map(
				salesRows.map((row) => [row.date, row.amountCents] as const),
			);

			// Distribute each entry's worked minutes and labor across the zoned
			// calendar days it touches, weighted by raw interval minutes.
			const workedByDate = new Map<string, number>();
			const laborByDate = new Map<string, number>();
			for (const entry of entries) {
				const splits = [
					...minutesByZonedDate(
						entry.clockedInAt,
						entry.clockedOutAt ?? new Date(),
						entry.timezone,
					),
				];
				const weights = splits.map(([, minutes]) => minutes);
				const workedShares = distributeByWeight(entry.worked, weights);
				const laborShares = distributeByWeight(entry.laborCents, weights);
				splits.forEach(([date], index) => {
					workedByDate.set(
						date,
						(workedByDate.get(date) ?? 0) + (workedShares[index] ?? 0),
					);
					laborByDate.set(
						date,
						(laborByDate.get(date) ?? 0) + (laborShares[index] ?? 0),
					);
				});
			}

			const byDate = dateKeys(query.from, query.to).map((date) => {
				const workedMinutes = workedByDate.get(date) ?? 0;
				const laborCents = laborByDate.get(date) ?? 0;
				const salesCents = salesByDate.get(date) ?? 0;
				return {
					date,
					workedMinutes,
					laborCents,
					salesCents,
					laborPercent: laborPercent(laborCents, salesCents),
				};
			});

			const workerTotals = new Map<
				string,
				{ name: string; workedMinutes: number; laborCents: number }
			>();
			const positionTotals = new Map<
				string,
				{ name: string; workedMinutes: number }
			>();
			for (const entry of entries) {
				const worker = workerTotals.get(entry.employmentId) ?? {
					name: entry.name ?? entry.email,
					workedMinutes: 0,
					laborCents: 0,
				};
				worker.workedMinutes += entry.worked;
				worker.laborCents += entry.laborCents;
				workerTotals.set(entry.employmentId, worker);

				const position = positionTotals.get(entry.positionId) ?? {
					name: entry.positionName,
					workedMinutes: 0,
				};
				position.workedMinutes += entry.worked;
				positionTotals.set(entry.positionId, position);
			}

			const totalWorked = entries.reduce((sum, row) => sum + row.worked, 0);
			const totalLabor = entries.reduce((sum, row) => sum + row.laborCents, 0);
			const totalSales = salesRows.reduce(
				(sum, row) => sum + row.amountCents,
				0,
			);

			return {
				range: { from: query.from, to: query.to },
				totals: {
					workedMinutes: totalWorked,
					laborCents: totalLabor,
					salesCents: totalSales,
					laborPercent: laborPercent(totalLabor, totalSales),
					timeEntryCount: entries.length,
				},
				byDate,
				byWorker: [...workerTotals.entries()]
					.map(([employmentId, value]) => ({ employmentId, ...value }))
					.sort((a, b) => b.workedMinutes - a.workedMinutes),
				byPosition: [...positionTotals.entries()]
					.map(([positionId, value]) => ({ positionId, ...value }))
					.sort((a, b) => b.workedMinutes - a.workedMinutes),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			query: t.Object({
				from: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
				to: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
			}),
			detail: {
				summary: "Hours, labor, sales, and labor % summary (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
