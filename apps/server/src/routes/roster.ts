import {
	attendanceMarks,
	db,
	employments,
	locations,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	timeOffRequests,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	locationScopeFor,
	requireManager,
	requireSession,
	requireWorkplaceMember,
	weekStartDayFor,
} from "../context";
import { BadRequestError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import { notifyEmployments, writeAudit } from "../notify";
import { weekStartOfDateKey } from "../time";
import { loadWorkplace } from "../workplace-policy";
import { publicWorkerName } from "../schedule-conflicts";

function zonedDateKey(instant: Date, timezone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(instant);
}

export const rosterRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Daily Roster"],
})
	.get(
		"/workplaces/:workplaceId/my/day-roster",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const workplace = await loadWorkplace(params.workplaceId);
			const showTeam =
				employment.kind === "manager" ||
				workplace.workerScheduleVisibility === "full";
			const showContacts =
				employment.kind === "manager" || workplace.contactDetailsVisible;
			const showOthersTimeOff =
				employment.kind === "manager" || workplace.workerTimeOffVisibility;

			const scope = await locationScopeFor(employment);
			if (scope.length === 0) return { roster: [], timeOff: [] };

			const weekStart = weekStartOfDateKey(
				query.date,
				await weekStartDayFor(params.workplaceId),
			);

			const scheduleRows = await db
				.select({ schedule: schedules, timezone: locations.timezone })
				.from(schedules)
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.where(
					and(
						inArray(schedules.locationId, scope),
						eq(schedules.weekStartDate, weekStart),
					),
				);
			if (scheduleRows.length === 0) return { roster: [], timeOff: [] };

			const latestVersions = await Promise.all(
				scheduleRows.map(async (row) => {
					const [latest] = await db
						.select()
						.from(scheduleVersions)
						.where(eq(scheduleVersions.scheduleId, row.schedule.id))
						.orderBy(desc(scheduleVersions.versionNumber))
						.limit(1);
					return latest ? { version: latest, timezone: row.timezone } : null;
				}),
			);
			const versions = latestVersions.filter(
				(row): row is NonNullable<typeof row> => row !== null,
			);
			if (versions.length === 0) return { roster: [], timeOff: [] };

			const shiftRows = await db
				.select({
					shift: versionShifts,
					positionName: positions.name,
					name: profiles.fullName,
					email: profiles.email,
				})
				.from(versionShifts)
				.innerJoin(positions, eq(positions.id, versionShifts.positionId))
				.leftJoin(employments, eq(employments.id, versionShifts.employmentId))
				.leftJoin(profiles, eq(profiles.id, employments.profileId))
				.where(
					inArray(
						versionShifts.versionId,
						versions.map((row) => row.version.id),
					),
				);

			const roster = shiftRows
				.filter((row) => {
					const timezone =
						versions.find((v) => v.version.id === row.shift.versionId)
							?.timezone ?? "America/Chicago";
					if (zonedDateKey(row.shift.startsAt, timezone) !== query.date) {
						return false;
					}
					if (showTeam) return true;
					return (
						row.shift.employmentId === employment.id ||
						row.shift.employmentId === null
					);
				})
				.map((row) => ({
					versionShiftId: row.shift.id,
					employmentId: row.shift.employmentId,
					workerName: row.shift.employmentId
						? publicWorkerName(row.name, row.email ?? "", showContacts)
						: "Open shift",
					positionName: row.positionName,
					startsAt: row.shift.startsAt.toISOString(),
					endsAt: row.shift.endsAt.toISOString(),
					mine: employment.id === row.shift.employmentId,
				}))
				.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

			const timeOffRows =
				showOthersTimeOff || employment.kind === "manager"
					? await db
							.select({
								request: timeOffRequests,
								name: profiles.fullName,
								email: profiles.email,
								employmentId: timeOffRequests.employmentId,
							})
							.from(timeOffRequests)
							.innerJoin(
								employments,
								eq(employments.id, timeOffRequests.employmentId),
							)
							.innerJoin(profiles, eq(profiles.id, employments.profileId))
							.where(
								and(
									eq(employments.workplaceId, params.workplaceId),
									eq(timeOffRequests.status, "approved"),
								),
							)
					: await db
							.select({
								request: timeOffRequests,
								name: profiles.fullName,
								email: profiles.email,
								employmentId: timeOffRequests.employmentId,
							})
							.from(timeOffRequests)
							.innerJoin(
								employments,
								eq(employments.id, timeOffRequests.employmentId),
							)
							.innerJoin(profiles, eq(profiles.id, employments.profileId))
							.where(
								and(
									eq(timeOffRequests.employmentId, employment.id),
									eq(timeOffRequests.status, "approved"),
								),
							);

			const dayStart = new Date(`${query.date}T00:00:00Z`);
			const dayEnd = new Date(`${query.date}T23:59:59Z`);
			const timeOff = timeOffRows
				.filter((row) => {
					if (
						!showOthersTimeOff &&
						row.employmentId !== employment.id &&
						employment.kind !== "manager"
					) {
						return false;
					}
					return row.request.startsAt <= dayEnd && row.request.endsAt >= dayStart;
				})
				.map((row) => ({
					employmentId: row.employmentId,
					workerName: publicWorkerName(row.name, row.email, showContacts),
					startsAt: row.request.startsAt.toISOString(),
					endsAt: row.request.endsAt.toISOString(),
					mine: row.employmentId === employment.id,
				}));

			return { roster, timeOff };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			query: t.Object({
				date: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
			}),
			detail: {
				summary: "Who else is working on a day (Published Schedule)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/my/pay-period",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireWorkplaceMember(profile.id, params.workplaceId);

			const [workplace] = await db
				.select({
					payPeriodType: workplaces.payPeriodType,
					payPeriodAnchor: workplaces.payPeriodAnchor,
					weekStartDay: workplaces.weekStartDay,
				})
				.from(workplaces)
				.where(eq(workplaces.id, params.workplaceId))
				.limit(1);
			if (!workplace) throw new Error("Workplace not found");

			const now = new Date();
			const period = payPeriodBounds(
				workplace.payPeriodType,
				workplace.payPeriodAnchor,
				now,
			);

			return {
				payPeriod: {
					type: workplace.payPeriodType,
					startsAt: period.startsAt.toISOString(),
					endsAt: period.endsAt.toISOString(),
					weekStartDay: workplace.weekStartDay,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "The pay period containing today",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/version-shifts/:versionShiftId/attendance",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `attendance.mark:${params.versionShiftId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const [row] = await db
						.select({
							versionShiftId: versionShifts.id,
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
					if (!row) throw new NotFoundError("Shift not found");
					if (!row.employmentId) {
						throw new BadRequestError(
							"Mark attendance on an assigned published Shift",
						);
					}

					const [mark] = await db
						.insert(attendanceMarks)
						.values({
							versionShiftId: params.versionShiftId,
							kind: body.kind,
							markedByProfileId: profile.id,
							note: body.note ?? null,
						})
						.onConflictDoUpdate({
							target: attendanceMarks.versionShiftId,
							set: {
								kind: body.kind,
								markedByProfileId: profile.id,
								note: body.note ?? null,
								updatedAt: new Date(),
							},
						})
						.returning();
					if (!mark) throw new NotFoundError("Shift not found");

					const labels = {
						late: "late",
						no_show: "no-show",
						sick: "sick",
					} as const;
					await notifyEmployments([row.employmentId], {
						kind: "attendance_mark",
						title: `Marked ${labels[body.kind]}`,
						body: `A manager marked this shift as ${labels[body.kind]}. The published schedule did not change.`,
					});
					await writeAudit({
						workplaceId: params.workplaceId,
						actorProfileId: profile.id,
						action: "attendance.marked",
						entityType: "attendance_mark",
						entityId: mark.id,
						summary: `Marked a published Shift as ${labels[body.kind]}`,
					});
					return {
						attendance: {
							kind: mark.kind,
							note: mark.note,
						},
					};
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
				kind: t.Union([
					t.Literal("late"),
					t.Literal("no_show"),
					t.Literal("sick"),
				]),
				note: t.Optional(t.String({ maxLength: 240 })),
			}),
			detail: {
				summary:
					"Mark a published Shift late, no-show, or sick without changing the schedule (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);

function payPeriodBounds(
	type: "weekly" | "biweekly" | "semimonthly" | "monthly",
	anchor: string | null,
	from: Date,
): { startsAt: Date; endsAt: Date } {
	const day = startOfDay(from);
	if (type === "semimonthly") {
		if (day.getUTCDate() <= 15) {
			return {
				startsAt: new Date(
					Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1),
				),
				endsAt: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 16)),
			};
		}
		return {
			startsAt: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 16)),
			endsAt: new Date(
				Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1),
			),
		};
	}
	if (type === "monthly") {
		return {
			startsAt: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)),
			endsAt: new Date(
				Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1),
			),
		};
	}
	const lengthDays = type === "biweekly" ? 14 : 7;
	const anchorDate = anchor
		? startOfDay(new Date(`${anchor}T00:00:00Z`))
		: mondayStart(day);
	const diffDays = Math.floor(
		(day.getTime() - anchorDate.getTime()) / 86_400_000,
	);
	const periodsIn = Math.floor(diffDays / lengthDays);
	const startsAt = new Date(anchorDate);
	startsAt.setUTCDate(startsAt.getUTCDate() + periodsIn * lengthDays);
	const endsAt = new Date(startsAt);
	endsAt.setUTCDate(endsAt.getUTCDate() + lengthDays);
	return { startsAt, endsAt };
}

function startOfDay(date: Date): Date {
	const copy = new Date(date);
	copy.setUTCHours(0, 0, 0, 0);
	return copy;
}

function mondayStart(date: Date): Date {
	const copy = startOfDay(date);
	const weekday = copy.getUTCDay();
	const diff = (weekday === 0 ? -6 : 1) - weekday;
	copy.setUTCDate(copy.getUTCDate() + diff);
	return copy;
}
