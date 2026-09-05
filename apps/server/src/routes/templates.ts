import {
	db,
	employments,
	locations,
	schedules,
	scheduleTemplates,
	shifts,
	templateShifts,
} from "@SchedulesManager/db";
import { and, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requireManager, requireSession, weekStartDayFor } from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import { writeAudit } from "../notify";
import {
	assertWeekStartDay,
	shiftDays,
	wallToInstant,
	zonedDayInfo,
} from "../time";

function daysBetween(fromDateKey: string, toDateKey: string): number {
	const from = new Date(`${fromDateKey}T00:00:00Z`);
	const to = new Date(`${toDateKey}T00:00:00Z`);
	return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

async function locationForManager(profileId: string, locationId: string) {
	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, locationId))
		.limit(1);
	if (!location) throw new NotFoundError("Location not found");
	await requireManager(profileId, location.workplaceId);
	return location;
}

async function getOrCreateSchedule(locationId: string, weekStart: string) {
	const [existing] = await db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.locationId, locationId),
				eq(schedules.weekStartDate, weekStart),
			),
		)
		.limit(1);
	if (existing) return existing;

	await db
		.insert(schedules)
		.values({ locationId, weekStartDate: weekStart })
		.onConflictDoNothing();

	const [created] = await db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.locationId, locationId),
				eq(schedules.weekStartDate, weekStart),
			),
		)
		.limit(1);
	if (!created) throw new ConflictError("Schedule could not be created");
	return created;
}

function serializeTemplate(
	template: typeof scheduleTemplates.$inferSelect,
	shiftCount: number,
) {
	return {
		id: template.id,
		locationId: template.locationId,
		name: template.name,
		shiftCount,
		updatedAt: template.updatedAt.toISOString(),
	};
}

export const templateRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Schedule Templates"],
})
	.get(
		"/locations/:locationId/schedule-templates",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await locationForManager(profile.id, params.locationId);

			const templates = await db
				.select()
				.from(scheduleTemplates)
				.where(eq(scheduleTemplates.locationId, params.locationId));
			const counts = new Map<string, number>();
			if (templates.length > 0) {
				const rows = await db
					.select({ templateId: templateShifts.templateId })
					.from(templateShifts)
					.where(
						inArray(
							templateShifts.templateId,
							templates.map((template) => template.id),
						),
					);
				for (const row of rows) {
					counts.set(row.templateId, (counts.get(row.templateId) ?? 0) + 1);
				}
			}

			return {
				templates: templates.map((template) =>
					serializeTemplate(template, counts.get(template.id) ?? 0),
				),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "List named Schedule Templates for a Location (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/templates",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			assertWeekStartDay(
				params.weekStart,
				await weekStartDayFor(location.workplaceId),
			);

			return withIdempotency({
				actorProfileId: profile.id,
				scope: `template.save:${params.locationId}:${params.weekStart}:${body.name}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const [schedule] = await db
						.select()
						.from(schedules)
						.where(
							and(
								eq(schedules.locationId, location.id),
								eq(schedules.weekStartDate, params.weekStart),
							),
						)
						.limit(1);
					if (!schedule) {
						throw new NotFoundError("This week has no draft to save");
					}
					const draftShifts = await db
						.select()
						.from(shifts)
						.where(eq(shifts.scheduleId, schedule.id));
					if (draftShifts.length === 0) {
						throw new ConflictError("This week has no shifts to save");
					}
					const template = await db.transaction(async (tx) => {
						const [created] = await tx
							.insert(scheduleTemplates)
							.values({
								locationId: location.id,
								name: body.name.trim(),
							})
							.onConflictDoNothing({
								target: [scheduleTemplates.locationId, scheduleTemplates.name],
							})
							.returning();
						if (!created) {
							throw new ConflictError(
								"A template with that name already exists",
							);
						}
						await tx.insert(templateShifts).values(
							draftShifts.map((shift) => {
								const startInfo = zonedDayInfo(
									shift.startsAt,
									location.timezone,
								);
								const endInfo = zonedDayInfo(shift.endsAt, location.timezone);
								const weekdayOffset = daysBetween(
									params.weekStart,
									startInfo.dateKey,
								);
								if (weekdayOffset < 0 || weekdayOffset > 6) {
									throw new BadRequestError(
										"A Shift in this week falls outside the workweek",
									);
								}
								return {
									templateId: created.id,
									employmentId: shift.employmentId,
									positionId: shift.positionId,
									weekdayOffset,
									startMinute: startInfo.minuteOfDay,
									endMinute: endInfo.minuteOfDay,
									overnight: startInfo.dateKey !== endInfo.dateKey,
									note: shift.note,
								};
							}),
						);
						await writeAudit(
							{
								workplaceId: location.workplaceId,
								actorProfileId: profile.id,
								action: "template.saved",
								entityType: "schedule_template",
								entityId: created.id,
								summary: `Saved Schedule Template “${created.name}” from week of ${params.weekStart}`,
							},
							tx,
						);
						return created;
					});

					return {
						template: serializeTemplate(template, draftShifts.length),
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
				locationId: t.String({ format: "uuid" }),
				weekStart: t.String(),
			}),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
			}),
			detail: {
				summary:
					"Save this week's draft Shifts as a named Schedule Template (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/templates/:templateId/apply",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			assertWeekStartDay(
				params.weekStart,
				await weekStartDayFor(location.workplaceId),
			);

			return withIdempotency({
				actorProfileId: profile.id,
				scope: `template.apply:${params.templateId}:${params.weekStart}`,
				key: headers["idempotency-key"],
				request: { templateId: params.templateId, weekStart: params.weekStart },
				execute: async () => {
					const [template] = await db
						.select()
						.from(scheduleTemplates)
						.where(
							and(
								eq(scheduleTemplates.id, params.templateId),
								eq(scheduleTemplates.locationId, location.id),
							),
						)
						.limit(1);
					if (!template) throw new NotFoundError("Template not found");

					const skeletons = await db
						.select()
						.from(templateShifts)
						.where(eq(templateShifts.templateId, template.id));
					if (skeletons.length === 0) {
						throw new ConflictError("This template has no shifts");
					}

					const target = await getOrCreateSchedule(
						location.id,
						params.weekStart,
					);
					await db.transaction(async (tx) => {
						const activeIds = new Set(
							(
								await tx
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
						await tx.delete(shifts).where(eq(shifts.scheduleId, target.id));
						await tx.insert(shifts).values(
							skeletons.map((row) => {
								const dateKey = shiftDays(params.weekStart, row.weekdayOffset);
								const endDateKey = row.overnight
									? shiftDays(dateKey, 1)
									: dateKey;
								return {
									scheduleId: target.id,
									employmentId:
										row.employmentId && activeIds.has(row.employmentId)
											? row.employmentId
											: null,
									positionId: row.positionId,
									startsAt: wallToInstant(
										dateKey,
										row.startMinute,
										location.timezone,
									),
									endsAt: wallToInstant(
										endDateKey,
										row.endMinute,
										location.timezone,
									),
									note: row.note,
								};
							}),
						);
						await writeAudit(
							{
								workplaceId: location.workplaceId,
								actorProfileId: profile.id,
								action: "template.applied",
								entityType: "schedule_template",
								entityId: template.id,
								summary: `Applied Schedule Template “${template.name}” to week of ${params.weekStart}`,
							},
							tx,
						);
					});

					return { applied: skeletons.length };
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
				locationId: t.String({ format: "uuid" }),
				weekStart: t.String(),
				templateId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary:
					"Replace this week's draft with a named Schedule Template (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
