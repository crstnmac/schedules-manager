import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { resetRateLimitState } from "../../src/rate-limit";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
};

// Seeds `workerCount` workers, each with a unique kiosk PIN and an active
// published shift, under one location. Returns what the clock-in requests need.
async function seedKioskWorkplace(
	d: Context["database"],
	hashPin: (pin: string) => string,
	name: string,
	workerCount: number,
) {
	const locationPin = "9999";
	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({ name })
		.returning();
	const [location] = await d.db
		.insert(d.locations)
		.values({
			workplaceId: required(workplace).id,
			name: `${name} Floor`,
			timezone: "America/Chicago",
		})
		.returning();
	await d.db
		.update(d.locations)
		.set({ kioskPinHash: hashPin(locationPin) })
		.where(eq(d.locations.id, required(location).id));
	const [position] = await d.db
		.insert(d.positions)
		.values({
			workplaceId: required(workplace).id,
			name: "Server",
		})
		.returning();

	const profileIds = Array.from({ length: workerCount }, () =>
		crypto.randomUUID(),
	);
	const workerPins = profileIds.map((_, index) => String(1000 + index));
	const slug = name.toLowerCase().replaceAll(" ", "-");
	await d.db.insert(d.profiles).values(
		profileIds.map((id, index) => ({
			id,
			email: `${slug}-worker-${index}@example.test`,
		})),
	);
	const employments = await d.db
		.insert(d.employments)
		.values(
			profileIds.map((id, index) => ({
				workplaceId: required(workplace).id,
				profileId: id,
				kind: "worker" as const,
				kioskPinHash: hashPin(workerPins[index] ?? ""),
			})),
		)
		.returning();
	const [schedule] = await d.db
		.insert(d.schedules)
		.values({
			locationId: required(location).id,
			weekStartDate: "2026-09-07",
		})
		.returning();
	const [version] = await d.db
		.insert(d.scheduleVersions)
		.values({
			scheduleId: required(schedule).id,
			versionNumber: 1,
		})
		.returning();
	const now = Date.now();
	await d.db.insert(d.versionShifts).values(
		employments.map((employment) => ({
			versionId: required(version).id,
			employmentId: employment.id,
			positionId: required(position).id,
			startsAt: new Date(now - 60 * 60_000),
			endsAt: new Date(now + 60 * 60_000),
		})),
	);
	return {
		locationId: required(location).id,
		workerPins,
		employmentIds: employments.map((employment) => employment.id),
	};
}

function clockIn(
	app: Context["app"],
	locationId: string,
	workerPin: string,
	headers: Record<string, string> = {},
) {
	return app.handle(
		new Request("http://localhost/v1/kiosk/clock", {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify({
				locationId,
				locationPin: "9999",
				workerPin,
				action: "in",
			}),
		}),
	);
}

export function registerKioskRateLimitTests(getContext: () => Context) {
	afterEach(() => {
		resetRateLimitState();
	});

	// Regression guard for the kiosk route: it must key its rate-limit bucket by
	// the real client IP when `x-forwarded-for` is absent and `x-real-ip` is set
	// (the header shape a proxy that only sets `x-real-ip` produces). If the
	// route ever re-implements `x-forwarded-for`-only parsing inline, the 41st
	// distinct source below collapses onto `kiosk:unknown` and is throttled.
	test("kiosk clock-in keys the rate-limit bucket by x-real-ip when x-forwarded-for is absent", async () => {
		const { database: d, app } = getContext();
		const { hashPin } = await import("../../src/pin");
		const { locationId, workerPins, employmentIds } = await seedKioskWorkplace(
			d,
			hashPin,
			"Kiosk Real Ip Cafe",
			41,
		);

		for (let i = 0; i < 40; i++) {
			const res = await clockIn(app, locationId, workerPins[i] ?? "", {
				"x-real-ip": `198.51.100.${i}`,
			});
			expect(res.status).toBe(200);
		}

		// A 41st distinct source must NOT be throttled: it gets its own bucket
		// and the Time Entry is created.
		const victim = await clockIn(app, locationId, workerPins[40] ?? "", {
			"x-real-ip": "198.51.100.250",
		});
		expect(victim.status).toBe(200);
		const victimEntry = await d.db
			.select()
			.from(d.timeEntries)
			.where(eq(d.timeEntries.employmentId, employmentIds[40] ?? ""))
			.limit(1);
		expect(victimEntry).toHaveLength(1);
	});
}
