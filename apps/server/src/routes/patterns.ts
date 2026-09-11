import {
	db,
	employments,
	locations,
	positions,
	profiles,
	schedules,
	shiftPatternMembers,
	shiftPatternShifts,
	shiftPatterns,
	shifts,
} from "@SchedulesManager/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requirePrivilege, requireSession, weekStartDayFor } from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import { writeAudit } from "../notify";
import { resolveScheduleTeam } from "../schedule-teams";
import { assertWeekStartDay, shiftDays, wallToInstant } from "../time";

export interface PatternListItem {
	id: string;
	name: string;
	description: string | null;
	locationId: string | null;
	cycleWeeks: number;
	shiftCount: number;
	memberCount: number;
	updatedAt: string;
}

export interface PatternShiftDto {
	id: string;
	weekIndex: number;
	weekdayOffset: number;
	positionId: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	coverageTarget: number;
	note: string | null;
}

export interface PatternMemberDto {
	employmentId: string;
	rotationSlot: number;
	name: string | null;
	email: string;
}

export interface PatternDetail {
	id: string;
	workplaceId: string;
	locationId: string | null;
	name: string;
	description: string | null;
	cycleWeeks: number;
	shifts: PatternShiftDto[];
	memberIds: string[];
	members: PatternMemberDto[];
	updatedAt: string;
}

export interface ProjectedShift {
	date: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	positionId: string;
	note: string | null;
	coverageTarget: number;
	assignedEmploymentIds: string[];
}

export interface ProjectedDay {
	date: string;
	shifts: ProjectedShift[];
}

export interface ProjectedWeek {
	weekStart: string;
	days: ProjectedDay[];
}

export interface PatternPreviewPattern {
	id: string;
	name: string;
	cycleWeeks: number;
	locationId: string | null;
}

export interface PatternPreviewResult {
	pattern: PatternPreviewPattern;
	members: PatternMemberDto[];
	weeks: ProjectedWeek[];
}

export interface AppliedPatternResult {
	applied: number;
	weeks: number;
}

const uuid = t.String({ format: "uuid" });
const minuteSchema = t.Integer({ minimum: 0, maximum: 1440 });
const weeksSchema = t.Integer({ minimum: 1, maximum: 12 });
const authHeaders = t.Object(
	{ authorization: t.Optional(t.String()) },
	{ additionalProperties: true },
);
const applyHeaders = t.Object(
	{
		authorization: t.Optional(t.String()),
		"idempotency-key": t.Optional(t.String({ minLength: 8, maxLength: 200 })),
	},
	{ additionalProperties: true },
);
const shiftInput = t.Object({
	weekIndex: t.Integer({ minimum: 0, maximum: 7 }),
	weekdayOffset: t.Integer({ minimum: 0, maximum: 6 }),
	positionId: uuid,
	startMinute: minuteSchema,
	endMinute: minuteSchema,
	overnight: t.Optional(t.Boolean()),
	coverageTarget: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
	note: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
});

type ShiftInput = {
	weekIndex: number;
	weekdayOffset: number;
	positionId: string;
	startMinute: number;
	endMinute: number;
	overnight?: boolean;
	coverageTarget?: number;
	note?: string | null;
};

async function locationWithManage(profileId: string, locationId: string) {
	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, locationId))
		.limit(1);
	if (!location) throw new NotFoundError("Location not found");
	await requirePrivilege(profileId, location.workplaceId, "schedule.manage");
	return location;
}

async function assertPositionsInWorkplace(
	workplaceId: string,
	positionIds: string[],
) {
	const unique = [...new Set(positionIds)];
	if (unique.length === 0) return;
	const rows = await db
		.select({ id: positions.id })
		.from(positions)
		.where(
			and(
				eq(positions.workplaceId, workplaceId),
				inArray(positions.id, unique),
			),
		);
	if (rows.length !== unique.length) {
		throw new NotFoundError("Position not found");
	}
}

async function assertMembersInWorkplace(
	workplaceId: string,
	employmentIds: string[],
) {
	const unique = [...new Set(employmentIds)];
	if (unique.length === 0) return;
	const rows = await db
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				inArray(employments.id, unique),
			),
		);
	if (rows.length !== unique.length) {
		throw new NotFoundError("Employment not found");
	}
}

