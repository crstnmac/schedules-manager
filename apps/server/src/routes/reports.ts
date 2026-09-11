import {
	attendanceMarks,
	db,
	employments,
	locationSales,
	locations,
	openShifts,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shiftPickups,
	shiftReleases,
	shiftSwaps,
	shifts,
	timeEntries,
	timeEntryBreaks,
	timeOffRequests,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requireSubscriptionCapability } from "../billing";
import { requirePrivilege, requireSession } from "../context";
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

type CoverageShiftRow = {
	id: string;
	employmentId: string | null;
	startsAt: Date;
	endsAt: Date;
	locationId: string;
	locationName: string;
};

/** Scheduled vs assigned shift counts, minutes, fill rate, and utilization. */
function coverageMetrics(rows: CoverageShiftRow[], openCount: number) {
	let scheduledShifts = 0;
	let assignedShifts = 0;
	let scheduledMinutes = 0;
	let assignedMinutes = 0;
	for (const row of rows) {
		const minutes = Math.max(
			0,
			Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
		);
		scheduledShifts += 1;
		scheduledMinutes += minutes;
		if (row.employmentId) {
			assignedShifts += 1;
			assignedMinutes += minutes;
		}
	}
	return {
		scheduledShifts,
		assignedShifts,
		openShifts: openCount,
		fillRate: scheduledShifts > 0 ? assignedShifts / scheduledShifts : 0,
		scheduledMinutes,
		assignedMinutes,
		utilization: scheduledMinutes > 0 ? assignedMinutes / scheduledMinutes : 0,
	};
}

type RequestStatusKind = "approved" | "declined" | "pending" | "other";

type RequestRow = {
	status: string;
	createdAt: Date;
	decidedAt: Date | null;
};

/** Counts by outcome plus approval rate and average decision cycle time. */
function requestMetrics(
	rows: RequestRow[],
	classify: (status: string) => RequestStatusKind,
) {
	let approved = 0;
	let declined = 0;
	let pending = 0;
	let decisionHours = 0;
	let decidedCount = 0;
	for (const row of rows) {
		const kind = classify(row.status);
		if (kind === "approved") approved += 1;
		else if (kind === "declined") declined += 1;
		else if (kind === "pending") pending += 1;
		if (row.decidedAt) {
			decisionHours +=
				(row.decidedAt.getTime() - row.createdAt.getTime()) / 3_600_000;
			decidedCount += 1;
		}
	}
	const decided = approved + declined;
	return {
		total: rows.length,
		approved,
		declined,
		pending,
		approvalRate: decided > 0 ? approved / decided : 0,
		averageDecisionHours: decidedCount > 0 ? decisionHours / decidedCount : 0,
	};
}

function coverageStatusKind(status: string): RequestStatusKind {
	if (status === "approved") return "approved";
	if (status === "declined") return "declined";
	if (status === "pending") return "pending";
	return "other";
}

function swapStatusKind(status: string): RequestStatusKind {
	if (status === "approved") return "approved";
	if (status === "declined_by_counterparty" || status === "declined_by_manager")
		return "declined";
	if (status === "pending_counterpart" || status === "pending_manager")
		return "pending";
	return "other";
}

