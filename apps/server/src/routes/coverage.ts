import {
	db,
	employmentLocations,
	employmentPositions,
	employments,
	locations,
	openShifts,
	positions,
	profiles,
	schedules as schedulesTable,
	shiftPickups,
	shiftReleases,
	shifts as shiftsTable,
	timeOffRequests,
	unavailability,
	versionShifts,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	requireManager,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import {
	managerEmploymentIds,
	notifyEmployments,
	workerEmploymentIds,
	writeAudit,
} from "../notify";
import { firstRow } from "../rows";
import { wallToInstant, zonedDayInfo } from "../time";
import { publishScheduleNow } from "./publication";

async function queryDraftShifts(shiftIds: string[]) {
	return db.select().from(shiftsTable).where(inArray(shiftsTable.id, shiftIds));
}

async function ownedVersionShift(
	authorization: string,
	versionShiftId: string,
) {
	const { profile } = await requireSession(authorization);
	const employmentRows = await activeEmploymentsOf(profile.id);

	const [shift] = await db
		.select()
		.from(versionShifts)
		.where(eq(versionShifts.id, versionShiftId))
		.limit(1);
	if (!shift) throw new NotFoundError("Shift not found");
	if (!shift.employmentId || !employmentRows.includes(shift.employmentId)) {
		throw new BadRequestError("This shift is not yours");
	}
	if (shift.endsAt.getTime() <= Date.now()) {
		throw new ConflictError("This shift has already ended");
	}
	return { profile, shift };
}

async function activeEmploymentsOf(profileId: string) {
	const rows = await db
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.profileId, profileId),
				eq(employments.status, "active"),
			),
		);
	return rows.map((row) => row.id);
}

export async function assertEligible(
	employmentId: string,
	locationId: string,
	positionId: string,
	startsAt: Date,
	endsAt: Date,
	reader: Pick<typeof db, "select"> = db,
) {
	const [employment] = await reader
		.select()
		.from(employments)
		.where(eq(employments.id, employmentId))
		.limit(1);
	if (employment?.status !== "active") {
		throw new ConflictError("You are not active at this workplace");
	}

	if (employment.kind === "worker") {
		const locationRows = await reader
			.select()
			.from(employmentLocations)
			.where(eq(employmentLocations.employmentId, employmentId));
		if (
			locationRows.length > 0 &&
			!locationRows.some((row) => row.locationId === locationId)
		) {
			throw new ConflictError("This shift is at a location you don't work at");
		}

		const positionRows = await reader
			.select()
			.from(employmentPositions)
			.where(eq(employmentPositions.employmentId, employmentId));
		if (
			positionRows.length > 0 &&
			!positionRows.some((row) => row.positionId === positionId)
		) {
			throw new ConflictError("You are not approved for this position");
		}
	}

	const constraintRows = await reader
		.select()
		.from(unavailability)
		.where(eq(unavailability.employmentId, employmentId));

	const [location] = await reader
		.select()
		.from(locations)
		.where(eq(locations.id, locationId))
		.limit(1);
	const tz = location?.timezone ?? "America/Chicago";

	for (const window of constraintRows) {
		let blocked = false;
		if (window.kind === "recurring" && window.weekday !== null) {
			const firstKey = zonedDayInfo(startsAt, tz).dateKey;
			const lastKey = zonedDayInfo(endsAt, tz).dateKey;
			const keys = firstKey === lastKey ? [firstKey] : [firstKey, lastKey];
			for (const key of keys) {
				const info = zonedDayInfo(wallToInstant(key, 0, tz), tz);
				if (info.weekday !== window.weekday) continue;
				const winStart = wallToInstant(key, window.startMinute, tz);
				const winEnd = wallToInstant(key, window.endMinute, tz);
				if (startsAt < winEnd && winStart < endsAt) blocked = true;
			}
		} else if (window.kind === "date" && window.specificDate) {
			const winStart = wallToInstant(
				window.specificDate,
				window.startMinute,
				tz,
			);
			const winEnd = wallToInstant(window.specificDate, window.endMinute, tz);
			blocked = startsAt < winEnd && winStart < endsAt;
		}
		if (blocked) {
			throw new ConflictError(
				"This shift overlaps a window when you said you can't work",
			);
		}
	}

	const approvedTimeOff = await reader
		.select()
		.from(timeOffRequests)
		.where(
			and(
				eq(timeOffRequests.employmentId, employmentId),
				eq(timeOffRequests.status, "approved"),
			),
		);
	for (const request of approvedTimeOff) {
		if (startsAt < request.endsAt && request.startsAt < endsAt) {
			throw new ConflictError("This shift overlaps your approved time off");
		}
	}
}

