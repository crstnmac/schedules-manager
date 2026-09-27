/**
 * Creates (or refreshes) the Google Play reviewer account.
 *
 * The reviewer signs in with email + password and lands as the full-access
 * Manager of a dedicated demo Workplace on the Operations plan, with a few
 * synthetic Workers and published Schedules for this week and next. The
 * reviewer is also scheduled on shifts so the Worker views (My schedule,
 * timecard, swaps) have data.
 *
 * Usage (from apps/server, with DATABASE_URL pointing at the target db):
 *   PLAY_REVIEWER_PASSWORD='…' bun scripts/create-play-reviewer.ts [email]
 *
 * Without PLAY_REVIEWER_PASSWORD a random password is generated and printed
 * once. Re-running resets the password and tops up missing access, but never
 * duplicates demo data.
 */
import {
	account,
	db,
	employmentLocations,
	employmentPositions,
	employments,
	locations,
	positions,
	profiles,
	schedules,
	shifts,
	user,
	workplaceSubscriptions,
	workplaces,
} from "@SchedulesManager/db";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import { hashPin } from "../src/pin";
import { publishScheduleNow } from "../src/routes/publication";
import { shiftDays, wallToInstant, zonedDayInfo } from "../src/time";

const EMAIL = (
	process.argv[2] ??
	process.env.PLAY_REVIEWER_EMAIL ??
	"play.reviewer@jooling.com"
).toLowerCase();
const FULL_NAME = "Play Reviewer";
const WORKPLACE_NAME = "jooling Play Review";
const TIMEZONE = "America/Chicago";
const REVIEW_SUBSCRIPTION_ID = "play-review-comp";

const POSITION_NAMES = ["Server", "Host", "Line Cook"] as const;

const DEMO_WORKERS = [
	{ fullName: "Priya Shah", position: "Server" },
	{ fullName: "Luis Ortega", position: "Server" },
	{ fullName: "Maya Thompson", position: "Host" },
	{ fullName: "Ben Walsh", position: "Line Cook" },
	{ fullName: "Sofia Alvarez", position: "Line Cook" },
] as const;

const LUNCH = { start: 11 * 60, end: 15 * 60 };
const DINNER = { start: 16 * 60 + 30, end: 22 * 60 };

function generatePassword() {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	return Buffer.from(bytes).toString("base64url");
}

function slug(name: string) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
}

/** Monday of the current week in the Location's time zone. */
function currentWeekStart(timeZone: string) {
	const today = zonedDayInfo(new Date(), timeZone);
	return shiftDays(today.dateKey, -((today.weekday + 6) % 7));
}

async function ensureUser(password: string) {
	const passwordHash = await hashPassword(password);
	const [existing] = await db
		.select()
		.from(user)
		.where(eq(user.email, EMAIL))
		.limit(1);

	const authUser =
		existing ??
		(
			await db
				.insert(user)
				.values({ name: FULL_NAME, email: EMAIL, emailVerified: true })
				.returning()
		)[0];
	if (!authUser) throw new Error(`Could not create ${EMAIL}`);

	await db
		.update(user)
		.set({ emailVerified: true, updatedAt: new Date() })
		.where(eq(user.id, authUser.id));

	const [credential] = await db
		.select()
		.from(account)
		.where(
			and(
				eq(account.userId, authUser.id),
				eq(account.providerId, "credential"),
			),
		)
		.limit(1);
	if (credential) {
		await db
			.update(account)
			.set({ password: passwordHash, updatedAt: new Date() })
			.where(eq(account.id, credential.id));
	} else {
		await db.insert(account).values({
			userId: authUser.id,
			accountId: authUser.id,
			providerId: "credential",
			password: passwordHash,
		});
	}

	// Mirrors the better-auth user.create hook in src/auth.ts.
	await db
		.insert(profiles)
		.values({ id: authUser.id, email: EMAIL, fullName: FULL_NAME })
		.onConflictDoNothing();

	return { userId: authUser.id, created: !existing };
}

async function ensureWorkplace(profileId: string) {
	const [existing] = await db
		.select({ workplace: workplaces, employment: employments })
		.from(employments)
		.innerJoin(workplaces, eq(workplaces.id, employments.workplaceId))
		.where(
			and(
				eq(employments.profileId, profileId),
				eq(workplaces.name, WORKPLACE_NAME),
			),
		)
		.limit(1);
	if (existing) {
		// A Manager with no explicit privileges has full access.
		await db
			.update(employments)
			.set({ kind: "manager", privileges: null })
			.where(eq(employments.id, existing.employment.id));
		return { workplace: existing.workplace, created: false };
	}

	return db.transaction(async (tx) => {
		const [workplace] = await tx
			.insert(workplaces)
			.values({ name: WORKPLACE_NAME })
			.returning();
		if (!workplace) throw new Error("Could not create the review Workplace");

		await tx.insert(employments).values({
			workplaceId: workplace.id,
			profileId,
			kind: "manager",
			hourlyWageCents: 2000,
		});
		await tx.insert(locations).values({
			workplaceId: workplace.id,
			name: "Downtown",
			timezone: TIMEZONE,
			addressLine: "900 E 11th St, Austin, TX 78702",
		});
		for (const name of POSITION_NAMES) {
			await tx.insert(positions).values({ workplaceId: workplace.id, name });
		}
		return { workplace, created: true };
	});
}

/**
 * The Operations plan unlocks every capability. The row is not backed by a
 * Polar subscription, so seat changes and the billing portal are unavailable
 * in this Workplace.
 */
