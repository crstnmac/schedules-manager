import type { Location, Shift } from "@SchedulesManager/db";
import {
	attendanceMarks,
	db,
	employmentGroups,
	employmentLocations,
	employmentPositions,
	employments,
	locationSales,
	locations,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shiftTagAssignments,
	shiftTasks,
	shifts,
	timeEntries,
	timeOffRequests,
	unavailability,
	versionShifts,
	workPreferences,
} from "@SchedulesManager/db";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	requireManager,
	requireSession,
	weekStartDayFor,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { laborCents, laborPercent } from "../labor";
import { firstRow } from "../rows";
import {
	clopeningConflicts,
	consecutiveWorkDayConflicts,
	isLateArrival,
} from "../schedule-conflicts";
import {
	assertWeekStartDay,
	shiftDays,
	wallToInstant,
	weekStartOfDateKey,
	zonedDayInfo,
} from "../time";
import { loadWorkplace } from "../workplace-policy";
import { assertEligible } from "./coverage";
import {
	closeOpenMarketplaceForShifts,
	loadPublicationVersions,
} from "./publication";

type ShiftRow = Shift;
export interface Conflict {
	shiftId: string;
	type:
		| "overlap"
		| "unavailability"
		| "time_off"
		| "position_access"
		| "location_access"
		| "clopening"
		| "consecutive_days";
	message: string;
}

const dateSchema = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const minuteSchema = t.Integer({ minimum: 0, maximum: 1440 });

async function getOrCreateSchedule(locationId: string, weekStart: string) {
	const [existing] = await db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.locationId, locationId),
				eq(schedules.weekStartDate, weekStart),
			),
		)
		.limit(1);
	if (existing) return existing;

	await db
		.insert(schedules)
		.values({ locationId, weekStartDate: weekStart })
		.onConflictDoNothing();

	const [created] = await db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.locationId, locationId),
				eq(schedules.weekStartDate, weekStart),
			),
		)
		.limit(1);
	if (!created) throw new ConflictError("Schedule could not be created");
	return created;
}

async function loadWorkforce(workplaceId: string) {
	const employmentRows = await db
		.select({ employment: employments, profile: profiles })
		.from(employments)
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				eq(employments.status, "active"),
			),
		);

	const ids = employmentRows.map((row) => row.employment.id);
	if (ids.length === 0) {
		return {
			employmentRows,
			positionScope: new Map<string, string[]>(),
			locationScope: new Map<string, string[]>(),
			unavailabilityRows: [],
			timeOffRows: [],
			preferenceByEmployment: new Map<string, string>(),
		};
	}

	const [
		positionScopeRows,
		locationScopeRows,
		unavailabilityRows,
		timeOffRows,
		preferenceRows,
	] = await Promise.all([
		db
			.select()
			.from(employmentPositions)
			.where(inArray(employmentPositions.employmentId, ids)),
		db
			.select()
			.from(employmentLocations)
			.where(inArray(employmentLocations.employmentId, ids)),
		db
			.select()
			.from(unavailability)
			.where(inArray(unavailability.employmentId, ids)),
		db
			.select()
			.from(timeOffRequests)
			.where(inArray(timeOffRequests.employmentId, ids)),
		db
			.select()
			.from(workPreferences)
			.where(inArray(workPreferences.employmentId, ids)),
	]);

	const positionScope = new Map<string, string[]>();
	for (const row of positionScopeRows) {
		const list = positionScope.get(row.employmentId) ?? [];
		list.push(row.positionId);
		positionScope.set(row.employmentId, list);
	}

	const locationScope = new Map<string, string[]>();
	for (const row of locationScopeRows) {
		const list = locationScope.get(row.employmentId) ?? [];
		list.push(row.locationId);
		locationScope.set(row.employmentId, list);
	}

	const preferenceByEmployment = new Map<string, string>();
	for (const row of preferenceRows) {
		preferenceByEmployment.set(row.employmentId, row.note);
	}

	return {
		employmentRows,
		positionScope,
		locationScope,
		unavailabilityRows,
		timeOffRows,
		preferenceByEmployment,
	};
}

async function loadNearbyShifts(
	workplaceId: string,
	employmentIds: string[],
	weekStart: string,
	timeZone: string,
) {
	if (employmentIds.length === 0) return [];
	const from = wallToInstant(shiftDays(weekStart, -14), 0, timeZone);
	const to = wallToInstant(shiftDays(weekStart, 21), 0, timeZone);
	return db
		.select({
			id: shifts.id,
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
				gte(shifts.startsAt, from),
				lte(shifts.startsAt, to),
			),
		);
}

function shiftHitsUnavailability(
	shiftStart: Date,
	shiftEnd: Date,
	employmentId: string,
	windows: {
		employmentId: string;
		kind: string;
		weekday: number | null;
		specificDate: string | null;
		startMinute: number;
		endMinute: number;
		status?: string;
	}[],
	timeZone: string,
): boolean {
	for (const window of windows) {
		if (window.employmentId !== employmentId) continue;
		if (window.status && window.status !== "approved") continue;
		let blocked = false;
		if (window.kind === "recurring" && window.weekday !== null) {
			blocked = recurringWindowOverlaps(
				shiftStart,
				shiftEnd,
				window.weekday,
				window.startMinute,
				window.endMinute,
				timeZone,
			);
		} else if (window.kind === "date" && window.specificDate) {
			const winStart = wallToInstant(
				window.specificDate,
				window.startMinute,
				timeZone,
			);
			const winEnd = wallToInstant(
				window.specificDate,
				window.endMinute,
				timeZone,
			);
			blocked = shiftStart < winEnd && winStart < shiftEnd;
		}
		if (blocked) return true;
	}
	return false;
}

async function overrideReasonIfNeeded(
	location: Location,
	employmentId: string | null | undefined,
	startsAt: Date,
	endsAt: Date,
	submitted: string | null | undefined,
): Promise<string | null> {
	if (!employmentId) return null;
	const windows = await db
		.select()
		.from(unavailability)
		.where(eq(unavailability.employmentId, employmentId));
	const hits = shiftHitsUnavailability(
		startsAt,
		endsAt,
		employmentId,
		windows,
		location.timezone,
	);
	if (!hits) return null;
	const reason = submitted?.trim() ?? "";
	if (!reason) {
		throw new BadRequestError(
			"This shift overlaps the worker's unavailability. Record an override reason.",
		);
	}
	return reason;
}

