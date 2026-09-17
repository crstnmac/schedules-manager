import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

/**
 * The pre-checkout disclosure promises a trial length, a price that begins
 * when it ends, and a first-charge date. Those figures come from trialPolicy,
 * so the server contract behind them is covered here.
 */
export function registerTrialPolicyTests(getContext: () => Context) {
	test("trial policy reports the trial length and whether a trial is available", async () => {
		const { database: d, app, token } = getContext();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Trial Policy Test" })
			.returning();
		if (!workplace) throw new Error("Missing workplace fixture");
		const profileId = crypto.randomUUID();
		const email = `trial-manager-${profileId}@example.test`;
		await d.db.insert(d.profiles).values({ id: profileId, email });
		await d.db
			.insert(d.employments)
			.values({ workplaceId: workplace.id, profileId, kind: "manager" });
		const access = await token(profileId, email);
		const billing = () =>
			app
				.handle(
					new Request(
						`http://localhost/v1/workplaces/${workplace.id}/billing`,
						{ headers: { authorization: `Bearer ${access}` } },
					),
				)
				.then((response) => response.json());

		// The integration harness provisions an active subscription for every new
		// workplace; a genuinely new workplace has none, which is the state the
		// trial offer targets.
		await d.db
			.delete(d.workplaceSubscriptions)
			.where(eq(d.workplaceSubscriptions.workplaceId, workplace.id));
		expect(await billing()).toMatchObject({
			trialPolicy: { eligible: true, days: 30 },
		});

		// The opening-restaurant offer lengthens the trial to 90 days; the
		// checkout disclosure reads this number rather than assuming 30.
		await d.db
			.update(d.workplaces)
			.set({ openingRestaurantOffer: true })
			.where(eq(d.workplaces.id, workplace.id));
		expect(await billing()).toMatchObject({
			trialPolicy: { eligible: true, days: 90 },
		});

		// A trial still grants scheduling access, and it closes the trial path —
		// this is the state a cancel-during-trial flows from.
		await d.db.insert(d.workplaceSubscriptions).values({
			workplaceId: workplace.id,
			polarSubscriptionId: `sub_${crypto.randomUUID()}`,
			polarCustomerId: `cus_${crypto.randomUUID()}`,
			polarProductId: "test-product",
			plan: "schedule",
			billingInterval: "month",
			status: "trialing",
		});
		expect(await billing()).toMatchObject({
			trialPolicy: { eligible: false },
			capabilities: { scheduling: true },
		});
	});
}