async function assertLocationInWorkplace(
	workplaceId: string,
	locationId: string,
) {
	const [row] = await db
		.select({ id: locations.id })
		.from(locations)
		.where(
			and(eq(locations.id, locationId), eq(locations.workplaceId, workplaceId)),
		)
		.limit(1);
	if (!row) throw new NotFoundError("Location not found");
}

function normalizeShifts(cycleWeeks: number, rows: ShiftInput[]) {
	return rows.map((row) => {
		if (row.weekIndex >= cycleWeeks) {
			throw new BadRequestError(
				`Week ${row.weekIndex + 1} is outside the ${cycleWeeks}-week cycle`,
			);
		}
		if (row.endMinute === row.startMinute) {
			throw new BadRequestError(
				"A Shift must start and end at different times",
			);
		}
		const trimmed = row.note?.trim();
		return {
			weekIndex: row.weekIndex,
			weekdayOffset: row.weekdayOffset,
			positionId: row.positionId,
			startMinute: row.startMinute,
			endMinute: row.endMinute,
			overnight: row.overnight ?? row.endMinute < row.startMinute,
			coverageTarget: row.coverageTarget ?? 1,
			note: trimmed && trimmed.length > 0 ? trimmed : null,
		};
	});
}

async function replaceChildren(
	tx: Pick<typeof db, "delete" | "insert">,
	patternId: string,
	rows: ReturnType<typeof normalizeShifts>,
	memberIds: string[],
) {
	await tx
		.delete(shiftPatternShifts)
		.where(eq(shiftPatternShifts.patternId, patternId));
	await tx
		.delete(shiftPatternMembers)
		.where(eq(shiftPatternMembers.patternId, patternId));
	if (rows.length > 0) {
		await tx
			.insert(shiftPatternShifts)
			.values(rows.map((row) => ({ patternId, ...row })));
	}
	const uniqueMembers = [...new Set(memberIds)];
	if (uniqueMembers.length > 0) {
		await tx.insert(shiftPatternMembers).values(
			uniqueMembers.map((employmentId, index) => ({
				patternId,
				employmentId,
				rotationSlot: index,
			})),
		);
	}
}

async function memberDetails(patternId: string): Promise<PatternMemberDto[]> {
	return db
		.select({
			employmentId: shiftPatternMembers.employmentId,
			rotationSlot: shiftPatternMembers.rotationSlot,
			name: profiles.fullName,
			email: profiles.email,
		})
		.from(shiftPatternMembers)
		.innerJoin(
			employments,
			eq(employments.id, shiftPatternMembers.employmentId),
		)
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.where(eq(shiftPatternMembers.patternId, patternId))
		.orderBy(shiftPatternMembers.rotationSlot);
}

async function loadPatternForLocation(
	patternId: string,
	location: { id: string; workplaceId: string },
) {
	const [pattern] = await db
		.select()
		.from(shiftPatterns)
		.where(
			and(
				eq(shiftPatterns.id, patternId),
				eq(shiftPatterns.workplaceId, location.workplaceId),
			),
		)
		.limit(1);
	if (!pattern) throw new NotFoundError("Shift Pattern not found");
	if (pattern.locationId && pattern.locationId !== location.id) {
		throw new NotFoundError("Shift Pattern not found");
	}
	return pattern;
}

function scheduleTeamMatch(teamId: string | null | undefined) {
	return teamId ? eq(schedules.teamId, teamId) : isNull(schedules.teamId);
}

async function getOrCreateSchedule(
	locationId: string,
	weekStart: string,
	teamId: string | null = null,
) {
	const match = scheduleTeamMatch(teamId);
	const [existing] = await db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.locationId, locationId),
				eq(schedules.weekStartDate, weekStart),
				match,
			),
		)
		.limit(1);
	if (existing) return existing;

	await db
		.insert(schedules)
		.values({ locationId, weekStartDate: weekStart, teamId })
		.onConflictDoNothing();

	const [created] = await db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.locationId, locationId),
				eq(schedules.weekStartDate, weekStart),
				match,
			),
		)
		.limit(1);
	if (!created) throw new ConflictError("Schedule could not be created");
	return created;
}