function hasScope(
	scope: Map<string, string[]>,
	employmentId: string,
	id: string,
) {
	const list = scope.get(employmentId) ?? [];
	return list.length === 0 || list.includes(id);
}

function recurringWindowOverlaps(
	shiftStart: Date,
	shiftEnd: Date,
	weekday: number,
	startMinute: number,
	endMinute: number,
	timeZone: string,
): boolean {
	const firstKey = zonedDayInfo(shiftStart, timeZone).dateKey;
	const lastKey = zonedDayInfo(shiftEnd, timeZone).dateKey;
	const keys = firstKey === lastKey ? [firstKey] : [firstKey, lastKey];

	for (const key of keys) {
		const info = zonedDayInfo(wallToInstant(key, 0, timeZone), timeZone);
		if (info.weekday !== weekday) continue;
		const winStart = wallToInstant(key, startMinute, timeZone);
		const winEnd = wallToInstant(key, endMinute, timeZone);
		if (shiftStart < winEnd && winStart < shiftEnd) return true;
	}
	return false;
}

/**
 * Split a shift's minutes across the zoned calendar days it touches, so
 * overnight shifts feed daily overtime on both days instead of loading the
 * start date with the full span.
 */
function minutesByZonedDate(
	startsAt: Date,
	endsAt: Date,
	timeZone: string,
): Map<string, number> {
	const split = new Map<string, number>();
	let cursor = startsAt.getTime();
	const endMs = endsAt.getTime();
	while (cursor < endMs) {
		const info = zonedDayInfo(new Date(cursor), timeZone);
		const nextMidnight = wallToInstant(shiftDays(info.dateKey, 1), 0, timeZone);
		const segmentEnd = Math.min(endMs, nextMidnight.getTime());
		const segmentMinutes = Math.round((segmentEnd - cursor) / 60_000);
		if (segmentMinutes > 0) {
			split.set(info.dateKey, (split.get(info.dateKey) ?? 0) + segmentMinutes);
		}
		cursor = segmentEnd;
	}
	return split;
}

function computeConflicts(
	location: Location,
	shiftRows: ShiftRow[],
	workforce: Awaited<ReturnType<typeof loadWorkforce>>,
	nearbyShifts: { id: string; employmentId: string | null; startsAt: Date; endsAt: Date }[],
	policy: { clopeningMinutes: number; maxConsecutiveWorkDays: number },
): Conflict[] {
	const conflicts: Conflict[] = [];
	const tz = location.timezone;

	const profileById = new Map(
		workforce.employmentRows.map((row) => [row.employment.id, row]),
	);

	for (const shift of shiftRows) {
		if (!shift.employmentId) continue;
		const person = profileById.get(shift.employmentId);
		if (!person) continue;

		if (
			person.employment.kind === "worker" &&
			!hasScope(workforce.positionScope, shift.employmentId, shift.positionId)
		) {
			conflicts.push({
				shiftId: shift.id,
				type: "position_access",
				message: `${person.profile.email} is not trained for this position`,
			});
		}

		if (
			person.employment.kind === "worker" &&
			!hasScope(workforce.locationScope, shift.employmentId, location.id)
		) {
			conflicts.push({
				shiftId: shift.id,
				type: "location_access",
				message: `${person.profile.email} is not assigned to this location`,
			});
		}

		for (const other of shiftRows) {
			if (
				other.id === shift.id ||
				!other.employmentId ||
				other.employmentId !== shift.employmentId
			) {
				continue;
			}
			if (shift.startsAt < other.endsAt && other.startsAt < shift.endsAt) {
				conflicts.push({
					shiftId: shift.id,
					type: "overlap",
					message: "Overlaps another shift for this worker",
				});
				break;
			}
		}

		const hitsUnavailability = shiftHitsUnavailability(
			shift.startsAt,
			shift.endsAt,
			shift.employmentId,
			workforce.unavailabilityRows,
			tz,
		);
		if (hitsUnavailability && !shift.unavailabilityOverrideReason?.trim()) {
			conflicts.push({
				shiftId: shift.id,
				type: "unavailability",
				message: "During a window when this worker cannot work",
			});
		}

		for (const request of workforce.timeOffRows) {
			if (request.employmentId !== shift.employmentId) continue;
			if (request.status !== "approved") continue;
			if (shift.startsAt < request.endsAt && request.startsAt < shift.endsAt) {
				conflicts.push({
					shiftId: shift.id,
					type: "time_off",
					message: "During approved time off",
				});
				break;
			}
		}
	}

	const weekShiftIds = new Set(shiftRows.map((shift) => shift.id));
	const merged = new Map<
		string,
		{ id: string; employmentId: string | null; startsAt: Date; endsAt: Date }
	>();
	for (const shift of nearbyShifts) merged.set(shift.id, shift);
	for (const shift of shiftRows) {
		merged.set(shift.id, {
			id: shift.id,
			employmentId: shift.employmentId,
			startsAt: shift.startsAt,
			endsAt: shift.endsAt,
		});
	}
	conflicts.push(
		...clopeningConflicts(
			[...merged.values()],
			policy.clopeningMinutes,
			weekShiftIds,
		),
		...consecutiveWorkDayConflicts(
			[...merged.values()],
			policy.maxConsecutiveWorkDays,
			tz,
			weekShiftIds,
		),
	);

	return conflicts;
}

