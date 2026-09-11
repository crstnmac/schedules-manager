import {
	db,
	employmentLocations,
	employments,
	locations,
	openShifts,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shiftAcceptances,
	shiftPickups,
	shiftReleases,
	shifts,
	timeEntries,
	versionShifts,
	workerDeliveries,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	listActiveEmployments,
	requirePrivilege,
	requireSession,
	requireWorkplaceMember,
	weekStartDayFor,
} from "../context";
import { BadRequestError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import { isWithinNoticeWindow } from "../notice-window";
import { notifyEmployments, writeAudit } from "../notify";
import { firstRow } from "../rows";
import { publicWorkerName } from "../schedule-conflicts";
import {
	shiftDays,
	wallToInstant,
	weekStartOfDateKey,
	zonedDayInfo,
} from "../time";
import { loadWorkplace } from "../workplace-policy";
import { diffShiftSets } from "./changes";

export type PublicationTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

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

async function syncPublishedOpenShifts(
	tx: PublicationTransaction,
	input: {
		workplaceId: string;
		locationId: string;
		draftShifts: (typeof shifts.$inferSelect)[];
	},
) {
	const shiftIds = input.draftShifts.map((shift) => shift.id);
	if (shiftIds.length === 0) return;

	const existingOpen =
		shiftIds.length > 0
			? await tx
					.select()
					.from(openShifts)
					.where(
						and(
							inArray(openShifts.shiftId, shiftIds),
							eq(openShifts.status, "open"),
						),
					)
			: [];
	const openByShiftId = new Map(
		existingOpen.map((row) => [row.shiftId, row] as const),
	);

	const newlyOffered = input.draftShifts.filter(
		(shift) => shift.employmentId === null && !openByShiftId.has(shift.id),
	);
	const assignedOpenIds = input.draftShifts.flatMap((shift) => {
		if (shift.employmentId === null) return [];
		const existing = openByShiftId.get(shift.id);
		return existing ? [existing.id] : [];
	});

	if (assignedOpenIds.length > 0) {
		await tx
			.update(openShifts)
			.set({ status: "closed" })
			.where(inArray(openShifts.id, assignedOpenIds));
		await tx
			.update(shiftPickups)
			.set({ status: "declined", decidedAt: new Date() })
			.where(
				and(
					inArray(shiftPickups.openShiftId, assignedOpenIds),
					eq(shiftPickups.status, "pending"),
				),
			);
	}

	if (newlyOffered.length === 0) return;

	await tx.insert(openShifts).values(
		newlyOffered.map((shift) => ({
			shiftId: shift.id,
			locationId: input.locationId,
			positionId: shift.positionId,
			note: shift.note,
		})),
	);

	const workers = await tx
		.select({ id: employments.id })
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, input.workplaceId),
				eq(employments.kind, "worker"),
				eq(employments.status, "active"),
			),
		);
	await notifyEmployments(
		workers.map((worker) => worker.id),
		{
			kind: "open_shift",
			title: "An open shift is available",
			body: "An unassigned shift was published and is open for pickup.",
		},
		tx,
	);
}

/**
 * Close the pickup marketplace for draft shifts that a manager assigned
 * directly: their open rows close and pending pickups decline, so workers
 * cannot win a shift that is no longer open. Runs on the caller's active
 * transaction when invoked inside one (db routes to the caller's tx).
 */
