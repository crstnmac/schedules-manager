import {
	announcements,
	attendanceMarks,
	conversationMembers,
	conversations,
	dayParts,
	db,
	employmentDocuments,
	employmentGroups,
	employmentLocations,
	employmentPositions,
	employments,
	invitations,
	leaveTypes,
	locationSales,
	locations,
	notifications,
	openShifts,
	positions,
	profiles,
	ptoBalances,
	schedules,
	scheduleTemplates,
	scheduleVersions,
	shiftAcceptances,
	shiftPickups,
	shiftReleases,
	shiftSwaps,
	shifts,
	shiftTagAssignments,
	shiftTags,
	shiftTaskCompletions,
	shiftTasks,
	shiftTemplates,
	templateShifts,
	timeBlocks,
	timeEntries,
	timeEntryBreaks,
	timeOffRequests,
	unavailability,
	versionShifts,
	workerDeliveries,
	workerGroups,
	workPreferences,
	workplaceMessages,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import { writeAudit } from "../src/notify";
import { hashPin } from "../src/pin";
import { publishScheduleNow } from "../src/routes/publication";
import { shiftDays, wallToInstant, zonedDayInfo } from "../src/time";

const WEEK_STARTS = [
	"2026-08-17",
	"2026-08-24",
	"2026-08-31",
	"2026-09-07",
	"2026-09-14",
	"2026-09-21",
	"2026-09-28",
] as const;

const POSITION_DEFS = [
	{ name: "Server" },
	{ name: "Host" },
	{ name: "Bartender" },
	{ name: "Line Cook" },
	{ name: "Prep Cook" },
	{ name: "Dishwasher" },
];

const WAGE_CENTS: Record<string, number> = {
	Server: 1500,
	Host: 1600,
	Bartender: 1800,
	"Line Cook": 2200,
	"Prep Cook": 1800,
	Dishwasher: 1500,
};

const FOH = new Set(["Server", "Host", "Bartender"]);

const REAL_WORKERS = [
	{
		email: "worker.pilot@icmans.com",
		fullName: "Alex Rivera",
		position: "Server",
	},
	{
		email: "worker2.pilot@icmans.com",
		fullName: "Jordan Chen",
		position: "Server",
	},
	{
		email: "worker3.pilot@icmans.com",
		fullName: "Sam Patel",
		position: "Bartender",
	},
	{
		email: "edsel1944@icmans.com",
		fullName: "Edsel Marks",
		position: "Line Cook",
	},
	{
		email: "ui.review.schedules@gmail.com",
		fullName: "Riley Gomez",
		position: "Host",
	},
	{
		email: "jooling.onboard.1788342923@mailinator.com",
		fullName: "Casey Nguyen",
		position: "Server",
	},
	{
		email: "jooling.invited.1788342923@mailinator.com",
		fullName: "Morgan Blake",
		position: "Prep Cook",
	},
] as const;

const SYNTHETIC_WORKERS = [
	{ fullName: "Priya Shah", position: "Server" },
	{ fullName: "Luis Ortega", position: "Server" },
	{ fullName: "Hannah Brooks", position: "Server" },
	{ fullName: "Noah Kim", position: "Server" },
	{ fullName: "Maya Thompson", position: "Host" },
	{ fullName: "Chris Delgado", position: "Bartender" },
	{ fullName: "Aisha Rahman", position: "Bartender" },
	{ fullName: "Ben Walsh", position: "Line Cook" },
	{ fullName: "Sofia Alvarez", position: "Line Cook" },
	{ fullName: "Derek Holt", position: "Line Cook" },
	{ fullName: "Elena Rossi", position: "Prep Cook" },
	{ fullName: "Jamal Wright", position: "Dishwasher" },
	{ fullName: "Nina Park", position: "Dishwasher" },
] as const;

const LUNCH = { start: 11 * 60, end: 15 * 60 };
const DINNER = { start: 16 * 60 + 30, end: 22 * 60 };

type Meal = "lunch" | "dinner";
type SeededWorker = {
	employmentId: string;
	profileId: string;
	fullName: string;
	email: string;
	position: string;
	login: boolean;
};

function coverage(dayOffset: number, meal: Meal): Record<string, number> {
	const weekend = dayOffset >= 5;
	if (meal === "lunch") {
		return {
			Server: weekend ? 4 : 3,
			Host: 1,
			Bartender: weekend ? 1 : 0,
			"Line Cook": 2,
			"Prep Cook": 1,
			Dishwasher: 1,
		};
	}
	return {
		Server: weekend ? 6 : 4,
		Host: 1,
		Bartender: weekend ? 2 : 1,
		"Line Cook": weekend ? 3 : 2,
		"Prep Cook": 1,
		Dishwasher: weekend ? 2 : 1,
	};
}

function unassignedCount(dayOffset: number, meal: Meal, position: string) {
	if (position !== "Server" || meal !== "dinner") return 0;
	return dayOffset >= 5 ? 2 : 1;
}

function slug(name: string) {
	return name.toLowerCase().replaceAll(/[^a-z]+/g, ".");
}

function daysBetween(fromDateKey: string, toDateKey: string): number {
	const from = new Date(`${fromDateKey}T00:00:00Z`);
	const to = new Date(`${toDateKey}T00:00:00Z`);
	return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

async function insertChunks<T>(
	rows: T[],
	size: number,
	write: (chunk: T[]) => Promise<unknown>,
) {
	for (let i = 0; i < rows.length; i += size) {
		await write(rows.slice(i, i + size));
	}
}

function pickWorkers(
	pool: { employmentId: string }[],
	needed: number,
	used: Set<string>,
	salt: string,
) {
	if (needed <= 0 || pool.length === 0) return [];
	const start =
		[...salt].reduce((sum, char) => sum + char.charCodeAt(0), 0) % pool.length;
	const chosen: string[] = [];
	for (let step = 0; step < pool.length && chosen.length < needed; step++) {
		const candidate = pool[(start + step) % pool.length];
		if (!candidate || used.has(candidate.employmentId)) continue;
		used.add(candidate.employmentId);
		chosen.push(candidate.employmentId);
	}
	return chosen;
}

async function ensureNamed<T extends { id: string }>(
	existing: T | undefined,
	create: () => Promise<T | undefined>,
	label: string,
): Promise<T> {
	if (existing) return existing;
	const created = await create();
	if (!created) throw new Error(`Could not create ${label}`);
	return created;
}

async function main() {
	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.name, "Pilot Restaurant"))
		.limit(1);
	if (!workplace) {
		throw new Error(
			"Pilot Restaurant is missing. Sign in as the manager first.",
		);
	}

	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.workplaceId, workplace.id))
		.limit(1);
	if (!location) throw new Error("Pilot Restaurant has no location");

	const [manager] = await db
		.select()
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, workplace.id),
				eq(employments.kind, "manager"),
			),
		)
		.limit(1);
	if (!manager) {
		throw new Error("Pilot Restaurant has no manager employment");
	}

	const authUsers = await db.execute<{ id: string; email: string }>(
		sql`select id::text as id, lower(email) as email from auth.users`,
	);
	const authByEmail = new Map(
		authUsers.rows.map((row) => [row.email, row.id] as const),
	);

	await db
		.update(workplaces)
		.set({
			noticeWindowHours: 48,
			weekStartDay: 1,
			payPeriodType: "biweekly",
			payPeriodAnchor: "2026-08-17",
			earlyClockInMinutes: 15,
			clockRoundMinutes: 0,
			overtimeWeeklyMinutes: 2400,
			updatedAt: new Date(),
		})
		.where(eq(workplaces.id, workplace.id));

	await db
		.update(locations)
		.set({
			addressLine: "900 E 11th St, Austin, TX 78702",
			kioskPinHash: hashPin("2468"),
			geofenceRadiusMeters: 150,
			updatedAt: new Date(),
		})
		.where(eq(locations.id, location.id));

	await db
		.update(profiles)
		.set({
			fullName: "Pilot Manager",
			email: "manager.pilot@icmans.com",
			updatedAt: new Date(),
		})
		.where(eq(profiles.id, manager.profileId));

	const positionByName = new Map<string, string>();
	for (const def of POSITION_DEFS) {
		const [existing] = await db
			.select()
			.from(positions)
			.where(
				and(
					eq(positions.workplaceId, workplace.id),
					eq(positions.name, def.name),
				),
			)
			.limit(1);
		const row = await ensureNamed(
			existing,
			async () =>
				(
					await db
						.insert(positions)
						.values({ workplaceId: workplace.id, name: def.name })
						.returning()
				)[0],
			`position ${def.name}`,
		);
		positionByName.set(def.name, row.id);
	}

	const seededWorkers: SeededWorker[] = [];

	async function ensureWorker(input: {
		id: string;
		email: string;
		fullName: string;
		position: string;
		login: boolean;
		pin: string;
	}) {
		await db
			.insert(profiles)
			.values({
				id: input.id,
				email: input.email,
				fullName: input.fullName,
			})
			.onConflictDoUpdate({
				target: profiles.id,
				set: {
					email: input.email,
					fullName: input.fullName,
					updatedAt: new Date(),
				},
			});

		const [existingEmployment] = await db
			.select()
			.from(employments)
			.where(
				and(
					eq(employments.profileId, input.id),
					eq(employments.workplaceId, workplace.id),
				),
			)
			.limit(1);

		const employment =
			existingEmployment ??
			(
				await db
					.insert(employments)
					.values({
						workplaceId: workplace.id,
						profileId: input.id,
						kind: "worker",
					})
					.returning()
			)[0];
		if (!employment) throw new Error(`Could not employ ${input.email}`);

		const positionId = positionByName.get(input.position);
		if (!positionId) throw new Error(`Missing position ${input.position}`);
		await db
			.insert(employmentPositions)
			.values({ employmentId: employment.id, positionId })
			.onConflictDoNothing();
		await db
			.insert(employmentLocations)
			.values({ employmentId: employment.id, locationId: location.id })
			.onConflictDoNothing();
		await db
			.update(employments)
			.set({
				hourlyWageCents: WAGE_CENTS[input.position] ?? 1500,
				emergencyContactName: `${input.fullName.split(" ")[0]} Emergency`,
				emergencyContactPhone: "512-555-0147",
				kioskPinHash: hashPin(input.pin),
			})
			.where(eq(employments.id, employment.id));

		seededWorkers.push({
			employmentId: employment.id,
			profileId: input.id,
			fullName: input.fullName,
			email: input.email,
			position: input.position,
			login: input.login,
		});
	}

	await db
		.insert(employmentLocations)
		.values({ employmentId: manager.id, locationId: location.id })
		.onConflictDoNothing();

	let pin = 1010;
	for (const worker of REAL_WORKERS) {
		const id = authByEmail.get(worker.email);
		if (!id) {
			throw new Error(`Auth user missing for ${worker.email}`);
		}
		await ensureWorker({
			...worker,
			id,
			login: true,
			pin: String(pin++),
		});
	}

	for (const worker of SYNTHETIC_WORKERS) {
		const email = `seed.${slug(worker.fullName)}@jooling.demo`;
		const [existing] = await db
			.select()
			.from(profiles)
			.where(eq(profiles.email, email))
			.limit(1);
		await ensureWorker({
			id: existing?.id ?? crypto.randomUUID(),
			email,
			fullName: worker.fullName,
			position: worker.position,
			login: false,
			pin: String(pin++),
		});
	}

	if (seededWorkers.length !== 20) {
		throw new Error(`Expected 20 workers, seeded ${seededWorkers.length}`);
	}

	const workerByName = new Map(
		seededWorkers.map((row) => [row.fullName, row] as const),
	);
	const serverPositionId = positionByName.get("Server");
	if (!serverPositionId) throw new Error("Missing Server position");

	const settings = await seedSettings({
		workplaceId: workplace.id,
		locationId: location.id,
		workers: seededWorkers,
		positionByName,
	});

	await seedConstraints(seededWorkers, workerByName);

	const poolByPosition = new Map<string, { employmentId: string }[]>();
	for (const worker of seededWorkers) {
		const list = poolByPosition.get(worker.position) ?? [];
		list.push({ employmentId: worker.employmentId });
		poolByPosition.set(worker.position, list);
	}

	const timezone = location.timezone;
	let shiftCount = 0;
	let openCount = 0;
	const publishedWeeks: { scheduleId: string; weekStart: string }[] = [];

	for (const weekStart of WEEK_STARTS) {
		const [existingSchedule] = await db
			.select()
			.from(schedules)
			.where(
				and(
					eq(schedules.locationId, location.id),
					eq(schedules.weekStartDate, weekStart),
				),
			)
			.limit(1);

		const schedule =
			existingSchedule ??
			(
				await db
					.insert(schedules)
					.values({ locationId: location.id, weekStartDate: weekStart })
					.returning()
			)[0];
		if (!schedule) throw new Error(`Could not create week ${weekStart}`);

		await db.delete(shifts).where(eq(shifts.scheduleId, schedule.id));

		const weekRows: (typeof shifts.$inferInsert)[] = [];
		for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
			const day = shiftDays(weekStart, dayOffset);
			for (const meal of ["lunch", "dinner"] as const) {
				const used = new Set<string>();
				const window = meal === "lunch" ? LUNCH : DINNER;
				const counts = coverage(dayOffset, meal);
				for (const def of POSITION_DEFS) {
					const assigned = pickWorkers(
						poolByPosition.get(def.name) ?? [],
						counts[def.name] ?? 0,
						used,
						`${weekStart}:${day}:${meal}:${def.name}`,
					);
					const open = unassignedCount(dayOffset, meal, def.name);
					const people = [
						...assigned.map((employmentId) => employmentId as string | null),
						...Array.from({ length: open }, () => null),
					];
					openCount += open;
					const positionId = positionByName.get(def.name);
					if (!positionId) continue;
					for (const employmentId of people) {
						weekRows.push({
							scheduleId: schedule.id,
							employmentId,
							positionId,
							startsAt: wallToInstant(day, window.start, timezone),
							endsAt: wallToInstant(day, window.end, timezone),
							note:
								employmentId === null
									? "Open shift — pickup if you can cover"
									: null,
						});
					}
				}
			}
		}

		const inserted = await insertAndReturnShifts(weekRows);
		shiftCount += inserted.length;
		await tagAndTaskShifts(inserted, settings.tags, weekStart, timezone);
		await publishScheduleNow(schedule.id, manager.profileId);
		publishedWeeks.push({ scheduleId: schedule.id, weekStart });
		console.log(`Published ${weekStart} (${inserted.length} shifts)`);
	}

	await seedWeekTemplate(
		location.id,
		timezone,
		publishedWeeks[2]?.scheduleId,
		publishedWeeks[2]?.weekStart,
	);

	const ops = await seedOperationalData({
		workplaceId: workplace.id,
		locationId: location.id,
		timezone,
		manager,
		workers: seededWorkers,
		workerByName,
		leaveTypes: settings.leaveTypes,
		publishedWeeks,
		serverPositionId,
	});

	console.log(
		JSON.stringify(
			{
				workplace: workplace.name,
				location: location.name,
				timezone,
				manager: "manager.pilot@icmans.com",
				kiosk: { locationPin: "2468", workerPinsFrom: "1010" },
				workers: seededWorkers.length,
				loginWorkers: seededWorkers
					.filter((row) => row.login)
					.map((row) => ({
						email: row.email,
						name: row.fullName,
						position: row.position,
					})),
				weeks: WEEK_STARTS,
				shifts: shiftCount,
				openShifts: openCount,
				...ops,
			},
			null,
			2,
		),
	);
}