function serializeShift(
	shift: ShiftRow,
	location: Location,
	conflicts: Conflict[],
	workerInfo: { name: string; email: string } | null,
	positionName: string,
) {
	const startInfo = zonedDayInfo(shift.startsAt, location.timezone);
	const endInfo = zonedDayInfo(shift.endsAt, location.timezone);
	return {
		id: shift.id,
		employmentId: shift.employmentId,
		workerName: workerInfo?.name ?? null,
		workerEmail: workerInfo?.email ?? null,
		positionId: shift.positionId,
		positionName,
		startsAt: shift.startsAt.toISOString(),
		endsAt: shift.endsAt.toISOString(),
		date: startInfo.dateKey,
		startMinute: startInfo.minuteOfDay,
		endMinute: endInfo.minuteOfDay,
		overnight: startInfo.dateKey !== endInfo.dateKey,
		note: shift.note,
		unavailabilityOverrideReason: shift.unavailabilityOverrideReason,
		conflicts: conflicts.filter((conflict) => conflict.shiftId === shift.id),
	};
}

async function loadSchedulePayload(
	location: Location,
	weekStart: string,
	exclude: { labor?: boolean; timeclock?: boolean } = {},
) {
	const schedule = await getOrCreateSchedule(location.id, weekStart);

	const [shiftRows, positionRows, workforce, workplace] = await Promise.all([
		db.select().from(shifts).where(eq(shifts.scheduleId, schedule.id)),
		db
			.select()
			.from(positions)
			.where(eq(positions.workplaceId, location.workplaceId)),
		loadWorkforce(location.workplaceId),
		loadWorkplace(location.workplaceId),
	]);

	const nearbyShifts = await loadNearbyShifts(
		location.workplaceId,
		workforce.employmentRows.map((row) => row.employment.id),
		weekStart,
		location.timezone,
	);
	const conflicts = computeConflicts(location, shiftRows, workforce, nearbyShifts, {
		clopeningMinutes: workplace.clopeningMinutes,
		maxConsecutiveWorkDays: workplace.maxConsecutiveWorkDays,
	});
	const timeclock = exclude.timeclock
		? []
		: await timeclockSummary(schedule.id, workplace.lateArrivalGraceMinutes);

	const workerInfoById = new Map(
		workforce.employmentRows.map((row) => [
			row.employment.id,
			{
				name: row.profile.fullName ?? row.profile.email,
				email: row.profile.email,
			},
		]),
	);
	const positionNameById = new Map(
		positionRows.map((position) => [position.id, position.name]),
	);

	const serialized = shiftRows
		.map((shift) =>
			serializeShift(
				shift,
				location,
				conflicts,
				workerInfoById.get(shift.employmentId ?? "") ?? null,
				positionNameById.get(shift.positionId) ?? "Unknown",
			),
		)
		.sort((a, b) =>
			a.startsAt === b.startsAt
				? (a.workerName ?? "").localeCompare(b.workerName ?? "")
				: a.startsAt.localeCompare(b.startsAt),
		);

	const shiftIds = shiftRows.map((shift) => shift.id);
	const tagRows =
		shiftIds.length === 0
			? []
			: await db
					.select()
					.from(shiftTagAssignments)
					.where(inArray(shiftTagAssignments.shiftId, shiftIds));
	const taskRows =
		shiftIds.length === 0
			? []
			: await db
					.select()
					.from(shiftTasks)
					.where(inArray(shiftTasks.shiftId, shiftIds));
	const tagsByShift = new Map<string, string[]>();
	for (const row of tagRows) {
		const list = tagsByShift.get(row.shiftId) ?? [];
		list.push(row.tagId);
		tagsByShift.set(row.shiftId, list);
	}
	const taskCountByShift = new Map<string, number>();
	for (const row of taskRows) {
		taskCountByShift.set(row.shiftId, (taskCountByShift.get(row.shiftId) ?? 0) + 1);
	}

	const groupRows =
		workforce.employmentRows.length === 0
			? []
			: await db
					.select()
					.from(employmentGroups)
					.where(
						inArray(
							employmentGroups.employmentId,
							workforce.employmentRows.map((row) => row.employment.id),
						),
					);
	const groupsByEmployment = new Map<string, string[]>();
	for (const row of groupRows) {
		const list = groupsByEmployment.get(row.employmentId) ?? [];
		list.push(row.groupId);
		groupsByEmployment.set(row.employmentId, list);
	}

	const hours = new Map<
		string,
		{
			employmentId: string;
			name: string;
			minutes: number;
			byPosition: Map<string, number>;
			byDate: Map<string, number>;
		}
	>();
	for (const shift of shiftRows) {
		if (!shift.employmentId) continue;
		const info = workerInfoById.get(shift.employmentId);
		if (!info) continue;
		const entry = hours.get(shift.employmentId) ?? {
			employmentId: shift.employmentId,
			name: info.name,
			minutes: 0,
			byPosition: new Map<string, number>(),
			byDate: new Map<string, number>(),
		};
		const minutes = Math.round(
			(shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000,
		);
		entry.minutes += minutes;
		entry.byPosition.set(
			shift.positionId,
			(entry.byPosition.get(shift.positionId) ?? 0) + minutes,
		);
		for (const [dateKey, dayMinutes] of minutesByZonedDate(
			shift.startsAt,
			shift.endsAt,
			location.timezone,
		)) {
			entry.byDate.set(dateKey, (entry.byDate.get(dateKey) ?? 0) + dayMinutes);
		}
		hours.set(shift.employmentId, entry);
	}

	const overtimeWeeklyMinutes = workplace.overtimeWeeklyMinutes;
	const overtimeDailyMinutes = workplace.overtimeDailyMinutes;
	let scheduledCents = 0;
	let overtimeCents = 0;
	let salesCents = 0;
	let salesByDate: { date: string; amountCents: number }[] = [];
	if (!exclude.labor) {
		if (workplace.managersCanViewLaborCost) {
			for (const entry of hours.values()) {
				const wage =
					workforce.employmentRows.find(
						(row) => row.employment.id === entry.employmentId,
					)?.employment.hourlyWageCents ?? 0;
				const cost = laborCents({
					minutes: entry.minutes,
					hourlyWageCents: wage ?? 0,
					overtimeWeeklyMinutes,
					overtimeDailyMinutes,
					dailyMinutes: [...entry.byDate.values()],
				});
				scheduledCents += cost.totalCents;
				overtimeCents += cost.overtimeCents;
			}
		}
		const weekDates = Array.from({ length: 7 }, (_, index) =>
			shiftDays(weekStart, index),
		);
		const salesRows = await db
			.select()
			.from(locationSales)
			.where(
				and(
					eq(locationSales.locationId, location.id),
					inArray(locationSales.saleDate, weekDates),
				),
			);
		salesCents = salesRows.reduce((sum, row) => sum + row.amountCents, 0);
		salesByDate = salesRows.map((row) => ({
			date: row.saleDate,
			amountCents: row.amountCents,
		}));
	}

	const publication = await publicationSummary(schedule.id, shiftRows);

	return {
		schedule: {
			id: schedule.id,
			locationId: location.id,
			weekStartDate: schedule.weekStartDate,
			timezone: location.timezone,
			weekStartDay: await weekStartDayFor(location.workplaceId),
			openMinute: location.openMinute,
			closeMinute: location.closeMinute,
		},
		publication,
		timeclock,
		labor: exclude.labor
			? null
			: {
					scheduledCents,
					overtimeCents,
					salesCents,
					laborPercent: workplace.managersCanViewLaborCost
						? laborPercent(scheduledCents, salesCents)
						: null,
					laborCostPercentGoal: workplace.laborCostPercentGoal,
					hidden: !workplace.managersCanViewLaborCost,
					byDate: salesByDate,
				},
		shifts: serialized.map((shift) => ({
			...shift,
			tagIds: tagsByShift.get(shift.id) ?? [],
			taskCount: taskCountByShift.get(shift.id) ?? 0,
		})),
		staff: workforce.employmentRows
			.filter(({ employment }) =>
				employment.kind === "manager"
					? true
					: hasScope(workforce.locationScope, employment.id, location.id),
			)
			.map(({ employment, profile }) => ({
				employmentId: employment.id,
				name: profile.fullName ?? profile.email,
				email: profile.email,
				kind: employment.kind,
				hourlyWageCents: workplace.managersCanViewLaborCost
					? employment.hourlyWageCents
					: null,
				groupIds: groupsByEmployment.get(employment.id) ?? [],
				positionIds: workforce.positionScope.get(employment.id) ?? [],
				preference: workforce.preferenceByEmployment.get(employment.id) ?? null,
				unavailability: workforce.unavailabilityRows
					.filter((window) => window.employmentId === employment.id)
					.map((window) => ({
						kind: window.kind,
						weekday: window.kind === "recurring" ? window.weekday : null,
						date: window.kind === "date" ? window.specificDate : null,
						startMinute: window.startMinute,
						endMinute: window.endMinute,
						note: window.note,
						status: window.status,
					})),
				timeOff: workforce.timeOffRows
					.filter((request) => request.employmentId === employment.id)
					.map((request) => ({
						startsAt: request.startsAt.toISOString(),
						endsAt: request.endsAt.toISOString(),
						reason: request.reason,
						status: request.status,
					})),
			})),
		hours: [...hours.values()].map((entry) => ({
			employmentId: entry.employmentId,
			name: entry.name,
			minutes: entry.minutes,
			byPosition: [...entry.byPosition.entries()].map(
				([positionId, minutes]) => ({
					positionId,
					positionName: positionNameById.get(positionId) ?? "Unknown",
					minutes,
				}),
			),
		})),
		positions: positionRows.map((position) => ({
			id: position.id,
			name: position.name,
		})),
	};
}

/** Labor cost and sales rollup for one week — the focused /labor endpoint. */
async function loadLaborObject(
	location: Location,
	schedule: typeof schedules.$inferSelect,
	weekStart: string,
) {
	const [shiftRows, workforce, workplace] = await Promise.all([
		db.select().from(shifts).where(eq(shifts.scheduleId, schedule.id)),
		loadWorkforce(location.workplaceId),
		loadWorkplace(location.workplaceId),
	]);

	const workerInfoById = new Map(
		workforce.employmentRows.map((row) => [
			row.employment.id,
			{
				name: row.profile.fullName ?? row.profile.email,
				email: row.profile.email,
			},
		]),
	);

	const hours = new Map<
		string,
		{ employmentId: string; minutes: number; byDate: Map<string, number> }
	>();
	for (const shift of shiftRows) {
		if (!shift.employmentId) continue;
		if (!workerInfoById.has(shift.employmentId)) continue;
		const entry = hours.get(shift.employmentId) ?? {
			employmentId: shift.employmentId,
			minutes: 0,
			byDate: new Map<string, number>(),
		};
		const minutes = Math.round(
			(shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000,
		);
		entry.minutes += minutes;
		for (const [dateKey, dayMinutes] of minutesByZonedDate(
			shift.startsAt,
			shift.endsAt,
			location.timezone,
		)) {
			entry.byDate.set(dateKey, (entry.byDate.get(dateKey) ?? 0) + dayMinutes);
		}
		hours.set(shift.employmentId, entry);
	}

	let scheduledCents = 0;
	let overtimeCents = 0;
	if (workplace.managersCanViewLaborCost) {
		for (const entry of hours.values()) {
			const wage =
				workforce.employmentRows.find(
					(row) => row.employment.id === entry.employmentId,
				)?.employment.hourlyWageCents ?? 0;
			const cost = laborCents({
				minutes: entry.minutes,
				hourlyWageCents: wage ?? 0,
				overtimeWeeklyMinutes: workplace.overtimeWeeklyMinutes,
				overtimeDailyMinutes: workplace.overtimeDailyMinutes,
				dailyMinutes: [...entry.byDate.values()],
			});
			scheduledCents += cost.totalCents;
			overtimeCents += cost.overtimeCents;
		}
	}
	const weekDates = Array.from({ length: 7 }, (_, index) =>
		shiftDays(weekStart, index),
	);
	const salesRows = await db
		.select()
		.from(locationSales)
		.where(
			and(
				eq(locationSales.locationId, location.id),
				inArray(locationSales.saleDate, weekDates),
			),
		);
	const salesCents = salesRows.reduce((sum, row) => sum + row.amountCents, 0);
	const salesByDate = salesRows.map((row) => ({
		date: row.saleDate,
		amountCents: row.amountCents,
	}));

	return {
		scheduledCents,
		overtimeCents,
		salesCents,
		laborPercent: workplace.managersCanViewLaborCost
			? laborPercent(scheduledCents, salesCents)
			: null,
		laborCostPercentGoal: workplace.laborCostPercentGoal,
		hidden: !workplace.managersCanViewLaborCost,
		byDate: salesByDate,
	};
}

async function locationForShift(shiftId: string) {
	const context = await shiftContext(shiftId);
	return context.location;
}

async function shiftContext(shiftId: string) {
	const [row] = await db
		.select({ location: locations, schedule: schedules })
		.from(shifts)
		.innerJoin(schedules, eq(schedules.id, shifts.scheduleId))
		.innerJoin(locations, eq(locations.id, schedules.locationId))
		.where(eq(shifts.id, shiftId))
		.limit(1);
	if (!row) throw new NotFoundError("Shift not found");
	return row;
}

function resolveShiftTimes(
	body: { date: string; startMinute: number; endMinute: number },
	timeZone: string,
): { startsAt: Date; endsAt: Date } {
	if (body.startMinute === body.endMinute) {
		throw new BadRequestError("Start and end time cannot be identical");
	}
	const startsAt = wallToInstant(body.date, body.startMinute, timeZone);
	const endDay =
		body.endMinute <= body.startMinute ? shiftDays(body.date, 1) : body.date;
	const endsAt = wallToInstant(endDay, body.endMinute, timeZone);
	return { startsAt, endsAt };
}

function assertDateInWeek(date: string, weekStart: string) {
	const last = shiftDays(weekStart, 6);
	if (date < weekStart || date > last) {
		throw new BadRequestError("Shift must start on a day in this workweek");
	}
}

async function assertAssignmentValid(
	location: Location,
	employmentId: string,
	positionId: string,
	options: { approvePosition?: boolean } = {},
) {
	const [employment] = await db
		.select()
		.from(employments)
		.where(
			and(
				eq(employments.id, employmentId),
				eq(employments.workplaceId, location.workplaceId),
				eq(employments.status, "active"),
			),
		)
		.limit(1);
	if (!employment) {
		throw new BadRequestError("Worker is not active at this workplace");
	}

	if (employment.kind === "worker") {
		const locationRows = await db
			.select()
			.from(employmentLocations)
			.where(eq(employmentLocations.employmentId, employmentId));
		if (
			locationRows.length > 0 &&
			!locationRows.some((row) => row.locationId === location.id)
		) {
			throw new BadRequestError("Worker is not assigned to this location");
		}
		const positionRows = await db
			.select()
			.from(employmentPositions)
			.where(eq(employmentPositions.employmentId, employmentId));
		if (
			positionRows.length > 0 &&
			!positionRows.some((row) => row.positionId === positionId)
		) {
			if (!options.approvePosition) {
				throw new BadRequestError("Worker is not approved for this position");
			}
			const [position] = await db
				.select({ id: positions.id })
				.from(positions)
				.where(
					and(
						eq(positions.id, positionId),
						eq(positions.workplaceId, location.workplaceId),
					),
				)
				.limit(1);
			if (!position) throw new BadRequestError("Position not found");
			await db
				.insert(employmentPositions)
				.values({ employmentId, positionId })
				.onConflictDoNothing();
		}
	}
}

async function timeclockSummary(scheduleId: string, lateArrivalGraceMinutes: number) {
	const [latest] = await db
		.select()
		.from(scheduleVersions)
		.where(eq(scheduleVersions.scheduleId, scheduleId))
		.orderBy(desc(scheduleVersions.versionNumber))
		.limit(1);
	if (!latest) return [];

	const rows = await db
		.select({
			shiftId: versionShifts.shiftId,
			versionShiftId: versionShifts.id,
			startsAt: versionShifts.startsAt,
			entryId: timeEntries.id,
			clockedInAt: timeEntries.clockedInAt,
			clockedOutAt: timeEntries.clockedOutAt,
			attendanceKind: attendanceMarks.kind,
		})
		.from(versionShifts)
		.leftJoin(timeEntries, eq(timeEntries.versionShiftId, versionShifts.id))
		.leftJoin(
			attendanceMarks,
			eq(attendanceMarks.versionShiftId, versionShifts.id),
		)
		.where(and(eq(versionShifts.versionId, latest.id)));

	return rows
		.filter(
			(row): row is typeof row & { shiftId: string } => row.shiftId !== null,
		)
		.map((row) => {
			const late =
				row.clockedInAt != null &&
				isLateArrival(
					row.clockedInAt,
					row.startsAt,
					lateArrivalGraceMinutes,
				);
			const attendance =
				row.attendanceKind ?? (late ? ("late" as const) : null);
			if (!row.entryId || !row.clockedInAt) {
				return {
					shiftId: row.shiftId,
					versionShiftId: row.versionShiftId,
					status: null as "open" | "closed" | null,
					clockedInAt: null as string | null,
					clockedOutAt: null as string | null,
					workedMinutes: null as number | null,
					attendance,
					late,
				};
			}
			const workedMinutes = Math.max(
				0,
				Math.round(
					((row.clockedOutAt?.getTime() ?? Date.now()) -
						row.clockedInAt.getTime()) /
						60_000,
				),
			);
			return {
				shiftId: row.shiftId,
				versionShiftId: row.versionShiftId,
				status: row.clockedOutAt ? ("closed" as const) : ("open" as const),
				clockedInAt: row.clockedInAt.toISOString(),
				clockedOutAt: row.clockedOutAt?.toISOString() ?? null,
				workedMinutes,
				attendance,
				late,
			};
		});
}

async function publicationSummary(scheduleId: string, draftShifts: ShiftRow[]) {
	const [latest] = await db
		.select()
		.from(scheduleVersions)
		.where(eq(scheduleVersions.scheduleId, scheduleId))
		.orderBy(desc(scheduleVersions.versionNumber))
		.limit(1);

	if (!latest) {
		return {
			latestVersionNumber: null as number | null,
			publishedAt: null as string | null,
			hasUnpublishedChanges: draftShifts.length > 0,
			versions: [] as Awaited<
				ReturnType<typeof loadPublicationVersions>
			>,
		};
	}

	const published = await db
		.select()
		.from(versionShifts)
		.where(eq(versionShifts.versionId, latest.id));

	const keyOf = (shift: {
		employmentId: string | null;
		positionId: string;
		startsAt: Date;
		endsAt: Date;
		note: string | null;
	}) =>
		`${shift.employmentId ?? ""}|${shift.positionId}|${shift.startsAt.toISOString()}|${shift.endsAt.toISOString()}|${shift.note ?? ""}`;

	const draftKeys = draftShifts.map(keyOf).sort();
	const publishedKeys = published.map(keyOf).sort();
	const hasUnpublishedChanges =
		draftKeys.length !== publishedKeys.length ||
		draftKeys.some((key, index) => key !== publishedKeys[index]);

	// Delivery/acknowledgement history rides along with the week payload so the
	// schedule page needs no extra /publication round-trip.
	const versions = await loadPublicationVersions(scheduleId);

	return {
		latestVersionNumber: latest.versionNumber,
		publishedAt: latest.publishedAt.toISOString(),
		hasUnpublishedChanges,
		versions,
	};
}

function calendarMonthKeys(monthStart: string, weekStartDay: number): string[] {
	const firstWeekday = new Date(`${monthStart}T00:00:00Z`).getUTCDay();
	const offset = (firstWeekday - weekStartDay + 7) % 7;
	const start = shiftDays(monthStart, -offset);
	return Array.from({ length: 42 }, (_, index) => shiftDays(start, index));
}

async function loadCalendarPayload(location: Location, monthStart: string) {
	if (!/^\d{4}-\d{2}-01$/.test(monthStart)) {
		throw new BadRequestError("Month must be the first day, like 2026-09-01");
	}
	const weekStartDay = await weekStartDayFor(location.workplaceId);
	const days = calendarMonthKeys(monthStart, weekStartDay);
	const weekStarts = [
		...new Set(days.map((day) => weekStartOfDateKey(day, weekStartDay))),
	];

	const existing = await db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.locationId, location.id),
				inArray(schedules.weekStartDate, weekStarts),
			),
		);
	if (existing.length === 0) {
		return { monthStart, shifts: [], timeclock: [] };
	}

	const scheduleIds = existing.map((row) => row.id);
	const [shiftRows, positionRows, workforce, workplace] = await Promise.all([
		db.select().from(shifts).where(inArray(shifts.scheduleId, scheduleIds)),
		db
			.select()
			.from(positions)
			.where(eq(positions.workplaceId, location.workplaceId)),
		loadWorkforce(location.workplaceId),
		loadWorkplace(location.workplaceId),
	]);

	const firstWeek = weekStarts[0] ?? monthStart;
	const lastWeek = weekStarts[weekStarts.length - 1] ?? monthStart;
	const employmentIds = workforce.employmentRows.map(
		(row) => row.employment.id,
	);
	const [nearbyEarly, nearbyLate] = await Promise.all([
		loadNearbyShifts(
			location.workplaceId,
			employmentIds,
			firstWeek,
			location.timezone,
		),
		firstWeek === lastWeek
			? Promise.resolve([])
			: loadNearbyShifts(
					location.workplaceId,
					employmentIds,
					lastWeek,
					location.timezone,
				),
	]);
	const nearbyById = new Map(
		[...nearbyEarly, ...nearbyLate].map((shift) => [shift.id, shift]),
	);
	const nearbyShifts = [...nearbyById.values()];

	const conflicts = computeConflicts(
		location,
		shiftRows,
		workforce,
		nearbyShifts,
		{
			clopeningMinutes: workplace.clopeningMinutes,
			maxConsecutiveWorkDays: workplace.maxConsecutiveWorkDays,
		},
	);
	const workerInfoById = new Map(
		workforce.employmentRows.map((row) => [
			row.employment.id,
			{
				name: row.profile.fullName ?? row.profile.email,
				email: row.profile.email,
			},
		]),
	);
	const positionNameById = new Map(
		positionRows.map((position) => [position.id, position.name]),
	);
	const serialized = shiftRows
		.map((shift) =>
			serializeShift(
				shift,
				location,
				conflicts,
				workerInfoById.get(shift.employmentId ?? "") ?? null,
				positionNameById.get(shift.positionId) ?? "Unknown",
			),
		)
		.sort((a, b) =>
			a.startsAt === b.startsAt
				? (a.workerName ?? "").localeCompare(b.workerName ?? "")
				: a.startsAt.localeCompare(b.startsAt),
		);

	const shiftIds = shiftRows.map((shift) => shift.id);
	const tagRows =
		shiftIds.length === 0
			? []
			: await db
					.select()
					.from(shiftTagAssignments)
					.where(inArray(shiftTagAssignments.shiftId, shiftIds));
	const tagsByShift = new Map<string, string[]>();
	for (const row of tagRows) {
		const list = tagsByShift.get(row.shiftId) ?? [];
		list.push(row.tagId);
		tagsByShift.set(row.shiftId, list);
	}
	const taskRows =
		shiftIds.length === 0
			? []
			: await db
					.select()
					.from(shiftTasks)
					.where(inArray(shiftTasks.shiftId, shiftIds));
	const taskCountByShift = new Map<string, number>();
	for (const row of taskRows) {
		taskCountByShift.set(
			row.shiftId,
			(taskCountByShift.get(row.shiftId) ?? 0) + 1,
		);
	}

	const timeclock = (
		await Promise.all(
			scheduleIds.map((id) =>
				timeclockSummary(id, workplace.lateArrivalGraceMinutes),
			),
		)
	).flat();

	return {
		monthStart,
		shifts: serialized.map((shift) => ({
			...shift,
			tagIds: tagsByShift.get(shift.id) ?? [],
			taskCount: taskCountByShift.get(shift.id) ?? 0,
		})),
		timeclock,
	};
}