/**
 * Projects a pattern across consecutive weeks without writing anything. Week w
 * uses the pattern's `weekIndex === w % cycleWeeks`; coverage slot i for a
 * shift needing c workers is assigned member `(w * c + i) % n` in rotationSlot
 * order, so the rotation advances even when coverage and roster differ.
 */
function projectWeeks(input: {
	weekStart: string;
	weeks: number;
	cycleWeeks: number;
	rows: {
		weekIndex: number;
		weekdayOffset: number;
		positionId: string;
		startMinute: number;
		endMinute: number;
		overnight: boolean;
		coverageTarget: number;
		note: string | null;
	}[];
	memberIds: string[];
}): ProjectedWeek[] {
	const { weekStart, weeks, cycleWeeks, rows, memberIds } = input;
	const n = memberIds.length;
	const projected: ProjectedWeek[] = [];

	for (let w = 0; w < weeks; w += 1) {
		const start = shiftDays(weekStart, w * 7);
		const byDate = new Map<string, ProjectedShift[]>();
		const weekRows = rows
			.filter((row) => row.weekIndex === w % cycleWeeks)
			.sort(
				(a, b) =>
					a.weekdayOffset - b.weekdayOffset || a.startMinute - b.startMinute,
			);
		for (const row of weekRows) {
			const date = shiftDays(start, row.weekdayOffset);
			const coverage = Math.max(1, row.coverageTarget);
			const assignedEmploymentIds: string[] = [];
			if (n > 0) {
				for (let i = 0; i < coverage; i += 1) {
					assignedEmploymentIds.push(
						memberIds[(w * coverage + i) % n] as string,
					);
				}
			}
			const list = byDate.get(date) ?? [];
			list.push({
				date,
				startMinute: row.startMinute,
				endMinute: row.endMinute,
				overnight: row.overnight,
				positionId: row.positionId,
				note: row.note,
				coverageTarget: coverage,
				assignedEmploymentIds,
			});
			byDate.set(date, list);
		}
		const days: ProjectedDay[] = [...byDate.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, dayShifts]) => ({ date, shifts: dayShifts }));
		projected.push({ weekStart: start, days });
	}
	return projected;
}

