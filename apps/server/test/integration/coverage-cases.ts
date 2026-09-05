import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

/**
 * Coverage dashboard guard contract tests.
 *
 * These exercise the HTTP endpoints whose response shapes the web coverage
 * dashboard's `hasItems` empty-state guard reads:
 *   - GET /v1/workplaces/:id/coverage          -> { releases: [...], pickups: [...] }
 *   - GET /v1/workplaces/:id/coverage/swaps     -> { swaps: [...] }  (pending_manager only)
 *
 * The bug being fixed Gloated `hasItems` on releases/pickups only, ignoring
 * pending swaps. The trigger condition is a workplace with
 * `releases: [] && pickups: []` plus a non-empty `pending_manager` swap set.
 */
export function registerCoverageTests(getContext: () => Context) {
	test("coverage endpoints return empty releases/pickups while a pending_manager swap is queued", async () => {
		const { database: d, app, token } = getContext();
		const { publishScheduleNow } = await import("../../src/routes/publication");

		const managerProfileId = crypto.randomUUID();
		const workerAProfileId = crypto.randomUUID();
		const workerBProfileId = crypto.randomUUID();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Coverage Swap Trigger Workplace" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
			.returning();
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: "cov-manager@example.test" },
			{ id: workerAProfileId, email: "cov-worker-a@example.test" },
			{ id: workerBProfileId, email: "cov-worker-b@example.test" },
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
					profileId: workerAProfileId,
					kind: "worker",
				},
				{
					workplaceId: required(workplace).id,
					profileId: workerBProfileId,
					kind: "worker",
				},
			])
			.returning();
		const manager = required(
			employments.find((row) => row.profileId === managerProfileId),
		);
		const workerA = required(
			employments.find((row) => row.profileId === workerAProfileId),
		);
		const workerB = required(
			employments.find((row) => row.profileId === workerBProfileId),
		);

		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: "2026-09-21",
			})
			.returning();
		await d.db.insert(d.shifts).values([
			{
				scheduleId: required(schedule).id,
				employmentId: workerA.id,
				positionId: required(position).id,
				startsAt: new Date("2026-09-22T16:00:00.000Z"),
				endsAt: new Date("2026-09-22T22:00:00.000Z"),
			},
			{
				scheduleId: required(schedule).id,
				employmentId: workerB.id,
				positionId: required(position).id,
				startsAt: new Date("2026-09-23T16:00:00.000Z"),
				endsAt: new Date("2026-09-23T22:00:00.000Z"),
			},
		]);
		const publication = await publishScheduleNow(
			required(schedule).id,
			managerProfileId,
		);
		const publishedShifts = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, publication.version.id));
		const shiftByEmployment = new Map(
			publishedShifts.map((shift) => [shift.employmentId, shift]),
		);
		const workerAShift = required(shiftByEmployment.get(workerA.id));
		const workerBShift = required(shiftByEmployment.get(workerB.id));

		const managerToken = await token(
			managerProfileId,
			"cov-manager@example.test",
		);
		const workerAToken = await token(
			workerAProfileId,
			"cov-worker-a@example.test",
		);
		const workerBToken = await token(
			workerBProfileId,
			"cov-worker-b@example.test",
		);

		const get = async (path: string) =>
			app.handle(
				new Request(`http://localhost${path}`, {
					headers: { authorization: `Bearer ${managerToken}` },
				}),
			);

		// Before any swap, BOTH coverage endpoints are empty for this workplace:
		// releases: [] and pickups: [] (no release/pickup rows exist).
		const coverageEmpty = await (
			await get(`/v1/workplaces/${workplace?.id}/coverage`)
		).json();
		expect(coverageEmpty.releases).toEqual([]);
		expect(coverageEmpty.pickups).toEqual([]);
		const swapsEmpty = await (
			await get(`/v1/workplaces/${workplace?.id}/coverage/swaps`)
		).json();
		expect(swapsEmpty.swaps).toEqual([]);

		// Worker A proposes a swap with worker B -> pending_counterpart.
		const propose = await app.handle(
			new Request("http://localhost/v1/my/swaps", {
				method: "POST",
				headers: {
					authorization: `Bearer ${workerAToken}`,
					"content-type": "application/json",
					"idempotency-key": "coverage-swap-propose",
				},
				body: JSON.stringify({
					requesterShiftId: workerAShift.id,
					counterpartEmploymentId: workerB.id,
					counterpartShiftId: workerBShift.id,
				}),
			}),
		);
		expect(propose.status).toBe(200);
		const proposed = (await propose.json()) as {
			swap: { id: string; status: string };
		};
		expect(proposed.swap.status).toBe("pending_counterpart");

		// While only pending_counterpart, the manager coverage-swaps endpoint
		// (which filters pending_manager) must NOT list it.
		const swapsBeforeAccept = await (
			await get(`/v1/workplaces/${workplace?.id}/coverage/swaps`)
		).json();
		expect(swapsBeforeAccept.swaps).toEqual([]);

		// Worker B accepts -> pending_manager.
		const respond = await app.handle(
			new Request(`http://localhost/v1/my/swaps/${proposed.swap.id}/respond`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${workerBToken}`,
					"content-type": "application/json",
					"idempotency-key": "coverage-swap-accept",
				},
				body: JSON.stringify({ decision: "accept" }),
			}),
		);
		expect(respond.status).toBe(200);
		const accepted = (await respond.json()) as { swap: { status: string } };
		expect(accepted.swap.status).toBe("pending_manager");

		// TRIGGER CONDITION for the bug: releases: [] && pickups: [] AND a
		// pending_manager swap is queued.
		const coverageTrigger = await (
			await get(`/v1/workplaces/${workplace?.id}/coverage`)
		).json();
		expect(coverageTrigger.releases).toEqual([]);
		expect(coverageTrigger.pickups).toEqual([]);
		const swapsTrigger = await (
			await get(`/v1/workplaces/${workplace?.id}/coverage/swaps`)
		).json();
		expect(swapsTrigger.swaps).toHaveLength(1);
		expect(swapsTrigger.swaps[0].status).toBe("pending_manager");

		// Manager approves the swap. (The schedule is already published, so the
		// decision flow can complete; we then re-fetch the swaps endpoint.)
		const decision = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${workplace?.id}/swaps/${proposed.swap.id}/decision`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${managerToken}`,
						"content-type": "application/json",
						"idempotency-key": "coverage-swap-approve",
					},
					body: JSON.stringify({ decision: "approved" }),
				},
			),
		);
		expect(decision.status).toBe(200);

		// After the decision, the coverage-swaps queue is empty again (the
		// data-side counterpart of the web guard's transition to the banner).
		const swapsAfter = await (
			await get(`/v1/workplaces/${workplace?.id}/coverage/swaps`)
		).json();
		expect(swapsAfter.swaps).toEqual([]);

		// Sanity: releases/pickups are STILL empty for this workplace (the swap
		// flow never creates release/pickup rows), so a manager UI consuming
		// these endpoints would correctly show the empty banner now.
		const coverageAfter = await (
			await get(`/v1/workplaces/${workplace?.id}/coverage`)
		).json();
		expect(coverageAfter.releases).toEqual([]);
		expect(coverageAfter.pickups).toEqual([]);
		void manager;
	});

	test("coverage endpoint returns releases of EVERY status (no status filter)", async () => {
		const { database: d, app, token } = getContext();
		const { publishScheduleNow } = await import("../../src/routes/publication");

		const managerProfileId = crypto.randomUUID();
		const workerProfileId = crypto.randomUUID();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Coverage No-Filter Workplace" })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
			.returning();
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: "nofilter-manager@example.test" },
			{ id: workerProfileId, email: "nofilter-worker@example.test" },
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
		const worker = required(
			employments.find((row) => row.profileId === workerProfileId),
		);
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: "2026-09-21",
			})
			.returning();
		await d.db.insert(d.shifts).values({
			scheduleId: required(schedule).id,
			employmentId: worker.id,
			positionId: required(position).id,
			startsAt: new Date("2026-09-24T16:00:00.000Z"),
			endsAt: new Date("2026-09-24T22:00:00.000Z"),
		});
		const publication = await publishScheduleNow(
			required(schedule).id,
			managerProfileId,
		);
		const [versionShift] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, publication.version.id));

		// Insert a DECIDED (approved) release directly. The coverage endpoint
		// applies no status filter, so this row must still be returned.
		await d.db.insert(d.shiftReleases).values({
			versionShiftId: required(versionShift).id,
			requestedBy: worker.id,
			reason: "prior approved release",
			status: "approved",
		});

		const managerToken = await token(
			managerProfileId,
			"nofilter-manager@example.test",
		);
		const coverage = await app.handle(
			new Request(`http://localhost/v1/workplaces/${workplace?.id}/coverage`, {
				headers: { authorization: `Bearer ${managerToken}` },
			}),
		);
		expect(coverage.status).toBe(200);
		const body = (await coverage.json()) as {
			releases: { status: string }[];
			pickups: { status: string }[];
		};
		expect(body.releases).toHaveLength(1);
		expect(body.releases[0].status).toBe("approved");
		expect(body.pickups).toEqual([]);
	});
}
