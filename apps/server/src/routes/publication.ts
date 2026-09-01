import {
	db,
	employmentLocations,
	employments,
	locations,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shiftAcceptances,
	shiftReleases,
	shifts,
	timeEntries,
	versionShifts,
	workerDeliveries,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	listActiveEmployments,
	requireManager,
	requireSession,
	requireWorkplaceMember,
	weekStartDayFor,
} from "../context";
import { NotFoundError } from "../errors";
import { notifyEmployments, writeAudit } from "../notify";
import { firstRow } from "../rows";
import { weekStartOfDateKey, zonedDayInfo } from "../time";
import { diffShiftSets } from "./changes";

async function scheduleContext(scheduleId: string) {
	const [row] = await db
		.select({ schedule: schedules, location: locations })
		.from(schedules)
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.where(eq(schedules.id, scheduleId))
		.limit(1);
	if (!row) throw new NotFoundError("Schedule not found");
	return row;
}

async function accessibleLocationIds(
	employmentId: string,
	workplaceId: string,
) {
	const [employment] = await db
		.select()
		.from(employments)
		.where(eq(employments.id, employmentId))
		.limit(1);
	if (!employment) throw new NotFoundError("Employment not found");

	if (employment.kind === "manager") {
		const rows = await db
			.select({ id: locations.id })
			.from(locations)
			.where(eq(locations.workplaceId, workplaceId));
		return rows.map((row) => row.id);
	}

	const rows = await db
		.select({ id: employmentLocations.locationId })
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, employmentId));
	if (rows.length === 0) {
		const all = await db
			.select({ id: locations.id })
			.from(locations)
			.where(eq(locations.workplaceId, workplaceId));
		return all.map((row) => row.id);
	}
	return rows.map((row) => row.id);
}