async function ensureSubscription(workplaceId: string) {
	await db
		.insert(workplaceSubscriptions)
		.values({
			workplaceId,
			polarSubscriptionId: `${REVIEW_SUBSCRIPTION_ID}-${workplaceId}`,
			polarCustomerId: REVIEW_SUBSCRIPTION_ID,
			polarProductId: REVIEW_SUBSCRIPTION_ID,
			plan: "operations",
			billingInterval: "month",
			status: "active",
			locationCount: 1,
			currentPeriodEnd: new Date("2099-12-31T00:00:00Z"),
		})
		.onConflictDoUpdate({
			target: workplaceSubscriptions.workplaceId,
			set: {
				plan: "operations",
				status: "active",
				cancelAtPeriodEnd: false,
				currentPeriodEnd: new Date("2099-12-31T00:00:00Z"),
				updatedAt: new Date(),
			},
		});
}

async function seedDemoData(workplaceId: string, reviewerProfileId: string) {
	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.workplaceId, workplaceId))
		.limit(1);
	if (!location) throw new Error("The review Workplace has no Location");

	const positionRows = await db
		.select()
		.from(positions)
		.where(eq(positions.workplaceId, workplaceId));
	const positionId = (name: string) => {
		const row = positionRows.find((position) => position.name === name);
		if (!row) throw new Error(`Missing position ${name}`);
		return row.id;
	};

	const [reviewer] = await db
		.select()
		.from(employments)
		.where(
			and(
				eq(employments.workplaceId, workplaceId),
				eq(employments.profileId, reviewerProfileId),
			),
		)
		.limit(1);
	if (!reviewer) throw new Error("Reviewer has no Employment");

	const staff = [{ employmentId: reviewer.id, position: "Server" }];
	await db
		.insert(employmentPositions)
		.values({ employmentId: reviewer.id, positionId: positionId("Server") })
		.onConflictDoNothing();
	await db
		.insert(employmentLocations)
		.values({ employmentId: reviewer.id, locationId: location.id })
		.onConflictDoNothing();

	let pin = 1010;
	for (const worker of DEMO_WORKERS) {
		const profileId = crypto.randomUUID();
		await db.insert(profiles).values({
			id: profileId,
			email: `review.${slug(worker.fullName)}@jooling.demo`,
			fullName: worker.fullName,
		});
		const [employment] = await db
			.insert(employments)
			.values({
				workplaceId,
				profileId,
				kind: "worker",
				hourlyWageCents: 1600,
				kioskPinHash: await hashPin(String(pin++)),
			})
			.returning();
		if (!employment) throw new Error(`Could not employ ${worker.fullName}`);
		await db.insert(employmentPositions).values({
			employmentId: employment.id,
			positionId: positionId(worker.position),
		});
		await db
			.insert(employmentLocations)
			.values({ employmentId: employment.id, locationId: location.id });
		staff.push({ employmentId: employment.id, position: worker.position });
	}

	const thisWeek = currentWeekStart(location.timezone);
	for (const weekStart of [thisWeek, shiftDays(thisWeek, 7)]) {
		const [schedule] = await db
			.insert(schedules)
			.values({ locationId: location.id, weekStartDate: weekStart })
			.returning();
		if (!schedule) throw new Error(`Could not create week ${weekStart}`);

		const rows: (typeof shifts.$inferInsert)[] = [];
		for (let day = 0; day < 7; day++) {
			const dateKey = shiftDays(weekStart, day);
			staff.forEach((member, index) => {
				// Everyone works five days; lunch and dinner alternate by person.
				if ((day + index) % 7 >= 5) return;
				const meal = (day + index) % 2 === 0 ? LUNCH : DINNER;
				rows.push({
					scheduleId: schedule.id,
					employmentId: member.employmentId,
					positionId: positionId(member.position),
					startsAt: wallToInstant(dateKey, meal.start, location.timezone),
					endsAt: wallToInstant(dateKey, meal.end, location.timezone),
				});
			});
			// One unassigned dinner shift a day for the open-shift flows.
			rows.push({
				scheduleId: schedule.id,
				employmentId: null,
				positionId: positionId("Server"),
				startsAt: wallToInstant(dateKey, DINNER.start, location.timezone),
				endsAt: wallToInstant(dateKey, DINNER.end, location.timezone),
			});
		}
		await db.insert(shifts).values(rows);
		await publishScheduleNow(schedule.id, reviewerProfileId);
		console.log(`Published week of ${weekStart} (${rows.length} shifts)`);
	}
}

async function main() {
	const providedPassword = process.env.PLAY_REVIEWER_PASSWORD;
	if (providedPassword !== undefined && providedPassword.length < 8) {
		throw new Error("PLAY_REVIEWER_PASSWORD must be at least 8 characters");
	}
	const password = providedPassword ?? generatePassword();

	const { userId, created: userCreated } = await ensureUser(password);
	const { workplace, created: workplaceCreated } =
		await ensureWorkplace(userId);
	await ensureSubscription(workplace.id);
	if (workplaceCreated) await seedDemoData(workplace.id, userId);

	console.log(
		[
			`${userCreated ? "Created" : "Updated"} ${EMAIL}`,
			`Workplace: ${workplace.name} (${workplaceCreated ? "created" : "existing"}, Operations plan)`,
			providedPassword === undefined
				? `Generated password (shown once): ${password}`
				: "Password set from PLAY_REVIEWER_PASSWORD",
		].join("\n"),
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