export const patternRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Shift Patterns"],
})
	.get(
		"/workplaces/:workplaceId/shift-patterns",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.manage");
			const patterns = await db
				.select()
				.from(shiftPatterns)
				.where(eq(shiftPatterns.workplaceId, params.workplaceId))
				.orderBy(shiftPatterns.name);

			const shiftCounts = new Map<string, number>();
			const memberCounts = new Map<string, number>();
			if (patterns.length > 0) {
				const ids = patterns.map((pattern) => pattern.id);
				const [shiftRows, memberRows] = await Promise.all([
					db
						.select({ patternId: shiftPatternShifts.patternId })
						.from(shiftPatternShifts)
						.where(inArray(shiftPatternShifts.patternId, ids)),
					db
						.select({ patternId: shiftPatternMembers.patternId })
						.from(shiftPatternMembers)
						.where(inArray(shiftPatternMembers.patternId, ids)),
				]);
				for (const row of shiftRows) {
					shiftCounts.set(
						row.patternId,
						(shiftCounts.get(row.patternId) ?? 0) + 1,
					);
				}
				for (const row of memberRows) {
					memberCounts.set(
						row.patternId,
						(memberCounts.get(row.patternId) ?? 0) + 1,
					);
				}
			}

			const serialized: PatternListItem[] = patterns.map((pattern) => ({
				id: pattern.id,
				name: pattern.name,
				description: pattern.description,
				locationId: pattern.locationId,
				cycleWeeks: pattern.cycleWeeks,
				shiftCount: shiftCounts.get(pattern.id) ?? 0,
				memberCount: memberCounts.get(pattern.id) ?? 0,
				updatedAt: pattern.updatedAt.toISOString(),
			}));
			return { patterns: serialized };
		},
		{
			headers: authHeaders,
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "List Shift Patterns for a Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/shift-patterns/:patternId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.manage");
			const [pattern] = await db
				.select()
				.from(shiftPatterns)
				.where(
					and(
						eq(shiftPatterns.id, params.patternId),
						eq(shiftPatterns.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!pattern) throw new NotFoundError("Shift Pattern not found");

			const rows = await db
				.select()
				.from(shiftPatternShifts)
				.where(eq(shiftPatternShifts.patternId, pattern.id))
				.orderBy(
					shiftPatternShifts.weekIndex,
					shiftPatternShifts.weekdayOffset,
					shiftPatternShifts.startMinute,
				);
			const members = await memberDetails(pattern.id);

			const detail: PatternDetail = {
				id: pattern.id,
				workplaceId: pattern.workplaceId,
				locationId: pattern.locationId,
				name: pattern.name,
				description: pattern.description,
				cycleWeeks: pattern.cycleWeeks,
				updatedAt: pattern.updatedAt.toISOString(),
				shifts: rows.map((row) => ({
					id: row.id,
					weekIndex: row.weekIndex,
					weekdayOffset: row.weekdayOffset,
					positionId: row.positionId,
					startMinute: row.startMinute,
					endMinute: row.endMinute,
					overnight: row.overnight,
					coverageTarget: row.coverageTarget,
					note: row.note,
				})),
				memberIds: members.map((member) => member.employmentId),
				members,
			};
			return { pattern: detail };
		},
		{
			headers: authHeaders,
			params: t.Object({ workplaceId: uuid, patternId: uuid }),
			detail: {
				summary: "Read a Shift Pattern with its Shifts and Members (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/shift-patterns",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.manage");
			if (body.locationId) {
				await assertLocationInWorkplace(params.workplaceId, body.locationId);
			}
			const normalized = normalizeShifts(body.cycleWeeks, body.shifts);
			await assertPositionsInWorkplace(
				params.workplaceId,
				normalized.map((row) => row.positionId),
			);
			await assertMembersInWorkplace(params.workplaceId, body.memberIds ?? []);
			const description = body.description?.trim();

			const pattern = await db.transaction(async (tx) => {
				const [created] = await tx
					.insert(shiftPatterns)
					.values({
						workplaceId: params.workplaceId,
						locationId: body.locationId ?? null,
						name: body.name.trim(),
						description:
							description && description.length > 0 ? description : null,
						cycleWeeks: body.cycleWeeks,
					})
					.onConflictDoNothing({
						target: [shiftPatterns.workplaceId, shiftPatterns.name],
					})
					.returning();
				if (!created) {
					throw new ConflictError(
						"A Shift Pattern with that name already exists",
					);
				}
				await replaceChildren(tx, created.id, normalized, body.memberIds ?? []);
				await writeAudit(
					{
						workplaceId: params.workplaceId,
						actorProfileId: profile.id,
						action: "pattern.created",
						entityType: "shift_pattern",
						entityId: created.id,
						summary: `Created Shift Pattern “${created.name}”`,
					},
					tx,
				);
				return created;
			});

			return {
				pattern: {
					id: pattern.id,
					name: pattern.name,
					cycleWeeks: pattern.cycleWeeks,
				},
			};
		},
		{
			headers: authHeaders,
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				description: t.Optional(
					t.Union([t.String({ maxLength: 500 }), t.Null()]),
				),
				locationId: t.Optional(t.Union([uuid, t.Null()])),
				cycleWeeks: t.Integer({ minimum: 1, maximum: 8 }),
				shifts: t.Array(shiftInput),
				memberIds: t.Optional(t.Array(uuid)),
			}),
			detail: {
				summary: "Create a Shift Pattern (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/workplaces/:workplaceId/shift-patterns/:patternId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.manage");
			const [existing] = await db
				.select()
				.from(shiftPatterns)
				.where(
					and(
						eq(shiftPatterns.id, params.patternId),
						eq(shiftPatterns.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Shift Pattern not found");
			if (body.locationId) {
				await assertLocationInWorkplace(params.workplaceId, body.locationId);
			}
			const normalized = normalizeShifts(body.cycleWeeks, body.shifts);
			await assertPositionsInWorkplace(
				params.workplaceId,
				normalized.map((row) => row.positionId),
			);
			await assertMembersInWorkplace(params.workplaceId, body.memberIds ?? []);

			const name = body.name.trim();
			if (name !== existing.name) {
				const [clash] = await db
					.select({ id: shiftPatterns.id })
					.from(shiftPatterns)
					.where(
						and(
							eq(shiftPatterns.workplaceId, params.workplaceId),
							eq(shiftPatterns.name, name),
						),
					)
					.limit(1);
				if (clash) {
					throw new ConflictError(
						"A Shift Pattern with that name already exists",
					);
				}
			}
			const description = body.description?.trim();

			await db.transaction(async (tx) => {
				await tx
					.update(shiftPatterns)
					.set({
						name,
						description:
							description && description.length > 0 ? description : null,
						locationId: body.locationId ?? null,
						cycleWeeks: body.cycleWeeks,
						updatedAt: new Date(),
					})
					.where(eq(shiftPatterns.id, existing.id));
				await replaceChildren(
					tx,
					existing.id,
					normalized,
					body.memberIds ?? [],
				);
				await writeAudit(
					{
						workplaceId: params.workplaceId,
						actorProfileId: profile.id,
						action: "pattern.updated",
						entityType: "shift_pattern",
						entityId: existing.id,
						summary: `Updated Shift Pattern “${name}”`,
					},
					tx,
				);
			});

			return {
				pattern: { id: existing.id, name, cycleWeeks: body.cycleWeeks },
			};
		},
		{
			headers: authHeaders,
			params: t.Object({ workplaceId: uuid, patternId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				description: t.Optional(
					t.Union([t.String({ maxLength: 500 }), t.Null()]),
				),
				locationId: t.Optional(t.Union([uuid, t.Null()])),
				cycleWeeks: t.Integer({ minimum: 1, maximum: 8 }),
				shifts: t.Array(shiftInput),
				memberIds: t.Optional(t.Array(uuid)),
			}),
			detail: {
				summary:
					"Replace a Shift Pattern's fields, Shifts, and Members (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/shift-patterns/:patternId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.manage");
			const [deleted] = await db
				.delete(shiftPatterns)
				.where(
					and(
						eq(shiftPatterns.id, params.patternId),
						eq(shiftPatterns.workplaceId, params.workplaceId),
					),
				)
				.returning({ id: shiftPatterns.id });
			if (!deleted) throw new NotFoundError("Shift Pattern not found");
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "pattern.deleted",
				entityType: "shift_pattern",
				entityId: deleted.id,
				summary: "Deleted a Shift Pattern",
			});
			return { ok: true as const };
		},
		{
			headers: authHeaders,
			params: t.Object({ workplaceId: uuid, patternId: uuid }),
			detail: {
				summary: "Delete a Shift Pattern (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/patterns/:patternId/preview",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const location = await locationWithManage(profile.id, params.locationId);
			assertWeekStartDay(
				params.weekStart,
				await weekStartDayFor(location.workplaceId),
			);
			const pattern = await loadPatternForLocation(params.patternId, location);
			const [rows, members] = await Promise.all([
				db
					.select()
					.from(shiftPatternShifts)
					.where(eq(shiftPatternShifts.patternId, pattern.id)),
				db
					.select()
					.from(shiftPatternMembers)
					.where(eq(shiftPatternMembers.patternId, pattern.id))
					.orderBy(shiftPatternMembers.rotationSlot),
			]);

			const weeks = projectWeeks({
				weekStart: params.weekStart,
				weeks: body.weeks,
				cycleWeeks: pattern.cycleWeeks,
				rows,
				memberIds: members.map((member) => member.employmentId),
			});
			const result: PatternPreviewResult = {
				pattern: {
					id: pattern.id,
					name: pattern.name,
					cycleWeeks: pattern.cycleWeeks,
					locationId: pattern.locationId,
				},
				members: await memberDetails(pattern.id),
				weeks,
			};
			return result;
		},
		{
			headers: authHeaders,
			params: t.Object({
				locationId: uuid,
				weekStart: t.String(),
				patternId: uuid,
			}),
			body: t.Object({ weeks: weeksSchema }),
			detail: {
				summary: "Preview a Shift Pattern across future weeks (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/patterns/:patternId/apply",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const location = await locationWithManage(profile.id, params.locationId);
			assertWeekStartDay(
				params.weekStart,
				await weekStartDayFor(location.workplaceId),
			);

			return withIdempotency<AppliedPatternResult>({
				actorProfileId: profile.id,
				scope: `pattern.apply:${params.patternId}:${params.locationId}:${params.weekStart}:${body.teamId ?? "primary"}`,
				key: headers["idempotency-key"],
				request: {
					patternId: params.patternId,
					locationId: params.locationId,
					weekStart: params.weekStart,
					weeks: body.weeks,
					replace: body.replace ?? false,
					teamId: body.teamId ?? null,
				},
				execute: async () => {
					const teamId = await resolveScheduleTeam(location.id, body.teamId);
					const pattern = await loadPatternForLocation(
						params.patternId,
						location,
					);
					const [rows, members] = await Promise.all([
						db
							.select()
							.from(shiftPatternShifts)
							.where(eq(shiftPatternShifts.patternId, pattern.id)),
						db
							.select()
							.from(shiftPatternMembers)
							.where(eq(shiftPatternMembers.patternId, pattern.id))
							.orderBy(shiftPatternMembers.rotationSlot),
					]);
					const projected = projectWeeks({
						weekStart: params.weekStart,
						weeks: body.weeks,
						cycleWeeks: pattern.cycleWeeks,
						rows,
						memberIds: members.map((member) => member.employmentId),
					});

					const activeIds = new Set(
						(
							await db
								.select({ id: employments.id })
								.from(employments)
								.where(
									and(
										eq(employments.workplaceId, location.workplaceId),
										eq(employments.status, "active"),
									),
								)
						).map((row) => row.id),
					);

					const targets: { week: ProjectedWeek; scheduleId: string }[] = [];
					for (const week of projected) {
						const schedule = await getOrCreateSchedule(
							location.id,
							week.weekStart,
							teamId,
						);
						targets.push({ week, scheduleId: schedule.id });
					}

					let applied = 0;
					await db.transaction(async (tx) => {
						for (const target of targets) {
							if (body.replace) {
								await tx
									.delete(shifts)
									.where(eq(shifts.scheduleId, target.scheduleId));
							}
							const values: (typeof shifts.$inferInsert)[] = [];
							for (const day of target.week.days) {
								for (const shift of day.shifts) {
									const endDate = shift.overnight
										? shiftDays(shift.date, 1)
										: shift.date;
									const assigned =
										shift.assignedEmploymentIds.length > 0
											? shift.assignedEmploymentIds.map((id) =>
													activeIds.has(id) ? id : null,
												)
											: [null];
									for (const employmentId of assigned) {
										values.push({
											scheduleId: target.scheduleId,
											employmentId,
											positionId: shift.positionId,
											startsAt: wallToInstant(
												shift.date,
												shift.startMinute,
												location.timezone,
											),
											endsAt: wallToInstant(
												endDate,
												shift.endMinute,
												location.timezone,
											),
											note: shift.note,
										});
									}
								}
							}
							if (values.length > 0) {
								await tx.insert(shifts).values(values);
								applied += values.length;
							}
						}
						await writeAudit(
							{
								workplaceId: location.workplaceId,
								actorProfileId: profile.id,
								action: "pattern.applied",
								entityType: "shift_pattern",
								entityId: pattern.id,
								summary: `Applied Shift Pattern “${pattern.name}” for ${projected.length} week(s) from ${params.weekStart}`,
							},
							tx,
						);
					});

					return { applied, weeks: projected.length };
				},
			});
		},
		{
			headers: applyHeaders,
			params: t.Object({
				locationId: uuid,
				weekStart: t.String(),
				patternId: uuid,
			}),
			body: t.Object({
				weeks: weeksSchema,
				replace: t.Optional(t.Boolean()),
				teamId: t.Optional(t.Union([uuid, t.Null()])),
			}),
			detail: {
				summary: "Apply a Shift Pattern to future weeks' drafts (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
