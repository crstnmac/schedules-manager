import { and, eq, sql } from "drizzle-orm";
import {
	db,
	employmentPositions,
	employments,
	locations,
	positions,
	profiles,
	schedules,
	shifts,
	workplaces,
} from "@SchedulesManager/db";

import { publishScheduleNow } from "../src/routes/publication";
import { shiftDays, wallToInstant } from "../src/time";

const WEEK_STARTS = [
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

async function main() {
	const [workplace] = await db
		.select()
		.from(workplaces)
		.where(eq(workplaces.name, "Pilot Restaurant"))
		.limit(1);
	if (!workplace) {
		throw new Error("Pilot Restaurant is missing. Sign in as the manager first.");
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
		.where(eq(employments.workplaceId, workplace.id))
		.limit(1);
	if (!manager || manager.kind !== "manager") {
		throw new Error("Pilot Restaurant has no manager employment");
	}

	const authUsers = await db.execute<{ id: string; email: string }>(
		sql`select id::text as id, lower(email) as email from auth.users`,
	);
	const authByEmail = new Map(
		authUsers.rows.map((row) => [row.email, row.id] as const),
	);

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
		if (existing) {
			positionByName.set(def.name, existing.id);
			continue;
		}
		const [created] = await db
			.insert(positions)
			.values({
				workplaceId: workplace.id,
				name: def.name,
			})
			.returning();
		if (!created) throw new Error(`Could not create position ${def.name}`);
		positionByName.set(def.name, created.id);
	}

	type SeededWorker = {
		employmentId: string;
		fullName: string;
		email: string;
		position: string;
		login: boolean;
	};
	const seededWorkers: SeededWorker[] = [];

	async function ensureWorker(input: {
		id: string;
		email: string;
		fullName: string;
		position: string;
		login: boolean;
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

		seededWorkers.push({
			employmentId: employment.id,
			fullName: input.fullName,
			email: input.email,
			position: input.position,
			login: input.login,
		});
	}

	for (const worker of REAL_WORKERS) {
		const id = authByEmail.get(worker.email);
		if (!id) {
			throw new Error(`Auth user missing for ${worker.email}`);
		}
		await ensureWorker({ ...worker, id, login: true });
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
		});
	}

	if (seededWorkers.length !== 20) {
		throw new Error(`Expected 20 workers, seeded ${seededWorkers.length}`);
	}

	const poolByPosition = new Map<string, { employmentId: string }[]>();
	for (const worker of seededWorkers) {
		const list = poolByPosition.get(worker.position) ?? [];
		list.push({ employmentId: worker.employmentId });
		poolByPosition.set(worker.position, list);
	}

	const timezone = location.timezone;
	let shiftCount = 0;
	let openCount = 0;

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

		await insertChunks(weekRows, 80, (chunk) => db.insert(shifts).values(chunk));
		shiftCount += weekRows.length;
		await publishScheduleNow(schedule.id, manager.profileId);
		console.log(`Published ${weekStart} (${weekRows.length} shifts)`);
	}

	console.log(
		JSON.stringify(
			{
				workplace: workplace.name,
				location: location.name,
				timezone,
				manager: "manager.pilot@icmans.com",
				workers: seededWorkers.length,
				loginWorkers: seededWorkers.filter((row) => row.login).map((row) => ({
					email: row.email,
					name: row.fullName,
					position: row.position,
				})),
				weeks: WEEK_STARTS,
				shifts: shiftCount,
				openShifts: openCount,
			},
			null,
			2,
		),
	);
}

try {
	await main();
} finally {
	await db.$client.end();
}
