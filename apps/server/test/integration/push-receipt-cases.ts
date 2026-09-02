import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

export function registerPushReceiptTests(
	getContext: () => { database: typeof import("@SchedulesManager/db") },
) {
	test("receipt polling records provider outcomes and removes invalid tokens", async () => {
		const { database: d } = getContext();
		const { processPushReceiptBatch } = await import("../../src/notify");
		const profileId = crypto.randomUUID();
		await d.db
			.insert(d.profiles)
			.values({ id: profileId, email: "push-receipts@example.test" });
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Push receipts" })
			.returning();
		if (!workplace) throw new Error("Missing workplace");
		const [worker] = await d.db
			.insert(d.employments)
			.values({ profileId, workplaceId: workplace.id, kind: "worker" })
			.returning();
		if (!worker) throw new Error("Missing worker");
		const [notification] = await d.db
			.insert(d.notifications)
			.values({
				employmentId: worker.id,
				kind: "test",
				title: "Receipt test",
				body: "Test",
			})
			.returning();
		if (!notification) throw new Error("Missing notification");
		const [outbox] = await d.db
			.insert(d.notificationOutbox)
			.values({ notificationId: notification.id, processedAt: new Date() })
			.returning();
		if (!outbox) throw new Error("Missing outbox");
		await d.db.insert(d.pushTokens).values({
			employmentId: worker.id,
			expoPushToken: "invalid-device",
			platform: "ios",
		});
		await d.db.insert(d.pushDeliveries).values([
			{
				outboxId: outbox.id,
				token: "invalid-device",
				ticketId: "invalid-ticket",
				availableAt: new Date(0),
			},
			{
				outboxId: outbox.id,
				token: "valid-device",
				ticketId: "valid-ticket",
				availableAt: new Date(0),
			},
		]);
		const originalFetch = globalThis.fetch;
		try {
			globalThis.fetch = (async () =>
				new Response("Unavailable", { status: 503 })) as typeof fetch;
			expect((await processPushReceiptBatch()).claimed).toBe(2);
			const deferred = await d.db
				.select()
				.from(d.pushDeliveries)
				.where(eq(d.pushDeliveries.outboxId, outbox.id));
			expect(
				deferred.every(
					(row) =>
						row.status === "sent" &&
						row.attempts === 1 &&
						row.lockedAt === null &&
						row.availableAt.getTime() > Date.now(),
				),
			).toBe(true);
			await d.db
				.update(d.pushDeliveries)
				.set({ availableAt: new Date(0) })
				.where(eq(d.pushDeliveries.outboxId, outbox.id));
			globalThis.fetch = (async () =>
				Response.json({
					data: {
						"invalid-ticket": {
							status: "error",
							details: { error: "DeviceNotRegistered" },
						},
						"valid-ticket": { status: "ok" },
					},
				})) as typeof fetch;
			expect((await processPushReceiptBatch()).claimed).toBe(2);
			expect((await processPushReceiptBatch()).claimed).toBe(0);
		} finally {
			globalThis.fetch = originalFetch;
		}
		const deliveries = await d.db
			.select()
			.from(d.pushDeliveries)
			.where(eq(d.pushDeliveries.outboxId, outbox.id));
		expect(
			deliveries.find((row) => row.ticketId === "invalid-ticket")?.status,
		).toBe("failed");
		expect(
			deliveries.find((row) => row.ticketId === "valid-ticket")?.status,
		).toBe("delivered");
		expect(
			await d.db
				.select()
				.from(d.pushTokens)
				.where(eq(d.pushTokens.employmentId, worker.id)),
		).toHaveLength(0);
	});
}
