import { db, locations } from "@SchedulesManager/db";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requireManager, requireSession } from "../context";
import { BadRequestError, NotFoundError } from "../errors";
import { fillPlaceFromAddress } from "../geocode";
import { hashPin } from "../pin";
import { firstRow } from "../rows";

function assertTimeZone(timezone: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
	} catch {
		throw new BadRequestError(`Unknown IANA time zone: ${timezone}`);
	}
}

function toLocationDto(location: typeof locations.$inferSelect) {
	return {
		id: location.id,
		name: location.name,
		timezone: location.timezone,
		addressLine: location.addressLine,
		latitude: location.latitude,
		longitude: location.longitude,
		geofenceRadiusMeters: location.geofenceRadiusMeters,
		kioskEnabled: Boolean(location.kioskPinHash),
	};
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
				locations: rows.map(toLocationDto),
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

			const filled = await fillPlaceFromAddress({
				addressLine: body.addressLine,
				latitude: body.latitude,
				longitude: body.longitude,
			});
			const timezone = body.timezone ?? filled.timezone;
			assertTimeZone(timezone);

			const location = firstRow(
				await db
					.insert(locations)
					.values({
						workplaceId: params.workplaceId,
						name: body.name,
						timezone,
						addressLine: body.addressLine?.trim() || null,
						latitude: filled.latitude,
						longitude: filled.longitude,
						geofenceRadiusMeters: body.geofenceRadiusMeters ?? null,
					})
					.returning(),
			);

			return {
				location: toLocationDto(location),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 120 }),
				timezone: t.String({ default: "America/Chicago" }),
				addressLine: t.Optional(t.String({ maxLength: 200 })),
				latitude: t.Optional(t.Union([t.String(), t.Null()])),
				longitude: t.Optional(t.Union([t.String(), t.Null()])),
				geofenceRadiusMeters: t.Optional(
					t.Union([t.Integer({ minimum: 20, maximum: 5000 }), t.Null()]),
				),
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

			const addressLine =
				body.addressLine === undefined
					? existing.addressLine
					: body.addressLine;
			const filled = await fillPlaceFromAddress({
				addressLine,
				latitude:
					body.latitude === undefined ? existing.latitude : body.latitude,
				longitude:
					body.longitude === undefined ? existing.longitude : body.longitude,
			});
			const timezone = body.timezone ?? filled.timezone ?? existing.timezone;
			assertTimeZone(timezone);

			const location = firstRow(
				await db
					.update(locations)
					.set({
						name: body.name ?? existing.name,
						timezone,
						addressLine:
							body.addressLine === undefined
								? existing.addressLine
								: body.addressLine,
						latitude: filled.latitude,
						longitude: filled.longitude,
						geofenceRadiusMeters:
							body.geofenceRadiusMeters === undefined
								? existing.geofenceRadiusMeters
								: body.geofenceRadiusMeters,
						kioskPinHash:
							body.kioskPin === undefined
								? existing.kioskPinHash
								: body.kioskPin === null
									? null
									: hashPin(body.kioskPin),
						updatedAt: new Date(),
					})
					.where(eq(locations.id, params.locationId))
					.returning(),
			);

			return {
				location: toLocationDto(location),
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
				latitude: t.Optional(t.Union([t.String(), t.Null()])),
				longitude: t.Optional(t.Union([t.String(), t.Null()])),
				geofenceRadiusMeters: t.Optional(
					t.Union([t.Integer({ minimum: 20, maximum: 5000 }), t.Null()]),
				),
				kioskPin: t.Optional(
					t.Union([t.String({ minLength: 4, maxLength: 8 }), t.Null()]),
				),
			}),
			detail: {
				summary: "Update a Location (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