export async function closeOpenMarketplaceForShifts(shiftIds: string[]) {
	if (shiftIds.length === 0) return;
	const openRows = await db
		.select({ id: openShifts.id })
		.from(openShifts)
		.where(
			and(inArray(openShifts.shiftId, shiftIds), eq(openShifts.status, "open")),
		);
	const ids = openRows.map((row) => row.id);
	if (ids.length === 0) return;
	await db
		.update(openShifts)
		.set({ status: "closed" })
		.where(inArray(openShifts.id, ids));
	await db
		.update(shiftPickups)
		.set({ status: "declined", decidedAt: new Date() })
		.where(
			and(
				inArray(shiftPickups.openShiftId, ids),
				eq(shiftPickups.status, "pending"),
			),
		);
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

export interface PublishScheduleResult {
	version: {
		id: string;
		versionNumber: number;
		publishedAt: string;
		workers: number;
	};
	changes: {
		total: number;
		material: number;
		acceptancesRequired: number;
	};
}

export interface PublishSelectionResult {
	publishedShiftIds: string[];
	version: PublishScheduleResult["version"];
	changes: PublishScheduleResult["changes"];
}

export async function publishScheduleNow(
	scheduleId: string,
	publishedBy: string,
	options?: {
		beforePublish?: (tx: PublicationTransaction) => Promise<void>;
		/**
		 * When set, only these draft Shift ids are published. The successor
		 * version still carries forward every shift from the previous version,
		 * so unlisted draft changes remain unpublished.
		 */
		publishShiftIds?: string[];
	},
): Promise<PublishScheduleResult> {
	const { schedule, location } = await scheduleContext(scheduleId);

	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.id, location.workplaceId))
		.limit(1);
	const noticeWindowHours = workplace?.noticeWindowHours ?? 48;
	const now = Date.now();

	const published = await db.transaction(async (tx) => {
		await tx
			.select({ id: schedules.id })
			.from(schedules)
			.where(eq(schedules.id, schedule.id))
			.for("update");
		await options?.beforePublish?.(tx);
		const allDraftShifts = await tx
			.select()
			.from(shifts)
			.where(eq(shifts.scheduleId, schedule.id))
			.for("update");
		const publishShiftIds = options?.publishShiftIds;
		// Partial publish: only the named draft shifts are incorporated, and all
		// other draft changes stay invisible. The emitted version is still a
		// complete weekly snapshot because previous version shifts are carried
		// forward below; see the merge step.
		const draftShifts = publishShiftIds
			? allDraftShifts.filter((shift) => publishShiftIds.includes(shift.id))
			: allDraftShifts;

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

		// Build the version's shift set and the set diffed against the previous
		// version. A selection publish starts from the previous version's shifts
		// and lets the named drafts replace or add to that base, so unselected
		// draft shifts are never leaked into the published Schedule.
		const versionShiftInputs: Array<{
			shiftId: string | null;
			employmentId: string | null;
			positionId: string;
			startsAt: Date;
			endsAt: Date;
			note: string | null;
		}> = [];
		const diffNext: Array<{
			id: string;
			shiftId: string | null;
			employmentId: string | null;
			positionId: string;
			startsAt: Date;
			endsAt: Date;
			note: string | null;
		}> = [];

		if (publishShiftIds) {
			const selectedDraftIds = new Set(draftShifts.map((shift) => shift.id));
			for (const base of previousShifts) {
				if (base.shiftId && selectedDraftIds.has(base.shiftId)) continue;
				versionShiftInputs.push({
					shiftId: base.shiftId,
					employmentId: base.employmentId,
					positionId: base.positionId,
					startsAt: base.startsAt,
					endsAt: base.endsAt,
					note: base.note,
				});
				diffNext.push({
					id: base.id,
					shiftId: base.shiftId,
					employmentId: base.employmentId,
					positionId: base.positionId,
					startsAt: base.startsAt,
					endsAt: base.endsAt,
					note: base.note,
				});
			}
		}
		for (const shift of draftShifts) {
			versionShiftInputs.push({
				shiftId: shift.id,
				employmentId: shift.employmentId,
				positionId: shift.positionId,
				startsAt: shift.startsAt,
				endsAt: shift.endsAt,
				note: shift.note,
			});
			diffNext.push({
				id: shift.id,
				shiftId: shift.id,
				employmentId: shift.employmentId,
				positionId: shift.positionId,
				startsAt: shift.startsAt,
				endsAt: shift.endsAt,
				note: shift.note,
			});
		}

		const insertedVersionShifts =
			versionShiftInputs.length > 0
				? await tx
						.insert(versionShifts)
						.values(
							versionShiftInputs.map((shift) => ({
								versionId: version.id,
								...shift,
							})),
						)
						.returning()
				: [];

		const changes =
			previousShifts.length + diffNext.length > 0
				? diffShiftSets(
						previousShifts.map((shift) => ({
							id: shift.id,
							shiftId: shift.shiftId,
							employmentId: shift.employmentId,
							positionId: shift.positionId,
							startsAt: shift.startsAt,
							endsAt: shift.endsAt,
							note: shift.note,
						})),
						diffNext,
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
						? isWithinNoticeWindow(shift.startsAt, now, noticeWindowHours)
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
		const acceptanceEmploymentIds = [
			...new Set(
				acceptanceTargets
					.map((change) => change.employmentId)
					.filter((id): id is string => id !== null),
			),
		];

		await syncPublishedOpenShifts(tx, {
			workplaceId: location.workplaceId,
			locationId: location.id,
			draftShifts,
		});

		await writeAudit(
			{
				workplaceId: location.workplaceId,
				actorProfileId: publishedBy,
				action: "schedule.published",
				entityType: "schedule_version",
				entityId: version.id,
				summary: `Published version ${version.versionNumber} for ${location.name}, week of ${schedule.weekStartDate}`,
			},
			tx,
		);
		await notifyEmployments(
			workerIds,
			{
				kind: "schedule_published",
				title: "Your schedule is ready",
				body: `${location.name}: version ${version.versionNumber} for the week of ${schedule.weekStartDate} has been published.`,
			},
			tx,
		);
		await notifyEmployments(
			acceptanceEmploymentIds,
			{
				kind: "late_change",
				title: "A late change needs your acceptance",
				body: "A material change was published inside the notice window. Open your schedule to accept or decline the shift.",
			},
			tx,
		);

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
				acceptanceEmploymentIds,
			},
		};
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

async function acknowledgeDelivery(profileId: string, versionId: string) {
	const membership = await listActiveEmployments(profileId);
	const employmentIds = membership.map((row) => row.employment.id);
	if (employmentIds.length === 0) {
		throw new NotFoundError("Delivery not found");
	}

	const [delivery] = await db
		.select()
		.from(workerDeliveries)
		.where(
			and(
				eq(workerDeliveries.versionId, versionId),
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
}

/** Delivery/acknowledgement state for the most recent published versions.
 * Shared by the /publication endpoint and the week schedule payload so the
 * manager schedule page needs no extra round-trip. */
export async function loadPublicationVersions(scheduleId: string) {
	const versions = await db
		.select()
		.from(scheduleVersions)
		.where(eq(scheduleVersions.scheduleId, scheduleId))
		.orderBy(desc(scheduleVersions.versionNumber))
		.limit(12);

	if (versions.length === 0) return [];

	const versionIds = versions.map((version) => version.id);
	const deliveryRows = await db
		.select({
			delivery: workerDeliveries,
			email: profiles.email,
			fullName: profiles.fullName,
		})
		.from(workerDeliveries)
		.innerJoin(employments, eq(employments.id, workerDeliveries.employmentId))
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.where(inArray(workerDeliveries.versionId, versionIds));

	return versions.map((version) => ({
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
				acknowledgedAt: row.delivery.acknowledgedAt?.toISOString() ?? null,
			})),
	}));
}

