import {
	db,
	employments,
	locations,
	schedules,
	scheduleVersions,
	timeEntries,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { BadRequestError, NotFoundError, RateLimitError } from "../errors";
import { assertClockInGeofence, roundToMinutes } from "../geo";
import { pinMatches } from "../pin";
import { tryConsumeRateLimit } from "../rate-limit";

export const kioskRoutes = new Elysia({ prefix: "/v1", tags: ["Kiosk"] }).post(
	"/kiosk/clock",
	async ({ request, body }) => {
		const ip =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			"unknown";
		const limited = tryConsumeRateLimit(`kiosk:${ip}`, {
			limit: 40,
			windowMs: 10 * 60 * 1000,
		});
		if (!limited.allowed) throw new RateLimitError();

		const [location] = await db
			.select()
			.from(locations)
			.where(eq(locations.id, body.locationId))
			.limit(1);
		if (
			!location?.kioskPinHash ||
			!pinMatches(body.locationPin, location.kioskPinHash)
		) {
			throw new BadRequestError("Location PIN is not valid");
		}

		const workers = await db
			.select()
			.from(employments)
			.where(
				and(
					eq(employments.workplaceId, location.workplaceId),
					eq(employments.status, "active"),
				),
			);
		const worker = workers.find((row) =>
			pinMatches(body.workerPin, row.kioskPinHash),
		);
		if (!worker) throw new BadRequestError("Worker PIN is not valid");

		const [workplace] = await db
			.select()
			.from(workplaces)
			.where(eq(workplaces.id, location.workplaceId))
			.limit(1);
		assertClockInGeofence({
			geofenceRequired: workplace?.geofenceRequired ?? false,
			latitude: location.latitude,
			longitude: location.longitude,
			geofenceRadiusMeters: location.geofenceRadiusMeters,
			coords: { latitude: body.latitude, longitude: body.longitude },
		});
		const earlyMs = (workplace?.earlyClockInMinutes ?? 15) * 60_000;
		const now = new Date();

		const scheduleRows = await db
			.select()
			.from(schedules)
			.where(eq(schedules.locationId, location.id));
		let target: typeof versionShifts.$inferSelect | null = null;
		for (const schedule of scheduleRows) {
			const [latest] = await db
				.select()
				.from(scheduleVersions)
				.where(eq(scheduleVersions.scheduleId, schedule.id))
				.orderBy(desc(scheduleVersions.versionNumber))
				.limit(1);
			if (!latest) continue;
			const rows = await db
				.select()
				.from(versionShifts)
				.where(
					and(
						eq(versionShifts.versionId, latest.id),
						eq(versionShifts.employmentId, worker.id),
					),
				);
			for (const shift of rows) {
				if (
					now.getTime() >= shift.startsAt.getTime() - earlyMs &&
					now.getTime() <= shift.endsAt.getTime()
				) {
					target = shift;
					break;
				}
			}
			if (target) break;
		}
		if (!target) {
			throw new NotFoundError("No published Shift is open to clock");
		}

		const [entry] = await db
			.select()
			.from(timeEntries)
			.where(eq(timeEntries.versionShiftId, target.id))
			.limit(1);

		const roundedNow = roundToMinutes(now, workplace?.clockRoundMinutes ?? 0);

		if (body.action === "in") {
			if (entry) throw new BadRequestError("Already clocked in");
			const created = (
				await db
					.insert(timeEntries)
					.values({
						versionShiftId: target.id,
						employmentId: worker.id,
						clockedInAt: roundedNow,
					})
					.returning()
			)[0];
			return {
				timeEntry: {
					id: created?.id,
					clockedInAt: created?.clockedInAt.toISOString(),
					clockedOutAt: null,
				},
			};
		}

		if (!entry || entry.clockedOutAt) {
			throw new BadRequestError("No open Time Entry to clock out of");
		}
		const [updated] = await db
			.update(timeEntries)
			.set({ clockedOutAt: roundedNow })
			.where(eq(timeEntries.id, entry.id))
			.returning();
		return {
			timeEntry: {
				id: updated?.id,
				clockedInAt: updated?.clockedInAt.toISOString(),
				clockedOutAt: updated?.clockedOutAt?.toISOString() ?? null,
			},
		};
	},
	{
		body: t.Object({
			locationId: t.String({ format: "uuid" }),
			locationPin: t.String({ minLength: 4, maxLength: 8 }),
			workerPin: t.String({ minLength: 4, maxLength: 8 }),
			action: t.Union([t.Literal("in"), t.Literal("out")]),
			latitude: t.Optional(t.Number()),
			longitude: t.Optional(t.Number()),
		}),
		detail: { summary: "Clock in or out at a Location Kiosk by PIN" },
	},
);
