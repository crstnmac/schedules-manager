import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, isNull, sql } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { registerAcceptanceRaceTests } from "./acceptance-race-cases";
import { registerAutoClockOutBreaksTests } from "./auto-clock-out-breaks-cases";
import { registerCoverageTests } from "./coverage-cases";
import { resetAndMigrateDatabase } from "./database";
import {
	emailWebhookTestSecret,
	registerEmailDeliveryTests,
} from "./email-delivery-cases";
import { registerJoinPolicyTests } from "./join-policy-cases";
import { registerOpsTests } from "./ops-cases";
import { registerOwnReleaseTests } from "./own-release-cases";
import { registerPushReceiptTests } from "./push-receipt-cases";
import { registerReadinessTests } from "./readiness-cases";
import { registerReminderTests } from "./reminder-cases";
import { registerTimeClockTests } from "./time-clock-cases";

const integrationDescribe =
	process.env.RUN_INTEGRATION_TESTS === "1" ? describe : describe.skip;

integrationDescribe("Schedule publication", () => {
	let database: typeof import("@SchedulesManager/db");
	let publishScheduleNow: typeof import("../../src/routes/publication").publishScheduleNow;
	let reserveShiftSwap: typeof import("../../src/routes/swaps").reserveShiftSwap;
	let processNotificationOutboxBatch: typeof import("../../src/notify").processNotificationOutboxBatch;
	let app: ReturnType<typeof import("../../src/app").createApp>;
	let jwksServer: ReturnType<typeof Bun.serve>;
	let privateKey: CryptoKey;
	let issuer: string;

	beforeAll(async () => {
		process.env.ZEPTOMAIL_WEBHOOK_SECRET = emailWebhookTestSecret;
		const keys = await generateKeyPair("RS256", { extractable: true });
		privateKey = keys.privateKey;
		const publicJwk = await exportJWK(keys.publicKey);
		publicJwk.kid = "integration-test-key";
		publicJwk.use = "sig";
		jwksServer = Bun.serve({
			port: 0,
			fetch(request) {
				if (
					new URL(request.url).pathname === "/auth/v1/.well-known/jwks.json"
				) {
					return Response.json({ keys: [publicJwk] });
				}
				return new Response("Not found", { status: 404 });
			},
		});
		process.env.SUPABASE_URL = jwksServer.url.origin;
		issuer = `${jwksServer.url.origin}/auth/v1`;
		await resetAndMigrateDatabase();
		database = await import("@SchedulesManager/db");
		await database.db.execute(
			sql`create function reject_published_shift_mutation() returns trigger as $$ begin raise exception 'Published version shifts are immutable'; end; $$ language plpgsql`,
		);
		await database.db.execute(
			sql`create trigger reject_published_shift_mutation before update or delete on version_shifts for each row execute function reject_published_shift_mutation()`,
		);
		({ publishScheduleNow } = await import("../../src/routes/publication"));
		({ reserveShiftSwap } = await import("../../src/routes/swaps"));
		({ processNotificationOutboxBatch } = await import("../../src/notify"));
		const { createApp } = await import("../../src/app");
		app = createApp();
	});

	afterAll(async () => {
		jwksServer?.stop(true);
		await database?.db.$client.end();
	});

	async function managerToken(profileId: string, email: string) {
		return new SignJWT({ email, role: "authenticated" })
			.setProtectedHeader({ alg: "RS256", kid: "integration-test-key" })
			.setSubject(profileId)
			.setIssuer(issuer)
			.setAudience("authenticated")
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(privateKey);
	}

	registerEmailDeliveryTests(() => ({ database, app, token: managerToken }));
	registerTimeClockTests(() => ({ database, app, token: managerToken }));
	registerPushReceiptTests(() => ({ database }));
	registerReadinessTests(() => ({ app }));
	registerReminderTests(() => ({ database, app, token: managerToken }));
	registerJoinPolicyTests(() => ({ database, app, token: managerToken }));
	registerOpsTests(() => ({ database, app, token: managerToken }));
	registerOwnReleaseTests(() => ({ database, app, token: managerToken }));
	registerAcceptanceRaceTests(() => ({ database, app, token: managerToken }));
	registerAutoClockOutBreaksTests(() => ({
		database,
		app,
		token: managerToken,
	}));

	test("republishing never changes the previous published Shift snapshot", async () => {
		const managerProfileId = crypto.randomUUID();
		const firstWorkerProfileId = crypto.randomUUID();
		const secondWorkerProfileId = crypto.randomUUID();

		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Integration Test Restaurant" })
			.returning();
		expect(workplace).toBeDefined();

		const [location] = await database.db
			.insert(database.locations)
			.values({
				workplaceId: workplace?.id ?? "",
				name: "Main Restaurant",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await database.db
			.insert(database.positions)
			.values({ workplaceId: workplace?.id ?? "", name: "Server" })
			.returning();

		await database.db.insert(database.profiles).values([
			{ id: managerProfileId, email: "manager@example.test" },
			{ id: firstWorkerProfileId, email: "first@example.test" },
			{ id: secondWorkerProfileId, email: "second@example.test" },
		]);
		const employments = await database.db
			.insert(database.employments)
			.values([
				{
					workplaceId: workplace?.id ?? "",
					profileId: managerProfileId,
					kind: "manager",
				},
				{
					workplaceId: workplace?.id ?? "",
					profileId: firstWorkerProfileId,
					kind: "worker",
				},
				{
					workplaceId: workplace?.id ?? "",
					profileId: secondWorkerProfileId,
					kind: "worker",
				},
			])
			.returning();
		const firstWorker = employments.find(
			(row) => row.profileId === firstWorkerProfileId,
		);
		const secondWorker = employments.find(
			(row) => row.profileId === secondWorkerProfileId,
		);

		const [schedule] = await database.db
			.insert(database.schedules)
			.values({
				locationId: location?.id ?? "",
				weekStartDate: "2026-09-07",
			})
			.returning();
		const originalStart = new Date("2026-09-08T22:00:00.000Z");
		const originalEnd = new Date("2026-09-09T04:00:00.000Z");
		const [draftShift] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId: schedule?.id ?? "",
				employmentId: firstWorker?.id,
				positionId: position?.id ?? "",
				startsAt: originalStart,
				endsAt: originalEnd,
			})
			.returning();

		const firstPublication = await publishScheduleNow(
			schedule?.id ?? "",
			managerProfileId,
		);
		const [originalSnapshot] = await database.db
			.select()
			.from(database.versionShifts)
			.where(eq(database.versionShifts.versionId, firstPublication.version.id));
		await expect(
			Promise.resolve(
				database.db.execute(
					sql`update version_shifts set employment_id = employment_id where id = ${originalSnapshot?.id}`,
				),
			),
		).rejects.toThrow();
		await expect(
			Promise.resolve(
				database.db.execute(
					sql`delete from version_shifts where id = ${originalSnapshot?.id}`,
				),
			),
		).rejects.toThrow();

		const changedStart = new Date("2026-09-09T00:00:00.000Z");
		await database.db
			.update(database.shifts)
			.set({
				employmentId: secondWorker?.id,
				startsAt: changedStart,
				updatedAt: new Date(),
			})
			.where(eq(database.shifts.id, draftShift?.id ?? ""));

		const secondPublication = await publishScheduleNow(
			schedule?.id ?? "",
			managerProfileId,
		);
		expect(secondPublication.version.versionNumber).toBe(2);

		const [persistedOriginal] = await database.db
			.select()
			.from(database.versionShifts)
			.where(eq(database.versionShifts.id, originalSnapshot?.id ?? ""));
		expect(persistedOriginal?.employmentId).toBe(firstWorker?.id);
		expect(persistedOriginal?.startsAt).toEqual(originalStart);
		expect(persistedOriginal?.endsAt).toEqual(originalEnd);

		const [notificationCountBeforeFailure] = await database.db
			.select({ count: sql<number>`count(*)::int` })
			.from(database.notifications);
		await database.db.execute(sql`
			create function reject_notification_outbox_insert() returns trigger as $$
			begin
				raise exception 'forced publication failure';
			end;
			$$ language plpgsql
		`);
		await database.db.execute(sql`
			create trigger reject_notification_outbox_insert
			before insert on notification_outbox
			for each row execute function reject_notification_outbox_insert()
		`);

		await expect(
			publishScheduleNow(schedule?.id ?? "", managerProfileId),
		).rejects.toThrow();

		const [versionCount] = await database.db
			.select({ count: sql<number>`count(*)::int` })
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(versionCount?.count).toBe(2);
		const [notificationCountAfterFailure] = await database.db
			.select({ count: sql<number>`count(*)::int` })
			.from(database.notifications);
		expect(notificationCountAfterFailure?.count).toBe(
			notificationCountBeforeFailure?.count,
		);

		await database.db.execute(
			sql`drop trigger reject_notification_outbox_insert on notification_outbox`,
		);
		await database.db.execute(
			sql`drop function reject_notification_outbox_insert()`,
		);
	});

	test("simultaneous publications serialize into complete, unique versions", async () => {
		const managerProfileId = crypto.randomUUID();
		const workerProfileId = crypto.randomUUID();
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Concurrent Publication Restaurant" })
			.returning();
		const [location] = await database.db
			.insert(database.locations)
			.values({
				workplaceId: workplace?.id ?? "",
				name: "Concurrent Location",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await database.db
			.insert(database.positions)
			.values({ workplaceId: workplace?.id ?? "", name: "Cook" })
			.returning();
		await database.db.insert(database.profiles).values([
			{ id: managerProfileId, email: "concurrent-manager@example.test" },
			{ id: workerProfileId, email: "concurrent-worker@example.test" },
		]);
		const publicationEmployments = await database.db
			.insert(database.employments)
			.values([
				{
					workplaceId: workplace?.id ?? "",
					profileId: managerProfileId,
					kind: "manager",
				},
				{
					workplaceId: workplace?.id ?? "",
					profileId: workerProfileId,
					kind: "worker",
				},
			])
			.returning();
		const worker = publicationEmployments.find(
			(employment) => employment.profileId === workerProfileId,
		);
		const [schedule] = await database.db
			.insert(database.schedules)
			.values({
				locationId: location?.id ?? "",
				weekStartDate: "2026-09-14",
			})
			.returning();
		await database.db.insert(database.shifts).values({
			scheduleId: schedule?.id ?? "",
			employmentId: worker?.id,
			positionId: position?.id ?? "",
			startsAt: new Date("2026-09-15T15:00:00.000Z"),
			endsAt: new Date("2026-09-15T21:00:00.000Z"),
		});

		const publications = await Promise.all([
			publishScheduleNow(schedule?.id ?? "", managerProfileId),
			publishScheduleNow(schedule?.id ?? "", managerProfileId),
		]);
		expect(
			publications
				.map((result) => result.version.versionNumber)
				.sort((a, b) => a - b),
		).toEqual([1, 2]);

		const versions = await database.db
			.select()
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(versions).toHaveLength(2);
		const snapshots = await database.db
			.select()
			.from(database.versionShifts)
			.where(
				sql`${database.versionShifts.versionId} in (${sql.join(
					versions.map((version) => sql`${version.id}`),
					sql`, `,
				)})`,
			);
		expect(snapshots).toHaveLength(2);

		const token = await managerToken(
			managerProfileId,
			"concurrent-manager@example.test",
		);
		const publishRequest = (key = "same-publication-retry") =>
			app.handle(
				new Request(`http://localhost/v1/schedules/${schedule?.id}/publish`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${token}`,
						"idempotency-key": key,
					},
				}),
			);
		const replayedResponses = await Promise.all(
			Array.from({ length: 8 }, () => publishRequest()),
		);
		expect(replayedResponses.map((response) => response.status)).toEqual(
			Array(8).fill(200),
		);
		expect(await replayedResponses[0]?.clone().json()).toEqual(
			await replayedResponses[1]?.clone().json(),
		);
		const versionsAfterRetry = await database.db
			.select()
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(versionsAfterRetry).toHaveLength(3);
		await database.db.execute(
			sql`create function reject_idempotency_insert() returns trigger as $$ begin raise exception 'forced replay-record failure'; end; $$ language plpgsql`,
		);
		await database.db.execute(
			sql`create trigger reject_idempotency_insert before insert on idempotency_records for each row execute function reject_idempotency_insert()`,
		);
		try {
			expect((await publishRequest("failed-record-publication")).status).toBe(
				500,
			);
			expect(
				await database.db
					.select()
					.from(database.scheduleVersions)
					.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? "")),
			).toHaveLength(3);
		} finally {
			await database.db.execute(
				sql`drop trigger reject_idempotency_insert on idempotency_records`,
			);
			await database.db.execute(sql`drop function reject_idempotency_insert()`);
		}
		expect((await publishRequest("failed-record-publication")).status).toBe(
			200,
		);
		expect(
			await database.db
				.select()
				.from(database.scheduleVersions)
				.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? "")),
		).toHaveLength(4);
	});

	test("simultaneous swap proposals cannot reserve the same Shift", async () => {
		const managerProfileId = crypto.randomUUID();
		const workerProfileIds = [
			crypto.randomUUID(),
			crypto.randomUUID(),
			crypto.randomUUID(),
		];
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Concurrent Swap Restaurant" })
			.returning();
		const [location] = await database.db
			.insert(database.locations)
			.values({
				workplaceId: workplace?.id ?? "",
				name: "Swap Location",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await database.db
			.insert(database.positions)
			.values({ workplaceId: workplace?.id ?? "", name: "Bartender" })
			.returning();
		await database.db.insert(database.profiles).values([
			{ id: managerProfileId, email: "swap-manager@example.test" },
			...workerProfileIds.map((id, index) => ({
				id,
				email: `swap-worker-${index}@example.test`,
			})),
		]);
		await database.db.insert(database.employments).values({
			workplaceId: workplace?.id ?? "",
			profileId: managerProfileId,
			kind: "manager",
		});
		const workers = await database.db
			.insert(database.employments)
			.values(
				workerProfileIds.map((profileId) => ({
					workplaceId: workplace?.id ?? "",
					profileId,
					kind: "worker" as const,
				})),
			)
			.returning();
		const [schedule] = await database.db
			.insert(database.schedules)
			.values({
				locationId: location?.id ?? "",
				weekStartDate: "2026-09-21",
			})
			.returning();
		await database.db.insert(database.shifts).values(
			workers.map((worker, index) => ({
				scheduleId: schedule?.id ?? "",
				employmentId: worker.id,
				positionId: position?.id ?? "",
				startsAt: new Date(`2026-09-${22 + index}T16:00:00.000Z`),
				endsAt: new Date(`2026-09-${22 + index}T22:00:00.000Z`),
			})),
		);
		const publication = await publishScheduleNow(
			schedule?.id ?? "",
			managerProfileId,
		);
		const publishedShifts = await database.db
			.select()
			.from(database.versionShifts)
			.where(eq(database.versionShifts.versionId, publication.version.id));
		const shiftByEmployment = new Map(
			publishedShifts.map((shift) => [shift.employmentId, shift]),
		);
		const [firstWorker, sharedWorker, thirdWorker] = workers;
		const firstShift = shiftByEmployment.get(firstWorker?.id ?? "");
		const sharedShift = shiftByEmployment.get(sharedWorker?.id ?? "");
		const thirdShift = shiftByEmployment.get(thirdWorker?.id ?? "");

		const results = await Promise.allSettled([
			reserveShiftSwap({
				requesterEmploymentId: firstWorker?.id ?? "",
				requesterShiftId: firstShift?.id ?? "",
				counterpartEmploymentId: sharedWorker?.id ?? "",
				counterpartShiftId: sharedShift?.id ?? "",
			}),
			reserveShiftSwap({
				requesterEmploymentId: thirdWorker?.id ?? "",
				requesterShiftId: thirdShift?.id ?? "",
				counterpartEmploymentId: sharedWorker?.id ?? "",
				counterpartShiftId: sharedShift?.id ?? "",
			}),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		const activeSwaps = await database.db.select().from(database.shiftSwaps);
		expect(activeSwaps).toHaveLength(1);

		await database.db.delete(database.shiftSwaps);
		const requesterToken = await managerToken(
			workerProfileIds[0] ?? "",
			"swap-worker-0@example.test",
		);
		const swapRequest = (counterpartIndex = 1) =>
			app.handle(
				new Request("http://localhost/v1/my/swaps", {
					method: "POST",
					headers: {
						authorization: `Bearer ${requesterToken}`,
						"content-type": "application/json",
						"idempotency-key": "same-swap-proposal-retry",
					},
					body: JSON.stringify({
						requesterShiftId: firstShift?.id,
						counterpartEmploymentId: workers[counterpartIndex]?.id,
						counterpartShiftId: shiftByEmployment.get(
							workers[counterpartIndex]?.id ?? "",
						)?.id,
					}),
				}),
			);
		const replayedProposals = await Promise.all([swapRequest(), swapRequest()]);
		expect(replayedProposals.map((response) => response.status)).toEqual([
			200, 200,
		]);
		expect(await replayedProposals[0]?.clone().json()).toEqual(
			await replayedProposals[1]?.clone().json(),
		);
		expect(await database.db.select().from(database.shiftSwaps)).toHaveLength(
			1,
		);
		expect((await swapRequest(2)).status).toBe(409);

		const [persistedSwap] = await database.db
			.select()
			.from(database.shiftSwaps);
		const outsiderManagerProfileId = crypto.randomUUID();
		const [outsiderWorkplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Swap Authorization Other" })
			.returning();
		await database.db.insert(database.profiles).values({
			id: outsiderManagerProfileId,
			email: "swap-outsider-manager@example.test",
		});
		await database.db.insert(database.employments).values({
			workplaceId: outsiderWorkplace?.id ?? "",
			profileId: outsiderManagerProfileId,
			kind: "manager",
		});
		const outsiderManagerToken = await managerToken(
			outsiderManagerProfileId,
			"swap-outsider-manager@example.test",
		);
		const crossWorkplaceDecision = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${outsiderWorkplace?.id}/swaps/${persistedSwap?.id}/decision`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${outsiderManagerToken}`,
						"content-type": "application/json",
						"idempotency-key": "cross-workplace-swap-decision",
					},
					body: JSON.stringify({ decision: "declined" }),
				},
			),
		);
		expect(crossWorkplaceDecision.status).toBe(404);
		const counterpartToken = await managerToken(
			workerProfileIds[1] ?? "",
			"swap-worker-1@example.test",
		);
		const counterpartResponse = await app.handle(
			new Request(`http://localhost/v1/my/swaps/${persistedSwap?.id}/respond`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${counterpartToken}`,
					"content-type": "application/json",
					"idempotency-key": "stale-swap-counterpart-accept",
				},
				body: JSON.stringify({ decision: "accept" }),
			}),
		);
		expect(counterpartResponse.status).toBe(200);
		await publishScheduleNow(schedule?.id ?? "", managerProfileId);
		const managerSwapToken = await managerToken(
			managerProfileId,
			"swap-manager@example.test",
		);
		const staleApproval = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${workplace?.id}/swaps/${persistedSwap?.id}/decision`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${managerSwapToken}`,
						"content-type": "application/json",
						"idempotency-key": "stale-swap-manager-decision",
					},
					body: JSON.stringify({ decision: "approved" }),
				},
			),
		);
		expect(staleApproval.status).toBe(409);
		const [staleSwap] = await database.db
			.select()
			.from(database.shiftSwaps)
			.where(eq(database.shiftSwaps.id, persistedSwap?.id ?? ""));
		expect(staleSwap?.status).toBe("pending_manager");
		await database.db
			.update(database.shiftSwaps)
			.set({ status: "pending_manager" })
			.where(eq(database.shiftSwaps.id, persistedSwap?.id ?? ""));
		await database.db.execute(sql`
			create function reject_swap_publication_outbox() returns trigger as $$
			begin
				raise exception 'forced swap publication failure';
			end;
			$$ language plpgsql
		`);
		await database.db.execute(sql`
			create trigger reject_swap_publication_outbox
			before insert on notification_outbox
			for each row execute function reject_swap_publication_outbox()
		`);
		await expect(
			publishScheduleNow(schedule?.id ?? "", managerProfileId, {
				beforePublish: async (tx) => {
					await tx
						.update(database.shiftSwaps)
						.set({ status: "approved" })
						.where(eq(database.shiftSwaps.id, persistedSwap?.id ?? ""));
					await tx
						.update(database.shifts)
						.set({ employmentId: sharedWorker?.id })
						.where(eq(database.shifts.id, firstShift?.shiftId ?? ""));
					await tx
						.update(database.shifts)
						.set({ employmentId: firstWorker?.id })
						.where(eq(database.shifts.id, sharedShift?.shiftId ?? ""));
				},
			}),
		).rejects.toThrow();
		const [swapAfterFailure] = await database.db
			.select()
			.from(database.shiftSwaps)
			.where(eq(database.shiftSwaps.id, persistedSwap?.id ?? ""));
		expect(swapAfterFailure?.status).toBe("pending_manager");
		const [firstDraftAfterFailure] = await database.db
			.select()
			.from(database.shifts)
			.where(eq(database.shifts.id, firstShift?.shiftId ?? ""));
		const [sharedDraftAfterFailure] = await database.db
			.select()
			.from(database.shifts)
			.where(eq(database.shifts.id, sharedShift?.shiftId ?? ""));
		expect(firstDraftAfterFailure?.employmentId).toBe(firstWorker?.id);
		expect(sharedDraftAfterFailure?.employmentId).toBe(sharedWorker?.id);
		const swapVersions = await database.db
			.select()
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(swapVersions).toHaveLength(2);
		await database.db.execute(
			sql`drop trigger reject_swap_publication_outbox on notification_outbox`,
		);
		await database.db.execute(
			sql`drop function reject_swap_publication_outbox()`,
		);

		const currentVersion = swapVersions.find(
			(version) => version.versionNumber === 2,
		);
		const currentSnapshots = await database.db
			.select()
			.from(database.versionShifts)
			.where(eq(database.versionShifts.versionId, currentVersion?.id ?? ""));
		const [decisionSwap] = await database.db
			.insert(database.shiftSwaps)
			.values({
				requesterEmploymentId: firstWorker?.id ?? "",
				requesterShiftId:
					currentSnapshots.find(
						(shift) => shift.employmentId === firstWorker?.id,
					)?.id ?? "",
				counterpartEmploymentId: sharedWorker?.id ?? "",
				counterpartShiftId:
					currentSnapshots.find(
						(shift) => shift.employmentId === sharedWorker?.id,
					)?.id ?? "",
				status: "pending_manager",
			})
			.returning();
		const decideSwap = (decision: "approved" | "declined", key: string) =>
			app.handle(
				new Request(
					`http://localhost/v1/workplaces/${workplace?.id}/swaps/${decisionSwap?.id}/decision`,
					{
						method: "POST",
						headers: {
							authorization: `Bearer ${managerSwapToken}`,
							"content-type": "application/json",
							"idempotency-key": key,
						},
						body: JSON.stringify({ decision }),
					},
				),
			);
		await database.db
			.update(database.employments)
			.set({ status: "deactivated" })
			.where(eq(database.employments.id, sharedWorker?.id ?? ""));
		expect(
			(await decideSwap("approved", "inactive-worker-decision")).status,
		).toBe(409);
		await database.db
			.update(database.employments)
			.set({ status: "active" })
			.where(eq(database.employments.id, sharedWorker?.id ?? ""));
		await database.db
			.update(database.shifts)
			.set({ endsAt: new Date("2026-09-22T23:00:00.000Z") })
			.where(eq(database.shifts.id, firstShift?.shiftId ?? ""));
		expect((await decideSwap("approved", "edited-draft-decision")).status).toBe(
			409,
		);
		await database.db
			.update(database.shifts)
			.set({ endsAt: firstShift?.endsAt })
			.where(eq(database.shifts.id, firstShift?.shiftId ?? ""));
		const [timeOff] = await database.db
			.insert(database.timeOffRequests)
			.values({
				employmentId: sharedWorker?.id ?? "",
				startsAt: firstShift?.startsAt ?? new Date(),
				endsAt: firstShift?.endsAt ?? new Date(),
				status: "approved",
			})
			.returning();
		expect((await decideSwap("approved", "timeoff-swap-decision")).status).toBe(
			409,
		);
		await database.db
			.delete(database.timeOffRequests)
			.where(eq(database.timeOffRequests.id, timeOff?.id ?? ""));
		const [overlappingDraft] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId: schedule?.id ?? "",
				employmentId: sharedWorker?.id,
				positionId: position?.id ?? "",
				startsAt: firstShift?.startsAt ?? new Date(),
				endsAt: firstShift?.endsAt ?? new Date(),
			})
			.returning();
		expect((await decideSwap("approved", "overlap-swap-decision")).status).toBe(
			409,
		);
		await database.db
			.delete(database.shifts)
			.where(eq(database.shifts.id, overlappingDraft?.id ?? ""));
		await database.db.execute(
			sql`create function reject_swap_api_outbox() returns trigger as $$ begin raise exception 'forced swap API failure'; end; $$ language plpgsql`,
		);
		await database.db.execute(
			sql`create trigger reject_swap_api_outbox before insert on notification_outbox for each row execute function reject_swap_api_outbox()`,
		);
		try {
			expect((await decideSwap("approved", "rollback-swap-api")).status).toBe(
				500,
			);
			const [rolledBackSwap] = await database.db
				.select()
				.from(database.shiftSwaps)
				.where(eq(database.shiftSwaps.id, decisionSwap?.id ?? ""));
			expect(rolledBackSwap?.status).toBe("pending_manager");
			const [rolledBackDraft] = await database.db
				.select()
				.from(database.shifts)
				.where(eq(database.shifts.id, firstShift?.shiftId ?? ""));
			expect(rolledBackDraft?.employmentId).toBe(firstWorker?.id);
			expect(
				await database.db
					.select()
					.from(database.scheduleVersions)
					.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? "")),
			).toHaveLength(2);
		} finally {
			await database.db.execute(
				sql`drop trigger reject_swap_api_outbox on notification_outbox`,
			);
			await database.db.execute(sql`drop function reject_swap_api_outbox()`);
		}
		const decisions = await Promise.all([
			decideSwap("approved", "competing-swap-approve"),
			decideSwap("declined", "competing-swap-decline"),
		]);
		expect(decisions.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);
		const [decidedSwap] = await database.db
			.select()
			.from(database.shiftSwaps)
			.where(eq(database.shiftSwaps.id, decisionSwap?.id ?? ""));
		const approved = decidedSwap?.status === "approved";
		expect(decidedSwap?.status).toBe(
			approved ? "approved" : "declined_by_manager",
		);
		const finalVersions = await database.db
			.select()
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(finalVersions).toHaveLength(approved ? 3 : 2);
		const [finalDraft] = await database.db
			.select()
			.from(database.shifts)
			.where(eq(database.shifts.id, firstShift?.shiftId ?? ""));
		expect(finalDraft?.employmentId).toBe(
			approved ? sharedWorker?.id : firstWorker?.id,
		);
		expect(
			await database.db
				.select()
				.from(database.versionShifts)
				.where(eq(database.versionShifts.versionId, currentVersion?.id ?? "")),
		).toEqual(currentSnapshots);
		const makeResponseSwap = async () => {
			const [row] = await database.db
				.insert(database.shiftSwaps)
				.values({
					requesterEmploymentId: firstWorker?.id ?? "",
					requesterShiftId: firstShift?.id ?? "",
					counterpartEmploymentId: sharedWorker?.id ?? "",
					counterpartShiftId: sharedShift?.id ?? "",
				})
				.returning();
			return row?.id ?? "";
		};
		const respond = (id: string, decision: "accept" | "decline") =>
			app.handle(
				new Request(`http://localhost/v1/my/swaps/${id}/respond`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${counterpartToken}`,
						"content-type": "application/json",
						"idempotency-key": `response-${decision}-${id}`,
					},
					body: JSON.stringify({ decision }),
				}),
			);
		const responseSwapId = await makeResponseSwap();
		const counterpartRace = await Promise.all([
			respond(responseSwapId, "accept"),
			respond(responseSwapId, "decline"),
		]);
		expect(counterpartRace.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);
		const cancellationSwapId = await makeResponseSwap();
		const cancellationRace = await Promise.all([
			respond(cancellationSwapId, "accept"),
			app.handle(
				new Request(
					`http://localhost/v1/my/swaps/${cancellationSwapId}/cancel`,
					{
						method: "POST",
						headers: {
							authorization: `Bearer ${requesterToken}`,
							"idempotency-key": `cancel-${cancellationSwapId}`,
						},
					},
				),
			),
		]);
		// Cancellation after acceptance is valid; both successes are a legal serial order.
		expect(
			cancellationRace.every((response) =>
				[200, 409].includes(response.status),
			),
		).toBe(true);
		expect(cancellationRace.some((response) => response.status === 200)).toBe(
			true,
		);
		const [cancelledSwap] = await database.db
			.select()
			.from(database.shiftSwaps)
			.where(eq(database.shiftSwaps.id, cancellationSwapId));
		// If cancellation read the old status then lost its guarded update, acceptance may win.
		expect(["cancelled", "pending_manager"]).toContain(cancelledSwap?.status);
	});

	test("invitation creation and resend replay enqueue one email per command", async () => {
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Invitation Replay" })
			.returning();
		const profileId = crypto.randomUUID();
		await database.db
			.insert(database.profiles)
			.values({ id: profileId, email: "invite-manager@example.test" });
		await database.db
			.insert(database.employments)
			.values({ profileId, workplaceId: workplace?.id ?? "", kind: "manager" });
		const token = await managerToken(profileId, "invite-manager@example.test");
		const request = (path: string, key: string, body?: unknown) =>
			app.handle(
				new Request(
					`http://localhost/v1/workplaces/${workplace?.id}/invitations${path}`,
					{
						method: "POST",
						headers: {
							authorization: `Bearer ${token}`,
							"content-type": "application/json",
							"idempotency-key": key,
						},
						...(body ? { body: JSON.stringify(body) } : {}),
					},
				),
			);
		const create = () =>
			request("", "create-invitation-replay", {
				email: "new-worker@integration.schedulesmanager.dev",
				kind: "worker",
			});
		const created = await Promise.all([create(), create()]);
		expect(created.map((response) => response.status)).toEqual([200, 200]);
		const createdBody = await created[0]?.json();
		expect(await created[1]?.json()).toEqual(createdBody);
		const invitationId = createdBody.invitation.id;
		const emails = () =>
			database.db
				.select()
				.from(database.emailDeliveries)
				.where(eq(database.emailDeliveries.invitationId, invitationId));
		expect(await emails()).toHaveLength(1);
		const resend = () =>
			request(`/${invitationId}/resend`, "resend-invitation-replay");
		const resent = await Promise.all([resend(), resend()]);
		expect(resent.map((response) => response.status)).toEqual([200, 200]);
		const resentBody = await resent[0]?.json();
		expect(await resent[1]?.json()).toEqual(resentBody);
		expect(resentBody.invitation.token).not.toBe(createdBody.invitation.token);
		expect(await emails()).toHaveLength(2);
		expect(
			(
				await request("", "create-invitation-replay", {
					email: "different-worker@integration.schedulesmanager.dev",
					kind: "worker",
				})
			).status,
		).toBe(409);
		expect(
			await database.db
				.select()
				.from(database.invitations)
				.where(eq(database.invitations.workplaceId, workplace?.id ?? "")),
		).toHaveLength(1);
	});

	test("invitations enforce recipient identity, expiry, scoped acceptance, and single use", async () => {
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Invitation Test" })
			.returning();
		const [location] = await database.db
			.insert(database.locations)
			.values({
				workplaceId: workplace?.id ?? "",
				name: "Invitation Location",
				timezone: "UTC",
			})
			.returning();
		const [position] = await database.db
			.insert(database.positions)
			.values({ workplaceId: workplace?.id ?? "", name: "Invitation Position" })
			.returning();
		const recipientId = crypto.randomUUID();
		const outsiderId = crypto.randomUUID();
		await database.db.insert(database.profiles).values([
			{ id: recipientId, email: "invite-recipient@example.test" },
			{ id: outsiderId, email: "invite-outsider@example.test" },
		]);
		const recipientToken = await managerToken(
			recipientId,
			"invite-recipient@example.test",
		);
		const outsiderToken = await managerToken(
			outsiderId,
			"invite-outsider@example.test",
		);
		const [invitation] = await database.db
			.insert(database.invitations)
			.values({
				workplaceId: workplace?.id ?? "",
				email: "invite-recipient@example.test",
				expiresAt: new Date(Date.now() + 60_000),
			})
			.returning();
		await database.db.insert(database.invitationLocations).values({
			invitationId: invitation?.id ?? "",
			locationId: location?.id ?? "",
		});
		await database.db.insert(database.invitationPositions).values({
			invitationId: invitation?.id ?? "",
			positionId: position?.id ?? "",
		});
		const accept = (
			token: string,
			invitationToken = invitation?.token,
			idempotencyKey?: string,
		) =>
			app.handle(
				new Request("http://localhost/v1/invitations/accept", {
					method: "POST",
					headers: {
						authorization: `Bearer ${token}`,
						"content-type": "application/json",
						...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
					},
					body: JSON.stringify({ token: invitationToken }),
				}),
			);
		expect((await accept(outsiderToken)).status).toBe(403);
		const outsiderPending = await app.handle(
			new Request("http://localhost/v1/invitations/pending", {
				headers: { authorization: `Bearer ${outsiderToken}` },
			}),
		);
		expect((await outsiderPending.json()).invitations).toEqual([]);
		const accepted = await accept(recipientToken);
		expect(accepted.status).toBe(200);
		const acceptedBody = await accepted.json();
		const [employment] = await database.db
			.select()
			.from(database.employments)
			.where(eq(database.employments.profileId, recipientId));
		expect(employment?.id).toBe(acceptedBody.employment.id);
		expect(employment?.workplaceId).toBe(workplace?.id);
		expect(employment?.kind).toBe("worker");
		const locationScope = await database.db
			.select()
			.from(database.employmentLocations)
			.where(
				eq(database.employmentLocations.employmentId, employment?.id ?? ""),
			);
		const positionScope = await database.db
			.select()
			.from(database.employmentPositions)
			.where(
				eq(database.employmentPositions.employmentId, employment?.id ?? ""),
			);
		expect(locationScope.map((scope) => scope.locationId)).toEqual([
			location?.id,
		]);
		expect(positionScope.map((scope) => scope.positionId)).toEqual([
			position?.id,
		]);
		expect((await accept(recipientToken)).status).toBe(409);
		expect(
			await database.db
				.select()
				.from(database.employments)
				.where(eq(database.employments.profileId, recipientId)),
		).toHaveLength(1);

		const [replayInvitation] = await database.db
			.insert(database.invitations)
			.values({
				workplaceId: workplace?.id ?? "",
				email: "invite-recipient@example.test",
				expiresAt: new Date(Date.now() + 60_000),
			})
			.returning();
		const replayed = await Promise.all([
			accept(
				recipientToken,
				replayInvitation?.token,
				"accept-invitation-replay",
			),
			accept(
				recipientToken,
				replayInvitation?.token,
				"accept-invitation-replay",
			),
		]);
		expect(replayed.map((response) => response.status)).toEqual([200, 200]);
		expect(await replayed[0]?.json()).toEqual(await replayed[1]?.json());
		expect(
			(
				await accept(
					recipientToken,
					replayInvitation?.token,
					"accept-invitation-different-key",
				)
			).status,
		).toBe(409);
		expect(
			await database.db
				.select()
				.from(database.employments)
				.where(eq(database.employments.profileId, recipientId)),
		).toHaveLength(1);

		const [expired] = await database.db
			.insert(database.invitations)
			.values({
				workplaceId: workplace?.id ?? "",
				email: "invite-recipient@example.test",
				expiresAt: new Date(Date.now() - 1000),
			})
			.returning();
		expect((await accept(recipientToken, expired?.token)).status).toBe(409);
		const lookup = await app.handle(
			new Request(`http://localhost/v1/invitations/${expired?.token}`),
		);
		expect((await lookup.json()).status).toBe("expired");
		const [expiredAfter] = await database.db
			.select()
			.from(database.invitations)
			.where(eq(database.invitations.id, expired?.id ?? ""));
		expect(expiredAfter?.acceptedAt).toBeNull();
	});

	test("workplace routes reject authenticated members of another workplace", async () => {
		const managerProfileId = crypto.randomUUID();
		const outsiderProfileId = crypto.randomUUID();
		const [targetWorkplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Authorization Target" })
			.returning();
		const [otherWorkplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Authorization Other" })
			.returning();
		await database.db.insert(database.profiles).values([
			{ id: managerProfileId, email: "isolation-manager@example.test" },
			{ id: outsiderProfileId, email: "isolation-outsider@example.test" },
		]);
		await database.db.insert(database.employments).values([
			{
				workplaceId: targetWorkplace?.id ?? "",
				profileId: managerProfileId,
				kind: "manager",
			},
			{
				workplaceId: otherWorkplace?.id ?? "",
				profileId: outsiderProfileId,
				kind: "worker",
			},
		]);
		await database.db.insert(database.positions).values({
			workplaceId: targetWorkplace?.id ?? "",
			name: "Private Position",
		});
		const managerAccessToken = await managerToken(
			managerProfileId,
			"isolation-manager@example.test",
		);
		const outsiderAccessToken = await managerToken(
			outsiderProfileId,
			"isolation-outsider@example.test",
		);
		const positionsRequest = (token: string) =>
			app.handle(
				new Request(
					`http://localhost/v1/workplaces/${targetWorkplace?.id}/positions`,
					{ headers: { authorization: `Bearer ${token}` } },
				),
			);
		expect((await positionsRequest(managerAccessToken)).status).toBe(200);
		expect((await positionsRequest(outsiderAccessToken)).status).toBe(403);
		const forbiddenInvitation = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${targetWorkplace?.id}/invitations`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${outsiderAccessToken}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email: "unauthorized-invite@example.test",
						kind: "worker",
					}),
				},
			),
		);
		expect(forbiddenInvitation.status).toBe(403);
	});

	test("competing pickup approvals assign exactly one Worker", async () => {
		const managerProfileId = crypto.randomUUID();
		const workerProfileIds = [crypto.randomUUID(), crypto.randomUUID()];
		const managerEmail = "pickup-manager@example.test";
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Competing Pickup Restaurant" })
			.returning();
		const [location] = await database.db
			.insert(database.locations)
			.values({
				workplaceId: workplace?.id ?? "",
				name: "Pickup Location",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await database.db
			.insert(database.positions)
			.values({ workplaceId: workplace?.id ?? "", name: "Host" })
			.returning();
		await database.db.insert(database.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			...workerProfileIds.map((id, index) => ({
				id,
				email: `pickup-worker-${index}@example.test`,
			})),
		]);
		const employments = await database.db
			.insert(database.employments)
			.values([
				{
					workplaceId: workplace?.id ?? "",
					profileId: managerProfileId,
					kind: "manager",
				},
				...workerProfileIds.map((profileId) => ({
					workplaceId: workplace?.id ?? "",
					profileId,
					kind: "worker" as const,
				})),
			])
			.returning();
		const workers = employments.filter((employment) =>
			workerProfileIds.includes(employment.profileId),
		);
		const [schedule] = await database.db
			.insert(database.schedules)
			.values({
				locationId: location?.id ?? "",
				weekStartDate: "2026-09-28",
			})
			.returning();
		const [draftShift] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId: schedule?.id ?? "",
				employmentId: null,
				positionId: position?.id ?? "",
				startsAt: new Date("2026-09-29T16:00:00.000Z"),
				endsAt: new Date("2026-09-29T22:00:00.000Z"),
			})
			.returning();
		const [openShift] = await database.db
			.insert(database.openShifts)
			.values({
				shiftId: draftShift?.id ?? "",
				locationId: location?.id ?? "",
				positionId: position?.id ?? "",
			})
			.returning();
		const pickups = await database.db
			.insert(database.shiftPickups)
			.values(
				workers.map((worker) => ({
					openShiftId: openShift?.id ?? "",
					requestedBy: worker.id,
				})),
			)
			.returning();
		const token = await managerToken(managerProfileId, managerEmail);

		const idempotencyKeys = pickups.map(
			(_, index) => `pickup-approval-${index}`,
		);
		const pickupDecisionRequest = (
			pickupId: string,
			idempotencyKey: string,
			decision: "approved" | "declined" = "approved",
		) =>
			app.handle(
				new Request(
					`http://localhost/v1/workplaces/${workplace?.id}/pickups/${pickupId}/decision`,
					{
						method: "POST",
						headers: {
							authorization: `Bearer ${token}`,
							"content-type": "application/json",
							"idempotency-key": idempotencyKey,
						},
						body: JSON.stringify({ decision }),
					},
				),
			);
		const responses = await Promise.all(
			pickups.map((pickup, index) =>
				pickupDecisionRequest(pickup.id, idempotencyKeys[index] ?? ""),
			),
		);
		expect(responses.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);

		const [persistedOpenShift] = await database.db
			.select()
			.from(database.openShifts)
			.where(eq(database.openShifts.id, openShift?.id ?? ""));
		expect(persistedOpenShift?.status).toBe("filled");
		const [assignedDraft] = await database.db
			.select()
			.from(database.shifts)
			.where(eq(database.shifts.id, draftShift?.id ?? ""));
		expect(workers.map((worker) => worker.id)).toContain(
			assignedDraft?.employmentId,
		);

		const persistedPickups = await database.db
			.select()
			.from(database.shiftPickups)
			.where(eq(database.shiftPickups.openShiftId, openShift?.id ?? ""));
		expect(
			persistedPickups.filter((pickup) => pickup.status === "approved"),
		).toHaveLength(1);
		expect(
			persistedPickups.filter((pickup) => pickup.status === "declined"),
		).toHaveLength(1);

		const versions = await database.db
			.select()
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(versions).toHaveLength(1);
		const [publishedAssignment] = await database.db
			.select()
			.from(database.versionShifts)
			.where(eq(database.versionShifts.versionId, versions[0]?.id ?? ""));
		expect(publishedAssignment?.employmentId).toBe(assignedDraft?.employmentId);

		const winnerIndex = responses.findIndex(
			(response) => response.status === 200,
		);
		const replay = await pickupDecisionRequest(
			pickups[winnerIndex]?.id ?? "",
			idempotencyKeys[winnerIndex] ?? "",
		);
		expect(replay.status).toBe(200);
		expect(await replay.json()).toEqual(
			await responses[winnerIndex]?.clone().json(),
		);
		const mismatchedReplay = await pickupDecisionRequest(
			pickups[winnerIndex]?.id ?? "",
			idempotencyKeys[winnerIndex] ?? "",
			"declined",
		);
		expect(mismatchedReplay.status).toBe(409);
		const versionsAfterReplays = await database.db
			.select()
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(versionsAfterReplays).toHaveLength(1);

		const assignedWorker = workers.find(
			(worker) => worker.id === assignedDraft?.employmentId,
		);
		expect(assignedWorker).toBeDefined();
		const assignedWorkerIndex = workerProfileIds.indexOf(
			assignedWorker?.profileId ?? "",
		);
		const workerToken = await managerToken(
			assignedWorker?.profileId ?? "",
			`pickup-worker-${assignedWorkerIndex}@example.test`,
		);
		const workerRequest = (path: string, idempotencyKey: string) =>
			app.handle(
				new Request(`http://localhost${path}`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${workerToken}`,
						"idempotency-key": idempotencyKey,
					},
				}),
			);

		const acknowledgementPath = `/v1/my/deliveries/${versions[0]?.id}/acknowledge`;
		const firstAcknowledgement = await workerRequest(
			acknowledgementPath,
			"worker-delivery-retry",
		);
		const replayedAcknowledgement = await workerRequest(
			acknowledgementPath,
			"worker-delivery-retry",
		);
		expect(firstAcknowledgement.status).toBe(200);
		expect(replayedAcknowledgement.status).toBe(200);
		expect(await replayedAcknowledgement.json()).toEqual(
			await firstAcknowledgement.json(),
		);

		const [acceptance] = await database.db
			.insert(database.shiftAcceptances)
			.values({
				versionId: versions[0]?.id ?? "",
				versionShiftId: publishedAssignment?.id ?? "",
				employmentId: assignedWorker?.id ?? "",
				changeSummary: "Pickup assignment confirmation",
			})
			.returning();
		const acceptancePath = `/v1/my/shift-acceptances/${acceptance?.id}`;
		const firstAcceptance = await workerRequest(
			`${acceptancePath}/accept`,
			"worker-acceptance-retry",
		);
		const replayedAcceptance = await workerRequest(
			`${acceptancePath}/accept`,
			"worker-acceptance-retry",
		);
		expect(firstAcceptance.status).toBe(200);
		expect(replayedAcceptance.status).toBe(200);
		expect(await replayedAcceptance.json()).toEqual(
			await firstAcceptance.json(),
		);
		const mismatchedAcceptance = await workerRequest(
			`${acceptancePath}/decline`,
			"worker-acceptance-retry",
		);
		expect(mismatchedAcceptance.status).toBe(409);
		const [persistedAcceptance] = await database.db
			.select()
			.from(database.shiftAcceptances)
			.where(eq(database.shiftAcceptances.id, acceptance?.id ?? ""));
		expect(persistedAcceptance?.status).toBe("accepted");

		const rollbackWorker = workers.find(
			(worker) => worker.id !== assignedDraft?.employmentId,
		);
		const [rollbackDraft] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId: schedule?.id ?? "",
				employmentId: null,
				positionId: position?.id ?? "",
				startsAt: new Date("2026-09-30T16:00:00.000Z"),
				endsAt: new Date("2026-09-30T22:00:00.000Z"),
			})
			.returning();
		const [rollbackOpenShift] = await database.db
			.insert(database.openShifts)
			.values({
				shiftId: rollbackDraft?.id ?? "",
				locationId: location?.id ?? "",
				positionId: position?.id ?? "",
			})
			.returning();
		const [rollbackPickup] = await database.db
			.insert(database.shiftPickups)
			.values({
				openShiftId: rollbackOpenShift?.id ?? "",
				requestedBy: rollbackWorker?.id ?? "",
			})
			.returning();
		await database.db.execute(sql`
			create function reject_pickup_publication_outbox() returns trigger as $$
			begin
				raise exception 'forced pickup publication failure';
			end;
			$$ language plpgsql
		`);
		await database.db.execute(sql`
			create trigger reject_pickup_publication_outbox
			before insert on notification_outbox
			for each row execute function reject_pickup_publication_outbox()
		`);
		const failedPickup = await pickupDecisionRequest(
			rollbackPickup?.id ?? "",
			"pickup-publication-failure",
		);
		expect(failedPickup.status).toBe(500);
		const [rollbackOpenShiftAfter] = await database.db
			.select()
			.from(database.openShifts)
			.where(eq(database.openShifts.id, rollbackOpenShift?.id ?? ""));
		const [rollbackPickupAfter] = await database.db
			.select()
			.from(database.shiftPickups)
			.where(eq(database.shiftPickups.id, rollbackPickup?.id ?? ""));
		const [rollbackDraftAfter] = await database.db
			.select()
			.from(database.shifts)
			.where(eq(database.shifts.id, rollbackDraft?.id ?? ""));
		expect(rollbackOpenShiftAfter?.status).toBe("open");
		expect(rollbackPickupAfter?.status).toBe("pending");
		expect(rollbackDraftAfter?.employmentId).toBeNull();
		const versionsAfterFailedPickup = await database.db
			.select()
			.from(database.scheduleVersions)
			.where(eq(database.scheduleVersions.scheduleId, schedule?.id ?? ""));
		expect(versionsAfterFailedPickup).toHaveLength(1);
		await database.db.execute(
			sql`drop trigger reject_pickup_publication_outbox on notification_outbox`,
		);
		await database.db.execute(
			sql`drop function reject_pickup_publication_outbox()`,
		);

		const [releaseDraft] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId: schedule?.id ?? "",
				employmentId: assignedWorker?.id,
				positionId: position?.id ?? "",
				startsAt: new Date("2026-10-01T16:00:00.000Z"),
				endsAt: new Date("2026-10-01T22:00:00.000Z"),
			})
			.returning();
		const [releaseVersionShift] = await database.db
			.insert(database.versionShifts)
			.values({
				versionId: versions[0]?.id ?? "",
				shiftId: releaseDraft?.id,
				employmentId: assignedWorker?.id,
				positionId: position?.id ?? "",
				startsAt: releaseDraft?.startsAt ?? new Date(),
				endsAt: releaseDraft?.endsAt ?? new Date(),
			})
			.returning();
		const [releaseRequest] = await database.db
			.insert(database.shiftReleases)
			.values({
				versionShiftId: releaseVersionShift?.id ?? "",
				requestedBy: assignedWorker?.id ?? "",
			})
			.returning();
		await database.db.execute(sql`
			create function reject_release_outbox() returns trigger as $$
			begin
				raise exception 'forced release notification failure';
			end;
			$$ language plpgsql
		`);
		await database.db.execute(sql`
			create trigger reject_release_outbox
			before insert on notification_outbox
			for each row execute function reject_release_outbox()
		`);
		const failedRelease = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${workplace?.id}/releases/${releaseRequest?.id}/decision`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${token}`,
						"content-type": "application/json",
						"idempotency-key": "release-approval-failure",
					},
					body: JSON.stringify({ decision: "approved" }),
				},
			),
		);
		expect(failedRelease.status).toBe(500);
		const [releaseAfterFailure] = await database.db
			.select()
			.from(database.shiftReleases)
			.where(eq(database.shiftReleases.id, releaseRequest?.id ?? ""));
		const [releaseDraftAfterFailure] = await database.db
			.select()
			.from(database.shifts)
			.where(eq(database.shifts.id, releaseDraft?.id ?? ""));
		const releaseOpenShifts = await database.db
			.select()
			.from(database.openShifts)
			.where(eq(database.openShifts.shiftId, releaseDraft?.id ?? ""));
		expect(releaseAfterFailure?.status).toBe("pending");
		expect(releaseDraftAfterFailure?.employmentId).toBe(assignedWorker?.id);
		expect(releaseOpenShifts).toHaveLength(0);
		await database.db.execute(
			sql`drop trigger reject_release_outbox on notification_outbox`,
		);
		await database.db.execute(sql`drop function reject_release_outbox()`);

		const pendingBeforeDispatch = await database.db
			.select()
			.from(database.notificationOutbox)
			.where(isNull(database.notificationOutbox.processedAt));
		expect(pendingBeforeDispatch.length).toBeGreaterThan(0);
		const dispatch = await processNotificationOutboxBatch(1_000);
		expect(dispatch.claimed).toBe(pendingBeforeDispatch.length);
		const pendingAfterDispatch = await database.db
			.select()
			.from(database.notificationOutbox)
			.where(isNull(database.notificationOutbox.processedAt));
		expect(pendingAfterDispatch).toHaveLength(0);
	});

	test("publishing unassigned Shifts offers them for pickup", async () => {
		const managerProfileId = crypto.randomUUID();
		const workerProfileId = crypto.randomUUID();
		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Unassigned Offer Cafe" })
			.returning();
		const [location] = await database.db
			.insert(database.locations)
			.values({
				workplaceId: workplace?.id ?? "",
				name: "Dining Room",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await database.db
			.insert(database.positions)
			.values({ workplaceId: workplace?.id ?? "", name: "Server" })
			.returning();
		await database.db.insert(database.profiles).values([
			{ id: managerProfileId, email: "unassigned-manager@example.test" },
			{ id: workerProfileId, email: "unassigned-worker@example.test" },
		]);
		const employments = await database.db
			.insert(database.employments)
			.values([
				{
					workplaceId: workplace?.id ?? "",
					profileId: managerProfileId,
					kind: "manager",
				},
				{
					workplaceId: workplace?.id ?? "",
					profileId: workerProfileId,
					kind: "worker",
				},
			])
			.returning();
		const worker = employments.find((row) => row.profileId === workerProfileId);
		const [schedule] = await database.db
			.insert(database.schedules)
			.values({
				locationId: location?.id ?? "",
				weekStartDate: "2026-10-05",
			})
			.returning();
		const [draftShift] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId: schedule?.id ?? "",
				employmentId: null,
				positionId: position?.id ?? "",
				startsAt: new Date("2026-10-06T16:00:00.000Z"),
				endsAt: new Date("2026-10-06T22:00:00.000Z"),
			})
			.returning();

		await publishScheduleNow(schedule?.id ?? "", managerProfileId);
		const offered = await database.db
			.select()
			.from(database.openShifts)
			.where(eq(database.openShifts.shiftId, draftShift?.id ?? ""));
		expect(offered).toHaveLength(1);
		expect(offered[0]?.status).toBe("open");

		await publishScheduleNow(schedule?.id ?? "", managerProfileId);
		const stillOne = await database.db
			.select()
			.from(database.openShifts)
			.where(eq(database.openShifts.shiftId, draftShift?.id ?? ""));
		expect(stillOne).toHaveLength(1);
		expect(stillOne[0]?.status).toBe("open");

		await database.db
			.update(database.shifts)
			.set({ employmentId: worker?.id, updatedAt: new Date() })
			.where(eq(database.shifts.id, draftShift?.id ?? ""));
		await publishScheduleNow(schedule?.id ?? "", managerProfileId);
		const closed = await database.db
			.select()
			.from(database.openShifts)
			.where(eq(database.openShifts.shiftId, draftShift?.id ?? ""));
		expect(closed).toHaveLength(1);
		expect(closed[0]?.status).toBe("closed");
	});

	// Registered last so its swap/release rows do not precede the fragile
	// global-count assertion in "simultaneous swap proposals cannot reserve
	// the same Shift" above (which counts all shift_swaps rows).
	registerCoverageTests(() => ({ database, app, token: managerToken }));
});
