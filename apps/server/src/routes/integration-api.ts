import type { Location, Workplace } from "@SchedulesManager/db";
import {
	db,
	employmentLocations,
	employmentPositions,
	employments,
	leaveTypes,
	locationSales,
	locations,
	openShifts,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shiftPickups,
	shifts,
	timeOffRequests,
	unavailability,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	lt,
	lte,
} from "drizzle-orm";
import { Elysia, t } from "elysia";
import { BadRequestError, ForbiddenError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import {
	type IntegrationActor,
	requireIntegrationActor,
} from "../integration-auth";
import { laborCents, laborPercent } from "../labor";
import { firstRow } from "../rows";
import {
	assertWeekStartDay,
	minutesByZonedDate,
	shiftDays,
	wallToInstant,
	weekStartOfDateKey,
	zonedDayInfo,
} from "../time";
import {
	closeOpenMarketplaceForShifts,
	publishScheduleNow,
} from "./publication";
import {
	assertAssignmentValid,
	assertDateInWeek,
	type Conflict,
	computeConflicts,
	getOrCreateSchedule,
	loadNearbyShifts,
	loadWorkforce,
	overrideReasonIfNeeded,
	resolveShiftTimes,
	serializeShift,
	shiftContext,
	shiftHitsUnavailability,
} from "./schedules";

const uuid = t.String({ format: "uuid" });
const dateKey = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const minuteSchema = t.Integer({ minimum: 0, maximum: 1440 });
const isoInstant = t.String({
	pattern:
		"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$",
});

interface WorkerInfo {
	name: string;
	email: string;
	kind: string;
	wageCents: number | null;
}

/**
 * Every handler resolves its Workplace from the API key itself, so a key can
 * never read or write another Workplace's data even by guessing identifiers.
 */
async function workplaceForKey(workplaceId: string): Promise<Workplace> {
	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.id, workplaceId))
		.limit(1);
	if (!workplace) throw new NotFoundError("Workplace not found");
	return workplace;
}

async function locationForKey(
	locationId: string,
	actor: IntegrationActor,
): Promise<Location> {
	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, locationId))
		.limit(1);
	if (!location) throw new NotFoundError("Location not found");
	if (location.workplaceId !== actor.workplaceId) {
		throw new ForbiddenError(
			"This credential is scoped to a different Workplace",
		);
	}
	if (
		actor.locationScope !== null &&
		!actor.locationScope.includes(location.id)
	) {
		throw new ForbiddenError("No access to this location");
	}
	return location;
}

/** Restricts a workplace-wide Location list to the actor's scope. */
function locationsInScope<T extends { id: string }>(
	all: T[],
	actor: IntegrationActor,
): T[] {
	if (actor.locationScope === null) return all;
	const scope = new Set(actor.locationScope);
	return all.filter((location) => scope.has(location.id));
}

function parseInstant(value: string, field: string): Date {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new BadRequestError(`${field} must be a valid timestamp`);
	}
	return parsed;
}

async function workerInfoByEmployment(
	workplaceId: string,
): Promise<Map<string, WorkerInfo>> {
	const rows = await db
		.select({
			employmentId: employments.id,
			kind: employments.kind,
			wageCents: employments.hourlyWageCents,
			fullName: profiles.fullName,
			email: profiles.email,
		})
		.from(employments)
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				eq(employments.status, "active"),
			),
		);
	const map = new Map<string, WorkerInfo>();
	for (const row of rows) {
		map.set(row.employmentId, {
			name: row.fullName ?? row.email,
			email: row.email,
			kind: row.kind,
			wageCents: row.wageCents,
		});
	}
	return map;
}

async function positionNamesFor(
	workplaceId: string,
): Promise<Map<string, string>> {
	const rows = await db
		.select({ id: positions.id, name: positions.name })
		.from(positions)
		.where(eq(positions.workplaceId, workplaceId));
	return new Map(rows.map((row) => [row.id, row.name]));
}

/** Latest version per schedule (published or in-flight), keyed by schedule id. */
async function latestVersionsForSchedules(
	scheduleIds: string[],
): Promise<Map<string, typeof scheduleVersions.$inferSelect>> {
	const latest = new Map<string, typeof scheduleVersions.$inferSelect>();
	if (scheduleIds.length === 0) return latest;
	const rows = await db
		.select()
		.from(scheduleVersions)
		.where(inArray(scheduleVersions.scheduleId, scheduleIds))
		.orderBy(desc(scheduleVersions.versionNumber));
	for (const row of rows) {
		if (!latest.has(row.scheduleId)) latest.set(row.scheduleId, row);
	}
	return latest;
}

/** Version ids that are actually published, from a latest-version map. */
function publishedVersionIds(
	versions: Map<string, typeof scheduleVersions.$inferSelect>,
): string[] {
	return [...versions.values()]
		.filter((version) => version.publishedAt !== null)
		.map((version) => version.id);
}

export interface RosterShift {
	id: string;
	workerName: string | null;
	positionName: string | null;
	startsAt: string;
	endsAt: string;
	date: string;
	startMinute: number;
	endMinute: number;
	note: string | null;
}

export interface AvailabilityEntry {
	employmentId: string;
	name: string;
	email: string;
	kind: string;
	wageCentsPerHour: number | null;
	weekScheduledMinutes: number;
}

function serializeRosterShift(
	row: {
		startsAt: Date;
		endsAt: Date;
		employmentId: string | null;
		positionId: string | null;
		note?: string | null;
	},
	id: string,
	location: Location,
	workerInfo: Map<string, WorkerInfo>,
	positionNames: Map<string, string>,
): RosterShift {
	const startInfo = zonedDayInfo(row.startsAt, location.timezone);
	const endInfo = zonedDayInfo(row.endsAt, location.timezone);
	const worker = row.employmentId
		? workerInfo.get(row.employmentId)
		: undefined;
	return {
		id,
		workerName: worker?.name ?? null,
		positionName: row.positionId
			? (positionNames.get(row.positionId) ?? null)
			: null,
		startsAt: row.startsAt.toISOString(),
		endsAt: row.endsAt.toISOString(),
		date: startInfo.dateKey,
		startMinute: startInfo.minuteOfDay,
		endMinute: endInfo.minuteOfDay,
		note: row.note ?? null,
	};
}

