import {
	db,
	locations,
	schedules,
	workplaceSubscriptions,
} from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { count, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	hasActiveSubscription,
	hasPaidLocationCapacity,
	loadWorkplaceSubscription,
	polarClient,
	requireSubscriptionCapability,
	seatsAfterLocationRemoval,
	setSubscriptionSeats,
} from "../billing";
import { requirePrivilege, requireSession } from "../context";
import {
	BadRequestError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
} from "../errors";
import { fillPlaceFromAddress } from "../geocode";
import { assertPin, hashPin } from "../pin";
import { firstRow } from "../rows";

function assertTimeZone(timezone: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
	} catch {
		throw new BadRequestError(`Unknown IANA time zone: ${timezone}`);
	}
}

/** Keeps digit-only PINs consistent with the worker-PIN path before hashing. */
async function resolveKioskPinHash(
	pin: string | null | undefined,
	existing: string | null,
): Promise<string | null> {
	if (pin === undefined) return existing;
	if (pin === null) return null;
	assertPin(pin);
	return hashPin(pin);
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
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.view");

			const rows = await db
				.select()
				.from(locations)
				.where(eq(locations.workplaceId, params.workplaceId));

			return {
				locations: rows.map(toLocationDto),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			if (body.geofenceRadiusMeters != null) {
				await requireSubscriptionCapability(params.workplaceId, "kiosk");
			}
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
			const location = await db.transaction(async (tx) => {
				const [subscription] = await tx
					.select()
					.from(workplaceSubscriptions)
					.where(eq(workplaceSubscriptions.workplaceId, params.workplaceId))
					.for("update")
					.limit(1);
				if (!subscription || !hasActiveSubscription(subscription.status)) {
					throw new ForbiddenError(
						"An active subscription is required to add a location.",
					);
				}
				const [locationTotal] = await tx
					.select({ value: count() })
					.from(locations)
					.where(eq(locations.workplaceId, params.workplaceId));
				if (
					!hasPaidLocationCapacity(
						subscription.locationCount,
						locationTotal?.value ?? 0,
					)
				) {
					throw new ConflictError(
						"No paid location seat is available. Buy another seat in Subscription settings before adding this location.",
					);
				}
				return firstRow(
					await tx
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
			});

			return {
				location: toLocationDto(location),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
			const { profile } = await requireSession(headers);

			const [existing] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);

			if (!existing) throw new NotFoundError("Location not found");
			await requirePrivilege(
				profile.id,
				existing.workplaceId,
				"settings.manage",
			);
			if (
				body.geofenceRadiusMeters !== undefined ||
				body.kioskPin !== undefined
			) {
				await requireSubscriptionCapability(existing.workplaceId, "kiosk");
			}

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
						kioskPinHash: await resolveKioskPinHash(
							body.kioskPin,
							existing.kioskPinHash,
						),
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
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
			const { profile } = await requireSession(headers);

			const [existing] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);

			if (!existing) throw new NotFoundError("Location not found");
			await requirePrivilege(
				profile.id,
				existing.workplaceId,
				"settings.manage",
			);

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

			const subscription = await loadWorkplaceSubscription(
				existing.workplaceId,
			);
			if (subscription && hasActiveSubscription(subscription.status)) {
				const [beforeDeletion] = await db
					.select({ value: count() })
					.from(locations)
					.where(eq(locations.workplaceId, existing.workplaceId));
				const seatTarget = seatsAfterLocationRemoval(
					subscription.locationCount,
					Math.max(0, (beforeDeletion?.value ?? 1) - 1),
				);
				if (env.POLAR_ACCESS_TOKEN && seatTarget < subscription.locationCount) {
					const live = await polarClient().subscriptions.get({
						id: subscription.polarSubscriptionId,
					});
					if (live.pendingUpdate) {
						throw new ConflictError(
							"Cancel the scheduled subscription change before deleting this location; otherwise its unused seat could remain billed.",
						);
					}
				}
			}
			await db.delete(locations).where(eq(locations.id, existing.id));

			if (subscription && hasActiveSubscription(subscription.status)) {
				const [locationTotal] = await db
					.select({ value: count() })
					.from(locations)
					.where(eq(locations.workplaceId, existing.workplaceId));
				try {
					await setSubscriptionSeats(
						subscription,
						seatsAfterLocationRemoval(
							subscription.locationCount,
							locationTotal?.value ?? 1,
						),
					);
				} catch (error) {
					console.error(
						"Failed to reduce Polar seats after Location deletion",
						error,
					);
				}
			}

			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ locationId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Delete a Location (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
