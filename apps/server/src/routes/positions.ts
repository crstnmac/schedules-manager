import {
	db,
	employmentPositions,
	positions,
	shifts,
	shiftTemplates,
	templateShifts,
} from "@SchedulesManager/db";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requireManager, requireSession } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import { firstRow } from "../rows";

function serializePosition(position: typeof positions.$inferSelect) {
	return {
		id: position.id,
		name: position.name,
	};
}

export const positionsRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Position"],
})
	.get(
		"/workplaces/:workplaceId/positions",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const rows = await db
				.select()
				.from(positions)
				.where(eq(positions.workplaceId, params.workplaceId));

			return {
				positions: rows.map(serializePosition),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "List Positions for a Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/positions",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const position = firstRow(
				await db
					.insert(positions)
					.values({
						workplaceId: params.workplaceId,
						name: body.name,
					})
					.returning(),
			);

			return { position: serializePosition(position) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 120 }),
			}),
			detail: {
				summary: "Create a Position (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/positions/:positionId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);

			const [existing] = await db
				.select()
				.from(positions)
				.where(eq(positions.id, params.positionId))
				.limit(1);

			if (!existing) throw new NotFoundError("Position not found");
			await requireManager(profile.id, existing.workplaceId);

			const position = firstRow(
				await db
					.update(positions)
					.set({
						name: body.name ?? existing.name,
						updatedAt: new Date(),
					})
					.where(eq(positions.id, params.positionId))
					.returning(),
			);

			return { position: serializePosition(position) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ positionId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
			}),
			detail: {
				summary: "Rename a Position (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/positions/:positionId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);

			const [existing] = await db
				.select()
				.from(positions)
				.where(eq(positions.id, params.positionId))
				.limit(1);

			if (!existing) throw new NotFoundError("Position not found");
			await requireManager(profile.id, existing.workplaceId);

			const [[shift], [template], [templateShift], [assignment]] =
				await Promise.all([
					db
						.select({ id: shifts.id })
						.from(shifts)
						.where(eq(shifts.positionId, existing.id))
						.limit(1),
					db
						.select({ id: shiftTemplates.id })
						.from(shiftTemplates)
						.where(eq(shiftTemplates.positionId, existing.id))
						.limit(1),
					db
						.select({ id: templateShifts.id })
						.from(templateShifts)
						.where(eq(templateShifts.positionId, existing.id))
						.limit(1),
					db
						.select({ employmentId: employmentPositions.employmentId })
						.from(employmentPositions)
						.where(eq(employmentPositions.positionId, existing.id))
						.limit(1),
				]);
			if (shift || template || templateShift || assignment) {
				throw new ConflictError(
					"This position is still used by shifts, templates, or workers.",
				);
			}

			await db.delete(positions).where(eq(positions.id, existing.id));
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ positionId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Delete a Position (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
