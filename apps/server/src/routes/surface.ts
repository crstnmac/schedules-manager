import {
	announcements,
	conversationMembers,
	conversations,
	dayParts,
	db,
	employmentDocuments,
	employmentGroups,
	employments,
	leaveTypes,
	locationSales,
	locations,
	positions,
	profiles,
	ptoBalances,
	schedules,
	shifts,
	shiftTagAssignments,
	shiftTags,
	shiftTaskCompletions,
	shiftTasks,
	shiftTemplates,
	timeBlocks,
	timeEntries,
	timeEntryBreaks,
	versionShifts,
	workerGroups,
	workplaceMessages,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	requireManager,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { leaveCapResetPayload } from "../leave";
import { notifyEmployments, writeAudit } from "../notify";
import { hashPin } from "../pin";
import { firstRow } from "../rows";
import { assertWorkplaceEnabled, loadWorkplace } from "../workplace-policy";

const uuid = t.String({ format: "uuid" });
const minuteSchema = t.Integer({ minimum: 0, maximum: 1440 });

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

async function workplaceForShift(shiftId: string) {
	const [row] = await db
		.select({ workplaceId: locations.workplaceId })
		.from(shifts)
		.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.where(eq(shifts.id, shiftId))
		.limit(1);
	if (!row) throw new NotFoundError("Shift not found");
	return row.workplaceId;
}

/** The caller's own published shift on an active employment, else 404. */
async function myVersionShiftRow(profileId: string, versionShiftId: string) {
	const [row] = await db
		.select({
			shift: versionShifts,
			workplaceId: employments.workplaceId,
		})
		.from(versionShifts)
		.innerJoin(employments, eq(employments.id, versionShifts.employmentId))
		.where(
			and(
				eq(versionShifts.id, versionShiftId),
				eq(employments.profileId, profileId),
				eq(employments.status, "active"),
			),
		)
		.limit(1);
	if (!row?.shift.employmentId) throw new NotFoundError("Shift not found");
	return row;
}

export const surfaceRoutes = new Elysia({ prefix: "/v1" })
	.get(
		"/workplaces/:workplaceId/groups",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const groups = await db
				.select()
				.from(workerGroups)
				.where(eq(workerGroups.workplaceId, params.workplaceId));
			const members =
				groups.length === 0
					? []
					: await db
							.select()
							.from(employmentGroups)
							.where(
								inArray(
									employmentGroups.groupId,
									groups.map((group) => group.id),
								),
							);
			return {
				groups: groups.map((group) => ({
					id: group.id,
					name: group.name,
					employmentIds: members
						.filter((row) => row.groupId === group.id)
						.map((row) => row.employmentId),
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/groups",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const group = firstRow(
				await db
					.insert(workerGroups)
					.values({
						workplaceId: params.workplaceId,
						name: body.name.trim(),
					})
					.returning(),
			);
			if (body.employmentIds.length > 0) {
				await db.insert(employmentGroups).values(
					body.employmentIds.map((employmentId) => ({
						employmentId,
						groupId: group.id,
					})),
				);
			}
			return { group: { id: group.id, name: group.name } };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				employmentIds: t.Array(uuid),
			}),
		},
	)
	.put(
		"/workplaces/:workplaceId/groups/:groupId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const [group] = await db
				.update(workerGroups)
				.set({ name: body.name.trim() })
				.where(
					and(
						eq(workerGroups.id, params.groupId),
						eq(workerGroups.workplaceId, params.workplaceId),
					),
				)
				.returning();
			if (!group) throw new NotFoundError("Group not found");
			await db
				.delete(employmentGroups)
				.where(eq(employmentGroups.groupId, group.id));
			if (body.employmentIds.length > 0) {
				await db.insert(employmentGroups).values(
					body.employmentIds.map((employmentId) => ({
						employmentId,
						groupId: group.id,
					})),
				);
			}
			return { group: { id: group.id, name: group.name } };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, groupId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				employmentIds: t.Array(uuid),
			}),
		},
	)
	.delete(
		"/workplaces/:workplaceId/groups/:groupId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			await db
				.delete(workerGroups)
				.where(
					and(
						eq(workerGroups.id, params.groupId),
						eq(workerGroups.workplaceId, params.workplaceId),
					),
				);
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, groupId: uuid }),
		},
	)
	.get(
		"/workplaces/:workplaceId/tags",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const tags = await db
				.select()
				.from(shiftTags)
				.where(eq(shiftTags.workplaceId, params.workplaceId));
			return { tags: tags.map((tag) => ({ id: tag.id, name: tag.name })) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/tags",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const tag = firstRow(
				await db
					.insert(shiftTags)
					.values({ workplaceId: params.workplaceId, name: body.name.trim() })
					.returning(),
			);
			return { tag: { id: tag.id, name: tag.name } };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({ name: t.String({ minLength: 1, maxLength: 40 }) }),
		},
	)
	.patch(
		"/workplaces/:workplaceId/tags/:tagId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const [tag] = await db
				.update(shiftTags)
				.set({ name: body.name.trim() })
				.where(
					and(
						eq(shiftTags.id, params.tagId),
						eq(shiftTags.workplaceId, params.workplaceId),
					),
				)
				.returning();
			if (!tag) throw new NotFoundError("Tag not found");
			return { tag: { id: tag.id, name: tag.name } };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, tagId: uuid }),
			body: t.Object({ name: t.String({ minLength: 1, maxLength: 40 }) }),
		},
	)
	.delete(
		"/workplaces/:workplaceId/tags/:tagId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			await db
				.delete(shiftTags)
				.where(
					and(
						eq(shiftTags.id, params.tagId),
						eq(shiftTags.workplaceId, params.workplaceId),
					),
				);
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, tagId: uuid }),
		},
	)
	.get(
		"/workplaces/:workplaceId/leave-types",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const types = await db
				.select()
				.from(leaveTypes)
				.where(eq(leaveTypes.workplaceId, params.workplaceId));
			return {
				leaveTypes: types.map((row) => ({
					id: row.id,
					name: row.name,
					paid: row.paid,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/leave-types",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const created = firstRow(
				await db
					.insert(leaveTypes)
					.values({
						workplaceId: params.workplaceId,
						name: body.name.trim(),
						paid: body.paid,
					})
					.returning(),
			);
			return {
				leaveType: { id: created.id, name: created.name, paid: created.paid },
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				paid: t.Boolean(),
			}),
		},
	)
	.patch(
		"/workplaces/:workplaceId/leave-types/:leaveTypeId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const [existing] = await db
				.select()
				.from(leaveTypes)
				.where(
					and(
						eq(leaveTypes.id, params.leaveTypeId),
						eq(leaveTypes.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Leave type not found");
			const updated = firstRow(
				await db
					.update(leaveTypes)
					.set({
						name: body.name !== undefined ? body.name.trim() : existing.name,
						paid: body.paid ?? existing.paid,
					})
					.where(eq(leaveTypes.id, existing.id))
					.returning(),
			);
			return {
				leaveType: {
					id: updated.id,
					name: updated.name,
					paid: updated.paid,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, leaveTypeId: uuid }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
				paid: t.Optional(t.Boolean()),
			}),
		},
	)
	.delete(
		"/workplaces/:workplaceId/leave-types/:leaveTypeId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const [deleted] = await db
				.delete(leaveTypes)
				.where(
					and(
						eq(leaveTypes.id, params.leaveTypeId),
						eq(leaveTypes.workplaceId, params.workplaceId),
					),
				)
				.returning({ id: leaveTypes.id });
			if (!deleted) throw new NotFoundError("Leave type not found");
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, leaveTypeId: uuid }),
		},
	)
	.put(
		"/workplaces/:workplaceId/employments/:employmentId/pto",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			// Both the employment and the leave type must belong to this
			// workplace, or the upsert could mutate another workplace's balances.
			const [employment] = await db
				.select({ id: employments.id })
				.from(employments)
				.where(
					and(
						eq(employments.id, params.employmentId),
						eq(employments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			const [leaveType] = await db
				.select({ id: leaveTypes.id })
				.from(leaveTypes)
				.where(
					and(
						eq(leaveTypes.id, body.leaveTypeId),
						eq(leaveTypes.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!employment || !leaveType) {
				throw new NotFoundError("Employment not found");
			}
			await db
				.insert(ptoBalances)
				.values({
					employmentId: employment.id,
					leaveTypeId: leaveType.id,
					minutes: body.minutes,
				})
				.onConflictDoUpdate({
					target: [ptoBalances.employmentId, ptoBalances.leaveTypeId],
					set: { minutes: body.minutes },
				});
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, employmentId: uuid }),
			body: t.Object({
				leaveTypeId: uuid,
				minutes: t.Integer({ minimum: 0, maximum: 200_000 }),
			}),
		},
	)
	.get(
		"/workplaces/:workplaceId/pto",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const rows = await db
				.select({
					employmentId: ptoBalances.employmentId,
					leaveTypeId: ptoBalances.leaveTypeId,
					minutes: ptoBalances.minutes,
					name: leaveTypes.name,
					hiredAt: employments.createdAt,
				})
				.from(ptoBalances)
				.innerJoin(leaveTypes, eq(leaveTypes.id, ptoBalances.leaveTypeId))
				.innerJoin(employments, eq(employments.id, ptoBalances.employmentId))
				.where(eq(employments.workplaceId, params.workplaceId));
			const workplace = await loadWorkplace(params.workplaceId);
			const timeZone =
				(
					await db
						.select({ timezone: locations.timezone })
						.from(locations)
						.where(eq(locations.workplaceId, params.workplaceId))
						.limit(1)
				)[0]?.timezone ?? "America/Chicago";
			return {
				balances: rows.map(({ hiredAt: _hiredAt, ...row }) => row),
				...leaveCapResetPayload(
					workplace,
					rows[0]?.hiredAt ?? new Date(),
					timeZone,
				),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.get(
		"/workplaces/:workplaceId/employments/:employmentId/pto",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			if (
				employment.kind !== "manager" &&
				employment.id !== params.employmentId
			) {
				throw new NotFoundError("Employment not found");
			}
			const rows = await db
				.select({
					leaveTypeId: ptoBalances.leaveTypeId,
					name: leaveTypes.name,
					minutes: ptoBalances.minutes,
				})
				.from(ptoBalances)
				.innerJoin(leaveTypes, eq(leaveTypes.id, ptoBalances.leaveTypeId))
				.where(eq(ptoBalances.employmentId, params.employmentId));
			const [subject] = await db
				.select({ createdAt: employments.createdAt })
				.from(employments)
				.where(eq(employments.id, params.employmentId))
				.limit(1);
			const workplace = await loadWorkplace(params.workplaceId);
			const timeZone =
				(
					await db
						.select({ timezone: locations.timezone })
						.from(locations)
						.where(eq(locations.workplaceId, params.workplaceId))
						.limit(1)
				)[0]?.timezone ?? "America/Chicago";
			return {
				balances: rows,
				...leaveCapResetPayload(
					workplace,
					subject?.createdAt ?? employment.createdAt,
					timeZone,
				),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, employmentId: uuid }),
		},
	)
	.get(
		"/locations/:locationId/time-blocks",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			const [blocks, parts, templates] = await Promise.all([
				db
					.select()
					.from(timeBlocks)
					.where(eq(timeBlocks.locationId, location.id)),
				db.select().from(dayParts).where(eq(dayParts.locationId, location.id)),
				db
					.select()
					.from(shiftTemplates)
					.where(eq(shiftTemplates.locationId, location.id)),
			]);
			return {
				timeBlocks: blocks.map((row) => ({
					id: row.id,
					name: row.name,
					startMinute: row.startMinute,
					endMinute: row.endMinute,
				})),
				dayParts: parts.map((row) => ({
					id: row.id,
					name: row.name,
					startMinute: row.startMinute,
					endMinute: row.endMinute,
				})),
				shiftTemplates: templates.map((row) => ({
					id: row.id,
					name: row.name,
					positionId: row.positionId,
					startMinute: row.startMinute,
					endMinute: row.endMinute,
					note: row.note,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid }),
		},
	)
	.post(
		"/locations/:locationId/time-blocks",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await locationForManager(profile.id, params.locationId);
			const created = firstRow(
				await db
					.insert(timeBlocks)
					.values({
						locationId: params.locationId,
						name: body.name.trim(),
						startMinute: body.startMinute,
						endMinute: body.endMinute,
					})
					.returning(),
			);
			return {
				timeBlock: {
					id: created.id,
					name: created.name,
					startMinute: created.startMinute,
					endMinute: created.endMinute,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 40 }),
				startMinute: minuteSchema,
				endMinute: minuteSchema,
			}),
		},
	)
	.patch(
		"/locations/:locationId/time-blocks/:blockId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			const [existing] = await db
				.select()
				.from(timeBlocks)
				.where(
					and(
						eq(timeBlocks.id, params.blockId),
						eq(timeBlocks.locationId, location.id),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Time block not found");
			const updated = firstRow(
				await db
					.update(timeBlocks)
					.set({
						name: body.name !== undefined ? body.name.trim() : existing.name,
						startMinute: body.startMinute ?? existing.startMinute,
						endMinute: body.endMinute ?? existing.endMinute,
					})
					.where(eq(timeBlocks.id, existing.id))
					.returning(),
			);
			return {
				timeBlock: {
					id: updated.id,
					name: updated.name,
					startMinute: updated.startMinute,
					endMinute: updated.endMinute,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid, blockId: uuid }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
				startMinute: t.Optional(minuteSchema),
				endMinute: t.Optional(minuteSchema),
			}),
		},
	)
	.delete(
		"/locations/:locationId/time-blocks/:blockId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			const [deleted] = await db
				.delete(timeBlocks)
				.where(
					and(
						eq(timeBlocks.id, params.blockId),
						eq(timeBlocks.locationId, location.id),
					),
				)
				.returning({ id: timeBlocks.id });
			if (!deleted) throw new NotFoundError("Time block not found");
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid, blockId: uuid }),
		},
	)
	.post(
		"/locations/:locationId/day-parts",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await locationForManager(profile.id, params.locationId);
			const created = firstRow(
				await db
					.insert(dayParts)
					.values({
						locationId: params.locationId,
						name: body.name.trim(),
						startMinute: body.startMinute,
						endMinute: body.endMinute,
					})
					.returning(),
			);
			return {
				dayPart: {
					id: created.id,
					name: created.name,
					startMinute: created.startMinute,
					endMinute: created.endMinute,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 40 }),
				startMinute: minuteSchema,
				endMinute: minuteSchema,
			}),
		},
	)
	.patch(
		"/locations/:locationId/day-parts/:dayPartId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			const [existing] = await db
				.select()
				.from(dayParts)
				.where(
					and(
						eq(dayParts.id, params.dayPartId),
						eq(dayParts.locationId, location.id),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Day part not found");
			const updated = firstRow(
				await db
					.update(dayParts)
					.set({
						name: body.name !== undefined ? body.name.trim() : existing.name,
						startMinute: body.startMinute ?? existing.startMinute,
						endMinute: body.endMinute ?? existing.endMinute,
					})
					.where(eq(dayParts.id, existing.id))
					.returning(),
			);
			return {
				dayPart: {
					id: updated.id,
					name: updated.name,
					startMinute: updated.startMinute,
					endMinute: updated.endMinute,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid, dayPartId: uuid }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
				startMinute: t.Optional(minuteSchema),
				endMinute: t.Optional(minuteSchema),
			}),
		},
	)
	.delete(
		"/locations/:locationId/day-parts/:dayPartId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			const [deleted] = await db
				.delete(dayParts)
				.where(
					and(
						eq(dayParts.id, params.dayPartId),
						eq(dayParts.locationId, location.id),
					),
				)
				.returning({ id: dayParts.id });
			if (!deleted) throw new NotFoundError("Day part not found");
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid, dayPartId: uuid }),
		},
	)
	.post(
		"/locations/:locationId/shift-templates",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await locationForManager(profile.id, params.locationId);
			const created = firstRow(
				await db
					.insert(shiftTemplates)
					.values({
						locationId: params.locationId,
						name: body.name.trim(),
						positionId: body.positionId,
						startMinute: body.startMinute,
						endMinute: body.endMinute,
						note: body.note ?? null,
					})
					.returning(),
			);
			return {
				shiftTemplate: {
					id: created.id,
					name: created.name,
					positionId: created.positionId,
					startMinute: created.startMinute,
					endMinute: created.endMinute,
					note: created.note,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				positionId: uuid,
				startMinute: minuteSchema,
				endMinute: minuteSchema,
				note: t.Optional(t.String({ maxLength: 200 })),
			}),
		},
	)
	.patch(
		"/locations/:locationId/shift-templates/:templateId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			const [existing] = await db
				.select()
				.from(shiftTemplates)
				.where(
					and(
						eq(shiftTemplates.id, params.templateId),
						eq(shiftTemplates.locationId, location.id),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Shift template not found");
			if (body.positionId !== undefined) {
				const [position] = await db
					.select({ id: positions.id })
					.from(positions)
					.where(
						and(
							eq(positions.id, body.positionId),
							eq(positions.workplaceId, location.workplaceId),
						),
					)
					.limit(1);
				if (!position) throw new NotFoundError("Position not found");
			}
			const updated = firstRow(
				await db
					.update(shiftTemplates)
					.set({
						name: body.name !== undefined ? body.name.trim() : existing.name,
						positionId: body.positionId ?? existing.positionId,
						startMinute: body.startMinute ?? existing.startMinute,
						endMinute: body.endMinute ?? existing.endMinute,
						note:
							body.note === undefined
								? existing.note
								: body.note.trim() || null,
					})
					.where(eq(shiftTemplates.id, existing.id))
					.returning(),
			);
			return {
				shiftTemplate: {
					id: updated.id,
					name: updated.name,
					positionId: updated.positionId,
					startMinute: updated.startMinute,
					endMinute: updated.endMinute,
					note: updated.note,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid, templateId: uuid }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
				positionId: t.Optional(uuid),
				startMinute: t.Optional(minuteSchema),
				endMinute: t.Optional(minuteSchema),
				note: t.Optional(t.String({ maxLength: 200 })),
			}),
		},
	)
	.delete(
		"/locations/:locationId/shift-templates/:templateId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForManager(profile.id, params.locationId);
			await db
				.delete(shiftTemplates)
				.where(
					and(
						eq(shiftTemplates.id, params.templateId),
						eq(shiftTemplates.locationId, location.id),
					),
				);
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: uuid, templateId: uuid }),
		},
	)
	.put(
		"/locations/:locationId/sales/:saleDate",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await locationForManager(profile.id, params.locationId);
			await db
				.insert(locationSales)
				.values({
					locationId: params.locationId,
					saleDate: params.saleDate,
					amountCents: body.amountCents,
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [locationSales.locationId, locationSales.saleDate],
					set: { amountCents: body.amountCents, updatedAt: new Date() },
				});
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: uuid,
				saleDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
			}),
			body: t.Object({ amountCents: t.Integer({ minimum: 0 }) }),
		},
	)
	.get(
		"/workplaces/:workplaceId/announcements",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const rows = await db
				.select({
					announcement: announcements,
					author: profiles.fullName,
					email: profiles.email,
				})
				.from(announcements)
				.innerJoin(profiles, eq(profiles.id, announcements.authorProfileId))
				.where(eq(announcements.workplaceId, params.workplaceId))
				.orderBy(desc(announcements.createdAt))
				.limit(50);
			return {
				announcements: rows.map((row) => ({
					id: row.announcement.id,
					title: row.announcement.title,
					body: row.announcement.body,
					author: row.author ?? row.email,
					createdAt: row.announcement.createdAt.toISOString(),
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/announcements",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			await assertWorkplaceEnabled(
				params.workplaceId,
				"announcementsEnabled",
				"Announcements are turned off for this Workplace",
			);
			if (body.title.trim().length === 0 || body.body.trim().length === 0) {
				throw new BadRequestError(
					"Announcement title and body are required",
				);
			}
			const created = firstRow(
				await db
					.insert(announcements)
					.values({
						workplaceId: params.workplaceId,
						authorProfileId: profile.id,
						title: body.title.trim(),
						body: body.body.trim(),
					})
					.returning(),
			);
			const workers = await db
				.select({ id: employments.id })
				.from(employments)
				.where(
					and(
						eq(employments.workplaceId, params.workplaceId),
						eq(employments.status, "active"),
					),
				);
			await notifyEmployments(
				workers.map((row) => row.id),
				{
					kind: "announcement",
					title: created.title,
					body: created.body.slice(0, 180),
				},
			);
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "announcement.posted",
				entityType: "announcement",
				entityId: created.id,
				summary: `Posted announcement “${created.title}”`,
			});
			return { announcement: { id: created.id } };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				title: t.String({ minLength: 1, maxLength: 120 }),
				body: t.String({ minLength: 1, maxLength: 4000 }),
			}),
		},
	)
	.get(
		"/workplaces/:workplaceId/conversations",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const existing = await db
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.workplaceId, params.workplaceId),
						eq(conversations.kind, "workplace"),
					),
				)
				.limit(1);
			const workplace =
				existing[0] ??
				firstRow(
					await db
						.insert(conversations)
						.values({
							workplaceId: params.workplaceId,
							kind: "workplace",
						})
						.returning(),
				);
			const memberRows = await db
				.select()
				.from(conversationMembers)
				.where(eq(conversationMembers.employmentId, employment.id));
			const directIds = memberRows.map((row) => row.conversationId);
			const directs =
				directIds.length === 0
					? []
					: await db
							.select()
							.from(conversations)
							.where(
								and(
									inArray(conversations.id, directIds),
									eq(conversations.kind, "direct"),
								),
							);

			const counterparts =
				directIds.length === 0
					? []
					: await db
							.select({
								conversationId: conversationMembers.conversationId,
								employmentId: employments.id,
								name: profiles.fullName,
								email: profiles.email,
							})
							.from(conversationMembers)
							.innerJoin(
								employments,
								eq(employments.id, conversationMembers.employmentId),
							)
							.innerJoin(profiles, eq(profiles.id, employments.profileId))
							.where(inArray(conversationMembers.conversationId, directIds));

			const counterpartByConversation = new Map<
				string,
				{ employmentId: string; name: string; email: string }
			>();
			for (const row of counterparts) {
				if (row.employmentId === employment.id) continue;
				counterpartByConversation.set(row.conversationId, {
					employmentId: row.employmentId,
					name: row.name ?? row.email,
					email: row.email,
				});
			}

			const conversationIds = [workplace.id, ...directs.map((row) => row.id)];
			const recentMessages =
				conversationIds.length === 0
					? []
					: await db
							.select({
								id: workplaceMessages.id,
								conversationId: workplaceMessages.conversationId,
								body: workplaceMessages.body,
								authorEmploymentId: workplaceMessages.authorEmploymentId,
								createdAt: workplaceMessages.createdAt,
								authorName: profiles.fullName,
								authorEmail: profiles.email,
							})
							.from(workplaceMessages)
							.innerJoin(
								employments,
								eq(employments.id, workplaceMessages.authorEmploymentId),
							)
							.innerJoin(profiles, eq(profiles.id, employments.profileId))
							.where(inArray(workplaceMessages.conversationId, conversationIds))
							.orderBy(desc(workplaceMessages.createdAt));

			const lastMessageByConversation = new Map<
				string,
				{
					id: string;
					body: string;
					authorEmploymentId: string;
					author: string;
					createdAt: string;
					mine: boolean;
				}
			>();
			for (const row of recentMessages) {
				if (lastMessageByConversation.has(row.conversationId)) continue;
				lastMessageByConversation.set(row.conversationId, {
					id: row.id,
					body: row.body,
					authorEmploymentId: row.authorEmploymentId,
					author: row.authorName ?? row.authorEmail,
					createdAt: row.createdAt.toISOString(),
					mine: row.authorEmploymentId === employment.id,
				});
			}

			const workplaceConversation = {
				id: workplace.id,
				kind: "workplace" as const,
				title: "Everyone",
				subtitle: "Workplace channel",
				counterpart: null,
				lastMessage: lastMessageByConversation.get(workplace.id) ?? null,
			};

			const directConversations = directs
				.map((row) => {
					const counterpart = counterpartByConversation.get(row.id) ?? null;
					return {
						id: row.id,
						kind: "direct" as const,
						title: counterpart?.name ?? "Direct message",
						subtitle: counterpart?.email ?? "Direct message",
						counterpart,
						lastMessage: lastMessageByConversation.get(row.id) ?? null,
					};
				})
				.sort((left, right) => {
					const leftAt = left.lastMessage?.createdAt ?? "";
					const rightAt = right.lastMessage?.createdAt ?? "";
					return rightAt.localeCompare(leftAt);
				});

			// One visible DM per counterpart (prefer the most recently active thread).
			const seenCounterparts = new Set<string>();
			const uniqueDirects = directConversations.filter((thread) => {
				const key = thread.counterpart?.employmentId ?? thread.id;
				if (seenCounterparts.has(key)) return false;
				seenCounterparts.add(key);
				return true;
			});

			return {
				conversations: [workplaceConversation, ...uniqueDirects],
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/conversations",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			await assertWorkplaceEnabled(
				params.workplaceId,
				"messagingEnabled",
				"Messaging is turned off for this Workplace",
			);
			if (body.counterpartEmploymentId === employment.id) {
				throw new BadRequestError("Pick someone else to message");
			}
			// The counterpart must be an active member of this workplace —
			// otherwise the thread would be created around a phantom employment.
			const [counterpart] = await db
				.select({ id: employments.id })
				.from(employments)
				.where(
					and(
						eq(employments.id, body.counterpartEmploymentId),
						eq(employments.workplaceId, params.workplaceId),
						eq(employments.status, "active"),
					),
				)
				.limit(1);
			if (!counterpart) throw new NotFoundError("Employment not found");

			const myDirects = await db
				.select({ conversationId: conversationMembers.conversationId })
				.from(conversationMembers)
				.innerJoin(
					conversations,
					eq(conversations.id, conversationMembers.conversationId),
				)
				.where(
					and(
						eq(conversationMembers.employmentId, employment.id),
						eq(conversations.workplaceId, params.workplaceId),
						eq(conversations.kind, "direct"),
					),
				);
			const myDirectIds = myDirects.map((row) => row.conversationId);
			if (myDirectIds.length > 0) {
				const existing = await db
					.select({ conversationId: conversationMembers.conversationId })
					.from(conversationMembers)
					.where(
						and(
							inArray(conversationMembers.conversationId, myDirectIds),
							eq(
								conversationMembers.employmentId,
								body.counterpartEmploymentId,
							),
						),
					)
					.limit(1);
				if (existing[0]) {
					return { conversation: { id: existing[0].conversationId } };
				}
			}

			const created = firstRow(
				await db
					.insert(conversations)
					.values({ workplaceId: params.workplaceId, kind: "direct" })
					.returning(),
			);
			await db.insert(conversationMembers).values([
				{ conversationId: created.id, employmentId: employment.id },
				{
					conversationId: created.id,
					employmentId: body.counterpartEmploymentId,
				},
			]);
			return { conversation: { id: created.id } };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({ counterpartEmploymentId: uuid }),
		},
	)
	.get(
		"/conversations/:conversationId/messages",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers.authorization);
			const [conversation] = await db
				.select()
				.from(conversations)
				.where(eq(conversations.id, params.conversationId))
				.limit(1);
			if (!conversation) throw new NotFoundError("Conversation not found");
			const membership = await requireWorkplaceMember(
				profile.id,
				conversation.workplaceId,
			);
			// Direct threads are private to their members; the workplace channel
			// stays readable by every workplace member.
			if (conversation.kind === "direct") {
				const [member] = await db
					.select({ conversationId: conversationMembers.conversationId })
					.from(conversationMembers)
					.where(
						and(
							eq(conversationMembers.conversationId, conversation.id),
							eq(conversationMembers.employmentId, membership.id),
						),
					)
					.limit(1);
				if (!member) throw new NotFoundError("Conversation not found");
			}
			const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
			// Cursor pagination from the newest page backwards: `before` is the
			// oldest createdAt the client already has and `beforeId` breaks ties
			// among messages that share that timestamp.
			const before = query.before ? new Date(query.before) : null;
			if (before && Number.isNaN(before.getTime())) {
				throw new BadRequestError("before must be an ISO timestamp");
			}
			const beforeId = query.beforeId ?? null;
			if (beforeId && !before) {
				throw new BadRequestError("beforeId requires before");
			}
			const descendingRows = await db
				.select({
					message: workplaceMessages,
					name: profiles.fullName,
					email: profiles.email,
					createdAt: workplaceMessages.createdAt,
				})
				.from(workplaceMessages)
				.innerJoin(
					employments,
					eq(employments.id, workplaceMessages.authorEmploymentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(
					and(
						eq(workplaceMessages.conversationId, conversation.id),
						before
							? or(
									lt(workplaceMessages.createdAt, before),
									beforeId
										? and(
												eq(workplaceMessages.createdAt, before),
												lt(workplaceMessages.id, beforeId),
											)
										: undefined,
								)
							: undefined,
					),
				)
				.orderBy(desc(workplaceMessages.createdAt), desc(workplaceMessages.id))
				.limit(limit + 1);
			const hasMore = descendingRows.length > limit;
			// Return the page oldest→newest so existing viewers render in order.
			const rows = descendingRows
				.slice(0, limit)
				.reverse();
			return {
				messages: rows.map((row) => ({
					id: row.message.id,
					body: row.message.body,
					author: row.name ?? row.email,
					authorEmploymentId: row.message.authorEmploymentId,
					createdAt: row.message.createdAt.toISOString(),
				})),
				hasMore,
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ conversationId: uuid }),
			query: t.Object({
				limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
				before: t.Optional(t.String({ format: "date-time" })),
				beforeId: t.Optional(t.String({ format: "uuid" })),
			}),
		},
	)
	.post(
		"/conversations/:conversationId/messages",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const [conversation] = await db
				.select()
				.from(conversations)
				.where(eq(conversations.id, params.conversationId))
				.limit(1);
			if (!conversation) throw new NotFoundError("Conversation not found");
			const employment = await requireWorkplaceMember(
				profile.id,
				conversation.workplaceId,
			);
			// Posting follows the same privacy rule as reading.
			if (conversation.kind === "direct") {
				const [member] = await db
					.select({ conversationId: conversationMembers.conversationId })
					.from(conversationMembers)
					.where(
						and(
							eq(conversationMembers.conversationId, conversation.id),
							eq(conversationMembers.employmentId, employment.id),
						),
					)
					.limit(1);
				if (!member) throw new NotFoundError("Conversation not found");
			}
			await assertWorkplaceEnabled(
				conversation.workplaceId,
				"messagingEnabled",
				"Messaging is turned off for this Workplace",
			);
			const created = firstRow(
				await db
					.insert(workplaceMessages)
					.values({
						conversationId: conversation.id,
						authorEmploymentId: employment.id,
						body: body.body.trim(),
					})
					.returning(),
			);
			const [author] = await db
				.select({ name: profiles.fullName, email: profiles.email })
				.from(employments)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.id, employment.id))
				.limit(1);
			return {
				message: {
					id: created.id,
					body: created.body,
					author: author?.name ?? author?.email ?? "Unknown",
					authorEmploymentId: employment.id,
					createdAt: created.createdAt.toISOString(),
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ conversationId: uuid }),
			body: t.Object({ body: t.String({ minLength: 1, maxLength: 2000 }) }),
		},
	)
	.get(
		"/workplaces/:workplaceId/employments/:employmentId/documents",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const [employment] = await db
				.select({ id: employments.id })
				.from(employments)
				.where(
					and(
						eq(employments.id, params.employmentId),
						eq(employments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!employment) throw new NotFoundError("Employment not found");
			const docs = await db
				.select()
				.from(employmentDocuments)
				.where(eq(employmentDocuments.employmentId, employment.id));
			return {
				documents: docs.map((row) => ({
					id: row.id,
					title: row.title,
					url: row.url,
					note: row.note,
					createdAt: row.createdAt.toISOString(),
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, employmentId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/employments/:employmentId/documents",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const [employment] = await db
				.select({ id: employments.id })
				.from(employments)
				.where(
					and(
						eq(employments.id, params.employmentId),
						eq(employments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!employment) throw new NotFoundError("Employment not found");
			const created = firstRow(
				await db
					.insert(employmentDocuments)
					.values({
						employmentId: employment.id,
						title: body.title.trim(),
						url: body.url ?? null,
						note: body.note ?? null,
					})
					.returning(),
			);
			return { document: { id: created.id } };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, employmentId: uuid }),
			body: t.Object({
				title: t.String({ minLength: 1, maxLength: 120 }),
				url: t.Optional(t.String({ maxLength: 500 })),
				note: t.Optional(t.String({ maxLength: 500 })),
			}),
		},
	)
	.patch(
		"/workplaces/:workplaceId/employments/:employmentId/profile",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const values: {
				hourlyWageCents?: number | null;
				emergencyContactName?: string | null;
				emergencyContactPhone?: string | null;
				kioskPinHash?: string | null;
			} = {};
			if (body.hourlyWageCents !== undefined) {
				values.hourlyWageCents = body.hourlyWageCents;
			}
			if (body.emergencyContactName !== undefined) {
				values.emergencyContactName = body.emergencyContactName;
			}
			if (body.emergencyContactPhone !== undefined) {
				values.emergencyContactPhone = body.emergencyContactPhone;
			}
			if (body.kioskPin !== undefined) {
				if (body.kioskPin === null) values.kioskPinHash = null;
				else {
					if (!/^\d{4,8}$/.test(body.kioskPin)) {
						throw new BadRequestError("Worker PIN must be 4 to 8 digits");
					}
					const pinHash = hashPin(body.kioskPin);
					// A shared PIN would make kiosk punches impossible to attribute.
					const [pinOwner] = await db
						.select({ id: employments.id })
						.from(employments)
						.where(
							and(
								eq(employments.workplaceId, params.workplaceId),
								eq(employments.status, "active"),
								eq(employments.kioskPinHash, pinHash),
							),
						)
						.limit(1);
					if (pinOwner && pinOwner.id !== params.employmentId) {
						throw new ConflictError(
							"This Kiosk PIN is already used by another worker",
						);
					}
					values.kioskPinHash = pinHash;
				}
			}
			const [updated] = await db
				.update(employments)
				.set(values)
				.where(
					and(
						eq(employments.id, params.employmentId),
						eq(employments.workplaceId, params.workplaceId),
					),
				)
				.returning();
			if (!updated) throw new NotFoundError("Employment not found");
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, employmentId: uuid }),
			body: t.Object({
				hourlyWageCents: t.Optional(
					t.Union([t.Integer({ minimum: 0 }), t.Null()]),
				),
				emergencyContactName: t.Optional(
					t.Union([t.String({ maxLength: 120 }), t.Null()]),
				),
				emergencyContactPhone: t.Optional(
					t.Union([t.String({ maxLength: 40 }), t.Null()]),
				),
				kioskPin: t.Optional(t.Union([t.String(), t.Null()])),
			}),
		},
	)
	.post(
		"/shifts/:shiftId/tags",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, await workplaceForShift(params.shiftId));
			await db
				.delete(shiftTagAssignments)
				.where(eq(shiftTagAssignments.shiftId, params.shiftId));
			if (body.tagIds.length > 0) {
				await db.insert(shiftTagAssignments).values(
					body.tagIds.map((tagId) => ({
						shiftId: params.shiftId,
						tagId,
					})),
				);
			}
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ shiftId: uuid }),
			body: t.Object({ tagIds: t.Array(uuid) }),
		},
	)
	.post(
		"/shifts/:shiftId/tasks",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const workplaceId = await workplaceForShift(params.shiftId);
			await requireManager(profile.id, workplaceId);
			await assertWorkplaceEnabled(
				workplaceId,
				"tasksEnabled",
				"Shift tasks are turned off for this Workplace",
			);
			await db.delete(shiftTasks).where(eq(shiftTasks.shiftId, params.shiftId));
			if (body.titles.length > 0) {
				await db.insert(shiftTasks).values(
					body.titles.map((title, index) => ({
						shiftId: params.shiftId,
						title: title.trim(),
						sortOrder: index,
					})),
				);
			}
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ shiftId: uuid }),
			body: t.Object({
				titles: t.Array(t.String({ minLength: 1, maxLength: 120 })),
			}),
		},
	)
	.get(
		"/my/shifts/:versionShiftId/tasks",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const row = await myVersionShiftRow(profile.id, params.versionShiftId);
			await assertWorkplaceEnabled(
				row.workplaceId,
				"tasksEnabled",
				"Shift tasks are turned off for this Workplace",
			);
			const shift = row.shift;
			if (!shift.shiftId) return { tasks: [] };
			const tasks = await db
				.select()
				.from(shiftTasks)
				.where(eq(shiftTasks.shiftId, shift.shiftId));
			const done =
				tasks.length === 0
					? []
					: await db
							.select()
							.from(shiftTaskCompletions)
							.where(
								and(
									eq(shiftTaskCompletions.versionShiftId, shift.id),
									inArray(
										shiftTaskCompletions.taskId,
										tasks.map((task) => task.id),
									),
								),
							);
			const doneIds = new Set(done.map((row) => row.taskId));
			return {
				tasks: tasks.map((task) => ({
					id: task.id,
					title: task.title,
					completed: doneIds.has(task.id),
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ versionShiftId: uuid }),
		},
	)
	.post(
		"/my/version-shifts/:versionShiftId/tasks/:taskId/complete",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const row = await myVersionShiftRow(profile.id, params.versionShiftId);
			await assertWorkplaceEnabled(
				row.workplaceId,
				"tasksEnabled",
				"Shift tasks are turned off for this Workplace",
			);
			// The task must belong to the shift being worked.
			const [task] = await db
				.select({ id: shiftTasks.id })
				.from(shiftTasks)
				.where(
					and(
						eq(shiftTasks.id, params.taskId),
						eq(shiftTasks.shiftId, row.shift.shiftId ?? ""),
					),
				)
				.limit(1);
			if (!task) throw new NotFoundError("Task not found");
			await db
				.insert(shiftTaskCompletions)
				.values({
					taskId: task.id,
					versionShiftId: params.versionShiftId,
					completedByProfileId: profile.id,
				})
				.onConflictDoNothing();
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ versionShiftId: uuid, taskId: uuid }),
		},
	)
	.post(
		"/my/time-entries/:timeEntryId/breaks/start",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const [row] = await db
				.select({
					entry: timeEntries,
					workplaceId: employments.workplaceId,
				})
				.from(timeEntries)
				.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
				.where(
					and(
						eq(timeEntries.id, params.timeEntryId),
						eq(employments.profileId, profile.id),
					),
				)
				.limit(1);
			if (!row?.entry || row.entry.clockedOutAt) {
				throw new NotFoundError("Time Entry not found");
			}
			await assertWorkplaceEnabled(
				row.workplaceId,
				"breaksEnabled",
				"Breaks are turned off for this Workplace",
			);
			const [openBreak] = await db
				.select()
				.from(timeEntryBreaks)
				.where(
					and(
						eq(timeEntryBreaks.timeEntryId, row.entry.id),
						isNull(timeEntryBreaks.endedAt),
					),
				)
				.limit(1);
			if (openBreak) throw new ConflictError("A Break is already open");
			const created = firstRow(
				await db
					.insert(timeEntryBreaks)
					.values({ timeEntryId: row.entry.id, startedAt: new Date() })
					.returning(),
			);
			return {
				break: {
					id: created.id,
					startedAt: created.startedAt.toISOString(),
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ timeEntryId: uuid }),
		},
	)
	.post(
		"/my/time-entries/:timeEntryId/breaks/end",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const [row] = await db
				.select({ entry: timeEntries, workplaceId: employments.workplaceId })
				.from(timeEntries)
				.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
				.where(
					and(
						eq(timeEntries.id, params.timeEntryId),
						eq(employments.profileId, profile.id),
					),
				)
				.limit(1);
			if (!row?.entry) throw new NotFoundError("Time Entry not found");
			const [openBreak] = await db
				.select()
				.from(timeEntryBreaks)
				.where(
					and(
						eq(timeEntryBreaks.timeEntryId, row.entry.id),
						isNull(timeEntryBreaks.endedAt),
					),
				)
				.limit(1);
			if (!openBreak) {
				// Ending is gated like starting, except a break that predates the
				// flag flip can always be closed — never strand unpaid open time.
				const workplace = await loadWorkplace(row.workplaceId);
				if (!workplace.breaksEnabled) {
					throw new BadRequestError("Breaks are turned off for this Workplace");
				}
				throw new NotFoundError("No open Break");
			}
			await db
				.update(timeEntryBreaks)
				.set({ endedAt: new Date() })
				.where(eq(timeEntryBreaks.id, openBreak.id));
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ timeEntryId: uuid }),
		},
	)
	.post(
		"/workplaces/:workplaceId/time-entries/:timeEntryId/approval",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			// The entry must belong to an employment of the caller's workplace.
			const [target] = await db
				.select({ id: timeEntries.id })
				.from(timeEntries)
				.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
				.where(
					and(
						eq(timeEntries.id, params.timeEntryId),
						eq(employments.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!target) throw new NotFoundError("Time Entry not found");
			const [updated] = await db
				.update(timeEntries)
				.set({
					approvalStatus: body.decision,
					approvedAt: new Date(),
					approvedByProfileId: profile.id,
				})
				.where(eq(timeEntries.id, target.id))
				.returning();
			if (!updated) throw new NotFoundError("Time Entry not found");
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: `timesheet.${body.decision}`,
				entityType: "time_entry",
				entityId: updated.id,
				summary: `${body.decision === "approved" ? "Approved" : "Declined"} a Time Entry`,
			});
			return {
				timeEntry: {
					id: updated.id,
					approvalStatus: updated.approvalStatus,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid, timeEntryId: uuid }),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
			}),
		},
	)
	.get(
		"/workplaces/:workplaceId/timesheets",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const rows = await db
				.select({
					entry: timeEntries,
					name: profiles.fullName,
					email: profiles.email,
				})
				.from(timeEntries)
				.innerJoin(employments, eq(employments.id, timeEntries.employmentId))
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, params.workplaceId))
				.orderBy(desc(timeEntries.clockedInAt))
				.limit(100);
			return {
				timesheets: rows.map((row) => ({
					id: row.entry.id,
					worker: row.name ?? row.email,
					clockedInAt: row.entry.clockedInAt.toISOString(),
					clockedOutAt: row.entry.clockedOutAt?.toISOString() ?? null,
					autoClosedAt: row.entry.autoClosedAt?.toISOString() ?? null,
					approvalStatus: row.entry.approvalStatus,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: uuid }),
		},
	);