const keyHeaders = t.Object(
	{
		authorization: t.Optional(t.String()),
		"x-api-key": t.Optional(t.String()),
		// Required only for principal credentials (OAuth access tokens,
		// sessions) whose caller belongs to more than one Workplace.
		"x-workplace-id": t.Optional(t.String({ format: "uuid" })),
	},
	{ additionalProperties: true },
);

export const integrationApiRoutes = new Elysia({
	prefix: "/v1/integration",
	tags: ["Integrations"],
})
	.get(
		"/context",
		async ({ headers }) => {
			const actor = await requireIntegrationActor(headers);
			const workplaceId = actor.workplaceId;
			const workplace = await workplaceForKey(workplaceId);
			const [locationRows, positionRows] = await Promise.all([
				db
					.select({
						id: locations.id,
						name: locations.name,
						timezone: locations.timezone,
						addressLine: locations.addressLine,
					})
					.from(locations)
					.where(eq(locations.workplaceId, workplaceId))
					.orderBy(asc(locations.name)),
				db
					.select({ id: positions.id, name: positions.name })
					.from(positions)
					.where(eq(positions.workplaceId, workplaceId))
					.orderBy(asc(positions.name)),
			]);
			return {
				workplace: {
					id: workplace.id,
					name: workplace.name,
					weekStartDay: workplace.weekStartDay,
					noticeWindowHours: workplace.noticeWindowHours,
					overtimeWeeklyMinutes: workplace.overtimeWeeklyMinutes,
					overtimeDailyMinutes: workplace.overtimeDailyMinutes,
					laborCostPercentGoal: workplace.laborCostPercentGoal,
				},
				locations: locationsInScope(locationRows, actor),
				positions: positionRows,
				credential: { kind: actor.kind, scopes: [...actor.scopes].sort() },
			};
		},
		{
			headers: keyHeaders,
			detail: {
				summary:
					"Workplace context for the caller (locations, positions, policy)",
				description:
					"Accepts a Workplace API key (`Authorization: Bearer jl_live_...` or `X-API-Key`), an MCP OAuth access token, or a user session. Principals belonging to several Workplaces pass `x-workplace-id`.",
			},
		},
	)
	.get(
		"/workers",
		async ({ headers }) => {
			const actor = await requireIntegrationActor(headers, "workers.read");
			const workplaceId = actor.workplaceId;
			const workforce = await loadWorkforce(workplaceId);
			const positionNames = await positionNamesFor(workplaceId);
			const locationRows = await db
				.select({ id: locations.id, name: locations.name })
				.from(locations)
				.where(eq(locations.workplaceId, workplaceId));
			const locationNames = new Map(
				locationRows.map((row) => [row.id, row.name]),
			);

			return {
				workers: workforce.employmentRows
					.map((row) => ({
						employmentId: row.employment.id,
						name: row.profile.fullName ?? row.profile.email,
						email: row.profile.email,
						kind: row.employment.kind,
						wageCentsPerHour: row.employment.hourlyWageCents,
						joinedAt: row.employment.joinedAt,
						positions: (
							workforce.positionScope.get(row.employment.id) ?? []
						).map((id) => ({ id, name: positionNames.get(id) ?? "Unknown" })),
						locations: (
							workforce.locationScope.get(row.employment.id) ?? []
						).map((id) => ({ id, name: locationNames.get(id) ?? "Unknown" })),
					}))
					.sort((a, b) => a.name.localeCompare(b.name)),
			};
		},
		{
			headers: keyHeaders,
			detail: {
				summary:
					"List active Workers with positions and wage rates (workers.read)",
			},
		},
	)
	.get(
		"/published",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "schedule.read");
			const workplaceId = actor.workplaceId;
			const workplace = await workplaceForKey(workplaceId);
			assertWeekStartDayFor(query.weekStart, workplace);

			const locationRows = query.locationId
				? [await locationForKey(query.locationId, actor)]
				: locationsInScope(
						await db
							.select()
							.from(locations)
							.where(eq(locations.workplaceId, workplaceId)),
						actor,
					);
			if (locationRows.length === 0) {
				return { weekStart: query.weekStart, locations: [] };
			}

			const scheduleRows = await db
				.select({ id: schedules.id, locationId: schedules.locationId })
				.from(schedules)
				.where(
					and(
						inArray(
							schedules.locationId,
							locationRows.map((row) => row.id),
						),
						eq(schedules.weekStartDate, query.weekStart),
						isNull(schedules.teamId),
					),
				);
			if (scheduleRows.length === 0) {
				return { weekStart: query.weekStart, locations: [] };
			}

			const latestVersions = await latestVersionsForSchedules(
				scheduleRows.map((row) => row.id),
			);
			const versionIds = publishedVersionIds(latestVersions);
			const shiftRows = versionIds.length
				? await db
						.select()
						.from(versionShifts)
						.where(inArray(versionShifts.versionId, versionIds))
				: [];

			const workerInfo = await workerInfoByEmployment(workplaceId);
			const positionNames = await positionNamesFor(workplaceId);
			const locationById = new Map(locationRows.map((row) => [row.id, row]));

			return {
				weekStart: query.weekStart,
				locations: scheduleRows
					.map((scheduleRow) => {
						const location = locationById.get(scheduleRow.locationId);
						const version = latestVersions.get(scheduleRow.id);
						if (!location || !version || version.publishedAt === null) {
							return null;
						}
						return {
							locationId: location.id,
							locationName: location.name,
							timezone: location.timezone,
							version: {
								id: version.id,
								versionNumber: version.versionNumber,
								publishedAt: version.publishedAt.toISOString(),
							},
							shifts: shiftRows
								.filter((row) => row.versionId === version.id)
								.map((row) =>
									serializeRosterShift(
										row,
										row.id,
										location,
										workerInfo,
										positionNames,
									),
								)
								.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
						};
					})
					.filter(
						(entry): entry is NonNullable<typeof entry> => entry !== null,
					),
			};
		},
		{
			headers: keyHeaders,
			query: t.Object({ weekStart: dateKey, locationId: t.Optional(uuid) }),
			detail: {
				summary:
					"Read the Published Schedule for a workweek with worker and position names (schedule.read)",
			},
		},
	)
	.get(
		"/draft",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "schedule.read");
			const workplaceId = actor.workplaceId;
			const workplace = await workplaceForKey(workplaceId);
			assertWeekStartDayFor(query.weekStart, workplace);
			const location = await locationForKey(query.locationId, actor);

			const [schedule] = await db
				.select()
				.from(schedules)
				.where(
					and(
						eq(schedules.locationId, location.id),
						eq(schedules.weekStartDate, query.weekStart),
						isNull(schedules.teamId),
					),
				)
				.limit(1);
			if (!schedule) {
				return {
					exists: false as const,
					locationId: location.id,
					locationName: location.name,
					weekStart: query.weekStart,
					shifts: [],
				};
			}

			const [shiftRows, workforce] = await Promise.all([
				db.select().from(shifts).where(eq(shifts.scheduleId, schedule.id)),
				loadWorkforce(workplaceId),
			]);
			const employmentIds = workforce.employmentRows.map(
				(row) => row.employment.id,
			);
			const nearbyShifts = await loadNearbyShifts(
				workplaceId,
				employmentIds,
				query.weekStart,
				location.timezone,
			);
			const conflicts: Conflict[] = computeConflicts(
				location,
				shiftRows,
				workforce,
				nearbyShifts,
				{
					clopeningMinutes: workplace.clopeningMinutes,
					maxConsecutiveWorkDays: workplace.maxConsecutiveWorkDays,
				},
			);

			const workerInfo = await workerInfoByEmployment(workplaceId);
			const positionNames = await positionNamesFor(workplaceId);
			const latestVersions = await latestVersionsForSchedules([schedule.id]);
			const publishedVersion = latestVersions.get(schedule.id);

			return {
				exists: true as const,
				locationId: location.id,
				locationName: location.name,
				weekStart: query.weekStart,
				scheduleId: schedule.id,
				publishedVersion: publishedVersion?.publishedAt
					? {
							versionNumber: publishedVersion.versionNumber,
							publishedAt: publishedVersion.publishedAt.toISOString(),
						}
					: null,
				shifts: shiftRows
					.map((shift) =>
						serializeShift(
							shift,
							location,
							conflicts,
							shift.employmentId
								? (workerInfo.get(shift.employmentId) ?? null)
								: null,
							positionNames.get(shift.positionId) ?? "Unknown",
						),
					)
					.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
			};
		},
		{
			headers: keyHeaders,
			query: t.Object({ locationId: uuid, weekStart: dateKey }),
			detail: {
				summary:
					"Read the draft Schedule for one Location and workweek, with server-computed conflicts (schedule.read)",
			},
		},
	)
	.get(
		"/roster",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "schedule.read");
			const workplaceId = actor.workplaceId;
			const locationRows = query.locationId
				? [await locationForKey(query.locationId, actor)]
				: locationsInScope(
						await db
							.select()
							.from(locations)
							.where(eq(locations.workplaceId, workplaceId))
							.orderBy(asc(locations.name)),
						actor,
					);
			if (locationRows.length === 0) return { date: query.date, locations: [] };

			const workerInfo = await workerInfoByEmployment(workplaceId);
			const positionNames = await positionNamesFor(workplaceId);

			const results = [];
			for (const location of locationRows) {
				const windowStart = wallToInstant(query.date, 0, location.timezone);
				const windowEnd = wallToInstant(
					shiftDays(query.date, 1),
					0,
					location.timezone,
				);

				const scheduleRows = await db
					.select({ id: schedules.id })
					.from(schedules)
					.where(
						and(
							eq(schedules.locationId, location.id),
							gte(schedules.weekStartDate, shiftDays(query.date, -13)),
							lte(schedules.weekStartDate, shiftDays(query.date, 7)),
							isNull(schedules.teamId),
						),
					);
				const latestVersions = await latestVersionsForSchedules(
					scheduleRows.map((row) => row.id),
				);
				const versionIds = publishedVersionIds(latestVersions);
				const [publishedRows, draftRows] = await Promise.all([
					versionIds.length
						? db
								.select()
								.from(versionShifts)
								.where(inArray(versionShifts.versionId, versionIds))
						: Promise.resolve([] as (typeof versionShifts.$inferSelect)[]),
					db
						.select({ shift: shifts, scheduleId: schedules.id })
						.from(shifts)
						.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
						.where(
							and(
								eq(schedules.locationId, location.id),
								lt(shifts.startsAt, windowEnd),
								gt(shifts.endsAt, windowStart),
								isNull(schedules.teamId),
							),
						),
				]);

				const published = publishedRows
					.filter((row) => row.startsAt < windowEnd && row.endsAt > windowStart)
					.map((row) =>
						serializeRosterShift(
							row,
							row.id,
							location,
							workerInfo,
							positionNames,
						),
					)
					.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
				const draft = draftRows
					.map((row) =>
						serializeRosterShift(
							row.shift,
							row.shift.id,
							location,
							workerInfo,
							positionNames,
						),
					)
					.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

				results.push({
					locationId: location.id,
					locationName: location.name,
					timezone: location.timezone,
					published,
					draft,
				});
			}

			return { date: query.date, locations: results };
		},
		{
			headers: keyHeaders,
			query: t.Object({ date: dateKey, locationId: t.Optional(uuid) }),
			detail: {
				summary:
					"Read the Daily Roster (published and draft Shifts) for one date (schedule.read)",
			},
		},
	)
	.get(
		"/open-shifts",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "schedule.read");
			const workplaceId = actor.workplaceId;
			const workplace = await workplaceForKey(workplaceId);
			assertWeekStartDayFor(query.weekStart, workplace);

			const rows = await db
				.select({
					openShift: openShifts,
					shift: shifts,
					location: locations,
					position: positions,
				})
				.from(openShifts)
				.innerJoin(shifts, eq(shifts.id, openShifts.shiftId))
				.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.innerJoin(positions, eq(positions.id, openShifts.positionId))
				.where(
					and(
						eq(locations.workplaceId, workplaceId),
						eq(schedules.weekStartDate, query.weekStart),
						eq(openShifts.status, "open"),
					),
				)
				.orderBy(asc(shifts.startsAt));

			const openShiftIds = rows.map((row) => row.openShift.id);
			const pickupRows = openShiftIds.length
				? await db
						.select({
							openShiftId: shiftPickups.openShiftId,
							requestedById: shiftPickups.requestedBy,
							status: shiftPickups.status,
						})
						.from(shiftPickups)
						.where(inArray(shiftPickups.openShiftId, openShiftIds))
				: [];
			const workerInfo = await workerInfoByEmployment(workplaceId);

			const requestsByOpenShift = new Map<
				string,
				{ workerName: string; status: string }[]
			>();
			for (const pickup of pickupRows) {
				const list = requestsByOpenShift.get(pickup.openShiftId) ?? [];
				list.push({
					workerName: workerInfo.get(pickup.requestedById)?.name ?? "Unknown",
					status: pickup.status,
				});
				requestsByOpenShift.set(pickup.openShiftId, list);
			}

			return {
				weekStart: query.weekStart,
				openShifts: rows.map((row) => {
					const startInfo = zonedDayInfo(
						row.shift.startsAt,
						row.location.timezone,
					);
					const endInfo = zonedDayInfo(row.shift.endsAt, row.location.timezone);
					return {
						openShiftId: row.openShift.id,
						shiftId: row.shift.id,
						locationId: row.location.id,
						locationName: row.location.name,
						positionId: row.position.id,
						positionName: row.position.name,
						date: startInfo.dateKey,
						startMinute: startInfo.minuteOfDay,
						endMinute: endInfo.minuteOfDay,
						startsAt: row.shift.startsAt.toISOString(),
						endsAt: row.shift.endsAt.toISOString(),
						note: row.openShift.note,
						pickupRequests: requestsByOpenShift.get(row.openShift.id) ?? [],
					};
				}),
			};
		},
		{
			headers: keyHeaders,
			query: t.Object({ weekStart: dateKey }),
			detail: {
				summary: "List Open Shifts offered for pickup (schedule.read)",
			},
		},
	)
	.get(
		"/time-off",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "requests.read");
			const workplaceId = actor.workplaceId;
			const rows = await db
				.select({
					request: timeOffRequests,
					employment: employments,
					profile: profiles,
					leaveType: leaveTypes,
				})
				.from(timeOffRequests)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.leftJoin(leaveTypes, eq(leaveTypes.id, timeOffRequests.leaveTypeId))
				.where(
					and(
						eq(employments.workplaceId, workplaceId),
						query.status ? eq(timeOffRequests.status, query.status) : undefined,
						query.employmentId
							? eq(timeOffRequests.employmentId, query.employmentId)
							: undefined,
						query.from
							? gte(
									timeOffRequests.startsAt,
									new Date(`${query.from}T00:00:00Z`),
								)
							: undefined,
						query.to
							? lte(timeOffRequests.startsAt, new Date(`${query.to}T23:59:59Z`))
							: undefined,
					),
				)
				.orderBy(desc(timeOffRequests.createdAt))
				.limit(Math.min(200, Math.max(1, query.limit ?? 100)));

			return {
				requests: rows.map((row) => ({
					id: row.request.id,
					employmentId: row.employment.id,
					workerName: row.profile.fullName ?? row.profile.email,
					startsAt: row.request.startsAt.toISOString(),
					endsAt: row.request.endsAt.toISOString(),
					status: row.request.status,
					reason: row.request.reason,
					leaveTypeName: row.leaveType?.name ?? null,
					chargeMinutes: row.request.chargeMinutes,
					createdAt: row.request.createdAt.toISOString(),
				})),
			};
		},
		{
			headers: keyHeaders,
			query: t.Object({
				status: t.Optional(
					t.Union([
						t.Literal("pending"),
						t.Literal("approved"),
						t.Literal("declined"),
						t.Literal("cancelled"),
					]),
				),
				employmentId: t.Optional(uuid),
				from: t.Optional(dateKey),
				to: t.Optional(dateKey),
				limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
			}),
			detail: {
				summary: "List Time-off Requests with worker names (requests.read)",
			},
		},
	)
	.get(
		"/labor",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "reports.read");
			const workplaceId = actor.workplaceId;
			const workplace = await workplaceForKey(workplaceId);
			assertWeekStartDayFor(query.weekStart, workplace);

			const locationRows = query.locationId
				? [await locationForKey(query.locationId, actor)]
				: locationsInScope(
						await db
							.select()
							.from(locations)
							.where(eq(locations.workplaceId, workplaceId)),
						actor,
					);
			const weekDates: string[] = [];
			for (let day = 0; day < 7; day++) {
				weekDates.push(shiftDays(query.weekStart, day));
			}
			if (locationRows.length === 0) {
				return {
					weekStart: query.weekStart,
					basis: "draft" as const,
					totals: {
						scheduledMinutes: 0,
						unassignedMinutes: 0,
						laborCents: 0,
						salesCents: null,
						laborPercent: null,
					},
					byWorker: [],
					byDate: [],
				};
			}

			const shiftRows = await db
				.select({ shift: shifts, location: locations })
				.from(shifts)
				.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.where(
					and(
						inArray(
							schedules.locationId,
							locationRows.map((row) => row.id),
						),
						eq(schedules.weekStartDate, query.weekStart),
						isNull(schedules.teamId),
					),
				);

			const minutesByEmployment = new Map<string, number>();
			const dailyMinutesByEmployment = new Map<string, number[]>();
			const minutesByDate = new Map<string, number>();
			let unassignedMinutes = 0;
			for (const row of shiftRows) {
				const durationMinutes =
					(row.shift.endsAt.getTime() - row.shift.startsAt.getTime()) / 60_000;
				if (!row.shift.employmentId) {
					unassignedMinutes += durationMinutes;
					continue;
				}
				const employmentId = row.shift.employmentId;
				const split = minutesByZonedDate(
					row.shift.startsAt,
					row.shift.endsAt,
					row.location.timezone,
				);
				const daily =
					dailyMinutesByEmployment.get(employmentId) ?? new Array(7).fill(0);
				for (const [dateKey, minutes] of split) {
					const index = weekDates.indexOf(dateKey);
					if (index >= 0) daily[index] += minutes;
					minutesByDate.set(
						dateKey,
						(minutesByDate.get(dateKey) ?? 0) + minutes,
					);
				}
				dailyMinutesByEmployment.set(employmentId, daily);
				minutesByEmployment.set(
					employmentId,
					(minutesByEmployment.get(employmentId) ?? 0) + durationMinutes,
				);
			}

			const employmentIds = [...minutesByEmployment.keys()];
			const employmentRows = employmentIds.length
				? await db
						.select({
							id: employments.id,
							hourlyWageCents: employments.hourlyWageCents,
							fullName: profiles.fullName,
							email: profiles.email,
						})
						.from(employments)
						.innerJoin(profiles, eq(profiles.id, employments.profileId))
						.where(inArray(employments.id, employmentIds))
				: [];

			let totalCents = 0;
			let totalMinutes = 0;
			const byWorker = employmentRows
				.map((row) => {
					const minutes = Math.round(minutesByEmployment.get(row.id) ?? 0);
					const daily = (dailyMinutesByEmployment.get(row.id) ?? []).map(
						(value) => Math.round(value),
					);
					const wage = row.hourlyWageCents ?? 0;
					const labor = laborCents({
						minutes,
						hourlyWageCents: wage,
						overtimeWeeklyMinutes: workplace.overtimeWeeklyMinutes,
						overtimeDailyMinutes: workplace.overtimeDailyMinutes,
						dailyMinutes: daily,
					});
					totalCents += wage > 0 ? labor.totalCents : 0;
					totalMinutes += minutes;
					return {
						employmentId: row.id,
						name: row.fullName ?? row.email,
						minutes,
						regularCents: wage > 0 ? labor.regularCents : null,
						overtimeCents: wage > 0 ? labor.overtimeCents : null,
						totalCents: wage > 0 ? labor.totalCents : null,
					};
				})
				.sort((a, b) => b.minutes - a.minutes);

			const salesRows = await db
				.select({
					saleDate: locationSales.saleDate,
					amountCents: locationSales.amountCents,
				})
				.from(locationSales)
				.where(
					and(
						inArray(
							locationSales.locationId,
							locationRows.map((row) => row.id),
						),
						gte(locationSales.saleDate, weekDates[0] ?? query.weekStart),
						lte(locationSales.saleDate, weekDates[6] ?? query.weekStart),
					),
				);
			const salesByDate = new Map<string, number>();
			for (const row of salesRows) {
				salesByDate.set(
					row.saleDate,
					(salesByDate.get(row.saleDate) ?? 0) + row.amountCents,
				);
			}
			const salesCentsTotal = [...salesByDate.values()].reduce(
				(sum, value) => sum + value,
				0,
			);

			return {
				weekStart: query.weekStart,
				basis: "draft" as const,
				totals: {
					scheduledMinutes: Math.round(totalMinutes + unassignedMinutes),
					unassignedMinutes: Math.round(unassignedMinutes),
					laborCents: totalCents,
					salesCents: salesCentsTotal > 0 ? salesCentsTotal : null,
					laborPercent: laborPercent(totalCents, salesCentsTotal),
				},
				byWorker,
				byDate: weekDates.map((dateKey) => {
					const minutes = Math.round(minutesByDate.get(dateKey) ?? 0);
					const salesCents = salesByDate.get(dateKey) ?? 0;
					return {
						date: dateKey,
						minutes,
						hours: Math.round((minutes / 60) * 10) / 10,
						salesCents: salesCents > 0 ? salesCents : null,
					};
				}),
			};
		},
		{
			headers: keyHeaders,
			query: t.Object({ weekStart: dateKey, locationId: t.Optional(uuid) }),
			detail: {
				summary:
					"Scheduled hours and Labor Cost for a workweek from the draft plan (reports.read)",
			},
		},
	)
	.get(
		"/worker",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "workers.read");
			const workplaceId = actor.workplaceId;
			const workplace = await workplaceForKey(workplaceId);
			assertWeekStartDayFor(query.weekStart, workplace);

			const [row] = await db
				.select({ employment: employments, profile: profiles })
				.from(employments)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(
					and(
						eq(employments.id, query.employmentId),
						eq(employments.workplaceId, workplaceId),
					),
				)
				.limit(1);
			if (!row) throw new NotFoundError("Worker not found at this Workplace");

			const weekEnd = shiftDays(query.weekStart, 7);
			const [
				shiftRows,
				unavailabilityRows,
				timeOffRows,
				positionRows,
				locationRows,
			] = await Promise.all([
				db
					.select({ shift: shifts, location: locations })
					.from(shifts)
					.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
					.innerJoin(locations, eq(locations.id, schedules.locationId))
					.where(
						and(
							eq(shifts.employmentId, row.employment.id),
							eq(schedules.weekStartDate, query.weekStart),
							isNull(schedules.teamId),
						),
					)
					.orderBy(asc(shifts.startsAt)),
				db
					.select()
					.from(unavailability)
					.where(eq(unavailability.employmentId, row.employment.id)),
				db
					.select()
					.from(timeOffRequests)
					.where(
						and(
							eq(timeOffRequests.employmentId, row.employment.id),
							lt(timeOffRequests.startsAt, new Date(`${weekEnd}T00:00:00Z`)),
							gt(
								timeOffRequests.endsAt,
								new Date(`${query.weekStart}T00:00:00Z`),
							),
						),
					),
				db
					.select({ positionId: employmentPositions.positionId })
					.from(employmentPositions)
					.where(eq(employmentPositions.employmentId, row.employment.id)),
				db
					.select({ locationId: employmentLocations.locationId })
					.from(employmentLocations)
					.where(eq(employmentLocations.employmentId, row.employment.id)),
			]);

			const positionNames = await positionNamesFor(workplaceId);
			const scheduledMinutes = shiftRows.reduce(
				(sum, entry) =>
					sum +
					(entry.shift.endsAt.getTime() - entry.shift.startsAt.getTime()) /
						60_000,
				0,
			);

			return {
				worker: {
					employmentId: row.employment.id,
					name: row.profile.fullName ?? row.profile.email,
					email: row.profile.email,
					kind: row.employment.kind,
					wageCentsPerHour: row.employment.hourlyWageCents,
					positionIds: positionRows.map((entry) => entry.positionId),
					positionNames: positionRows.map(
						(entry) => positionNames.get(entry.positionId) ?? "Unknown",
					),
					locationIds: locationRows.map((entry) => entry.locationId),
				},
				weekStart: query.weekStart,
				scheduledMinutes: Math.round(scheduledMinutes),
				shifts: shiftRows.map((entry) => {
					const startInfo = zonedDayInfo(
						entry.shift.startsAt,
						entry.location.timezone,
					);
					const endInfo = zonedDayInfo(
						entry.shift.endsAt,
						entry.location.timezone,
					);
					return {
						shiftId: entry.shift.id,
						locationName: entry.location.name,
						positionName:
							positionNames.get(entry.shift.positionId) ?? "Unknown",
						date: startInfo.dateKey,
						startMinute: startInfo.minuteOfDay,
						endMinute: endInfo.minuteOfDay,
						startsAt: entry.shift.startsAt.toISOString(),
						endsAt: entry.shift.endsAt.toISOString(),
						note: entry.shift.note,
					};
				}),
				unavailability: unavailabilityRows.map((entry) => ({
					kind: entry.kind,
					weekday: entry.weekday,
					specificDate: entry.specificDate,
					startMinute: entry.startMinute,
					endMinute: entry.endMinute,
					status: entry.status,
					note: entry.note,
				})),
				timeOff: timeOffRows.map((entry) => ({
					id: entry.id,
					startsAt: entry.startsAt.toISOString(),
					endsAt: entry.endsAt.toISOString(),
					status: entry.status,
					reason: entry.reason,
				})),
			};
		},
		{
			headers: keyHeaders,
			query: t.Object({ employmentId: uuid, weekStart: dateKey }),
			detail: {
				summary:
					"One Worker's week: scheduled Shifts, hours, Unavailability, and Time-off (workers.read)",
			},
		},
	)
	.get(
		"/available-workers",
		async ({ headers, query }) => {
			const actor = await requireIntegrationActor(headers, "workers.read");
			const workplaceId = actor.workplaceId;
			const startsAt = parseInstant(query.startsAt, "startsAt");
			const endsAt = parseInstant(query.endsAt, "endsAt");
			if (startsAt >= endsAt) {
				throw new BadRequestError("endsAt must be after startsAt");
			}

			const [workplace, locationRows] = await Promise.all([
				workplaceForKey(workplaceId),
				db
					.select()
					.from(locations)
					.where(eq(locations.workplaceId, workplaceId)),
			]);
			const targetLocation = query.locationId
				? await locationForKey(query.locationId, actor)
				: null;
			const timeZone =
				targetLocation?.timezone ??
				locationRows[0]?.timezone ??
				"America/Chicago";

			const workforce = await loadWorkforce(workplaceId);
			const positionNames = await positionNamesFor(workplaceId);
			const employmentIds = workforce.employmentRows.map(
				(row) => row.employment.id,
			);

			// Draft shifts already on the plan for these workers in the window.
			const draftOverlaps = employmentIds.length
				? await db
						.select({
							employmentId: shifts.employmentId,
							startsAt: shifts.startsAt,
							endsAt: shifts.endsAt,
						})
						.from(shifts)
						.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
						.innerJoin(locations, eq(locations.id, schedules.locationId))
						.where(
							and(
								eq(locations.workplaceId, workplaceId),
								inArray(shifts.employmentId, employmentIds),
								lt(shifts.startsAt, endsAt),
								gt(shifts.endsAt, startsAt),
							),
						)
				: [];

			// Published versions may still commit a worker even when the draft no
			// longer contains the shift (draft deleted after publication).
			const scheduleRows = await db
				.select({ id: schedules.id })
				.from(schedules)
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.where(eq(locations.workplaceId, workplaceId));
			const latestVersions = await latestVersionsForSchedules(
				scheduleRows.map((row) => row.id),
			);
			const versionIds = publishedVersionIds(latestVersions);
			const publishedOverlaps =
				employmentIds.length && versionIds.length
					? await db
							.select({
								employmentId: versionShifts.employmentId,
								startsAt: versionShifts.startsAt,
								endsAt: versionShifts.endsAt,
							})
							.from(versionShifts)
							.where(
								and(
									inArray(versionShifts.versionId, versionIds),
									inArray(versionShifts.employmentId, employmentIds),
									lt(versionShifts.startsAt, endsAt),
									gt(versionShifts.endsAt, startsAt),
								),
							)
					: [];

			const overlapsByEmployment = new Map<
				string,
				{ draft: number; published: number }
			>();
			for (const row of draftOverlaps) {
				if (!row.employmentId) continue;
				const entry = overlapsByEmployment.get(row.employmentId) ?? {
					draft: 0,
					published: 0,
				};
				entry.draft += 1;
				overlapsByEmployment.set(row.employmentId, entry);
			}
			for (const row of publishedOverlaps) {
				if (!row.employmentId) continue;
				const entry = overlapsByEmployment.get(row.employmentId) ?? {
					draft: 0,
					published: 0,
				};
				entry.published += 1;
				overlapsByEmployment.set(row.employmentId, entry);
			}

			// Hours already planned in the week containing the window, so callers
			// can weigh overtime before offering extra work.
			const weekStart = weekStartOfDateKey(
				zonedDayInfo(startsAt, timeZone).dateKey,
				workplace.weekStartDay,
			);
			const weekMinutesByEmployment = new Map<string, number>();
			if (employmentIds.length) {
				const weekShifts = await db
					.select({
						employmentId: shifts.employmentId,
						startsAt: shifts.startsAt,
						endsAt: shifts.endsAt,
					})
					.from(shifts)
					.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
					.innerJoin(locations, eq(locations.id, schedules.locationId))
					.where(
						and(
							eq(locations.workplaceId, workplaceId),
							inArray(shifts.employmentId, employmentIds),
							eq(schedules.weekStartDate, weekStart),
							isNull(schedules.teamId),
						),
					);
				for (const entry of weekShifts) {
					if (!entry.employmentId) continue;
					weekMinutesByEmployment.set(
						entry.employmentId,
						(weekMinutesByEmployment.get(entry.employmentId) ?? 0) +
							(entry.endsAt.getTime() - entry.startsAt.getTime()) / 60_000,
					);
				}
			}

			const available: AvailabilityEntry[] = [];
			const unavailable: {
				employmentId: string;
				name: string;
				reasons: string[];
			}[] = [];

			for (const row of workforce.employmentRows) {
				const employmentId = row.employment.id;
				const name = row.profile.fullName ?? row.profile.email;
				const reasons: string[] = [];

				const overlaps = overlapsByEmployment.get(employmentId);
				if (overlaps && overlaps.draft > 0) {
					reasons.push(
						overlaps.draft > 1
							? `Already scheduled during this window (${overlaps.draft} shifts)`
							: "Already scheduled during this window",
					);
				} else if (overlaps && overlaps.published > 0) {
					reasons.push("Committed to a published shift during this window");
				}

				if (
					shiftHitsUnavailability(
						startsAt,
						endsAt,
						employmentId,
						workforce.unavailabilityRows,
						timeZone,
					)
				) {
					reasons.push("Has an unavailability window at this time");
				}

				const timeOffHit = workforce.timeOffRows.find(
					(entry) =>
						entry.employmentId === employmentId &&
						(entry.status === "approved" || entry.status === "pending") &&
						entry.startsAt < endsAt &&
						entry.endsAt > startsAt,
				);
				if (timeOffHit) {
					reasons.push(
						timeOffHit.status === "approved"
							? "Has approved time-off at this time"
							: "Has a pending time-off request at this time",
					);
				}

				const positionScope = workforce.positionScope.get(employmentId) ?? [];
				if (
					query.positionId &&
					row.employment.kind === "worker" &&
					positionScope.length > 0 &&
					!positionScope.includes(query.positionId)
				) {
					reasons.push(
						`Not approved for position ${positionNames.get(query.positionId) ?? "selected"}`,
					);
				}

				const locationScope = workforce.locationScope.get(employmentId) ?? [];
				if (
					targetLocation &&
					row.employment.kind === "worker" &&
					locationScope.length > 0 &&
					!locationScope.includes(targetLocation.id)
				) {
					reasons.push(`Not assigned to ${targetLocation.name}`);
				}

				const entry: AvailabilityEntry = {
					employmentId,
					name,
					email: row.profile.email,
					kind: row.employment.kind,
					wageCentsPerHour: row.employment.hourlyWageCents,
					weekScheduledMinutes: Math.round(
						weekMinutesByEmployment.get(employmentId) ?? 0,
					),
				};
				if (reasons.length === 0) available.push(entry);
				else unavailable.push({ employmentId, name, reasons });
			}

			available.sort((a, b) => a.name.localeCompare(b.name));
			unavailable.sort((a, b) => a.name.localeCompare(b.name));

			return {
				window: {
					startsAt: startsAt.toISOString(),
					endsAt: endsAt.toISOString(),
				},
				overtimeWeeklyMinutes: workplace.overtimeWeeklyMinutes,
				available,
				unavailable,
			};
		},
		{
			headers: keyHeaders,
			query: t.Object({
				startsAt: isoInstant,
				endsAt: isoInstant,
				positionId: t.Optional(uuid),
				locationId: t.Optional(uuid),
			}),
			detail: {
				summary:
					"Workers who could take a shift in a window, with reasons for everyone else (workers.read)",
			},
		},
	)
	.post(
		"/shifts",
		async ({ headers, body }) => {
			const actor = await requireIntegrationActor(headers, "schedule.write");
			const workplaceId = actor.workplaceId;
			const workplace = await workplaceForKey(workplaceId);
			assertWeekStartDayFor(body.weekStart, workplace);
			const location = await locationForKey(body.locationId, actor);

			const [position] = await db
				.select({ id: positions.id })
				.from(positions)
				.where(
					and(
						eq(positions.id, body.positionId),
						eq(positions.workplaceId, workplaceId),
					),
				)
				.limit(1);
			if (!position) {
				throw new BadRequestError("Position not found at this Workplace");
			}

			const schedule = await getOrCreateSchedule(
				location.id,
				body.weekStart,
				null,
			);
			assertDateInWeek(body.date, body.weekStart);
			const { startsAt, endsAt } = resolveShiftTimes(body, location.timezone);
			const unavailabilityOverrideReason = await overrideReasonIfNeeded(
				location,
				body.employmentId,
				startsAt,
				endsAt,
				body.unavailabilityOverrideReason,
			);

			const shift = await db.transaction(async () => {
				if (body.employmentId) {
					await assertAssignmentValid(
						location,
						body.employmentId,
						body.positionId,
						{
							approvePosition: body.approvePosition === true,
						},
					);
				}
				return firstRow(
					await db
						.insert(shifts)
						.values({
							scheduleId: schedule.id,
							employmentId: body.employmentId ?? null,
							positionId: body.positionId,
							startsAt,
							endsAt,
							note: body.note ?? null,
							unavailabilityOverrideReason,
						})
						.returning(),
				);
			});

			return { shiftId: shift.id, scheduleId: schedule.id };
		},
		{
			headers: keyHeaders,
			body: t.Object({
				locationId: uuid,
				weekStart: dateKey,
				date: dateKey,
				startMinute: minuteSchema,
				endMinute: minuteSchema,
				positionId: uuid,
				employmentId: t.Optional(t.Union([uuid, t.Null()])),
				note: t.Optional(t.String({ maxLength: 200 })),
				unavailabilityOverrideReason: t.Optional(
					t.String({ minLength: 1, maxLength: 300 }),
				),
				approvePosition: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Add a Shift to a draft Schedule (schedule.write)",
			},
		},
	)
	.patch(
		"/shifts/:shiftId",
		async ({ headers, params, body }) => {
			const actor = await requireIntegrationActor(headers, "schedule.write");
			const { location, schedule } = await shiftContext(params.shiftId);
			await locationForKey(location.id, actor);

			const [existing] = await db
				.select()
				.from(shifts)
				.where(eq(shifts.id, params.shiftId))
				.limit(1);
			if (!existing) throw new NotFoundError("Shift not found");

			const employmentId =
				body.employmentId === undefined
					? existing.employmentId
					: body.employmentId;
			const positionId = body.positionId ?? existing.positionId;

			const date =
				body.date ?? zonedDayInfo(existing.startsAt, location.timezone).dateKey;
			assertDateInWeek(date, schedule.weekStartDate);
			const startMinute =
				body.startMinute ??
				zonedDayInfo(existing.startsAt, location.timezone).minuteOfDay;
			const endMinute =
				body.endMinute ??
				zonedDayInfo(existing.endsAt, location.timezone).minuteOfDay;
			const { startsAt, endsAt } = resolveShiftTimes(
				{ date, startMinute, endMinute },
				location.timezone,
			);
			const submittedOverride =
				body.unavailabilityOverrideReason === undefined
					? existing.unavailabilityOverrideReason
					: body.unavailabilityOverrideReason;
			const unavailabilityOverrideReason = await overrideReasonIfNeeded(
				location,
				employmentId ?? null,
				startsAt,
				endsAt,
				submittedOverride,
			);

			await db.transaction(async (tx) => {
				if (employmentId) {
					await assertAssignmentValid(location, employmentId, positionId, {
						approvePosition: body.approvePosition === true,
					});
				}
				await tx
					.update(shifts)
					.set({
						employmentId,
						positionId,
						startsAt,
						endsAt,
						note: body.note === undefined ? existing.note : body.note,
						unavailabilityOverrideReason,
						updatedAt: new Date(),
					})
					.where(eq(shifts.id, existing.id));
				// A direct assignment takes the shift off the pickup marketplace.
				if (employmentId) {
					await closeOpenMarketplaceForShifts([existing.id]);
				}
			});

			return { ok: true as const };
		},
		{
			headers: keyHeaders,
			params: t.Object({ shiftId: uuid }),
			body: t.Object({
				employmentId: t.Optional(t.Union([uuid, t.Null()])),
				positionId: t.Optional(uuid),
				date: t.Optional(dateKey),
				startMinute: t.Optional(minuteSchema),
				endMinute: t.Optional(minuteSchema),
				note: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
				unavailabilityOverrideReason: t.Optional(
					t.Union([t.String({ minLength: 1, maxLength: 300 }), t.Null()]),
				),
				approvePosition: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Update a draft Shift (schedule.write)",
			},
		},
	)
	.delete(
		"/shifts/:shiftId",
		async ({ headers, params }) => {
			const actor = await requireIntegrationActor(headers, "schedule.write");
			const { location } = await shiftContext(params.shiftId);
			await locationForKey(location.id, actor);
			await db.delete(shifts).where(eq(shifts.id, params.shiftId));
			return { ok: true as const };
		},
		{
			headers: keyHeaders,
			params: t.Object({ shiftId: uuid }),
			detail: {
				summary: "Remove a Shift from the draft Schedule (schedule.write)",
			},
		},
	)
	.post(
		"/schedules/:scheduleId/publish",
		async ({ headers, params, request }) => {
			const actor = await requireIntegrationActor(headers, "schedule.write");
			const [row] = await db
				.select({ schedule: schedules, location: locations })
				.from(schedules)
				.innerJoin(locations, eq(locations.id, schedules.locationId))
				.where(eq(schedules.id, params.scheduleId))
				.limit(1);
			if (!row) throw new NotFoundError("Schedule not found");
			await locationForKey(row.location.id, actor);
			// Publication records who published the version. API keys act as the
			// Manager who created them; principals act as themselves.
			if (!actor.canPublish) {
				throw new ForbiddenError(
					"This credential cannot publish: it needs schedule.write plus the schedule.publish capability",
				);
			}
			if (!actor.profileId) {
				throw new ForbiddenError(
					"This credential cannot publish because it has no creating Manager",
				);
			}

			return withIdempotency({
				actorProfileId: actor.profileId,
				scope: `schedule.publish:${row.schedule.id}`,
				key: request.headers.get("idempotency-key") ?? undefined,
				request: { scheduleId: row.schedule.id },
				execute: () =>
					publishScheduleNow(row.schedule.id, actor.profileId as string),
			});
		},
		{
			headers: t.Object(
				{
					authorization: t.Optional(t.String()),
					"x-api-key": t.Optional(t.String()),
					"idempotency-key": t.Optional(
						t.String({ minLength: 8, maxLength: 200 }),
					),
				},
				{ additionalProperties: true },
			),
			params: t.Object({ scheduleId: uuid }),
			detail: {
				summary:
					"Atomically publish a draft Schedule as the next immutable Schedule Version (schedule.write)",
				description:
					"Acts as the Manager who created the API key. Publication notifies affected Workers exactly like an in-app publish.",
			},
		},
	);

function assertWeekStartDayFor(weekStart: string, workplace: Workplace) {
	assertWeekStartDay(weekStart, workplace.weekStartDay);
}
