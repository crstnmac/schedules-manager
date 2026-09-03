import { db, locations, schedules } from "@SchedulesManager/db";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requireManager, requireSession } from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
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
		openMinute: location.openMinute,
		closeMinute: location.closeMinute,
		kioskEnabled: Boolean(location.kioskPinHash),
	};
}

function normalizeHours(
	openMinute: number | null | undefined,
	closeMinute: number | null | undefined,
	existingOpen: number | null,
	existingClose: number | null,
) {
	const open = openMinute === undefined ? existingOpen : openMinute;
	const close = closeMinute === undefined ? existingClose : closeMinute;
	if (open != null && (open < 0 || open > 1440)) {
		throw new BadRequestError("Open time must be between 0 and 1440 minutes");
	}
	if (close != null && (close < 0 || close > 1440)) {
		throw new BadRequestError("Close time must be between 0 and 1440 minutes");
	}
	return { openMinute: open, closeMinute: close };
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

			const hours = normalizeHours(
				body.openMinute,
				body.closeMinute,
				null,
				null,
			);
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
						openMinute: hours.openMinute,
						closeMinute: hours.closeMinute,
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
				openMinute: t.Optional(
					t.Union([t.Integer({ minimum: 0, maximum: 1440 }), t.Null()]),
				),
				closeMinute: t.Optional(
					t.Union([t.Integer({ minimum: 0, maximum: 1440 }), t.Null()]),
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
			const hours = normalizeHours(
				body.openMinute,
				body.closeMinute,
				existing.openMinute,
				existing.closeMinute,
			);

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
						openMinute: hours.openMinute,
						closeMinute: hours.closeMinute,
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
				openMinute: t.Optional(
					t.Union([t.Integer({ minimum: 0, maximum: 1440 }), t.Null()]),
				),
				closeMinute: t.Optional(
					t.Union([t.Integer({ minimum: 0, maximum: 1440 }), t.Null()]),
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
	)
	.delete(
		"/locations/:locationId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);

			const [existing] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);

			if (!existing) throw new NotFoundError("Location not found");
			await requireManager(profile.id, existing.workplaceId);

			const [schedule] = await db
				.select({ id: schedules.id })
				.from(schedules)
				.where(eq(schedules.locationId, existing.id))
				.limit(1);
			if (schedule) {
				throw new ConflictError(
					"This location still has schedules. Remove those weeks before deleting it.",
				);
			}

			await db.delete(locations).where(eq(locations.id, existing.id));
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ locationId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Delete a Location (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