export const schedulesRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Schedule"],
})
	.get(
		"/locations/:locationId/calendar/:monthStart",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);

			return loadCalendarPayload(location, params.monthStart);
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				monthStart: dateSchema,
			}),
			detail: {
				summary:
					"Read Shifts across a calendar month without creating draft Schedules",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/locations/:locationId/schedules/:weekStart",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers.authorization);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);
			assertWeekStartDay(
				params.weekStart,
				await weekStartDayFor(location.workplaceId),
			);

			const parts = (query.exclude ?? "")
				.split(",")
				.map((part) => part.trim());
			return loadSchedulePayload(location, params.weekStart, {
				labor: parts.includes("labor"),
				timeclock: parts.includes("timeclock"),
			});
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			query: t.Object({
				exclude: t.Optional(t.String({ maxLength: 60 })),
			}),
			detail: {
				summary:
					"Get or create the draft Schedule for a Location and workweek, with server-computed conflicts and hours. exclude=labor,timeclock trims heavy sections",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/locations/:locationId/schedules/:weekStart/timeclock",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);
			const [schedule] = await db
				.select()
				.from(schedules)
				.where(
					and(
						eq(schedules.locationId, location.id),
						eq(schedules.weekStartDate, params.weekStart),
					),
				)
				.limit(1);
			if (!schedule) return { timeclock: [] };
			const workplace = await loadWorkplace(location.workplaceId);
			return {
				timeclock: await timeclockSummary(
					schedule.id,
					workplace.lateArrivalGraceMinutes,
				),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			detail: {
				summary: "Time-clock state for the published shifts of one week (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/locations/:locationId/schedules/:weekStart/labor",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);
			const schedule = await getOrCreateSchedule(location.id, params.weekStart);
			return {
				labor: await loadLaborObject(location, schedule, params.weekStart),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			detail: {
				summary: "Labor cost and sales rollup for one schedule week (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/shifts",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);

			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			assertWeekStartDay(
				params.weekStart,
				await weekStartDayFor(location.workplaceId),
			);
			await requireManager(profile.id, location.workplaceId);

			const schedule = await getOrCreateSchedule(location.id, params.weekStart);
			assertDateInWeek(body.date, params.weekStart);
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
						{ approvePosition: body.approvePosition === true },
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

			return { shiftId: shift.id };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			body: t.Object({
				employmentId: t.Optional(
					t.Union([t.String({ format: "uuid" }), t.Null()]),
				),
				positionId: t.String({ format: "uuid" }),
				date: dateSchema,
				startMinute: minuteSchema,
				endMinute: minuteSchema,
				note: t.Optional(t.String({ maxLength: 200 })),
				unavailabilityOverrideReason: t.Optional(
					t.String({ minLength: 1, maxLength: 300 }),
				),
				approvePosition: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Add a Shift to the draft Schedule (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/shifts/:shiftId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const { location, schedule } = await shiftContext(params.shiftId);
			await requireManager(profile.id, location.workplaceId);

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
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ shiftId: t.String({ format: "uuid" }) }),
			body: t.Object({
				employmentId: t.Optional(
					t.Union([t.String({ format: "uuid" }), t.Null()]),
				),
				positionId: t.Optional(t.String({ format: "uuid" })),
				date: t.Optional(dateSchema),
				startMinute: t.Optional(minuteSchema),
				endMinute: t.Optional(minuteSchema),
				note: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
				unavailabilityOverrideReason: t.Optional(
					t.Union([t.String({ minLength: 1, maxLength: 300 }), t.Null()]),
				),
				approvePosition: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Update a draft Shift (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/shifts/:shiftId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const location = await locationForShift(params.shiftId);
			await requireManager(profile.id, location.workplaceId);

			await db.delete(shifts).where(eq(shifts.id, params.shiftId));
			return { ok: true as const };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ shiftId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Remove a Shift from the draft Schedule (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/copy-previous",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);

			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);
			assertWeekStartDay(
				params.weekStart,
				await weekStartDayFor(location.workplaceId),
			);

			const previousWeek = shiftDays(params.weekStart, -7);
			const [source] = await db
				.select()
				.from(schedules)
				.where(
					and(
						eq(schedules.locationId, location.id),
						eq(schedules.weekStartDate, previousWeek),
					),
				)
				.limit(1);
			if (!source) {
				throw new NotFoundError("The previous week has no schedule to copy");
			}

			const target = await getOrCreateSchedule(location.id, params.weekStart);
			const sourceShifts = await db
				.select()
				.from(shifts)
				.where(eq(shifts.scheduleId, source.id));
			if (sourceShifts.length === 0) {
				throw new ConflictError("The previous week has no shifts to copy");
			}

			await db.transaction(async (tx) => {
				await tx.delete(shifts).where(eq(shifts.scheduleId, target.id));
				await tx.insert(shifts).values(
					sourceShifts.map((shift) => {
						const startInfo = zonedDayInfo(shift.startsAt, location.timezone);
						const endInfo = zonedDayInfo(shift.endsAt, location.timezone);
						return {
							scheduleId: target.id,
							employmentId: shift.employmentId,
							positionId: shift.positionId,
							startsAt: wallToInstant(
								shiftDays(startInfo.dateKey, 7),
								startInfo.minuteOfDay,
								location.timezone,
							),
							endsAt: wallToInstant(
								shiftDays(endInfo.dateKey, 7),
								endInfo.minuteOfDay,
								location.timezone,
							),
							note: shift.note,
							unavailabilityOverrideReason: shift.unavailabilityOverrideReason,
						};
					}),
				);
			});

			return { copied: sourceShifts.length };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			detail: {
				summary:
					"Copy the previous week's Shifts into this week's draft (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/auto-assign",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);
			const [schedule] = await db
				.select()
				.from(schedules)
				.where(
					and(
						eq(schedules.locationId, location.id),
						eq(schedules.weekStartDate, params.weekStart),
					),
				)
				.limit(1);
			if (!schedule) throw new NotFoundError("Schedule not found");
			const draft = await db
				.select()
				.from(shifts)
				.where(eq(shifts.scheduleId, schedule.id));
			const unassigned = draft.filter((shift) => shift.employmentId === null);
			const workers = await db
				.select()
				.from(employments)
				.where(
					and(
						eq(employments.workplaceId, location.workplaceId),
						eq(employments.kind, "worker"),
						eq(employments.status, "active"),
					),
				);
			let assigned = 0;
			for (const shift of unassigned) {
				for (const worker of workers) {
					const overlap = draft.some(
						(other) =>
							other.employmentId === worker.id &&
							other.startsAt < shift.endsAt &&
							shift.startsAt < other.endsAt,
					);
					if (overlap) continue;
					try {
						await assertEligible(
							worker.id,
							location.id,
							shift.positionId,
							shift.startsAt,
							shift.endsAt,
						);
					} catch {
						continue;
					}
				await db
					.update(shifts)
					.set({ employmentId: worker.id, updatedAt: new Date() })
					.where(eq(shifts.id, shift.id));
				await closeOpenMarketplaceForShifts([shift.id]);
				shift.employmentId = worker.id;
				assigned += 1;
				break;
				}
			}
			return { assigned };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			detail: {
				summary: "Auto-assign unassigned draft Shifts (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/bulk",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);
			if (body.shiftIds.length === 0) return { updated: 0 };
			// Every mutation below is scoped to this location's week, so shift ids
			// from another schedule are ignored rather than wiped or retimed.
			const [schedule] = await db
				.select()
				.from(schedules)
				.where(
					and(
						eq(schedules.locationId, location.id),
						eq(schedules.weekStartDate, params.weekStart),
					),
				)
				.limit(1);
			if (!schedule) return { updated: 0 };
			const inSchedule = and(
				inArray(shifts.id, body.shiftIds),
				eq(shifts.scheduleId, schedule.id),
			);
			if (body.delete) {
				const deleted = await db
					.delete(shifts)
					.where(inSchedule)
					.returning({ id: shifts.id });
				return { updated: deleted.length };
			}
			const rows = await db.select().from(shifts).where(inSchedule);
			for (const shift of rows) {
				const date = zonedDayInfo(shift.startsAt, location.timezone).dateKey;
				const startMinute = body.startMinute ??
					zonedDayInfo(shift.startsAt, location.timezone).minuteOfDay;
				const endMinute = body.endMinute ??
					zonedDayInfo(shift.endsAt, location.timezone).minuteOfDay;
				const { startsAt, endsAt } = resolveShiftTimes(
					{ date, startMinute, endMinute },
					location.timezone,
				);
				await db
					.update(shifts)
					.set({
						startsAt,
						endsAt,
						employmentId:
							body.employmentId === undefined
								? shift.employmentId
								: body.employmentId,
						updatedAt: new Date(),
					})
					.where(eq(shifts.id, shift.id));
			}
			return { updated: rows.length };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			body: t.Object({
				shiftIds: t.Array(t.String({ format: "uuid" })),
				delete: t.Optional(t.Boolean()),
				startMinute: t.Optional(minuteSchema),
				endMinute: t.Optional(minuteSchema),
				employmentId: t.Optional(
					t.Union([t.String({ format: "uuid" }), t.Null()]),
				),
			}),
			detail: {
				summary: "Bulk edit or delete draft Shifts (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/locations/:locationId/schedules/:weekStart/paste",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const [location] = await db
				.select()
				.from(locations)
				.where(eq(locations.id, params.locationId))
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			await requireManager(profile.id, location.workplaceId);
			assertDateInWeek(body.date, params.weekStart);
			const schedule = await getOrCreateSchedule(location.id, params.weekStart);
			const created = [];
			for (const item of body.shifts) {
				const { startsAt, endsAt } = resolveShiftTimes(
					{
						date: body.date,
						startMinute: item.startMinute,
						endMinute: item.endMinute,
					},
					location.timezone,
				);
				created.push({
					scheduleId: schedule.id,
					employmentId: body.employmentId ?? null,
					positionId: item.positionId,
					startsAt,
					endsAt,
					note: item.note ?? null,
				});
			}
			if (created.length > 0) await db.insert(shifts).values(created);
			return { pasted: created.length };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				locationId: t.String({ format: "uuid" }),
				weekStart: dateSchema,
			}),
			body: t.Object({
				date: dateSchema,
				employmentId: t.Optional(
					t.Union([t.String({ format: "uuid" }), t.Null()]),
				),
				shifts: t.Array(
					t.Object({
						positionId: t.String({ format: "uuid" }),
						startMinute: minuteSchema,
						endMinute: minuteSchema,
						note: t.Optional(t.String({ maxLength: 200 })),
					}),
				),
			}),
			detail: {
				summary: "Paste copied Shift skeletons onto a day (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/shifts/:shiftId/repeat",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const { location, schedule } = await shiftContext(params.shiftId);
			await requireManager(profile.id, location.workplaceId);
			const [existing] = await db
				.select()
				.from(shifts)
				.where(eq(shifts.id, params.shiftId))
				.limit(1);
			if (!existing) throw new NotFoundError("Shift not found");
			const startInfo = zonedDayInfo(existing.startsAt, location.timezone);
			const endInfo = zonedDayInfo(existing.endsAt, location.timezone);
			let copied = 0;
			for (let week = 1; week <= body.weeks; week++) {
				const weekStart = shiftDays(schedule.weekStartDate, week * 7);
				const target = await getOrCreateSchedule(location.id, weekStart);
				await db.insert(shifts).values({
					scheduleId: target.id,
					employmentId: existing.employmentId,
					positionId: existing.positionId,
					startsAt: wallToInstant(
						shiftDays(startInfo.dateKey, week * 7),
						startInfo.minuteOfDay,
						location.timezone,
					),
					endsAt: wallToInstant(
						shiftDays(endInfo.dateKey, week * 7),
						endInfo.minuteOfDay,
						location.timezone,
					),
					note: existing.note,
				});
				copied += 1;
			}
			return { copied };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ shiftId: t.String({ format: "uuid" }) }),
			body: t.Object({ weeks: t.Integer({ minimum: 1, maximum: 12 }) }),
			detail: {
				summary: "Copy this draft Shift forward by N weeks (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