async function insertAndReturnShifts(weekRows: (typeof shifts.$inferInsert)[]) {
	const inserted: (typeof shifts.$inferSelect)[] = [];
	for (let i = 0; i < weekRows.length; i += 80) {
		const chunk = await db
			.insert(shifts)
			.values(weekRows.slice(i, i + 80))
			.returning();
		inserted.push(...chunk);
	}
	return inserted;
}

async function seedSettings(input: {
	workplaceId: string;
	locationId: string;
	workers: SeededWorker[];
	positionByName: Map<string, string>;
}) {
	const groupNames = ["Front of House", "Back of House"] as const;
	const groupByName = new Map<string, string>();
	for (const name of groupNames) {
		const [existing] = await db
			.select()
			.from(workerGroups)
			.where(
				and(
					eq(workerGroups.workplaceId, input.workplaceId),
					eq(workerGroups.name, name),
				),
			)
			.limit(1);
		const row = await ensureNamed(
			existing,
			async () =>
				(
					await db
						.insert(workerGroups)
						.values({ workplaceId: input.workplaceId, name })
						.returning()
				)[0],
			`group ${name}`,
		);
		groupByName.set(name, row.id);
	}
	for (const worker of input.workers) {
		const groupId = groupByName.get(
			FOH.has(worker.position) ? "Front of House" : "Back of House",
		);
		if (!groupId) continue;
		await db
			.insert(employmentGroups)
			.values({ employmentId: worker.employmentId, groupId })
			.onConflictDoNothing();
	}

	const tagNames = ["Opener", "Closer", "Training", "Event"] as const;
	const tags = new Map<string, string>();
	for (const name of tagNames) {
		const [existing] = await db
			.select()
			.from(shiftTags)
			.where(
				and(
					eq(shiftTags.workplaceId, input.workplaceId),
					eq(shiftTags.name, name),
				),
			)
			.limit(1);
		const row = await ensureNamed(
			existing,
			async () =>
				(
					await db
						.insert(shiftTags)
						.values({ workplaceId: input.workplaceId, name })
						.returning()
				)[0],
			`tag ${name}`,
		);
		tags.set(name, row.id);
	}

	const leaveDefs = [
		{ name: "Vacation", paid: true },
		{ name: "Sick", paid: true },
		{ name: "Unpaid", paid: false },
	] as const;
	const leaveTypeRows = new Map<string, string>();
	for (const def of leaveDefs) {
		const [existing] = await db
			.select()
			.from(leaveTypes)
			.where(
				and(
					eq(leaveTypes.workplaceId, input.workplaceId),
					eq(leaveTypes.name, def.name),
				),
			)
			.limit(1);
		const row = await ensureNamed(
			existing,
			async () =>
				(
					await db
						.insert(leaveTypes)
						.values({
							workplaceId: input.workplaceId,
							name: def.name,
							paid: def.paid,
						})
						.returning()
				)[0],
			`leave type ${def.name}`,
		);
		leaveTypeRows.set(def.name, row.id);
	}
	const vacationId = leaveTypeRows.get("Vacation");
	const sickId = leaveTypeRows.get("Sick");
	const unpaidId = leaveTypeRows.get("Unpaid");
	if (!vacationId || !sickId || !unpaidId) {
		throw new Error("Leave types were not created");
	}
	for (const worker of input.workers) {
		await db
			.insert(ptoBalances)
			.values([
				{
					employmentId: worker.employmentId,
					leaveTypeId: vacationId,
					minutes: 40 * 60,
				},
				{
					employmentId: worker.employmentId,
					leaveTypeId: sickId,
					minutes: 24 * 60,
				},
				{
					employmentId: worker.employmentId,
					leaveTypeId: unpaidId,
					minutes: 0,
				},
			])
			.onConflictDoUpdate({
				target: [ptoBalances.employmentId, ptoBalances.leaveTypeId],
				set: { minutes: sql`excluded.minutes` },
			});
	}

	const windows = [
		{ name: "Lunch", startMinute: LUNCH.start, endMinute: LUNCH.end },
		{ name: "Dinner", startMinute: DINNER.start, endMinute: DINNER.end },
	] as const;
	for (const window of windows) {
		const [block] = await db
			.select()
			.from(timeBlocks)
			.where(
				and(
					eq(timeBlocks.locationId, input.locationId),
					eq(timeBlocks.name, window.name),
				),
			)
			.limit(1);
		if (!block) {
			await db.insert(timeBlocks).values({
				locationId: input.locationId,
				...window,
			});
		}
		const [part] = await db
			.select()
			.from(dayParts)
			.where(
				and(
					eq(dayParts.locationId, input.locationId),
					eq(dayParts.name, window.name),
				),
			)
			.limit(1);
		if (!part) {
			await db.insert(dayParts).values({
				locationId: input.locationId,
				...window,
			});
		}
	}

	const templateDefs = [
		{
			name: "Lunch Server",
			position: "Server",
			startMinute: LUNCH.start,
			endMinute: LUNCH.end,
		},
		{
			name: "Dinner Server",
			position: "Server",
			startMinute: DINNER.start,
			endMinute: DINNER.end,
		},
		{
			name: "Lunch Line Cook",
			position: "Line Cook",
			startMinute: LUNCH.start,
			endMinute: LUNCH.end,
		},
		{
			name: "Dinner Bartender",
			position: "Bartender",
			startMinute: DINNER.start,
			endMinute: DINNER.end,
		},
	] as const;
	for (const def of templateDefs) {
		const positionId = input.positionByName.get(def.position);
		if (!positionId) continue;
		const [existing] = await db
			.select()
			.from(shiftTemplates)
			.where(
				and(
					eq(shiftTemplates.locationId, input.locationId),
					eq(shiftTemplates.name, def.name),
				),
			)
			.limit(1);
		if (existing) continue;
		await db.insert(shiftTemplates).values({
			locationId: input.locationId,
			name: def.name,
			positionId,
			startMinute: def.startMinute,
			endMinute: def.endMinute,
		});
	}

	return { tags, leaveTypes: leaveTypeRows };
}