export const reportRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Reports"],
})
	.get(
		"/workplaces/:workplaceId/reports/hours.csv",
		async ({ headers, params, query, set }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");
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
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");
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
	)
	.get(
		"/workplaces/:workplaceId/reports/coverage",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");

			const from = new Date(`${query.from}T00:00:00Z`);
			const to = new Date(`${query.to}T23:59:59Z`);
			const locationId = query.locationId;

			const [shiftRows, openRows] = await Promise.all([
				db
					.select({
						id: shifts.id,
						employmentId: shifts.employmentId,
						startsAt: shifts.startsAt,
						endsAt: shifts.endsAt,
						locationId: locations.id,
						locationName: locations.name,
					})
					.from(shifts)
					.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
					.innerJoin(locations, eq(locations.id, schedules.locationId))
					.where(
						and(
							eq(locations.workplaceId, params.workplaceId),
							gte(shifts.startsAt, from),
							lte(shifts.startsAt, to),
							...(locationId ? [eq(locations.id, locationId)] : []),
						),
					),
				db
					.select({
						shiftId: openShifts.shiftId,
						locationId: openShifts.locationId,
						startsAt: shifts.startsAt,
					})
					.from(openShifts)
					.innerJoin(shifts, eq(shifts.id, openShifts.shiftId))
					.innerJoin(locations, eq(locations.id, openShifts.locationId))
					.where(
						and(
							eq(locations.workplaceId, params.workplaceId),
							eq(openShifts.status, "open"),
							gte(shifts.startsAt, from),
							lte(shifts.startsAt, to),
							...(locationId ? [eq(openShifts.locationId, locationId)] : []),
						),
					),
			]);

			const openByDate = new Map<string, number>();
			const openByLocation = new Map<string, number>();
			for (const row of openRows) {
				const date = row.startsAt.toISOString().slice(0, 10);
				openByDate.set(date, (openByDate.get(date) ?? 0) + 1);
				openByLocation.set(
					row.locationId,
					(openByLocation.get(row.locationId) ?? 0) + 1,
				);
			}

			const byDate = dateKeys(query.from, query.to).map((date) => {
				const dayRows = shiftRows.filter(
					(row) => row.startsAt.toISOString().slice(0, 10) === date,
				);
				return {
					date,
					...coverageMetrics(dayRows, openByDate.get(date) ?? 0),
				};
			});

			const locationNames = new Map<string, string>();
			for (const row of shiftRows) {
				locationNames.set(row.locationId, row.locationName);
			}
			const locationIds = new Set([
				...shiftRows.map((row) => row.locationId),
				...openRows.map((row) => row.locationId),
			]);
			const byLocation = [...locationIds].map((id) => ({
				locationId: id,
				name: locationNames.get(id) ?? "Unknown",
				...coverageMetrics(
					shiftRows.filter((row) => row.locationId === id),
					openByLocation.get(id) ?? 0,
				),
			}));

			return {
				range: { from: query.from, to: query.to },
				totals: coverageMetrics(shiftRows, openRows.length),
				byDate,
				byLocation,
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
				locationId: t.Optional(t.String({ format: "uuid" })),
			}),
			detail: {
				summary: "Coverage, fill rate, and utilization (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/reports/requests",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");

			const from = new Date(`${query.from}T00:00:00Z`);
			const to = new Date(`${query.to}T23:59:59Z`);

			const [timeOff, releases, pickups, swaps] = await Promise.all([
				db
					.select({
						status: timeOffRequests.status,
						createdAt: timeOffRequests.createdAt,
						decidedAt: timeOffRequests.decidedAt,
					})
					.from(timeOffRequests)
					.innerJoin(
						employments,
						eq(employments.id, timeOffRequests.employmentId),
					)
					.where(
						and(
							eq(employments.workplaceId, params.workplaceId),
							gte(timeOffRequests.createdAt, from),
							lte(timeOffRequests.createdAt, to),
						),
					),
				db
					.select({
						status: shiftReleases.status,
						createdAt: shiftReleases.createdAt,
						decidedAt: shiftReleases.decidedAt,
					})
					.from(shiftReleases)
					.innerJoin(employments, eq(employments.id, shiftReleases.requestedBy))
					.where(
						and(
							eq(employments.workplaceId, params.workplaceId),
							gte(shiftReleases.createdAt, from),
							lte(shiftReleases.createdAt, to),
						),
					),
				db
					.select({
						status: shiftPickups.status,
						createdAt: shiftPickups.createdAt,
						decidedAt: shiftPickups.decidedAt,
					})
					.from(shiftPickups)
					.innerJoin(employments, eq(employments.id, shiftPickups.requestedBy))
					.where(
						and(
							eq(employments.workplaceId, params.workplaceId),
							gte(shiftPickups.createdAt, from),
							lte(shiftPickups.createdAt, to),
						),
					),
				db
					.select({
						status: shiftSwaps.status,
						createdAt: shiftSwaps.requestedAt,
						decidedAt: shiftSwaps.decidedAt,
					})
					.from(shiftSwaps)
					.innerJoin(
						employments,
						eq(employments.id, shiftSwaps.requesterEmploymentId),
					)
					.where(
						and(
							eq(employments.workplaceId, params.workplaceId),
							gte(shiftSwaps.requestedAt, from),
							lte(shiftSwaps.requestedAt, to),
						),
					),
			]);

			return {
				range: { from: query.from, to: query.to },
				requests: [
					{ type: "time_off", ...requestMetrics(timeOff, coverageStatusKind) },
					{
						type: "shift_release",
						...requestMetrics(releases, coverageStatusKind),
					},
					{
						type: "shift_pickup",
						...requestMetrics(pickups, coverageStatusKind),
					},
					{ type: "shift_swap", ...requestMetrics(swaps, swapStatusKind) },
				],
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
				summary: "Request volume, approval rate, and cycle time (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
