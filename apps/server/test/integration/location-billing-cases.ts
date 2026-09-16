import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

export function registerLocationBillingTests(getContext: () => Context) {
	test("location creation requires an already purchased seat", async () => {
		const { database: d, app, token } = getContext();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Seat Capacity Test" })
			.returning();
		if (!workplace) throw new Error("Missing workplace fixture");
		await d.db
			.insert(d.locations)
			.values({ workplaceId: workplace.id, name: "First", timezone: "UTC" });
		const profileId = crypto.randomUUID();
		const email = `seat-manager-${profileId}@example.test`;
		await d.db.insert(d.profiles).values({ id: profileId, email });
		await d.db
			.insert(d.employments)
			.values({ workplaceId: workplace.id, profileId, kind: "manager" });
		const access = await token(profileId, email);
		const request = (path: string, body: unknown) =>
			app.handle(
				new Request(`http://localhost${path}`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify(body),
				}),
			);
		const createPath = `/v1/workplaces/${workplace.id}/locations`;
		const createBody = { name: "Second", timezone: "UTC" };
		const denied = await request(createPath, createBody);
		expect(denied.status).toBe(409);
		const stale = await request(
			`/v1/workplaces/${workplace.id}/billing/location-seats`,
			{ expectedPaidLocationCount: 2, quantity: 5 },
		);
		expect(stale.status).toBe(409);
		const invalid = await request(
			`/v1/workplaces/${workplace.id}/billing/location-seats`,
			{ expectedPaidLocationCount: 1, quantity: 0 },
		);
		expect(invalid.status).toBe(422);
		const existing = await d.db
			.select()
			.from(d.locations)
			.where(eq(d.locations.workplaceId, workplace.id));
		expect(existing).toHaveLength(1);
		await d.db
			.update(d.workplaceSubscriptions)
			.set({ locationCount: 2 })
			.where(eq(d.workplaceSubscriptions.workplaceId, workplace.id));
		const created = await request(createPath, createBody);
		expect(created.status).toBe(200);
		const billing = await app.handle(
			new Request(`http://localhost/v1/workplaces/${workplace.id}/billing`, {
				headers: { authorization: `Bearer ${access}` },
			}),
		);
		expect(billing.status).toBe(200);
		expect(await billing.json()).toMatchObject({
			locationCount: 2,
			paidLocationCount: 2,
		});
		await d.db
			.update(d.workplaceSubscriptions)
			.set({ locationCount: 3 })
			.where(eq(d.workplaceSubscriptions.workplaceId, workplace.id));
		const concurrent = await Promise.all([
			request(createPath, { name: "Third", timezone: "UTC" }),
			request(createPath, { name: "Fourth", timezone: "UTC" }),
		]);
		expect(concurrent.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);
		const finalLocations = await d.db
			.select()
			.from(d.locations)
			.where(eq(d.locations.workplaceId, workplace.id));
		expect(finalLocations).toHaveLength(3);
	});
}