async function seedConstraints(
	workers: SeededWorker[],
	workerByName: Map<string, SeededWorker>,
) {
	const ids = workers.map((row) => row.employmentId);
	await db
		.delete(unavailability)
		.where(inArray(unavailability.employmentId, ids));
	await db
		.delete(workPreferences)
		.where(inArray(workPreferences.employmentId, ids));

	const alex = workerByName.get("Alex Rivera");
	const jordan = workerByName.get("Jordan Chen");
	const maya = workerByName.get("Maya Thompson");
	const aisha = workerByName.get("Aisha Rahman");
	if (alex) {
		await db.insert(unavailability).values({
			employmentId: alex.employmentId,
			kind: "recurring",
			weekday: 0,
			startMinute: 0,
			endMinute: 24 * 60,
			note: "Sunday class",
		});
		await db.insert(workPreferences).values({
			employmentId: alex.employmentId,
			note: "Prefers dinner shifts",
		});
	}
	if (jordan) {
		await db.insert(unavailability).values({
			employmentId: jordan.employmentId,
			kind: "recurring",
			weekday: 1,
			startMinute: DINNER.start,
			endMinute: DINNER.end,
			note: "Monday night class",
		});
	}
	if (maya) {
		await db.insert(unavailability).values({
			employmentId: maya.employmentId,
			kind: "date",
			specificDate: "2026-09-16",
			startMinute: 0,
			endMinute: 24 * 60,
			note: "Family appointment",
		});
		await db.insert(workPreferences).values({
			employmentId: maya.employmentId,
			note: "Happy to close on weekends",
		});
	}
	if (aisha) {
		await db.insert(workPreferences).values({
			employmentId: aisha.employmentId,
			note: "Prefers not to work both weekend nights",
		});
	}
}