export async function publishScheduleNow(
	scheduleId: string,
	publishedBy: string,
) {
	const { schedule, location } = await scheduleContext(scheduleId);

	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.id, location.workplaceId))
		.limit(1);
	const noticeWindowHours = workplace?.noticeWindowHours ?? 48;
	const now = Date.now();

	const published = await db.transaction(async (tx) => {
		const draftShifts = await tx
			.select()
			.from(shifts)
			.where(eq(shifts.scheduleId, schedule.id))
			.for("update");

		const [previousVersion] = await tx
			.select()
			.from(scheduleVersions)
			.where(eq(scheduleVersions.scheduleId, schedule.id))
			.orderBy(desc(scheduleVersions.versionNumber))
			.limit(1);

		const previousShifts = previousVersion
			? await tx
					.select()
					.from(versionShifts)
					.where(eq(versionShifts.versionId, previousVersion.id))
			: [];

		const maxRow = (
			await tx
				.select({
					maxNumber: sql<number>`coalesce(max(${scheduleVersions.versionNumber}), 0)`,
				})
				.from(scheduleVersions)
				.where(eq(scheduleVersions.scheduleId, schedule.id))
		)[0];
		const nextNumber = Number(maxRow?.maxNumber ?? 0) + 1;

		const version = firstRow(
			await tx
				.insert(scheduleVersions)
				.values({
					scheduleId: schedule.id,
					versionNumber: nextNumber,
					publishedBy,
				})
				.returning(),
		);

		const insertedVersionShifts =
			draftShifts.length > 0
				? await tx
						.insert(versionShifts)
						.values(
							draftShifts.map((shift) => ({
								versionId: version.id,
								shiftId: shift.id,
								employmentId: shift.employmentId,
								positionId: shift.positionId,
								startsAt: shift.startsAt,
								endsAt: shift.endsAt,
								note: shift.note,
							})),
						)
						.returning()
				: [];

		const changes =
			previousShifts.length + draftShifts.length > 0
				? diffShiftSets(
						previousShifts.map((shift) => ({
							id: shift.id,
							employmentId: shift.employmentId,
							positionId: shift.positionId,
							startsAt: shift.startsAt,
							endsAt: shift.endsAt,
							note: shift.note,
						})),
						draftShifts.map((shift) => ({
							id: shift.id,
							employmentId: shift.employmentId,
							positionId: shift.positionId,
							startsAt: shift.startsAt,
							endsAt: shift.endsAt,
							note: shift.note,
						})),
						location.timezone,
					)
				: [];

		const versionShiftByDraftId = new Map(
			insertedVersionShifts.map((row) => [row.shiftId, row]),
		);
		const acceptanceTargets = changes.filter(
			(change) =>
				change.material &&
				change.draftShiftId !== undefined &&
				change.employmentId !== null &&
				(() => {
					const shift = draftShifts.find(
						(candidate) => candidate.id === change.draftShiftId,
					);
					return shift
						? shift.startsAt.getTime() - now < noticeWindowHours * 3_600_000
						: false;
				})(),
		);

		if (acceptanceTargets.length > 0) {
			await tx
				.insert(shiftAcceptances)
				.values(
					acceptanceTargets.flatMap((change) => {
						const versionShift = versionShiftByDraftId.get(
							change.draftShiftId ?? "",
						);
						if (!versionShift || !change.employmentId) return [];
						return [
							{
								versionId: version.id,
								versionShiftId: versionShift.id,
								employmentId: change.employmentId,
								changeSummary: change.summary,
							},
						];
					}),
				)
				.onConflictDoNothing();
		}

		const workerIds = [
			...new Set(
				draftShifts
					.map((shift) => shift.employmentId)
					.filter((id): id is string => id !== null),
			),
		];

		if (workerIds.length > 0) {
			await tx
				.insert(workerDeliveries)
				.values(
					workerIds.map((employmentId) => ({
						versionId: version.id,
						employmentId,
					})),
				)
				.onConflictDoNothing();
		}

		return {
			version: {
				id: version.id,
				versionNumber: version.versionNumber,
				publishedAt: version.publishedAt.toISOString(),
				workers: workerIds.length,
			},
			changes: {
				total: changes.length,
				material: changes.filter((change) => change.material).length,
				acceptancesRequired: acceptanceTargets.length,
			},
			notices: {
				workerIds,
				acceptanceEmploymentIds: [
					...new Set(
						acceptanceTargets
							.map((change) => change.employmentId)
							.filter((id): id is string => id !== null),
					),
				],
			},
		};
	});

	await writeAudit({
		workplaceId: location.workplaceId,
		actorProfileId: publishedBy,
		action: "schedule.published",
		entityType: "schedule_version",
		entityId: published.version.id,
		summary: `Published version ${published.version.versionNumber} for ${location.name}, week of ${schedule.weekStartDate}`,
	});
	await notifyEmployments(published.notices.workerIds, {
		kind: "schedule_published",
		title: "Your schedule is ready",
		body: `${location.name}: version ${published.version.versionNumber} for the week of ${schedule.weekStartDate} has been published.`,
	});
	await notifyEmployments(published.notices.acceptanceEmploymentIds, {
		kind: "late_change",
		title: "A late change needs your acceptance",
		body: "A material change was published inside the notice window. Open your schedule to accept or decline the shift.",
	});

	return {
		version: published.version,
		changes: published.changes,
	};
}

async function markDelivered(versionIds: string[], employmentId: string) {
	if (versionIds.length === 0) return;
	await db
		.update(workerDeliveries)
		.set({ status: "delivered", deliveredAt: new Date() })
		.where(
			and(
				inArray(workerDeliveries.versionId, versionIds),
				eq(workerDeliveries.employmentId, employmentId),
				eq(workerDeliveries.status, "sent"),
			),
		);
}