export const publicationRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Publication"],
})
	.post(
		"/schedules/:scheduleId/publish",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const { schedule, location } = await scheduleContext(params.scheduleId);
			await requirePrivilege(profile.id, location.workplaceId, "schedule.publish");

			return withIdempotency({
				actorProfileId: profile.id,
				scope: `schedule.publish:${schedule.id}`,
				key: headers["idempotency-key"],
				request: { scheduleId: schedule.id },
				execute: () => publishScheduleNow(schedule.id, profile.id),
			});
		},
		{
			headers: t.Object(
				{
					authorization: t.Optional(t.String()),
					"idempotency-key": t.Optional(
						t.String({ minLength: 8, maxLength: 200 }),
					),
				},
				{ additionalProperties: true },
			),
			params: t.Object({ scheduleId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Atomically snapshot the draft into a new immutable Schedule Version and mark affected workers as Sent (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/schedules/:scheduleId/publish-selection",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const { schedule, location } = await scheduleContext(params.scheduleId);
			await requirePrivilege(profile.id, location.workplaceId, "schedule.publish");

			const shiftIds = [...new Set(body.shiftIds)];
			if (shiftIds.length === 0) {
				throw new BadRequestError("Select at least one draft Shift to publish");
			}

			// Every named Shift must belong to this Schedule. Anything else is a
			// client bug, not a silent partial publish of someone else's week.
			const owned = await db
				.select({ id: shifts.id })
				.from(shifts)
				.where(
					and(eq(shifts.scheduleId, schedule.id), inArray(shifts.id, shiftIds)),
				);
			if (owned.length !== shiftIds.length) {
				throw new BadRequestError(
					"Every published Shift must belong to this Schedule",
				);
			}

			return withIdempotency({
				actorProfileId: profile.id,
				scope: `schedule.publish-selection:${schedule.id}`,
				key: headers["idempotency-key"],
				request: { scheduleId: schedule.id, shiftIds },
				execute: async (): Promise<PublishSelectionResult> => {
					const result = await publishScheduleNow(schedule.id, profile.id, {
						publishShiftIds: shiftIds,
					});
					return {
						publishedShiftIds: shiftIds,
						version: result.version,
						changes: result.changes,
					};
				},
			});
		},
		{
			headers: t.Object(
				{
					authorization: t.Optional(t.String()),
					"idempotency-key": t.Optional(
						t.String({ minLength: 8, maxLength: 200 }),
					),
				},
				{ additionalProperties: true },
			),
			params: t.Object({ scheduleId: t.String({ format: "uuid" }) }),
			body: t.Object({
				shiftIds: t.Array(t.String({ format: "uuid" }), { minItems: 1 }),
			}),
			detail: {
				summary:
					"Publish only the selected draft Shifts as a successor Schedule Version, leaving other draft changes unpublished (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/schedules/:scheduleId/publication",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const { schedule, location } = await scheduleContext(params.scheduleId);
			await requirePrivilege(profile.id, location.workplaceId, "schedule.view");

			return { versions: await loadPublicationVersions(schedule.id) };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const scope = query.scope ?? "full";

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

			const workplace = await loadWorkplace(params.workplaceId);
			const plannedVisibility = workplace.plannedShiftsVisibility;
			const plannedLeadDays = workplace.plannedShiftLeadDays;
			const showTeam =
				employment.kind === "manager" ||
				workplace.workerScheduleVisibility === "full";
			const showContacts =
				employment.kind === "manager" || workplace.contactDetailsVisible;

			const now = new Date();
			const nowMs = now.getTime();
			const thisWeek = weekStartOfDateKey(
				zonedDayInfo(now, locationRows[0]?.timezone ?? "America/Chicago")
					.dateKey,
				weekStartDay,
			);
			const nextWeekDate = new Date(`${thisWeek}T00:00:00Z`);
			nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);
			const nextWeek = nextWeekDate.toISOString().slice(0, 10);

			const scheduleRows = await db
				.select()
				.from(schedules)
				.where(
					and(
						inArray(schedules.locationId, locationIds),
						inArray(schedules.weekStartDate, [thisWeek, nextWeek]),
					),
				);
			const scheduleIds = scheduleRows.map((schedule) => schedule.id);
			const versionRows =
				scheduleIds.length === 0
					? []
					: await db
							.select({ version: scheduleVersions, schedule: schedules })
							.from(scheduleVersions)
							.innerJoin(
								schedules,
								eq(schedules.id, scheduleVersions.scheduleId),
							)
							.where(inArray(scheduleVersions.scheduleId, scheduleIds))
							.orderBy(desc(scheduleVersions.versionNumber));

			const versionIds = versionRows.map((row) => row.version.id);
			await markDelivered(versionIds, employment.id);
			const draftShiftRows =
				scheduleIds.length === 0
					? []
					: await db
							.select()
							.from(shifts)
							.where(
								and(
									inArray(shifts.scheduleId, scheduleIds),
									eq(shifts.employmentId, employment.id),
								),
							);

			// Drafts visible to the caller's scope: every draft when the Workplace
			// shows the full team, otherwise only the caller's own.
			const visibleDraftRows =
				showTeam && scheduleIds.length > 0
					? await db
							.select()
							.from(shifts)
							.where(inArray(shifts.scheduleId, scheduleIds))
					: draftShiftRows;

			const employmentNameRows = await db
				.select({
					id: employments.id,
					name: profiles.fullName,
					email: profiles.email,
				})
				.from(employments)
				.leftJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, params.workplaceId));
			const employmentNameById = new Map(
				employmentNameRows.map((row) => [row.id, row]),
			);

			// The latest published version per schedule (primary or team). versionRows
			// is ordered by descending versionNumber, so the first row per schedule wins.
			const latestVersionBySchedule = new Map<
				string,
				{
					version: (typeof versionRows)[number]["version"];
					schedule: (typeof versionRows)[number]["schedule"];
				}
			>();
			for (const row of versionRows) {
				if (!latestVersionBySchedule.has(row.schedule.id)) {
					latestVersionBySchedule.set(row.schedule.id, {
						version: row.version,
						schedule: row.schedule,
					});
				}
			}
			const latestVersionIds = [...latestVersionBySchedule.values()].map(
				(entry) => entry.version.id,
			);
			const scheduleIdByVersionId = new Map<string, string>();
			for (const [scheduleId, entry] of latestVersionBySchedule) {
				scheduleIdByVersionId.set(entry.version.id, scheduleId);
			}

			const publishedShiftRows =
				latestVersionIds.length === 0
					? []
					: await db
							.select({
								shift: versionShifts,
								name: profiles.fullName,
								email: profiles.email,
							})
							.from(versionShifts)
							.leftJoin(
								employments,
								eq(employments.id, versionShifts.employmentId),
							)
							.leftJoin(profiles, eq(profiles.id, employments.profileId))
							.where(
								showTeam
									? inArray(versionShifts.versionId, latestVersionIds)
									: and(
											inArray(versionShifts.versionId, latestVersionIds),
											eq(versionShifts.employmentId, employment.id),
										),
							);

			const ownPublishedShifts = publishedShiftRows.filter(
				(row) => row.shift.employmentId === employment.id,
			);

			const myDeliveries =
				versionIds.length === 0
					? []
					: await db
							.select()
							.from(workerDeliveries)
							.where(
								and(
									inArray(workerDeliveries.versionId, versionIds),
									eq(workerDeliveries.employmentId, employment.id),
								),
							);
			const myTimeEntries =
				ownPublishedShifts.length === 0
					? []
					: await db
							.select()
							.from(timeEntries)
							.where(
								and(
									inArray(
										timeEntries.versionShiftId,
										ownPublishedShifts.map((row) => row.shift.id),
									),
									eq(timeEntries.employmentId, employment.id),
								),
							);
			const timeEntryByShiftId = new Map(
				myTimeEntries.map((entry) => [entry.versionShiftId, entry]),
			);
			const pendingReleaseRows =
				ownPublishedShifts.length === 0
					? []
					: await db
							.select({ versionShiftId: shiftReleases.versionShiftId })
							.from(shiftReleases)
							.where(
								and(
									inArray(
										shiftReleases.versionShiftId,
										ownPublishedShifts.map((row) => row.shift.id),
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

			const scheduleById = new Map(
				scheduleRows.map((schedule) => [schedule.id, schedule]),
			);
			const locationTzByScheduleId = new Map(
				scheduleRows.map((schedule) => [
					schedule.id,
					tzByLocation.get(schedule.locationId) ?? "America/Chicago",
				]),
			);

			// Draft shifts the worker may see before publication. The published
			// payload above stays authoritative: a draft whose underlying Shift is
			// already in the week's version is dropped, and planned entries never
			// carry delivery, acceptance, release, or time-entry state.
			const plannedCutoffMs = nowMs + plannedLeadDays * 86_400_000;
			function draftIsVisible(
				shift: (typeof draftShiftRows)[number],
				timezone: string,
			) {
				if (plannedVisibility === "never") return false;
				if (plannedVisibility === "always") return true;
				const todayKey = zonedDayInfo(new Date(nowMs), timezone).dateKey;
				const todayStartMs = wallToInstant(todayKey, 0, timezone).getTime();
				const startsAtMs = shift.startsAt.getTime();
				return startsAtMs >= todayStartMs && startsAtMs <= plannedCutoffMs;
			}

			function weekPayload(weekStart: string) {
				const weekSchedules = scheduleRows.filter(
					(schedule) => schedule.weekStartDate === weekStart,
				);
				const weekScheduleIds = new Set(
					weekSchedules.map((schedule) => schedule.id),
				);
				const weekLatest = weekSchedules
					.map((schedule) => latestVersionBySchedule.get(schedule.id))
					.filter((entry): entry is NonNullable<typeof entry> =>
						Boolean(entry),
					);
				// Primary (team-less) schedule's latest version when present, else the
				// first available team version.
				const primaryEntry =
					weekLatest.find((entry) => entry.schedule.teamId === null) ??
					weekLatest[0];
				const weekLatestVersionIds = new Set(
					weekLatest.map((entry) => entry.version.id),
				);
				const publishedShifts = publishedShiftRows.filter((row) =>
					weekLatestVersionIds.has(row.shift.versionId),
				);
				// A draft already represented by ANY published shift of the week must
				// never be double-listed, regardless of which schedule published it.
				const publishedDraftIds = new Set(
					publishedShifts
						.map((row) => row.shift.shiftId)
						.filter((id): id is string => id !== null),
				);
				const plannedShifts = visibleDraftRows.filter(
					(shift) =>
						weekScheduleIds.has(shift.scheduleId) &&
						!publishedDraftIds.has(shift.id) &&
						draftIsVisible(
							shift,
							locationTzByScheduleId.get(shift.scheduleId) ?? "America/Chicago",
						),
				);
				if (!primaryEntry && plannedShifts.length === 0) return null;
				const locationId =
					primaryEntry?.schedule.locationId ?? weekSchedules[0]?.locationId;
				if (!locationId) return null;
				const locationTz = tzByLocation.get(locationId) ?? "America/Chicago";
				const delivery = primaryEntry
					? myDeliveries.find(
							(candidate) => candidate.versionId === primaryEntry.version.id,
						)
					: undefined;
				const shifts = [
					...publishedShifts.map((row) => {
						const shift = row.shift;
						const startInfo = zonedDayInfo(shift.startsAt, locationTz);
						const endInfo = zonedDayInfo(shift.endsAt, locationTz);
						const isMine = shift.employmentId === employment.id;
						const entry = isMine ? timeEntryByShiftId.get(shift.id) : undefined;
						return {
							id: shift.id,
							employmentId: shift.employmentId,
							workerName: shift.employmentId
								? publicWorkerName(row.name, row.email ?? "", showContacts)
								: "Open shift",
							isMine,
							positionName: positionNamesById.get(shift.positionId) ?? "Shift",
							startsAt: shift.startsAt.toISOString(),
							endsAt: shift.endsAt.toISOString(),
							date: startInfo.dateKey,
							startMinute: startInfo.minuteOfDay,
							endMinute: endInfo.minuteOfDay,
							overnight: startInfo.dateKey !== endInfo.dateKey,
							note: shift.note,
							planned: false,
							releaseStatus:
								isMine && pendingReleaseShiftIds.has(shift.id)
									? ("pending" as const)
									: null,
							timeEntry:
								isMine && entry
									? {
											clockedInAt: entry.clockedInAt.toISOString(),
											clockedOutAt: entry.clockedOutAt?.toISOString() ?? null,
										}
									: null,
						};
					}),
					...plannedShifts.map((shift) => {
						const startInfo = zonedDayInfo(shift.startsAt, locationTz);
						const endInfo = zonedDayInfo(shift.endsAt, locationTz);
						const plannedWorker = shift.employmentId
							? employmentNameById.get(shift.employmentId)
							: undefined;
						return {
							id: shift.id,
							employmentId: shift.employmentId,
							workerName: shift.employmentId
								? publicWorkerName(
										plannedWorker?.name ?? null,
										plannedWorker?.email ?? "",
										showContacts,
									)
								: "Open shift",
							isMine: shift.employmentId === employment.id,
							positionName: positionNamesById.get(shift.positionId) ?? "Shift",
							startsAt: shift.startsAt.toISOString(),
							endsAt: shift.endsAt.toISOString(),
							date: startInfo.dateKey,
							startMinute: startInfo.minuteOfDay,
							endMinute: endInfo.minuteOfDay,
							overnight: startInfo.dateKey !== endInfo.dateKey,
							note: shift.note,
							planned: true,
							releaseStatus: null,
							timeEntry: null,
						};
					}),
				].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
				return {
					weekStart,
					locationId,
					locationName:
						locationRows.find((l) => l.id === locationId)?.name ?? "Location",
					timezone: locationTz,
					version: primaryEntry
						? {
								id: primaryEntry.version.id,
								versionNumber: primaryEntry.version.versionNumber,
								publishedAt: primaryEntry.version.publishedAt.toISOString(),
							}
						: null,
					deliveryStatus: delivery?.status ?? null,
					shifts,
				};
			}

			// nextShift candidates: the worker's own published shifts from the latest
			// version of every applicable schedule, plus their own visible planned
			// drafts. A draft already represented by any published shift is excluded.
			const publishedDraftIdsAll = new Set(
				publishedShiftRows
					.map((row) => row.shift.shiftId)
					.filter((id): id is string => id !== null),
			);
			const ownVisibleDrafts = draftShiftRows.filter(
				(shift) =>
					!publishedDraftIdsAll.has(shift.id) &&
					draftIsVisible(
						shift,
						locationTzByScheduleId.get(shift.scheduleId) ?? "America/Chicago",
					),
			);
			const nextShiftCandidates = [
				...ownPublishedShifts
					.filter((row) => row.shift.endsAt.getTime() >= nowMs)
					.filter((row) => {
						const entry = timeEntryByShiftId.get(row.shift.id);
						return entry == null || entry.clockedOutAt === null;
					})
					.map((row) => {
						const scheduleId = scheduleIdByVersionId.get(row.shift.versionId);
						return {
							id: row.shift.id,
							positionId: row.shift.positionId,
							startsAt: row.shift.startsAt,
							endsAt: row.shift.endsAt,
							locationId: scheduleId
								? (scheduleById.get(scheduleId)?.locationId ?? "")
								: "",
							planned: false,
						};
					}),
				...ownVisibleDrafts
					.filter((shift) => shift.endsAt.getTime() >= nowMs)
					.map((shift) => ({
						id: shift.id,
						positionId: shift.positionId,
						startsAt: shift.startsAt,
						endsAt: shift.endsAt,
						locationId: scheduleById.get(shift.scheduleId)?.locationId ?? "",
						planned: true,
					})),
			].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
			const nextShiftRaw = nextShiftCandidates[0] ?? null;
			const nextShift = nextShiftRaw
				? (() => {
						const locationTz =
							tzByLocation.get(nextShiftRaw.locationId) ?? "America/Chicago";
						const info = zonedDayInfo(nextShiftRaw.startsAt, locationTz);
						const endInfo = zonedDayInfo(nextShiftRaw.endsAt, locationTz);
						const entry = nextShiftRaw.planned
							? undefined
							: timeEntryByShiftId.get(nextShiftRaw.id);
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
							planned: nextShiftRaw.planned,
							timeEntry: entry
								? {
										clockedInAt: entry.clockedInAt.toISOString(),
										clockedOutAt: entry.clockedOutAt?.toISOString() ?? null,
									}
								: null,
						};
					})()
				: null;

			// Home scope is the dashboard/home-card summary: skip version
			// history entirely — it is only rendered on the worker schedule page.
			const historyRows =
				scope === "home"
					? []
					: await db
							.select({ version: scheduleVersions, schedule: schedules })
							.from(scheduleVersions)
							.innerJoin(
								schedules,
								eq(schedules.id, scheduleVersions.scheduleId),
							)
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

			// Aggregate material changes across every schedule for the current week
			// (primary + teams), each diffed against its own previous version.
			const currentWeekSchedules = scheduleRows.filter(
				(schedule) => schedule.weekStartDate === thisWeek,
			);
			const changeSummaries = new Set<string>();
			for (const schedule of currentWeekSchedules) {
				const latest = latestVersionBySchedule.get(schedule.id);
				if (!latest || latest.version.versionNumber <= 1) continue;
				const [previousVersion] = await db
					.select()
					.from(scheduleVersions)
					.where(
						and(
							eq(scheduleVersions.scheduleId, schedule.id),
							eq(
								scheduleVersions.versionNumber,
								latest.version.versionNumber - 1,
							),
						),
					)
					.limit(1);
				if (!previousVersion) continue;
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
								eq(versionShifts.versionId, latest.version.id),
								eq(versionShifts.employmentId, employment.id),
							),
						),
				]);
				const toDiffable = (shift: (typeof currentMyShifts)[number]) => ({
					id: shift.id,
					shiftId: shift.shiftId,
					employmentId: shift.employmentId,
					positionId: shift.positionId,
					startsAt: shift.startsAt,
					endsAt: shift.endsAt,
					note: shift.note,
				});
				for (const change of diffShiftSets(
					previousMyShifts.map(toDiffable),
					currentMyShifts.map(toDiffable),
					tzByLocation.get(schedule.locationId) ?? "America/Chicago",
				)) {
					if (change.material) changeSummaries.add(change.summary);
				}
			}
			const currentChanges = [...changeSummaries];

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
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			query: t.Object({
				scope: t.Optional(t.Union([t.Literal("home"), t.Literal("full")])),
			}),
			detail: {
				summary:
					"Return the worker's published schedule for this and next week, their next Shift, and version history (scope=home skips history)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/my/calendar/:monthStart",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const weekStartDay = await weekStartDayFor(params.workplaceId);
			const empty = {
				monthStart: params.monthStart,
				weekStartDay,
				shifts: [] as {
					id: string;
					positionName: string;
					startsAt: string;
					endsAt: string;
					date: string;
					startMinute: number;
					endMinute: number;
					overnight: boolean;
					note: string | null;
				}[],
			};

			const locationIds = await accessibleLocationIds(
				employment.id,
				params.workplaceId,
			);
			if (locationIds.length === 0) return empty;

			const gridStart = weekStartOfDateKey(params.monthStart, weekStartDay);
			const gridEnd = shiftDays(gridStart, 41);

			const workplace = await loadWorkplace(params.workplaceId);
			const plannedVisibility = workplace.plannedShiftsVisibility;
			const plannedLeadDays = workplace.plannedShiftLeadDays;
			const nowMs = Date.now();
			const plannedCutoffMs = nowMs + plannedLeadDays * 86_400_000;

			const gridSchedules = await db
				.select()
				.from(schedules)
				.where(
					and(
						inArray(schedules.locationId, locationIds),
						gte(schedules.weekStartDate, gridStart),
						lte(schedules.weekStartDate, gridEnd),
					),
				);
			if (gridSchedules.length === 0) return empty;
			const scheduleIds = gridSchedules.map((schedule) => schedule.id);

			const versionRows = await db
				.select()
				.from(scheduleVersions)
				.where(inArray(scheduleVersions.scheduleId, scheduleIds))
				.orderBy(desc(scheduleVersions.versionNumber));
			const latestVersionIdBySchedule = new Map<string, string>();
			const scheduleIdByVersionId = new Map<string, string>();
			for (const version of versionRows) {
				if (!latestVersionIdBySchedule.has(version.scheduleId)) {
					latestVersionIdBySchedule.set(version.scheduleId, version.id);
					scheduleIdByVersionId.set(version.id, version.scheduleId);
				}
			}
			const versionIds = [...latestVersionIdBySchedule.values()];

			const [myShiftRows, positionRows, locationRows, draftShiftRows] =
				await Promise.all([
					versionIds.length === 0
						? Promise.resolve([] as (typeof versionShifts.$inferSelect)[])
						: db
								.select()
								.from(versionShifts)
								.where(
									and(
										inArray(versionShifts.versionId, versionIds),
										eq(versionShifts.employmentId, employment.id),
									),
								),
					db
						.select({ id: positions.id, name: positions.name })
						.from(positions)
						.where(eq(positions.workplaceId, params.workplaceId)),
					db
						.select({ id: locations.id, timezone: locations.timezone })
						.from(locations)
						.where(inArray(locations.id, locationIds)),
					db
						.select()
						.from(shifts)
						.where(
							and(
								inArray(shifts.scheduleId, scheduleIds),
								eq(shifts.employmentId, employment.id),
							),
						),
				]);
			const positionNamesById = new Map(
				positionRows.map((position) => [position.id, position.name]),
			);
			const timezoneByLocation = new Map(
				locationRows.map((location) => [location.id, location.timezone]),
			);
			const timezoneBySchedule = new Map(
				gridSchedules.map((schedule) => [
					schedule.id,
					timezoneByLocation.get(schedule.locationId) ?? "America/Chicago",
				]),
			);

			const draftsRepresented = new Set(
				myShiftRows
					.map((shift) => shift.shiftId)
					.filter((id): id is string => id !== null),
			);
			const plannedShifts = draftShiftRows.filter((shift) => {
				if (draftsRepresented.has(shift.id)) return false;
				if (plannedVisibility === "never") return false;
				if (plannedVisibility === "always") return true;
				const timezone =
					timezoneBySchedule.get(shift.scheduleId) ?? "America/Chicago";
				const todayKey = zonedDayInfo(new Date(nowMs), timezone).dateKey;
				const todayStartMs = wallToInstant(todayKey, 0, timezone).getTime();
				const startsAtMs = shift.startsAt.getTime();
				return startsAtMs >= todayStartMs && startsAtMs <= plannedCutoffMs;
			});

			const published = myShiftRows.map((shift) => {
				const scheduleId = scheduleIdByVersionId.get(shift.versionId);
				const timezone =
					(scheduleId ? timezoneBySchedule.get(scheduleId) : undefined) ??
					"America/Chicago";
				const start = zonedDayInfo(shift.startsAt, timezone);
				const end = zonedDayInfo(shift.endsAt, timezone);
				return {
					id: shift.id,
					positionName: positionNamesById.get(shift.positionId) ?? "Shift",
					startsAt: shift.startsAt.toISOString(),
					endsAt: shift.endsAt.toISOString(),
					date: start.dateKey,
					startMinute: start.minuteOfDay,
					endMinute: end.minuteOfDay,
					overnight: start.dateKey !== end.dateKey,
					note: shift.note,
					planned: false,
				};
			});
			const planned = plannedShifts.map((shift) => {
				const timezone =
					timezoneBySchedule.get(shift.scheduleId) ?? "America/Chicago";
				const start = zonedDayInfo(shift.startsAt, timezone);
				const end = zonedDayInfo(shift.endsAt, timezone);
				return {
					id: shift.id,
					positionName: positionNamesById.get(shift.positionId) ?? "Shift",
					startsAt: shift.startsAt.toISOString(),
					endsAt: shift.endsAt.toISOString(),
					date: start.dateKey,
					startMinute: start.minuteOfDay,
					endMinute: end.minuteOfDay,
					overnight: start.dateKey !== end.dateKey,
					note: shift.note,
					planned: true,
				};
			});

			return {
				monthStart: params.monthStart,
				weekStartDay,
				shifts: [...published, ...planned].sort((a, b) =>
					a.startsAt.localeCompare(b.startsAt),
				),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				monthStart: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
			}),
			detail: {
				summary:
					"Read the caller's own published Shifts across a calendar month (Worker)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/my/versions/:versionId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
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

			const workplace = await loadWorkplace(row.location.workplaceId);
			const showTeam =
				employment.employment.kind === "manager" ||
				workplace.workerScheduleVisibility === "full";
			const shiftFilter = showTeam
				? eq(versionShifts.versionId, row.version.id)
				: and(
						eq(versionShifts.versionId, row.version.id),
						eq(versionShifts.employmentId, employment.employment.id),
					);

			const [publishedShifts, deliveryRows, positionRows] = await Promise.all([
				db
					.select({
						shift: versionShifts,
						name: profiles.fullName,
						email: profiles.email,
					})
					.from(versionShifts)
					.leftJoin(employments, eq(employments.id, versionShifts.employmentId))
					.leftJoin(profiles, eq(profiles.id, employments.profileId))
					.where(shiftFilter),
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
			const showContacts =
				employment.employment.kind === "manager" ||
				workplace.contactDetailsVisible;

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
				shifts: publishedShifts
					.map((item) => {
						const shift = item.shift;
						const startInfo = zonedDayInfo(shift.startsAt, tz);
						const endInfo = zonedDayInfo(shift.endsAt, tz);
						return {
							id: shift.id,
							employmentId: shift.employmentId,
							isMine: shift.employmentId === employment.employment.id,
							workerName: shift.employmentId
								? publicWorkerName(item.name, item.email ?? "", showContacts)
								: "Open shift",
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
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
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
			const { profile } = await requireSession(headers);
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `delivery.acknowledge:${params.versionId}`,
				key: headers["idempotency-key"],
				request: { versionId: params.versionId },
				execute: () => acknowledgeDelivery(profile.id, params.versionId),
			});
		},
		{
			headers: t.Object(
				{
					authorization: t.Optional(t.String()),
					"idempotency-key": t.Optional(
						t.String({ minLength: 8, maxLength: 200 }),
					),
				},
				{ additionalProperties: true },
			),
			params: t.Object({ versionId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Record the worker's explicit 'I saw this' acknowledgement for a published version",
				security: [{ bearerAuth: [] }],
			},
		},
	);