async function tagAndTaskShifts(
	weekShifts: (typeof shifts.$inferSelect)[],
	tags: Map<string, string>,
	weekStart: string,
	timezone: string,
) {
	const opener = tags.get("Opener");
	const closer = tags.get("Closer");
	const training = tags.get("Training");
	const event = tags.get("Event");
	const assignments: { shiftId: string; tagId: string }[] = [];
	const tasks: { shiftId: string; title: string; sortOrder: number }[] = [];

	for (const shift of weekShifts) {
		const info = zonedDayInfo(shift.startsAt, timezone);
		const offset = daysBetween(weekStart, info.dateKey);
		const dinner = info.minuteOfDay >= DINNER.start;
		if (opener && !dinner && offset === 0) {
			assignments.push({ shiftId: shift.id, tagId: opener });
		}
		if (closer && dinner && offset === 6) {
			assignments.push({ shiftId: shift.id, tagId: closer });
		}
		if (event && dinner && offset >= 5) {
			assignments.push({ shiftId: shift.id, tagId: event });
		}
		if (training && shift.note === null && offset === 2 && !dinner) {
			assignments.push({ shiftId: shift.id, tagId: training });
		}
		if (dinner && shift.employmentId) {
			tasks.push(
				{ shiftId: shift.id, title: "Sidework", sortOrder: 0 },
				{ shiftId: shift.id, title: "Restock", sortOrder: 1 },
			);
		}
	}

	if (assignments.length > 0) {
		await insertChunks(assignments, 100, (chunk) =>
			db.insert(shiftTagAssignments).values(chunk).onConflictDoNothing(),
		);
	}
	if (tasks.length > 0) {
		await insertChunks(tasks, 100, (chunk) =>
			db.insert(shiftTasks).values(chunk),
		);
	}
}

