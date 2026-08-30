import { db, locations } from "@SchedulesManager/db";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requireManager, requireSession } from "../context";
import { BadRequestError, NotFoundError } from "../errors";
import { firstRow } from "../rows";

function assertTimeZone(timezone: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
	} catch {
		throw new BadRequestError(`Unknown IANA time zone: ${timezone}`);
	}
}

export const locationsRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Location"],
})
	.get(
		"/workplaces/:workplaceId/locations",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const rows = await db
				.select()
				.from(locations)
				.where(eq(locations.workplaceId, params.workplaceId));

			return {
				locations: rows.map((location) => ({
					id: location.id,
					name: location.name,
					timezone: location.timezone,
					addressLine: location.addressLine,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "List Locations for a Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/locations",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			assertTimeZone(body.timezone);

			const location = firstRow(
				await db
					.insert(locations)
					.values({
						workplaceId: params.workplaceId,
						name: body.name,
						timezone: body.timezone,
						addressLine: body.addressLine ?? null,
					})
					.returning(),
			);

			return {
				location: {
					id: location.id,
					name: location.name,
					timezone: location.timezone,
					addressLine: location.addressLine,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 120 }),
				timezone: t.String({ default: "America/Chicago" }),
				addressLine: t.Optional(t.String({ maxLength: 200 })),
			}),
			detail: {
				summary: "Create a Location (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/locations/:locationId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);

			const [existing] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);

			if (!existing) throw new NotFoundError("Location not found");
			await requireManager(profile.id, existing.workplaceId);

			if (body.timezone) assertTimeZone(body.timezone);

			const location = firstRow(
				await db
					.update(locations)
					.set({
						name: body.name ?? existing.name,
						timezone: body.timezone ?? existing.timezone,
						addressLine:
							body.addressLine === undefined
								? existing.addressLine
								: body.addressLine,
						updatedAt: new Date(),
					})
					.where(eq(locations.id, params.locationId))
					.returning(),
			);

			return {
				location: {
					id: location.id,
					name: location.name,
					timezone: location.timezone,
					addressLine: location.addressLine,
				},
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
				timezone: t.Optional(t.String()),
				addressLine: t.Optional(
					t.Union([t.String({ maxLength: 200 }), t.Null()]),
				),
			}),
			detail: {
				summary: "Update a Location (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
