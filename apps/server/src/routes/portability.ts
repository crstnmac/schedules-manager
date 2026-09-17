import {
	db,
	employments,
	locations,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shifts,
	timeEntries,
	timeEntryBreaks,
	timeOffRequests,
	unavailability,
	versionShifts,
} from "@SchedulesManager/db";

import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requirePrivilege, requireSession } from "../context";
import { csvAttachment, csvCell } from "../csv-import";

function csv(header: string[], rows: (string | number | null | undefined)[][]) {
	return `${[header, ...rows]
		.map((row) => row.map((value) => csvCell(String(value ?? ""))).join(","))
		.join("\r\n")}\r\n`;
}

export const portabilityRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Portability"],
}).get(
	"/workplaces/:workplaceId/export/:dataset",
	async ({ headers, params, set }) => {
		const { profile } = await requireSession(headers);
		await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
		const workplaceId = params.workplaceId;
		const dataset = params.dataset;
		csvAttachment(set, `jooling-${dataset}.csv`);
		set.headers["cache-control"] = "private, no-store";
		if (dataset === "workers") {
			const rows = await db
				.select({ employment: employments, profile: profiles })
				.from(employments)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, workplaceId));
			return csv(
				["employment_id", "name", "email", "kind", "status", "joined_at"],
				rows.map(({ employment, profile }) => [
					employment.id,
					profile.fullName,
					profile.email,
					employment.kind,
					employment.status,
					employment.joinedAt,
				]),
			);
		}
		if (dataset === "locations") {
			const rows = await db
				.select()
				.from(locations)
				.where(eq(locations.workplaceId, workplaceId));
			return csv(
				["location_id", "name", "timezone", "address"],
				rows.map((row) => [row.id, row.name, row.timezone, row.addressLine]),
			);
		}
		if (dataset === "positions") {
			const rows = await db
				.select()
				.from(positions)
				.where(eq(positions.workplaceId, workplaceId));
			return csv(
				["position_id", "name"],
				rows.map((row) => [row.id, row.name]),
			);
		}
		if (dataset === "draft-shifts") {
			const rows = await db
				.select({
					shift: shifts,
					schedule: schedules,
					location: locations,
					position: positions,
					worker: profiles,
				})
				.from(shifts)
				.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.innerJoin(positions, eq(positions.id, shifts.positionId))
				.leftJoin(employments, eq(employments.id, shifts.employmentId))
				.leftJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(locations.workplaceId, workplaceId));
			return csv(
				[
					"shift_id",
					"location",
					"week_start",
					"team_id",
					"starts_at_utc",
					"ends_at_utc",
					"position",
					"worker_email",
					"note",
				],
				rows.map(({ shift, schedule, location, position, worker }) => [
					shift.id,
					location.name,
					schedule.weekStartDate,
					schedule.teamId,
					shift.startsAt.toISOString(),
					shift.endsAt.toISOString(),
					position.name,
					worker?.email,
					shift.note,
				]),
			);
		}
		if (dataset === "published-shifts") {
			const rows = await db
				.select({
					version: scheduleVersions,
					versionShift: versionShifts,
					schedule: schedules,
					location: locations,
					position: positions,
					worker: profiles,
				})
				.from(scheduleVersions)
				.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.innerJoin(
					versionShifts,
					eq(versionShifts.versionId, scheduleVersions.id),
				)
				.innerJoin(positions, eq(positions.id, versionShifts.positionId))
				.leftJoin(employments, eq(employments.id, versionShifts.employmentId))
				.leftJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(locations.workplaceId, workplaceId));
			return csv(
				[
					"version_id",
					"version_number",
					"published_at_utc",
					"location",
					"week_start",
					"team_id",
					"starts_at_utc",
					"ends_at_utc",
					"position",
					"worker_email",
					"note",
				],
				rows.map(
					({ version, versionShift, schedule, location, position, worker }) => [
						version.id,
						version.versionNumber,
						version.publishedAt.toISOString(),
						location.name,
						schedule.weekStartDate,
						schedule.teamId,
						versionShift.startsAt.toISOString(),
						versionShift.endsAt.toISOString(),
						position.name,
						worker?.email,
						versionShift.note,
					],
				),
			);
		}
		if (dataset === "time-off") {
			const rows = await db
				.select({ request: timeOffRequests, worker: profiles })
				.from(timeOffRequests)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, workplaceId));
			return csv(
				[
					"request_id",
					"worker_email",
					"starts_at_utc",
					"ends_at_utc",
					"status",
					"reason",
					"decision_reason",
				],
				rows.map(({ request, worker }) => [
					request.id,
					worker.email,
					request.startsAt.toISOString(),
					request.endsAt.toISOString(),
					request.status,
					request.reason,
					request.decisionReason,
				]),
			);
		}
		if (dataset === "unavailability") {
			const rows = await db
				.select({ window: unavailability, worker: profiles })
				.from(unavailability)
				.innerJoin(employments, eq(employments.id, unavailability.employmentId))
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, workplaceId));
			return csv(
				[
					"window_id",
					"worker_email",
					"kind",
					"weekday",
					"specific_date",
					"start_minute",
					"end_minute",
					"status",
					"note",
				],
				rows.map(({ window, worker }) => [
					window.id,
					worker.email,
					window.kind,
					window.weekday,
					window.specificDate,
					window.startMinute,
					window.endMinute,
					window.status,
					window.note,
				]),
			);
		}
		if (dataset === "time-entries") {
			const rows = await db
				.select({ entry: timeEntries, worker: profiles })
				.from(timeEntries)
				.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, workplaceId));
			return csv(
				[
					"entry_id",
					"version_shift_id",
					"worker_email",
					"clocked_in_at_utc",
					"clocked_out_at_utc",
					"approval_status",
					"worker_note",
				],
				rows.map(({ entry, worker }) => [
					entry.id,
					entry.versionShiftId,
					worker.email,
					entry.clockedInAt.toISOString(),
					entry.clockedOutAt?.toISOString(),
					entry.approvalStatus,
					entry.workerNote,
				]),
			);
		}
		if (dataset === "time-entry-breaks") {
			const rows = await db
				.select({ break: timeEntryBreaks })
				.from(timeEntryBreaks)
				.innerJoin(timeEntries, eq(timeEntries.id, timeEntryBreaks.timeEntryId))
				.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
				.where(eq(employments.workplaceId, workplaceId));
			return csv(
				["break_id", "entry_id", "started_at_utc", "ended_at_utc"],
				rows.map(({ break: item }) => [
					item.id,
					item.timeEntryId,
					item.startedAt.toISOString(),
					item.endedAt?.toISOString(),
				]),
			);
		}
		const rows = await db
			.select({
				shift: versionShifts,
				version: scheduleVersions,
				schedule: schedules,
				location: locations,
				position: positions,
				worker: profiles,
			})
			.from(versionShifts)
			.innerJoin(
				scheduleVersions,
				eq(scheduleVersions.id, versionShifts.versionId),
			)
			.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
			.innerJoin(locations, eq(locations.id, schedules.locationId))
			.innerJoin(positions, eq(positions.id, versionShifts.positionId))
			.leftJoin(employments, eq(employments.id, versionShifts.employmentId))
			.leftJoin(profiles, eq(profiles.id, employments.profileId))
			.where(eq(locations.workplaceId, workplaceId));
		return csv(
			[
				"version_id",
				"version_number",
				"published_at_utc",
				"location",
				"week_start",
				"shift_id",
				"starts_at_utc",
				"ends_at_utc",
				"position",
				"worker_email",
				"note",
			],
			rows.map(({ shift, version, schedule, location, position, worker }) => [
				version.id,
				version.versionNumber,
				version.publishedAt.toISOString(),
				location.name,
				schedule.weekStartDate,
				shift.shiftId,
				shift.startsAt.toISOString(),
				shift.endsAt.toISOString(),
				position.name,
				worker?.email,
				shift.note,
			]),
		);
	},
	{
		headers: t.Object(
			{ authorization: t.Optional(t.String()) },
			{ additionalProperties: true },
		),
		params: t.Object({
			workplaceId: t.String({ format: "uuid" }),
			dataset: t.Union([
				t.Literal("workers"),
				t.Literal("locations"),
				t.Literal("positions"),
				t.Literal("draft-shifts"),
				t.Literal("published-shifts"),
				t.Literal("time-off"),
				t.Literal("unavailability"),
				t.Literal("time-entries"),
				t.Literal("time-entry-breaks"),
			]),
		}),
		detail: {
			summary: "Export workplace scheduling data as CSV",
			security: [{ bearerAuth: [] }],
		},
	},
);