async function seedWeekTemplate(
	locationId: string,
	timezone: string,
	scheduleId: string | undefined,
	weekStart: string | undefined,
) {
	if (!scheduleId || !weekStart) return;
	const [existing] = await db
		.select()
		.from(scheduleTemplates)
		.where(
			and(
				eq(scheduleTemplates.locationId, locationId),
				eq(scheduleTemplates.name, "Typical service week"),
			),
		)
		.limit(1);
	if (existing) return;
	const draftShifts = await db
		.select()
		.from(shifts)
		.where(eq(shifts.scheduleId, scheduleId));
	if (draftShifts.length === 0) return;
	const [template] = await db
		.insert(scheduleTemplates)
		.values({ locationId, name: "Typical service week" })
		.returning();
	if (!template) return;
	await insertChunks(
		draftShifts.map((shift) => {
			const startInfo = zonedDayInfo(shift.startsAt, timezone);
			const endInfo = zonedDayInfo(shift.endsAt, timezone);
			return {
				templateId: template.id,
				employmentId: shift.employmentId,
				positionId: shift.positionId,
				weekdayOffset: daysBetween(weekStart, startInfo.dateKey),
				startMinute: startInfo.minuteOfDay,
				endMinute: endInfo.minuteOfDay,
				overnight: startInfo.dateKey !== endInfo.dateKey,
				note: shift.note,
			};
		}),
		80,
		(chunk) => db.insert(templateShifts).values(chunk),
	);
}

