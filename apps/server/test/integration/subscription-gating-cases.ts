import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { generateApiKey } from "../../src/api-key-auth";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

/**
 * ADR 0016: changing a Workplace needs an active subscription and Operations
 * features need the Operations plan, whichever client calls the API. Reads
 * stay open so history survives a lapse, and billing stays open so an unpaid
 * Workplace can subscribe.
 */
export function registerSubscriptionGatingTests(getContext: () => Context) {
	async function seed(plan: "schedule" | "operations" | null) {
		const { database: d, token } = getContext();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: `Gating ${plan ?? "unpaid"}` })
			.returning();
		if (!workplace) throw new Error("Missing workplace fixture");
		// The harness provisions an Operations subscription for every workplace.
		if (plan === null) {
			await d.db
				.delete(d.workplaceSubscriptions)
				.where(eq(d.workplaceSubscriptions.workplaceId, workplace.id));
		} else {
			await d.db
				.update(d.workplaceSubscriptions)
				.set({ plan, status: "active" })
				.where(eq(d.workplaceSubscriptions.workplaceId, workplace.id));
		}
		const profileId = crypto.randomUUID();
		const email = `gating-${profileId}@example.test`;
		await d.db.insert(d.profiles).values({ id: profileId, email });
		await d.db
			.insert(d.employments)
			.values({ workplaceId: workplace.id, profileId, kind: "manager" });
		const key = generateApiKey();
		await d.db.insert(d.apiKeys).values({
			workplaceId: workplace.id,
			name: "Gating key",
			keyPrefix: key.prefix,
			keyHash: key.hash,
			scopes: ["schedule.read", "requests.write"],
			createdBy: profileId,
		});
		return {
			workplace,
			session: await token(profileId, email),
			apiKey: key.token,
		};
	}

	function call(
		path: string,
		bearer: string,
		init: { method?: string; body?: unknown } = {},
	) {
		const { app } = getContext();
		return app.handle(
			new Request(`http://localhost${path}`, {
				method: init.method ?? "GET",
				headers: {
					authorization: `Bearer ${bearer}`,
					"content-type": "application/json",
				},
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
			}),
		);
	}

	test("an unpaid workplace can read and subscribe but not change anything", async () => {
		const { workplace, session, apiKey } = await seed(null);
		const base = `/v1/workplaces/${workplace.id}`;

		const write = await call(`${base}/positions`, session, {
			method: "POST",
			body: { name: "Host" },
		});
		expect(write.status).toBe(403);
		expect((await write.json()).message).toContain("active subscription");

		expect((await call(`${base}/workers`, session)).status).toBe(200);
		expect((await call(`${base}/billing`, session)).status).toBe(200);

		const integrationWrite = await call(
			`/v1/integration/timesheets/${crypto.randomUUID()}/decision`,
			apiKey,
			{ method: "POST", body: { decision: "approved" } },
		);
		expect(integrationWrite.status).toBe(403);
		expect((await call("/v1/integration/context", apiKey)).status).toBe(200);
	});

	test("timesheet decisions over the integration API need the Operations plan", async () => {
		const path = (id: string) => `/v1/integration/timesheets/${id}/decision`;
		const schedulePlan = await seed("schedule");
		const denied = await call(path(crypto.randomUUID()), schedulePlan.apiKey, {
			method: "POST",
			body: { decision: "approved" },
		});
		expect(denied.status).toBe(403);
		expect((await denied.json()).message).toContain("Operations plan");

		const operationsPlan = await seed("operations");
		const allowed = await call(
			path(crypto.randomUUID()),
			operationsPlan.apiKey,
			{ method: "POST", body: { decision: "approved" } },
		);
		expect(allowed.status).toBe(404);
	});

	test("a Schedule plan workplace saves settings unless it changes a time clock setting", async () => {
		const { workplace, session } = await seed("schedule");
		const base = `/v1/workplaces/${workplace.id}`;
		const settings = (await (await call(base, session)).json()).workplace;

		// Settings forms send every field back, including unchanged time clock
		// values; planned labor cost belongs to the Schedule plan.
		const save = await call(base, session, {
			method: "PATCH",
			body: {
				name: "Renamed Gating Workplace",
				earlyClockInMinutes: settings.earlyClockInMinutes,
				overtimeWeeklyMinutes: settings.overtimeWeeklyMinutes,
				laborCostPercentGoal: 28,
				managersCanViewLaborCost: true,
			},
		});
		expect(save.status).toBe(200);

		const timeClockChange = await call(base, session, {
			method: "PATCH",
			body: { earlyClockInMinutes: (settings.earlyClockInMinutes ?? 0) + 5 },
		});
		expect(timeClockChange.status).toBe(403);
	});
}