export const publicationRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Publication"],
})
	.post(
		"/schedules/:scheduleId/publish",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const { schedule, location } = await scheduleContext(params.scheduleId);
			await requireManager(profile.id, location.workplaceId);

			return publishScheduleNow(schedule.id, profile.id);
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ scheduleId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Atomically snapshot the draft into a new immutable Schedule Version and mark affected workers as Sent (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/schedules/:scheduleId/publication",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const { schedule, location } = await scheduleContext(params.scheduleId);
			await requireManager(profile.id, location.workplaceId);

			const versions = await db
				.select()
				.from(scheduleVersions)
				.where(eq(scheduleVersions.scheduleId, schedule.id))
				.orderBy(desc(scheduleVersions.versionNumber))
				.limit(12);

			if (versions.length === 0) {
				return { versions: [] };
			}

			const versionIds = versions.map((version) => version.id);
			const deliveryRows = await db
				.select({
					delivery: workerDeliveries,
					email: profiles.email,
					fullName: profiles.fullName,
				})
				.from(workerDeliveries)
				.innerJoin(
					employments,
					eq(employments.id, workerDeliveries.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(inArray(workerDeliveries.versionId, versionIds));

			return {
				versions: versions.map((version) => ({
					id: version.id,
					versionNumber: version.versionNumber,
					publishedAt: version.publishedAt.toISOString(),
					workers: deliveryRows
						.filter((row) => row.delivery.versionId === version.id)
						.map((row) => ({
							employmentId: row.delivery.employmentId,
							name: row.fullName ?? row.email,
							email: row.email,
							status: row.delivery.status,
							acknowledgedAt:
								row.delivery.acknowledgedAt?.toISOString() ?? null,
						})),
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ scheduleId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Delivery and acknowledgement overview per published version (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/my/schedule",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const locationIds = await accessibleLocationIds(
				employment.id,
				params.workplaceId,
			);
			const weekStartDay = await weekStartDayFor(params.workplaceId);
			if (locationIds.length === 0) {
				return {
					weekStartDay,
					currentWeek: null,
					nextWeek: null,
					nextShift: null,
					currentChanges: [],
					pendingAcceptances: [],
					history: [],
				};
			}

			const locationRows = await db
				.select()
				.from(locations)
				.where(inArray(locations.id, locationIds));
			const tzByLocation = new Map(
				locationRows.map((location) => [location.id, location.timezone]),
			);

			const now = new Date();
			const thisWeek = weekStartOfDateKey(
				zonedDayInfo(now, locationRows[0]?.timezone ?? "America/Chicago")
					.dateKey,
				weekStartDay,
			);
			const nextWeekDate = new Date(`${thisWeek}T00:00:00Z`);
			nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);
			const nextWeek = nextWeekDate.toISOString().slice(0, 10);

			const versionRows = await db
				.select({ version: scheduleVersions, schedule: schedules })
				.from(scheduleVersions)
				.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
				.where(
					and(
						inArray(schedules.locationId, locationIds),
						inArray(schedules.weekStartDate, [thisWeek, nextWeek]),
					),
				)
				.orderBy(desc(scheduleVersions.versionNumber));

			if (versionRows.length === 0) {
				return {
					weekStartDay,
					currentWeek: null,
					nextWeek: null,
					nextShift: null,
					currentChanges: [],
					pendingAcceptances: [],
					history: [],
				};
			}

			const versionIds = versionRows.map((row) => row.version.id);
			await markDelivered(versionIds, employment.id);
			const [myShiftRows, myDeliveries] = await Promise.all([
				db
					.select()
					.from(versionShifts)
					.where(
						and(
							inArray(versionShifts.versionId, versionIds),
							eq(versionShifts.employmentId, employment.id),
						),
					),
				db
					.select()
					.from(workerDeliveries)
					.where(
						and(
							inArray(workerDeliveries.versionId, versionIds),
							eq(workerDeliveries.employmentId, employment.id),
						),
					),
			]);
			const myTimeEntries =
				myShiftRows.length === 0
					? []
					: await db
							.select()
							.from(timeEntries)
							.where(
								and(
									inArray(
										timeEntries.versionShiftId,
										myShiftRows.map((shift) => shift.id),
									),
									eq(timeEntries.employmentId, employment.id),
								),
							);
			const timeEntryByShiftId = new Map(
				myTimeEntries.map((entry) => [entry.versionShiftId, entry]),
			);
			const pendingReleaseRows =
				myShiftRows.length === 0
					? []
					: await db
							.select({ versionShiftId: shiftReleases.versionShiftId })
							.from(shiftReleases)
							.where(
								and(
									inArray(
										shiftReleases.versionShiftId,
										myShiftRows.map((shift) => shift.id),
									),
									eq(shiftReleases.requestedBy, employment.id),
									eq(shiftReleases.status, "pending"),
								),
							);
			const pendingReleaseShiftIds = new Set(
				pendingReleaseRows.map((release) => release.versionShiftId),
			);

			const positionRows = await db
				.select({ id: positions.id, name: positions.name })
				.from(positions)
				.where(eq(positions.workplaceId, params.workplaceId));
			const positionNamesById = new Map(
				positionRows.map((position) => [position.id, position.name]),
			);

			function weekPayload(weekStart: string) {
				const row = versionRows.find(
					(candidate) => candidate.schedule.weekStartDate === weekStart,
				);
				if (!row) return null;
				const locationTz =
					tzByLocation.get(row.schedule.locationId) ?? "America/Chicago";
				const delivery = myDeliveries.find(
					(candidate) => candidate.versionId === row.version.id,
				);
				return {
					weekStart,
					locationId: row.schedule.locationId,
					locationName:
						locationRows.find((l) => l.id === row.schedule.locationId)?.name ??
						"Location",
					timezone: locationTz,
					version: {
						id: row.version.id,
						versionNumber: row.version.versionNumber,
						publishedAt: row.version.publishedAt.toISOString(),
					},
					deliveryStatus: delivery?.status ?? null,
					shifts: myShiftRows
						.filter((shift) => shift.versionId === row.version.id)
						.map((shift) => {
							const startInfo = zonedDayInfo(shift.startsAt, locationTz);
							const endInfo = zonedDayInfo(shift.endsAt, locationTz);
							const entry = timeEntryByShiftId.get(shift.id);
							return {
								id: shift.id,
								positionName:
									positionNamesById.get(shift.positionId) ?? "Shift",
								startsAt: shift.startsAt.toISOString(),
								endsAt: shift.endsAt.toISOString(),
								date: startInfo.dateKey,
								startMinute: startInfo.minuteOfDay,
								endMinute: endInfo.minuteOfDay,
								overnight: startInfo.dateKey !== endInfo.dateKey,
								note: shift.note,
								releaseStatus: pendingReleaseShiftIds.has(shift.id)
									? ("pending" as const)
									: null,
								timeEntry: entry
									? {
											clockedInAt: entry.clockedInAt.toISOString(),
											clockedOutAt: entry.clockedOutAt?.toISOString() ?? null,
										}
									: null,
							};
						})
						.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
				};
			}

			const upcoming = myShiftRows
				.filter((shift) => shift.endsAt.getTime() >= now.getTime())
				.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
			const nextShiftRaw = upcoming[0] ?? null;
			const nextShift = nextShiftRaw
				? (() => {
						const locationTz =
							tzByLocation.get(
								versionRows.find(
									(row) => row.version.id === nextShiftRaw.versionId,
								)?.schedule.locationId ?? "",
							) ?? "America/Chicago";
						const info = zonedDayInfo(nextShiftRaw.startsAt, locationTz);
						const endInfo = zonedDayInfo(nextShiftRaw.endsAt, locationTz);
						const entry = timeEntryByShiftId.get(nextShiftRaw.id);
						return {
							id: nextShiftRaw.id,
							positionName:
								positionNamesById.get(nextShiftRaw.positionId) ?? "Shift",
							startsAt: nextShiftRaw.startsAt.toISOString(),
							endsAt: nextShiftRaw.endsAt.toISOString(),
							date: info.dateKey,
							startMinute: info.minuteOfDay,
							endMinute: endInfo.minuteOfDay,
							overnight: endInfo.dateKey !== info.dateKey,
							timeEntry: entry
								? {
										clockedInAt: entry.clockedInAt.toISOString(),
										clockedOutAt: entry.clockedOutAt?.toISOString() ?? null,
									}
								: null,
						};
					})()
				: null;

			const historyRows = await db
				.select({ version: scheduleVersions, schedule: schedules })
				.from(scheduleVersions)
				.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
				.where(inArray(schedules.locationId, locationIds))
				.orderBy(desc(scheduleVersions.publishedAt))
				.limit(20);

			const pendingAcceptanceRows = await db
				.select({
					acceptance: shiftAcceptances,
					shift: versionShifts,
				})
				.from(shiftAcceptances)
				.innerJoin(
					versionShifts,
					eq(versionShifts.id, shiftAcceptances.versionShiftId),
				)
				.where(
					and(
						eq(shiftAcceptances.employmentId, employment.id),
						eq(shiftAcceptances.status, "pending"),
					),
				);

			const currentWeekRow = versionRows.find(
				(candidate) => candidate.schedule.weekStartDate === thisWeek,
			);
			let currentChanges: string[] = [];
			if (currentWeekRow && currentWeekRow.version.versionNumber > 1) {
				const [previousVersion] = await db
					.select()
					.from(scheduleVersions)
					.where(
						and(
							eq(scheduleVersions.scheduleId, currentWeekRow.schedule.id),
							eq(
								scheduleVersions.versionNumber,
								currentWeekRow.version.versionNumber - 1,
							),
						),
					)
					.limit(1);
				if (previousVersion) {
					const [previousMyShifts, currentMyShifts] = await Promise.all([
						db
							.select()
							.from(versionShifts)
							.where(
								and(
									eq(versionShifts.versionId, previousVersion.id),
									eq(versionShifts.employmentId, employment.id),
								),
							),
						db
							.select()
							.from(versionShifts)
							.where(
								and(
									eq(versionShifts.versionId, currentWeekRow.version.id),
									eq(versionShifts.employmentId, employment.id),
								),
							),
					]);
					const toDiffable = (shift: (typeof currentMyShifts)[number]) => ({
						id: shift.id,
						employmentId: shift.employmentId,
						positionId: shift.positionId,
						startsAt: shift.startsAt,
						endsAt: shift.endsAt,
						note: shift.note,
					});
					currentChanges = diffShiftSets(
						previousMyShifts.map(toDiffable),
						currentMyShifts.map(toDiffable),
						tzByLocation.get(currentWeekRow.schedule.locationId) ??
							"America/Chicago",
					)
						.filter((change) => change.material)
						.map((change) => change.summary);
				}
			}

			return {
				weekStartDay,
				currentWeek: weekPayload(thisWeek),
				nextWeek: weekPayload(nextWeek),
				nextShift,
				currentChanges,
				pendingAcceptances: pendingAcceptanceRows
					.filter((row) => row.acceptance.status === "pending")
					.map((row) => {
						const info = zonedDayInfo(
							row.shift.startsAt,
							tzByLocation.get(
								versionRows.find(
									(candidate) => candidate.version.id === row.shift.versionId,
								)?.schedule.locationId ?? "",
							) ?? "America/Chicago",
						);
						return {
							id: row.acceptance.id,
							changeSummary: row.acceptance.changeSummary,
							positionName:
								positionNamesById.get(row.shift.positionId) ?? "Shift",
							date: info.dateKey,
							startMinute: info.minuteOfDay,
						};
					}),
				history: historyRows
					.filter((row) => !versionIds.includes(row.version.id))
					.map((row) => ({
						versionId: row.version.id,
						versionNumber: row.version.versionNumber,
						weekStart: row.schedule.weekStartDate,
						publishedAt: row.version.publishedAt.toISOString(),
					})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Return the worker's published schedule for this and next week, their next Shift, and version history",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/my/versions/:versionId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const membership = await listActiveEmployments(profile.id);

			const [row] = await db
				.select({
					version: scheduleVersions,
					schedule: schedules,
					location: locations,
				})
				.from(scheduleVersions)
				.innerJoin(schedules, eq(schedules.id, scheduleVersions.scheduleId))
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.where(eq(scheduleVersions.id, params.versionId))
				.limit(1);
			if (!row) throw new NotFoundError("Published version not found");

			const employment = membership.find(
				(candidate) =>
					candidate.employment.workplaceId === row.location.workplaceId,
			);
			if (!employment) throw new NotFoundError("Published version not found");

			const locationIds = await accessibleLocationIds(
				employment.employment.id,
				row.location.workplaceId,
			);
			if (!locationIds.includes(row.schedule.locationId)) {
				throw new NotFoundError("Published version not found");
			}

			await markDelivered([row.version.id], employment.employment.id);

			const [myShifts, deliveryRows, positionRows] = await Promise.all([
				db
					.select()
					.from(versionShifts)
					.where(
						and(
							eq(versionShifts.versionId, row.version.id),
							eq(versionShifts.employmentId, employment.employment.id),
						),
					),
				db
					.select()
					.from(workerDeliveries)
					.where(
						and(
							eq(workerDeliveries.versionId, row.version.id),
							eq(workerDeliveries.employmentId, employment.employment.id),
						),
					)
					.limit(1),
				db
					.select({ id: positions.id, name: positions.name })
					.from(positions)
					.where(eq(positions.workplaceId, row.location.workplaceId)),
			]);

			const positionNamesById = new Map(
				positionRows.map((position) => [position.id, position.name]),
			);
			const tz = row.location.timezone;

			return {
				weekStart: row.schedule.weekStartDate,
				locationId: row.schedule.locationId,
				timezone: tz,
				version: {
					id: row.version.id,
					versionNumber: row.version.versionNumber,
					publishedAt: row.version.publishedAt.toISOString(),
				},
				deliveryStatus: deliveryRows[0]?.status ?? null,
				shifts: myShifts
					.map((shift) => {
						const startInfo = zonedDayInfo(shift.startsAt, tz);
						const endInfo = zonedDayInfo(shift.endsAt, tz);
						return {
							id: shift.id,
							positionName: positionNamesById.get(shift.positionId) ?? "Shift",
							startsAt: shift.startsAt.toISOString(),
							endsAt: shift.endsAt.toISOString(),
							date: startInfo.dateKey,
							startMinute: startInfo.minuteOfDay,
							endMinute: endInfo.minuteOfDay,
							overnight: startInfo.dateKey !== endInfo.dateKey,
							note: shift.note,
						};
					})
					.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ versionId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Return a previously published schedule version relevant to the caller. Opening it is not an acknowledgement.",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/my/deliveries/:versionId/acknowledge",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const membership = await listActiveEmployments(profile.id);
			const employmentIds = membership.map((row) => row.employment.id);
			if (employmentIds.length === 0) {
				throw new NotFoundError("Delivery not found");
			}

			const [delivery] = await db
				.select()
				.from(workerDeliveries)
				.where(
					and(
						eq(workerDeliveries.versionId, params.versionId),
						inArray(workerDeliveries.employmentId, employmentIds),
					),
				)
				.limit(1);

			if (!delivery) throw new NotFoundError("Delivery not found");
			if (delivery.status === "acknowledged") {
				return {
					status: delivery.status,
					acknowledgedAt: delivery.acknowledgedAt?.toISOString() ?? null,
				};
			}

			const updated = firstRow(
				await db
					.update(workerDeliveries)
					.set({ status: "acknowledged", acknowledgedAt: new Date() })
					.where(eq(workerDeliveries.id, delivery.id))
					.returning(),
			);

			return {
				status: updated.status,
				acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ versionId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Record the worker's explicit 'I saw this' acknowledgement for a published version",
				security: [{ bearerAuth: [] }],
			},
		},
	);