async function seedOperationalData(input: {
	workplaceId: string;
	locationId: string;
	timezone: string;
	manager: { id: string; profileId: string };
	workers: SeededWorker[];
	workerByName: Map<string, SeededWorker>;
	leaveTypes: Map<string, string>;
	publishedWeeks: { scheduleId: string; weekStart: string }[];
	serverPositionId: string;
}) {
	const now = new Date();
	const scheduleIds = input.publishedWeeks.map((row) => row.scheduleId);
	const versions = await db
		.select()
		.from(scheduleVersions)
		.where(inArray(scheduleVersions.scheduleId, scheduleIds));
	const versionIds = versions.map((row) => row.id);
	const allVersionShifts =
		versionIds.length === 0
			? []
			: await db
					.select()
					.from(versionShifts)
					.where(inArray(versionShifts.versionId, versionIds));
	const latestBySchedule = new Map<string, (typeof versions)[number]>();
	for (const version of versions) {
		const current = latestBySchedule.get(version.scheduleId);
		if (!current || version.versionNumber > current.versionNumber) {
			latestBySchedule.set(version.scheduleId, version);
		}
	}
	const latestVersionIds = new Set(
		[...latestBySchedule.values()].map((row) => row.id),
	);
	const latestShifts = allVersionShifts.filter((row) =>
		latestVersionIds.has(row.versionId),
	);
	const allVersionShiftIds = allVersionShifts.map((row) => row.id);
	if (allVersionShiftIds.length > 0) {
		await db
			.delete(timeEntries)
			.where(inArray(timeEntries.versionShiftId, allVersionShiftIds));
		await db
			.delete(attendanceMarks)
			.where(inArray(attendanceMarks.versionShiftId, allVersionShiftIds));
		await db
			.delete(shiftReleases)
			.where(inArray(shiftReleases.versionShiftId, allVersionShiftIds));
		await db
			.delete(shiftSwaps)
			.where(
				or(
					inArray(shiftSwaps.requesterShiftId, allVersionShiftIds),
					inArray(shiftSwaps.counterpartShiftId, allVersionShiftIds),
				),
			);
		await db
			.delete(shiftTaskCompletions)
			.where(inArray(shiftTaskCompletions.versionShiftId, allVersionShiftIds));
	}

	const assignedPast = latestShifts.filter(
		(row) => row.employmentId && row.endsAt.getTime() < now.getTime(),
	);
	const running = latestShifts.filter(
		(row) =>
			row.employmentId &&
			row.startsAt.getTime() <= now.getTime() &&
			row.endsAt.getTime() > now.getTime(),
	);
	const noShow = assignedPast.at(3);
	const sick = assignedPast.at(7);
	const skipTime = new Set(
		[noShow?.id, sick?.id].filter((id): id is string => Boolean(id)),
	);

	let timeEntryCount = 0;
	let approvedCount = 0;
	for (const [index, shift] of assignedPast.entries()) {
		if (!shift.employmentId || skipTime.has(shift.id)) continue;
		const late = index % 6 === 0;
		const clockedInAt = new Date(
			shift.startsAt.getTime() + (late ? 12 * 60_000 : 2 * 60_000),
		);
		const clockedOutAt = new Date(
			shift.endsAt.getTime() + (index % 8 === 0 ? 18 * 60_000 : 0),
		);
		const approved = shift.endsAt.getTime() < now.getTime() - 3 * 86_400_000;
		const [entry] = await db
			.insert(timeEntries)
			.values({
				versionShiftId: shift.id,
				employmentId: shift.employmentId,
				clockedInAt,
				clockedOutAt,
				approvalStatus: approved ? "approved" : "pending",
				approvedAt: approved ? clockedOutAt : null,
				approvedByProfileId: approved ? input.manager.profileId : null,
			})
			.returning();
		if (!entry) continue;
		timeEntryCount += 1;
		if (approved) approvedCount += 1;
		const dinner =
			zonedDayInfo(shift.startsAt, input.timezone).minuteOfDay >= DINNER.start;
		if (dinner) {
			const mid = new Date(
				(clockedInAt.getTime() + clockedOutAt.getTime()) / 2,
			);
			await db.insert(timeEntryBreaks).values({
				timeEntryId: entry.id,
				startedAt: mid,
				endedAt: new Date(mid.getTime() + 30 * 60_000),
			});
		}
		if (late) {
			await db.insert(attendanceMarks).values({
				versionShiftId: shift.id,
				kind: "late",
				markedByProfileId: input.manager.profileId,
				note: "Ran 12 minutes behind the door",
			});
		}
	}
	for (const shift of running.slice(0, 1)) {
		if (!shift.employmentId) continue;
		await db.insert(timeEntries).values({
			versionShiftId: shift.id,
			employmentId: shift.employmentId,
			clockedInAt: shift.startsAt,
			clockedOutAt: null,
			approvalStatus: "pending",
		});
		timeEntryCount += 1;
	}
	if (noShow) {
		await db.insert(attendanceMarks).values({
			versionShiftId: noShow.id,
			kind: "no_show",
			markedByProfileId: input.manager.profileId,
			note: "Did not arrive; floor covered short",
		});
	}
	if (sick) {
		await db.insert(attendanceMarks).values({
			versionShiftId: sick.id,
			kind: "sick",
			markedByProfileId: input.manager.profileId,
			note: "Sent home after clock-in window",
		});
	}

	const pastShiftIds = assignedPast
		.map((row) => row.shiftId)
		.filter((id): id is string => Boolean(id));
	const pastDinnerTasks =
		pastShiftIds.length === 0
			? []
			: await db
					.select()
					.from(shiftTasks)
					.where(inArray(shiftTasks.shiftId, pastShiftIds));
	const completions = pastDinnerTasks.flatMap((task) => {
		const versionShift = assignedPast.find(
			(row) => row.shiftId === task.shiftId,
		);
		if (!versionShift?.employmentId) return [];
		const worker = input.workers.find(
			(row) => row.employmentId === versionShift.employmentId,
		);
		return [
			{
				taskId: task.id,
				versionShiftId: versionShift.id,
				completedByProfileId: worker?.profileId ?? input.manager.profileId,
			},
		];
	});
	if (completions.length > 0) {
		await insertChunks(completions.slice(0, 80), 80, (chunk) =>
			db.insert(shiftTaskCompletions).values(chunk).onConflictDoNothing(),
		);
	}

	const workerIds = input.workers.map((row) => row.employmentId);
	await db
		.delete(timeOffRequests)
		.where(inArray(timeOffRequests.employmentId, workerIds));
	const alex = input.workerByName.get("Alex Rivera");
	const jordan = input.workerByName.get("Jordan Chen");
	const sam = input.workerByName.get("Sam Patel");
	const priya = input.workerByName.get("Priya Shah");
	const vacationId = input.leaveTypes.get("Vacation");
	const sickId = input.leaveTypes.get("Sick");
	const unpaidId = input.leaveTypes.get("Unpaid");
	if (alex && vacationId) {
		await db.insert(timeOffRequests).values({
			employmentId: alex.employmentId,
			leaveTypeId: vacationId,
			startsAt: wallToInstant("2026-09-14", 0, input.timezone),
			endsAt: wallToInstant("2026-09-16", 24 * 60, input.timezone),
			reason: "Family visiting from out of town",
			status: "pending",
		});
	}
	if (jordan && sickId) {
		await db.insert(timeOffRequests).values({
			employmentId: jordan.employmentId,
			leaveTypeId: sickId,
			startsAt: wallToInstant("2026-09-03", 0, input.timezone),
			endsAt: wallToInstant("2026-09-03", 24 * 60, input.timezone),
			reason: "Fever",
			status: "approved",
			decidedBy: input.manager.profileId,
			decidedAt: new Date(),
		});
	}
	if (sam && unpaidId) {
		await db.insert(timeOffRequests).values({
			employmentId: sam.employmentId,
			leaveTypeId: unpaidId,
			startsAt: wallToInstant("2026-09-10", 0, input.timezone),
			endsAt: wallToInstant("2026-09-10", 24 * 60, input.timezone),
			reason: "Personal day",
			status: "declined",
			decidedBy: input.manager.profileId,
			decisionReason: "Thursday dinner is already short on bartenders",
			decidedAt: new Date(),
		});
	}
	if (priya && vacationId) {
		await db.insert(timeOffRequests).values({
			employmentId: priya.employmentId,
			leaveTypeId: vacationId,
			startsAt: wallToInstant("2026-09-26", 0, input.timezone),
			endsAt: wallToInstant("2026-09-27", 24 * 60, input.timezone),
			reason: "Weekend trip",
			status: "pending",
		});
	}

	const futureAssigned = latestShifts
		.filter(
			(row) =>
				row.employmentId &&
				row.startsAt.getTime() > now.getTime() + 12 * 60 * 60 * 1000,
		)
		.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
	const releaseShift = futureAssigned.find(
		(row) => row.employmentId === alex?.employmentId,
	);
	if (releaseShift?.employmentId) {
		await db.insert(shiftReleases).values({
			versionShiftId: releaseShift.id,
			requestedBy: releaseShift.employmentId,
			reason: "Need coverage for a class",
			status: "pending",
		});
	}
	const [openShift] = await db
		.select()
		.from(openShifts)
		.where(
			and(
				eq(openShifts.locationId, input.locationId),
				eq(openShifts.status, "open"),
			),
		)
		.limit(1);
	const pickupWorker = input.workers.find(
		(row) =>
			row.position === "Server" && row.employmentId !== alex?.employmentId,
	);
	if (openShift && pickupWorker) {
		await db
			.insert(shiftPickups)
			.values({
				openShiftId: openShift.id,
				requestedBy: pickupWorker.employmentId,
				status: "pending",
			})
			.onConflictDoNothing();
	}
	const serverFuture = futureAssigned.filter(
		(row) => row.positionId === input.serverPositionId,
	);
	const requesterShift = serverFuture[0];
	const counterpartShift = serverFuture.find(
		(row) =>
			row.employmentId &&
			row.employmentId !== requesterShift?.employmentId &&
			Math.abs(
				row.startsAt.getTime() - (requesterShift?.startsAt.getTime() ?? 0),
			) <
				8 * 60 * 60 * 1000,
	);
	if (
		requesterShift?.employmentId &&
		counterpartShift?.employmentId &&
		requesterShift.id !== counterpartShift.id
	) {
		await db.insert(shiftSwaps).values({
			requesterEmploymentId: requesterShift.employmentId,
			requesterShiftId: requesterShift.id,
			counterpartEmploymentId: counterpartShift.employmentId,
			counterpartShiftId: counterpartShift.id,
			status: "pending_manager",
			respondedAt: new Date(),
		});
	}

	const announcementDefs = [
		{
			title: "Labor Day hours",
			body: "We are open 11–8 on Labor Day. Dinner coverage is thinner than a normal Monday — pickup an open shift if you can.",
		},
		{
			title: "New fall menu tasting",
			body: "Tasting is Wednesday at 3:00 PM in the dining room. Servers and bartenders should attend if they are not on lunch.",
		},
		{
			title: "Uniform reminder",
			body: "Black shoes, no athletic sneakers. Extra aprons are in the office if yours went missing over the weekend.",
		},
	] as const;
	let announcementCount = 0;
	for (const def of announcementDefs) {
		const [existing] = await db
			.select()
			.from(announcements)
			.where(
				and(
					eq(announcements.workplaceId, input.workplaceId),
					eq(announcements.title, def.title),
				),
			)
			.limit(1);
		if (existing) {
			announcementCount += 1;
			continue;
		}
		await db.insert(announcements).values({
			workplaceId: input.workplaceId,
			authorProfileId: input.manager.profileId,
			title: def.title,
			body: def.body,
		});
		announcementCount += 1;
	}

	const [workplaceThread] = await db
		.select()
		.from(conversations)
		.where(
			and(
				eq(conversations.workplaceId, input.workplaceId),
				eq(conversations.kind, "workplace"),
			),
		)
		.limit(1);
	const thread =
		workplaceThread ??
		(
			await db
				.insert(conversations)
				.values({ workplaceId: input.workplaceId, kind: "workplace" })
				.returning()
		)[0];
	if (thread) {
		const existingMessages = await db
			.select({ id: workplaceMessages.id })
			.from(workplaceMessages)
			.where(eq(workplaceMessages.conversationId, thread.id))
			.limit(1);
		if (existingMessages.length === 0 && alex) {
			await db.insert(workplaceMessages).values([
				{
					conversationId: thread.id,
					authorEmploymentId: input.manager.id,
					body: "Dinner Friday is going to be heavy. If you can pick up an open server shift, please do.",
				},
				{
					conversationId: thread.id,
					authorEmploymentId: alex.employmentId,
					body: "I can take Friday dinner if someone covers my Sunday lunch.",
				},
			]);
		}
		if (alex) {
			const [existingDirect] = await db
				.select({ conversationId: conversationMembers.conversationId })
				.from(conversationMembers)
				.innerJoin(
					conversations,
					eq(conversations.id, conversationMembers.conversationId),
				)
				.where(
					and(
						eq(conversations.workplaceId, input.workplaceId),
						eq(conversations.kind, "direct"),
						eq(conversationMembers.employmentId, alex.employmentId),
					),
				)
				.limit(1);
			let directId = existingDirect?.conversationId;
			if (!directId) {
				const [direct] = await db
					.insert(conversations)
					.values({ workplaceId: input.workplaceId, kind: "direct" })
					.returning();
				if (direct) {
					directId = direct.id;
					await db.insert(conversationMembers).values([
						{ conversationId: direct.id, employmentId: input.manager.id },
						{ conversationId: direct.id, employmentId: alex.employmentId },
					]);
				}
			}
			if (directId) {
				const existingDirectMessages = await db
					.select({ id: workplaceMessages.id })
					.from(workplaceMessages)
					.where(eq(workplaceMessages.conversationId, directId))
					.limit(1);
				if (existingDirectMessages.length === 0) {
					await db.insert(workplaceMessages).values([
						{
							conversationId: directId,
							authorEmploymentId: input.manager.id,
							body: "Can you close Friday if we keep Sunday lunch open for you?",
						},
						{
							conversationId: directId,
							authorEmploymentId: alex.employmentId,
							body: "Yes — I’ll take Friday dinner.",
						},
					]);
				}
			}
		}
	}

	for (const week of input.publishedWeeks) {
		for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
			const day = shiftDays(week.weekStart, dayOffset);
			const weekend = dayOffset >= 5;
			const amountCents = (weekend ? 8200 : 5400) * 100 + dayOffset * 17_500;
			await db
				.insert(locationSales)
				.values({
					locationId: input.locationId,
					saleDate: day,
					amountCents,
				})
				.onConflictDoUpdate({
					target: [locationSales.locationId, locationSales.saleDate],
					set: { amountCents, updatedAt: new Date() },
				});
		}
	}

	await db
		.insert(invitations)
		.values({
			workplaceId: input.workplaceId,
			email: "taylor.reed.pilot@mailinator.com",
			kind: "worker",
			invitedBy: input.manager.profileId,
			expiresAt: new Date(now.getTime() + 14 * 86_400_000),
		})
		.onConflictDoNothing();

	const documentWorker = input.workers[0];
	if (documentWorker) {
		const existingDocs = await db
			.select({ id: employmentDocuments.id })
			.from(employmentDocuments)
			.where(eq(employmentDocuments.employmentId, documentWorker.employmentId))
			.limit(1);
		if (existingDocs.length === 0) {
			await db.insert(employmentDocuments).values([
				{
					employmentId: documentWorker.employmentId,
					title: "Food Handler Card",
					note: "Expires March 2027",
				},
				{
					employmentId: documentWorker.employmentId,
					title: "I-9 on file",
					note: "Completed at hire",
				},
			]);
		}
	}

	const currentWeek = input.publishedWeeks.find(
		(row) => row.weekStart === "2026-08-31",
	);
	const currentVersion = currentWeek
		? latestBySchedule.get(currentWeek.scheduleId)
		: undefined;
	if (currentVersion) {
		const loginIds = input.workers
			.filter((row) => row.login)
			.map((row) => row.employmentId);
		if (loginIds.length > 0) {
			await db
				.update(workerDeliveries)
				.set({
					status: "acknowledged",
					deliveredAt: now,
					acknowledgedAt: now,
				})
				.where(
					and(
						eq(workerDeliveries.versionId, currentVersion.id),
						inArray(workerDeliveries.employmentId, loginIds),
					),
				);
		}
		const pendingAcceptances = await db
			.select()
			.from(shiftAcceptances)
			.where(
				and(
					eq(shiftAcceptances.versionId, currentVersion.id),
					eq(shiftAcceptances.status, "pending"),
				),
			);
		for (const [index, row] of pendingAcceptances.entries()) {
			if (index === 0) continue;
			await db
				.update(shiftAcceptances)
				.set({ status: "accepted", respondedAt: now })
				.where(eq(shiftAcceptances.id, row.id));
		}
	}

	await db
		.delete(notifications)
		.where(
			and(
				eq(notifications.employmentId, input.manager.id),
				inArray(notifications.kind, [
					"time_off_request",
					"coverage_request",
					"swap_request",
				]),
			),
		);
	await db.insert(notifications).values([
		{
			employmentId: input.manager.id,
			kind: "time_off_request",
			title: "Time off needs a decision",
			body: "Alex Rivera requested vacation for the week of Sep 14.",
		},
		{
			employmentId: input.manager.id,
			kind: "coverage_request",
			title: "Coverage is waiting",
			body: "A shift release and an open-shift pickup need a manager decision.",
		},
		{
			employmentId: input.manager.id,
			kind: "swap_request",
			title: "A swap is ready for you",
			body: "Two servers agreed to a swap. Approve or decline it on Coverage.",
		},
	]);
	await writeAudit({
		workplaceId: input.workplaceId,
		actorProfileId: input.manager.profileId,
		action: "seed.demo",
		entityType: "workplace",
		entityId: input.workplaceId,
		summary:
			"Seeded production demo data across schedule, coverage, and payroll surfaces",
	});

	return {
		timeEntries: timeEntryCount,
		approvedTimesheets: approvedCount,
		announcements: announcementCount,
		pendingTimeOff: 2,
		openShiftPickups: openShift ? 1 : 0,
	};
}

try {
	await main();
} finally {
	await db.$client.end();
}
