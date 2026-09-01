import {
	db,
	employments,
	locations,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	locationScopeFor,
	requireSession,
	requireWorkplaceMember,
	weekStartDayFor,
} from "../context";
import { weekStartOfDateKey } from "../time";

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

			const scope = await locationScopeFor(employment);
			if (scope.length === 0) return { roster: [] };

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
			if (scheduleRows.length === 0) return { roster: [] };

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
			if (versions.length === 0) return { roster: [] };

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
					return zonedDateKey(row.shift.startsAt, timezone) === query.date;
				})
				.map((row) => ({
					versionShiftId: row.shift.id,
					employmentId: row.shift.employmentId,
					workerName: row.name ?? row.email ?? "Open shift",
					positionName: row.positionName,
					startsAt: row.shift.startsAt.toISOString(),
					endsAt: row.shift.endsAt.toISOString(),
					mine: employment.id === row.shift.employmentId,
				}))
				.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

			return { roster };
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
