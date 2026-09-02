import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (id: string, email: string) => Promise<string>;
};

const createBody = {
	name: "New workplace",
	location: { name: "Dining room", timezone: "America/Chicago" },
	position: { name: "Server" },
};

export function registerJoinPolicyTests(getContext: () => Context) {
	async function createWorkplace(
		authorization: string,
		name = createBody.name,
	) {
		const { app } = getContext();
		return app.handle(
			new Request("http://localhost/v1/workplaces", {
				method: "POST",
				headers: {
					authorization,
					"content-type": "application/json",
				},
				body: JSON.stringify({ ...createBody, name }),
			}),
		);
	}

	test("an uninvited person can create their first Workplace as a manager", async () => {
		const { database, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = `join-create-${profileId}@example.test`;
		await database.db
			.insert(database.profiles)
			.values({ id: profileId, email });
		const response = await createWorkplace(
			`Bearer ${await token(profileId, email)}`,
			"First workplace",
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.workplace.name).toBe("First workplace");
		const [employment] = await database.db
			.select()
			.from(database.employments)
			.where(eq(database.employments.profileId, profileId));
		expect(employment?.kind).toBe("manager");
		expect(employment?.status).toBe("active");
		expect(employment?.workplaceId).toBe(body.workplace.id);
	});

	test("a pending invitation blocks Workplace create", async () => {
		const { database, token } = getContext();
		const managerId = crypto.randomUUID();
		const invitedId = crypto.randomUUID();
		const invitedEmail = `join-pending-${invitedId}@example.test`;
		await database.db.insert(database.profiles).values([
			{
				id: managerId,
				email: `join-pending-manager-${managerId}@example.test`,
			},
			{ id: invitedId, email: invitedEmail },
		]);
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Existing workplace" })
			.returning();
		if (!workplace) throw new Error("Missing workplace");
		await database.db.insert(database.employments).values({
			workplaceId: workplace.id,
			profileId: managerId,
			kind: "manager",
		});
		await database.db.insert(database.invitations).values({
			workplaceId: workplace.id,
			email: invitedEmail,
			kind: "worker",
			expiresAt: new Date(Date.now() + 60_000),
		});
		const response = await createWorkplace(
			`Bearer ${await token(invitedId, invitedEmail)}`,
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "forbidden",
			message: "Accept your invitation instead of creating a Workplace.",
		});
		expect(
			await database.db
				.select()
				.from(database.employments)
				.where(eq(database.employments.profileId, invitedId)),
		).toHaveLength(0);
	});

	test("an existing Employment blocks Workplace create, including deactivated", async () => {
		const { database, token } = getContext();
		const managerId = crypto.randomUUID();
		const activeId = crypto.randomUUID();
		const deactivatedId = crypto.randomUUID();
		await database.db.insert(database.profiles).values([
			{ id: managerId, email: `join-member-manager-${managerId}@example.test` },
			{ id: activeId, email: `join-active-${activeId}@example.test` },
			{
				id: deactivatedId,
				email: `join-deactivated-${deactivatedId}@example.test`,
			},
		]);
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Staffed workplace" })
			.returning();
		if (!workplace) throw new Error("Missing workplace");
		await database.db.insert(database.employments).values([
			{
				workplaceId: workplace.id,
				profileId: managerId,
				kind: "manager",
			},
			{
				workplaceId: workplace.id,
				profileId: activeId,
				kind: "worker",
			},
			{
				workplaceId: workplace.id,
				profileId: deactivatedId,
				kind: "worker",
				status: "deactivated",
				deactivatedAt: new Date(),
			},
		]);

		const activeResponse = await createWorkplace(
			`Bearer ${await token(activeId, `join-active-${activeId}@example.test`)}`,
		);
		expect(activeResponse.status).toBe(403);
		expect(await activeResponse.json()).toEqual({
			error: "forbidden",
			message: "You already belong to a Workplace. Workers join by invitation.",
		});

		const deactivatedResponse = await createWorkplace(
			`Bearer ${await token(
				deactivatedId,
				`join-deactivated-${deactivatedId}@example.test`,
			)}`,
		);
		expect(deactivatedResponse.status).toBe(403);
		expect(await deactivatedResponse.json()).toEqual({
			error: "forbidden",
			message: "You already belong to a Workplace. Workers join by invitation.",
		});
	});

	test("an expired invitation does not block Workplace create", async () => {
		const { database, token } = getContext();
		const managerId = crypto.randomUUID();
		const invitedId = crypto.randomUUID();
		const invitedEmail = `join-expired-${invitedId}@example.test`;
		await database.db.insert(database.profiles).values([
			{
				id: managerId,
				email: `join-expired-manager-${managerId}@example.test`,
			},
			{ id: invitedId, email: invitedEmail },
		]);
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Expired-invite workplace" })
			.returning();
		if (!workplace) throw new Error("Missing workplace");
		await database.db.insert(database.employments).values({
			workplaceId: workplace.id,
			profileId: managerId,
			kind: "manager",
		});
		await database.db.insert(database.invitations).values({
			workplaceId: workplace.id,
			email: invitedEmail,
			kind: "worker",
			status: "pending",
			expiresAt: new Date(Date.now() - 60_000),
		});
		const response = await createWorkplace(
			`Bearer ${await token(invitedId, invitedEmail)}`,
			"After expired invite",
		);
		expect(response.status).toBe(200);
		const [employment] = await database.db
			.select()
			.from(database.employments)
			.where(eq(database.employments.profileId, invitedId));
		expect(employment?.kind).toBe("manager");
	});

	test("concurrent first Workplace creates serialize to a single Employment", async () => {
		const { database, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = `join-concurrent-${profileId}@example.test`;
		await database.db
			.insert(database.profiles)
			.values({ id: profileId, email });
		const authorization = `Bearer ${await token(profileId, email)}`;
		const responses = await Promise.all([
			createWorkplace(authorization, "Concurrent A"),
			createWorkplace(authorization, "Concurrent B"),
		]);
		const statuses = responses.map((response) => response.status).sort();
		expect(statuses).toEqual([200, 403]);
		const memberships = await database.db
			.select()
			.from(database.employments)
			.where(eq(database.employments.profileId, profileId));
		expect(memberships).toHaveLength(1);
		expect(memberships[0]?.kind).toBe("manager");
	});
}
