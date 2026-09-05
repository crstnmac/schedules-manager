import { expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

interface AcceptanceFixture {
	workplace: { id: string };
	location: { id: string };
	position: { id: string };
	schedule: { id: string };
	version: { id: string };
	versionShift: { id: string };
	acceptance: { id: string };
	manager: { id: string };
	worker: { id: string };
	managerProfileId: string;
	workerProfileId: string;
	managerEmail: string;
	workerEmail: string;
}

async function seedAcceptanceFixture(
	d: Context["database"],
	label: string,
): Promise<AcceptanceFixture> {
	const managerProfileId = crypto.randomUUID();
	const workerProfileId = crypto.randomUUID();
	const slug = label.toLowerCase().replaceAll(" ", "-");
	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({ name: label })
		.returning();
	const [location] = await d.db
		.insert(d.locations)
		.values({
			workplaceId: required(workplace).id,
			name: `${label} Floor`,
			timezone: "America/Chicago",
		})
		.returning();
	const [position] = await d.db
		.insert(d.positions)
		.values({ workplaceId: required(workplace).id, name: "Server" })
		.returning();
	await d.db.insert(d.profiles).values([
		{ id: managerProfileId, email: `${slug}-manager@example.test` },
		{ id: workerProfileId, email: `${slug}-worker@example.test` },
	]);
	const employments = await d.db
		.insert(d.employments)
		.values([
			{
				workplaceId: required(workplace).id,
				profileId: managerProfileId,
				kind: "manager",
			},
			{
				workplaceId: required(workplace).id,
				profileId: workerProfileId,
				kind: "worker",
			},
		])
		.returning();
	const manager = required(
		employments.find((row) => row.profileId === managerProfileId),
	);
	const worker = required(
		employments.find((row) => row.profileId === workerProfileId),
	);
	const [schedule] = await d.db
		.insert(d.schedules)
		.values({
			locationId: required(location).id,
			weekStartDate: "2026-09-28",
		})
		.returning();
	const [version] = await d.db
		.insert(d.scheduleVersions)
		.values({
			scheduleId: required(schedule).id,
			versionNumber: 1,
		})
		.returning();
	const [versionShift] = await d.db
		.insert(d.versionShifts)
		.values({
			versionId: required(version).id,
			employmentId: worker.id,
			positionId: required(position).id,
			startsAt: new Date("2026-09-29T16:00:00.000Z"),
			endsAt: new Date("2026-09-29T22:00:00.000Z"),
		})
		.returning();
	const [acceptance] = await d.db
		.insert(d.shiftAcceptances)
		.values({
			versionId: required(version).id,
			versionShiftId: required(versionShift).id,
			employmentId: worker.id,
			changeSummary: `${label} confirmation`,
		})
		.returning();
	return {
		workplace: required(workplace),
		location: required(location),
		position: required(position),
		schedule: required(schedule),
		version: required(version),
		versionShift: required(versionShift),
		acceptance: required(acceptance),
		manager,
		worker,
		managerProfileId,
		workerProfileId,
		managerEmail: `${slug}-manager@example.test`,
		workerEmail: `${slug}-worker@example.test`,
	};
}

function respond(
	app: Context["app"],
	access: string,
	acceptanceId: string,
	decision: "accept" | "decline",
	idempotencyKey?: string,
) {
	const headers: Record<string, string> = {
		authorization: `Bearer ${access}`,
	};
	if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
	return app.handle(
		new Request(
			`http://localhost/v1/my/shift-acceptances/${acceptanceId}/${decision}`,
			{ method: "POST", headers },
		),
	);
}

async function withUpdateDelay<T>(
	d: Context["database"],
	fn: () => Promise<T>,
): Promise<T> {
	await d.db.execute(
		sql`create function delay_acceptance_update() returns trigger as $$ begin perform pg_sleep(0.2); return new; end; $$ language plpgsql`,
	);
	await d.db.execute(
		sql`create trigger delay_acceptance_update before update on shift_acceptances for each row execute function delay_acceptance_update()`,
	);
	try {
		return await fn();
	} finally {
		await d.db.execute(
			sql`drop trigger if exists delay_acceptance_update on shift_acceptances`,
		);
		await d.db.execute(sql`drop function if exists delay_acceptance_update`);
	}
}

export function registerAcceptanceRaceTests(getContext: () => Context) {
	test("concurrent accept/decline race: loser returns the recorded status, not stale pending", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedAcceptanceFixture(d, "Race Acceptance");
		const workerToken = await token(seed.workerProfileId, seed.workerEmail);

		await withUpdateDelay(d, async () => {
			const [acceptRes, declineRes] = await Promise.all([
				respond(
					app,
					workerToken,
					seed.acceptance.id,
					"accept",
					"race-accept-key-A",
				),
				respond(
					app,
					workerToken,
					seed.acceptance.id,
					"decline",
					"race-decline-key-B",
				),
			]);
			expect(acceptRes.status).toBe(200);
			expect(declineRes.status).toBe(200);

			const acceptBody = await acceptRes.json();
			const declineBody = await declineRes.json();

			const [persisted] = await d.db
				.select()
				.from(d.shiftAcceptances)
				.where(eq(d.shiftAcceptances.id, seed.acceptance.id));
			expect(persisted?.status).toMatch(/^(accepted|declined)$/);
			expect(persisted?.respondedAt).toBeTruthy();

			const acceptWon = persisted?.status === "accepted";
			const winnerBody = acceptWon ? acceptBody : declineBody;
			const loserBody = acceptWon ? declineBody : acceptBody;
			const winnerKey = acceptWon ? "race-accept-key-A" : "race-decline-key-B";
			const loserKey = acceptWon ? "race-decline-key-B" : "race-accept-key-A";
			const winnerDecision = acceptWon ? "accept" : "decline";
			const loserDecision = acceptWon ? "decline" : "accept";

			expect(winnerBody).toEqual({ status: persisted?.status });
			expect(loserBody).toEqual({ status: persisted?.status });

			const [loserRecord] = await d.db
				.select()
				.from(d.idempotencyRecords)
				.where(
					and(
						eq(d.idempotencyRecords.actorProfileId, seed.workerProfileId),
						eq(d.idempotencyRecords.key, loserKey),
					),
				);
			expect(loserRecord?.response).toEqual({ status: persisted?.status });

			const loserReplay = await respond(
				app,
				workerToken,
				seed.acceptance.id,
				loserDecision,
				loserKey,
			);
			expect(loserReplay.status).toBe(200);
			expect(await loserReplay.json()).toEqual({ status: persisted?.status });

			const winnerReplay = await respond(
				app,
				workerToken,
				seed.acceptance.id,
				winnerDecision,
				winnerKey,
			);
			expect(winnerReplay.status).toBe(200);
			expect(await winnerReplay.json()).toEqual(winnerBody);

			const mismatched = await respond(
				app,
				workerToken,
				seed.acceptance.id,
				loserDecision,
				winnerKey,
			);
			expect(mismatched.status).toBe(409);

			const notifies = await d.db
				.select()
				.from(d.notifications)
				.where(
					and(
						eq(d.notifications.employmentId, seed.manager.id),
						eq(d.notifications.kind, "acceptance_response"),
					),
				);
			expect(notifies).toHaveLength(1);
		});

		const mgrToken = await token(seed.managerProfileId, seed.managerEmail);
		const view = await app.handle(
			new Request(
				`http://localhost/v1/schedules/${seed.schedule.id}/acceptances`,
				{ headers: { authorization: `Bearer ${mgrToken}` } },
			),
		);
		expect(view.status).toBe(200);
		const viewBody = await view.json();
		const [persistedAgain] = await d.db
			.select()
			.from(d.shiftAcceptances)
			.where(eq(d.shiftAcceptances.id, seed.acceptance.id));
		const match = viewBody.acceptances.find(
			(row: { id: string }) => row.id === seed.acceptance.id,
		);
		expect(match?.status).toBe(persistedAgain?.status);

		const pending = await d.db
			.select()
			.from(d.shiftAcceptances)
			.where(
				and(
					eq(d.shiftAcceptances.employmentId, seed.worker.id),
					eq(d.shiftAcceptances.status, "pending"),
				),
			);
		expect(pending).toHaveLength(0);
	});

	test("concurrent accept/decline race without idempotency keys settles to one recorded status and writes no idempotency records", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedAcceptanceFixture(d, "No Key Race");
		const workerToken = await token(seed.workerProfileId, seed.workerEmail);

		const before = await d.db
			.select({ id: d.idempotencyRecords.id })
			.from(d.idempotencyRecords)
			.where(eq(d.idempotencyRecords.actorProfileId, seed.workerProfileId));

		await withUpdateDelay(d, async () => {
			const [acceptRes, declineRes] = await Promise.all([
				respond(app, workerToken, seed.acceptance.id, "accept"),
				respond(app, workerToken, seed.acceptance.id, "decline"),
			]);
			expect(acceptRes.status).toBe(200);
			expect(declineRes.status).toBe(200);

			const acceptBody = await acceptRes.json();
			const declineBody = await declineRes.json();

			const [persisted] = await d.db
				.select()
				.from(d.shiftAcceptances)
				.where(eq(d.shiftAcceptances.id, seed.acceptance.id));
			expect(persisted?.status).toMatch(/^(accepted|declined)$/);

			const acceptWon = persisted?.status === "accepted";
			const winnerBody = acceptWon ? acceptBody : declineBody;
			const loserBody = acceptWon ? declineBody : acceptBody;
			expect(winnerBody).toEqual({ status: persisted?.status });
			expect(loserBody).toEqual({ status: persisted?.status });
		});

		const after = await d.db
			.select({ id: d.idempotencyRecords.id })
			.from(d.idempotencyRecords)
			.where(eq(d.idempotencyRecords.actorProfileId, seed.workerProfileId));
		expect(after.length - before.length).toBe(0);
	});
}
