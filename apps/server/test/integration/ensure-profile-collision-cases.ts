import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
	emaillessToken: (profileId: string) => Promise<string>;
	emptyEmailToken: (profileId: string) => Promise<string>;
};

export function registerEnsureProfileCollisionTests(getContext: () => Context) {
	test("an email-less JWT is rejected before a profile is created (no empty-email collision)", async () => {
		const { database, app, emaillessToken } = getContext();
		const userA = crypto.randomUUID();
		const userB = crypto.randomUUID();

		const responseA = await app.handle(
			new Request("http://localhost/v1/me", {
				headers: { authorization: `Bearer ${await emaillessToken(userA)}` },
			}),
		);
		expect(responseA.status).toBe(401);
		expect((await responseA.json()).message).toContain("email");

		const responseB = await app.handle(
			new Request("http://localhost/v1/me", {
				headers: { authorization: `Bearer ${await emaillessToken(userB)}` },
			}),
		);
		expect(responseB.status).toBe(401);

		const emptyEmailRows = await database.db.execute(
			sql`select id from ${database.profiles} where email = ''`,
		);
		expect(emptyEmailRows.rows.length).toBe(0);

		const insertedRows = await database.db.execute(
			sql`select id from ${database.profiles} where id in (${userA}, ${userB})`,
		);
		expect(insertedRows.rows.length).toBe(0);
	});

	test("an explicit empty-string email claim is rejected like a missing one", async () => {
		const { database, app, emptyEmailToken } = getContext();
		const userA = crypto.randomUUID();

		const responseA = await app.handle(
			new Request("http://localhost/v1/me", {
				headers: { authorization: `Bearer ${await emptyEmailToken(userA)}` },
			}),
		);
		expect(responseA.status).toBe(401);
		expect((await responseA.json()).message).toContain("email");

		const rows = await database.db.execute(
			sql`select id from ${database.profiles} where id in (${userA})`,
		);
		expect(rows.rows.length).toBe(0);
	});

	test("two JWTs with distinct emails each create distinct profiles", async () => {
		const { database, app, token } = getContext();
		const userA = crypto.randomUUID();
		const userB = crypto.randomUUID();
		const emailA = `profile-a-${userA}@example.test`;
		const emailB = `profile-b-${userB}@example.test`;

		const responseA = await app.handle(
			new Request("http://localhost/v1/me", {
				headers: { authorization: `Bearer ${await token(userA, emailA)}` },
			}),
		);
		expect(responseA.status).toBe(200);
		expect(await responseA.json()).toMatchObject({
			profile: { id: userA, email: emailA },
		});

		const responseB = await app.handle(
			new Request("http://localhost/v1/me", {
				headers: { authorization: `Bearer ${await token(userB, emailB)}` },
			}),
		);
		expect(responseB.status).toBe(200);
		expect(await responseB.json()).toMatchObject({
			profile: { id: userB, email: emailB },
		});

		const rows = await database.db.execute(
			sql`select id, email from ${database.profiles} where id in (${userA}, ${userB})`,
		);
		expect(rows.rows.length).toBe(2);
	});

	test("a returning user reuses their existing profile instead of re-inserting", async () => {
		const { database, app, token } = getContext();
		const userA = crypto.randomUUID();
		const emailA = `profile-returning-${userA}@example.test`;

		const first = await app.handle(
			new Request("http://localhost/v1/me", {
				headers: { authorization: `Bearer ${await token(userA, emailA)}` },
			}),
		);
		expect(first.status).toBe(200);
		expect((await first.json()).profile).toMatchObject({
			id: userA,
			email: emailA,
		});

		const second = await app.handle(
			new Request("http://localhost/v1/me", {
				headers: { authorization: `Bearer ${await token(userA, emailA)}` },
			}),
		);
		expect(second.status).toBe(200);
		expect((await second.json()).profile).toMatchObject({
			id: userA,
			email: emailA,
		});

		const rows = await database.db
			.select()
			.from(database.profiles)
			.where(eq(database.profiles.id, userA));
		expect(rows).toHaveLength(1);
	});

	test("concurrent requests for the same sub resolve to a single profile", async () => {
		const { database, app, token } = getContext();
		const userA = crypto.randomUUID();
		const emailA = `profile-concurrent-${userA}@example.test`;

		const [responseA, responseB] = await Promise.all([
			app.handle(
				new Request("http://localhost/v1/me", {
					headers: { authorization: `Bearer ${await token(userA, emailA)}` },
				}),
			),
			app.handle(
				new Request("http://localhost/v1/me", {
					headers: { authorization: `Bearer ${await token(userA, emailA)}` },
				}),
			),
		]);
		expect(responseA.status).toBe(200);
		expect(responseB.status).toBe(200);
		expect((await responseA.json()).profile).toMatchObject({
			id: userA,
			email: emailA,
		});

		const rows = await database.db
			.select()
			.from(database.profiles)
			.where(eq(database.profiles.id, userA));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.email).toBe(emailA);
	});
}
