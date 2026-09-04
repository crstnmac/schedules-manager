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
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	BadRequestError,
	ConflictError,
	NotFoundError,
	RateLimitError,
} from "../errors";
import { assertClockInGeofence, roundToMinutes } from "../geo";
import { hashPin, pinMatches } from "../pin";
import { tryConsumeRateLimit } from "../rate-limit";
import { firstRow } from "../rows";

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

		// Resolve by exact hash within the workplace. More than one active match
		// means the PIN is shared and punches could be misattributed — refuse
		// rather than guessing.
		const workerMatches = await db
			.select()
			.from(employments)
			.where(
				and(
					eq(employments.workplaceId, location.workplaceId),
					eq(employments.status, "active"),
					eq(employments.kioskPinHash, hashPin(body.workerPin)),
				),
			);
		if (workerMatches.length === 0) {
			throw new BadRequestError("Worker PIN is not valid");
		}
		if (workerMatches.length > 1) {
			throw new BadRequestError(
				"This worker PIN is used by more than one worker. Ask a manager to set unique PINs.",
			);
		}
		const worker = firstRow(workerMatches);

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

		// Latest published version per schedule for this location, then the
		// worker's shift inside the clock window — two queries total.
		const versionRows = await db
			.select({
				id: scheduleVersions.id,
				scheduleId: scheduleVersions.scheduleId,
				versionNumber: scheduleVersions.versionNumber,
			})
			.from(scheduleVersions)
			.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
			.where(eq(schedules.locationId, location.id))
			.orderBy(
				scheduleVersions.scheduleId,
				desc(scheduleVersions.versionNumber),
			);
		const latestVersionIds: string[] = [];
		const seenSchedules = new Set<string>();
		for (const row of versionRows) {
			if (seenSchedules.has(row.scheduleId)) continue;
			seenSchedules.add(row.scheduleId);
			latestVersionIds.push(row.id);
		}

		let target: typeof versionShifts.$inferSelect | null = null;
		if (latestVersionIds.length > 0) {
			const rows = await db
				.select()
				.from(versionShifts)
				.where(
					and(
						inArray(versionShifts.versionId, latestVersionIds),
						eq(versionShifts.employmentId, worker.id),
						lte(
							versionShifts.startsAt,
							new Date(now.getTime() + earlyMs),
						),
						gte(versionShifts.endsAt, now),
					),
				)
				.orderBy(versionShifts.startsAt)
				.limit(1);
			target = rows[0] ?? null;
		}
		if (!target) {
			throw new NotFoundError("No published Shift is open to clock");
		}

		const roundedNow = roundToMinutes(now, workplace?.clockRoundMinutes ?? 0);

		// Serialize punches per shift and rely on the unique constraint, so a
		// double-tap cannot create two Time Entries.
		if (body.action === "in") {
			await db.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${`clock:${target.shiftId ?? target.id}`}, 0))`,
			);
			const [entry] = await db
				.select()
				.from(timeEntries)
				.where(eq(timeEntries.versionShiftId, target.id))
				.limit(1);
			if (entry) throw new BadRequestError("Already clocked in");
			const created = (
				await db
					.insert(timeEntries)
					.values({
						versionShiftId: target.id,
						employmentId: worker.id,
						clockedInAt: roundedNow,
					})
					.onConflictDoNothing({ target: timeEntries.versionShiftId })
					.returning()
			)[0];
			if (!created) throw new ConflictError("Already clocked in");
			return {
				timeEntry: {
					id: created?.id,
					clockedInAt: created?.clockedInAt.toISOString(),
					clockedOutAt: null,
				},
			};
		}

		const [entry] = await db
			.select()
			.from(timeEntries)
			.where(eq(timeEntries.versionShiftId, target.id))
			.limit(1);
		if (!entry || entry.clockedOutAt) {
			throw new BadRequestError("No open Time Entry to clock out of");
		}
		// Rounding must never pull clock-out to or before clock-in.
		const clockedOutAt =
			roundedNow.getTime() <= entry.clockedInAt.getTime()
				? new Date(entry.clockedInAt.getTime() + 60_000)
				: roundedNow;
		const [updated] = await db
			.update(timeEntries)
			.set({ clockedOutAt })
			.where(
				and(eq(timeEntries.id, entry.id), isNull(timeEntries.clockedOutAt)),
			)
			.returning();
		if (!updated) throw new ConflictError("Already clocked out");
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