export const coverageRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Coverage"],
})
	.post(
		"/my/releases",
		async ({ headers, body }) => {
			const { profile, shift } = await ownedVersionShift(
				headers.authorization,
				body.versionShiftId,
			);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `release.request:${body.versionShiftId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const [existing] = await db
						.select({ id: shiftReleases.id })
						.from(shiftReleases)
						.where(
							and(
								eq(shiftReleases.versionShiftId, shift.id),
								eq(shiftReleases.requestedBy, shift.employmentId ?? ""),
								eq(shiftReleases.status, "pending"),
							),
						)
						.limit(1);
					if (existing) {
						throw new ConflictError(
							"You already have a pending release request",
						);
					}

					const release = firstRow(
						await db
							.insert(shiftReleases)
							.values({
								versionShiftId: shift.id,
								requestedBy: shift.employmentId ?? "",
								reason: body.reason ?? null,
							})
							.returning(),
					);

					const [employment] = await db
						.select({ workplaceId: employments.workplaceId })
						.from(employments)
						.where(eq(employments.id, shift.employmentId ?? ""))
						.limit(1);
					if (employment) {
						await notifyEmployments(
							await managerEmploymentIds(employment.workplaceId),
							{
								kind: "release_requested",
								title: "Release requested",
								body: "A worker asked to be released from a published shift.",
							},
						);
					}

					return { release: { id: release.id, status: release.status } };
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
			body: t.Object({
				versionShiftId: t.String({ format: "uuid" }),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
			detail: {
				summary:
					"Request release from one of your published shifts. You remain responsible until a Manager approves (Worker)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/open-shifts",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const locationRows = await db
				.select()
				.from(locations)
				.where(eq(locations.workplaceId, params.workplaceId));
			const locationScope = await db
				.select({ id: employmentLocations.locationId })
				.from(employmentLocations)
				.where(eq(employmentLocations.employmentId, employment.id));
			const accessible =
				employment.kind === "manager" || locationScope.length === 0
					? locationRows.map((location) => location.id)
					: locationScope.map((row) => row.id);

			if (accessible.length === 0) {
				return { openShifts: [] };
			}

			const rows = await db
				.select({
					openShift: openShifts,
					locationName: locations.name,
					timezone: locations.timezone,
					positionName: positions.name,
				})
				.from(openShifts)
				.innerJoin(locations, eq(locations.id, openShifts.locationId))
				.innerJoin(positions, eq(positions.id, openShifts.positionId))
				.where(
					and(
						inArray(openShifts.locationId, accessible),
						eq(openShifts.status, "open"),
					),
				);

			const shiftRows = rows.length
				? await queryDraftShifts(rows.map((row) => row.openShift.shiftId))
				: [];
			const myPickups = await db
				.select()
				.from(shiftPickups)
				.where(eq(shiftPickups.requestedBy, employment.id));

			return {
				openShifts: rows
					.map((row) => {
						const shift = shiftRows.find(
							(candidate) => candidate.id === row.openShift.shiftId,
						);
						if (!shift || shift.endsAt.getTime() <= Date.now()) return null;
						const info = zonedDayInfo(shift.startsAt, row.timezone);
						const endInfo = zonedDayInfo(shift.endsAt, row.timezone);
						const myPickup = myPickups.find(
							(candidate) => candidate.openShiftId === row.openShift.id,
						);
						return {
							id: row.openShift.id,
							locationName: row.locationName,
							positionName: row.positionName,
							startsAt: shift.startsAt.toISOString(),
							endsAt: shift.endsAt.toISOString(),
							date: info.dateKey,
							startMinute: info.minuteOfDay,
							endMinute: endInfo.minuteOfDay,
							overnight: info.dateKey !== endInfo.dateKey,
							myPickupStatus: myPickup?.status ?? null,
						};
					})
					.filter((row) => row !== null),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "List open shifts the caller could pick up (Worker)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/open-shifts/:openShiftId/pickups",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `pickup.request:${params.openShiftId}`,
				key: headers["idempotency-key"],
				request: { openShiftId: params.openShiftId },
				execute: async () => {
					const [openShift] = await db
						.select({
							openShift: openShifts,
							workplaceId: locations.workplaceId,
						})
						.from(openShifts)
						.innerJoin(locations, eq(locations.id, openShifts.locationId))
						.where(eq(openShifts.id, params.openShiftId))
						.limit(1);
					if (!openShift) throw new NotFoundError("Open shift not found");
					if (openShift.openShift.status !== "open") {
						throw new ConflictError("This shift is no longer open");
					}

					const employment = await requireWorkplaceMember(
						profile.id,
						openShift.workplaceId,
					);
					if (openShift.openShift.releasedFrom === employment.id) {
						throw new ConflictError(
							"You cannot pick up a shift you released yourself",
						);
					}

					const [shift] = await db
						.select()
						.from(shiftsTable)
						.where(eq(shiftsTable.id, openShift.openShift.shiftId))
						.limit(1);
					if (!shift) throw new NotFoundError("Shift not found");

					await assertEligible(
						employment.id,
						openShift.openShift.locationId,
						openShift.openShift.positionId,
						shift.startsAt,
						shift.endsAt,
					);

					const [pickup] = await db
						.insert(shiftPickups)
						.values({
							openShiftId: openShift.openShift.id,
							requestedBy: employment.id,
						})
						.onConflictDoNothing()
						.returning();
					if (!pickup) {
						throw new ConflictError("You already requested this shift");
					}

					await notifyEmployments(
						await managerEmploymentIds(openShift.workplaceId),
						{
							kind: "pickup_requested",
							title: "Pickup requested",
							body: "A worker asked to pick up an open shift.",
						},
					);

					return { pickup: { id: pickup.id, status: pickup.status } };
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
			params: t.Object({ openShiftId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Request pickup of an open shift. Eligibility is checked server-side (Worker)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/coverage",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const releaseRows = await db
				.select({
					release: shiftReleases,
					shift: versionShifts,
					email: profiles.email,
					fullName: profiles.fullName,
				})
				.from(shiftReleases)
				.innerJoin(
					versionShifts,
					eq(versionShifts.id, shiftReleases.versionShiftId),
				)
				.innerJoin(employments, eq(employments.id, shiftReleases.requestedBy))
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, params.workplaceId))
				.orderBy(desc(shiftReleases.createdAt))
				.limit(50);

			const pickupRows = await db
				.select({
					pickup: shiftPickups,
					openShift: openShifts,
					email: profiles.email,
					fullName: profiles.fullName,
				})
				.from(shiftPickups)
				.innerJoin(openShifts, eq(openShifts.id, shiftPickups.openShiftId))
				.innerJoin(employments, eq(employments.id, shiftPickups.requestedBy))
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, params.workplaceId))
				.orderBy(desc(shiftPickups.createdAt))
				.limit(50);

			const openShiftDraftIds = pickupRows.map((row) => row.openShift.shiftId);
			const draftShifts = openShiftDraftIds.length
				? await queryDraftShifts(openShiftDraftIds)
				: [];

			const positionRows = await db
				.select()
				.from(positions)
				.where(eq(positions.workplaceId, params.workplaceId));
			const positionNamesById = new Map(
				positionRows.map((position) => [position.id, position.name]),
			);

			return {
				releases: releaseRows.map((row) => ({
					id: row.release.id,
					workerName: row.fullName ?? row.email,
					workerEmail: row.email,
					positionName: positionNamesById.get(row.shift.positionId) ?? "Shift",
					startsAt: row.shift.startsAt.toISOString(),
					reason: row.release.reason,
					status: row.release.status,
				})),
				pickups: pickupRows.map((row) => {
					const shift = draftShifts.find(
						(candidate) => candidate.id === row.openShift.shiftId,
					);
					return {
						id: row.pickup.id,
						workerName: row.fullName ?? row.email,
						workerEmail: row.email,
						positionName:
							positionNamesById.get(row.openShift.positionId) ?? "Shift",
						startsAt: shift ? shift.startsAt.toISOString() : null,
						status: row.pickup.status,
					};
				}),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Coverage queue: releases and pickups (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/releases/:releaseId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `release.decision:${params.releaseId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const [release] = await db
						.select()
						.from(shiftReleases)
						.where(eq(shiftReleases.id, params.releaseId))
						.limit(1);
					if (!release) throw new NotFoundError("Release request not found");
					if (release.status !== "pending") {
						throw new ConflictError("This request was already decided");
					}

					if (body.decision === "declined") {
						await db.transaction(async (tx) => {
							const declined = await tx
								.update(shiftReleases)
								.set({
									status: "declined",
									decidedBy: profile.id,
									decidedAt: new Date(),
								})
								.where(
									and(
										eq(shiftReleases.id, release.id),
										eq(shiftReleases.status, "pending"),
									),
								)
								.returning({ id: shiftReleases.id });
							if (declined.length === 0) {
								throw new ConflictError("This request was already decided");
							}
							await notifyEmployments(
								[release.requestedBy],
								{
									kind: "release_declined",
									title: "Release declined",
									body: "Your manager declined the release request. You remain responsible for the shift.",
								},
								tx,
							);
							await writeAudit(
								{
									workplaceId: params.workplaceId,
									actorProfileId: profile.id,
									action: "coverage.release_declined",
									entityType: "shift_release",
									entityId: release.id,
									summary: "Declined a shift release request",
								},
								tx,
							);
						});
						return { status: "declined" as const };
					}

					const [versionShift] = await db
						.select()
						.from(versionShifts)
						.where(eq(versionShifts.id, release.versionShiftId))
						.limit(1);
					if (!versionShift || versionShift.shiftId === null) {
						throw new NotFoundError("The original shift could not be found");
					}
					const draftShiftId = versionShift.shiftId;

					const draftLocationId = await locationIdForDraftShift(draftShiftId);
					const openShiftWorkers = (
						await workerEmploymentIds(params.workplaceId)
					).filter((id) => id !== release.requestedBy);
					await db.transaction(async (tx) => {
						const approved = await tx
							.update(shiftReleases)
							.set({
								status: "approved",
								decidedBy: profile.id,
								decidedAt: new Date(),
							})
							.where(
								and(
									eq(shiftReleases.id, release.id),
									eq(shiftReleases.status, "pending"),
								),
							)
							.returning({ id: shiftReleases.id });
						if (approved.length === 0) {
							throw new ConflictError("This request was already decided");
						}

						await tx
							.update(shiftsTable)
							.set({ employmentId: null, updatedAt: new Date() })
							.where(eq(shiftsTable.id, draftShiftId));

						await tx.insert(openShifts).values({
							shiftId: draftShiftId,
							locationId: draftLocationId,
							positionId: versionShift.positionId,
							releasedFrom: release.requestedBy,
							note: versionShift.note,
						});
						await notifyEmployments(
							[release.requestedBy],
							{
								kind: "release_approved",
								title: "Release approved",
								body: "Your manager approved the release. The shift is now open for pickup. You remain responsible until someone is assigned.",
							},
							tx,
						);
						await notifyEmployments(
							openShiftWorkers,
							{
								kind: "open_shift",
								title: "An open shift is available",
								body: "A shift was released and is open for pickup.",
							},
							tx,
						);
						await writeAudit(
							{
								workplaceId: params.workplaceId,
								actorProfileId: profile.id,
								action: "coverage.release_approved",
								entityType: "shift_release",
								entityId: release.id,
								summary:
									"Approved a shift release and opened the shift for pickup",
							},
							tx,
						);
					});

					return { status: "approved" as const };
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
				workplaceId: t.String({ format: "uuid" }),
				releaseId: t.String({ format: "uuid" }),
			}),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
			}),
			detail: {
				summary:
					"Approve a release: the draft shift becomes an Open Shift. Decline keeps the worker responsible (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/pickups/:pickupId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `pickup.decision:${params.pickupId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: () =>
					decidePickup(profile.id, params.workplaceId, params.pickupId, body),
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
				workplaceId: t.String({ format: "uuid" }),
				pickupId: t.String({ format: "uuid" }),
			}),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
			}),
			detail: {
				summary:
					"Approve a pickup: the worker is assigned and a successor Schedule Version is published atomically (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);

async function decidePickup(
	profileId: string,
	workplaceId: string,
	pickupId: string,
	body: { decision: "approved" | "declined" },
) {
	const [pickup] = await db
		.select()
		.from(shiftPickups)
		.where(eq(shiftPickups.id, pickupId))
		.limit(1);
	if (!pickup) throw new NotFoundError("Pickup request not found");
	if (pickup.status !== "pending") {
		throw new ConflictError("This request was already decided");
	}

	const [openShift] = await db
		.select()
		.from(openShifts)
		.where(eq(openShifts.id, pickup.openShiftId))
		.limit(1);
	if (!openShift) throw new NotFoundError("Open shift not found");

	if (body.decision === "declined") {
		const declined = await db
			.update(shiftPickups)
			.set({
				status: "declined",
				decidedBy: profileId,
				decidedAt: new Date(),
			})
			.where(
				and(eq(shiftPickups.id, pickup.id), eq(shiftPickups.status, "pending")),
			)
			.returning({ id: shiftPickups.id });
		if (declined.length === 0) {
			throw new ConflictError("This request was already decided");
		}
		await notifyEmployments([pickup.requestedBy], {
			kind: "pickup_declined",
			title: "Pickup declined",
			body: "Your manager declined the pickup request.",
		});
		await writeAudit({
			workplaceId,
			actorProfileId: profileId,
			action: "coverage.pickup_declined",
			entityType: "shift_pickup",
			entityId: pickup.id,
			summary: "Declined a shift pickup request",
		});
		return { status: "declined" as const };
	}

	const [shift] = await db
		.select()
		.from(shiftsTable)
		.where(eq(shiftsTable.id, openShift.shiftId))
		.limit(1);
	if (!shift) throw new NotFoundError("Shift not found");

	await assertEligible(
		pickup.requestedBy,
		openShift.locationId,
		openShift.positionId,
		shift.startsAt,
		shift.endsAt,
	);

	const published = await publishScheduleNow(shift.scheduleId, profileId, {
		beforePublish: async (tx) => {
			const claimedOpenShift = await tx
				.update(openShifts)
				.set({ status: "filled" })
				.where(
					and(eq(openShifts.id, openShift.id), eq(openShifts.status, "open")),
				)
				.returning({ id: openShifts.id });
			if (claimedOpenShift.length === 0) {
				throw new ConflictError("This open shift has already been filled");
			}

			const approvedPickup = await tx
				.update(shiftPickups)
				.set({
					status: "approved",
					decidedBy: profileId,
					decidedAt: new Date(),
				})
				.where(
					and(
						eq(shiftPickups.id, pickup.id),
						eq(shiftPickups.status, "pending"),
					),
				)
				.returning({ id: shiftPickups.id });
			if (approvedPickup.length === 0) {
				throw new ConflictError("This request was already decided");
			}

			await tx
				.update(shiftsTable)
				.set({ employmentId: pickup.requestedBy, updatedAt: new Date() })
				.where(eq(shiftsTable.id, shift.id));
			await tx
				.update(shiftPickups)
				.set({
					status: "declined",
					decidedBy: profileId,
					decidedAt: new Date(),
				})
				.where(
					and(
						eq(shiftPickups.openShiftId, openShift.id),
						eq(shiftPickups.status, "pending"),
					),
				);

			await notifyEmployments(
				[pickup.requestedBy],
				{
					kind: "pickup_approved",
					title: "Pickup approved",
					body: "Your manager assigned you the open shift and published a new schedule version.",
				},
				tx,
			);
			if (
				openShift.releasedFrom &&
				openShift.releasedFrom !== pickup.requestedBy
			) {
				await notifyEmployments(
					[openShift.releasedFrom],
					{
						kind: "coverage_filled",
						title: "Your released shift was covered",
						body: "Another worker was assigned to the shift you released.",
					},
					tx,
				);
			}
			await writeAudit(
				{
					workplaceId,
					actorProfileId: profileId,
					action: "coverage.pickup_approved",
					entityType: "shift_pickup",
					entityId: pickup.id,
					summary: "Approved a pickup and published a successor schedule",
				},
				tx,
			);
		},
	});

	return {
		status: "approved" as const,
		publishedVersion: published.version.versionNumber,
	};
}

async function locationIdForDraftShift(shiftId: string) {
	const [row] = await db
		.select({ locationId: schedulesTable.locationId })
		.from(shiftsTable)
		.innerJoin(schedulesTable, eq(schedulesTable.id, shiftsTable.scheduleId))
		.where(eq(shiftsTable.id, shiftId))
		.limit(1);
	if (!row) throw new NotFoundError("Shift not found");
	return row.locationId;
}
