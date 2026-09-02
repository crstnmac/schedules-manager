import { expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (id: string, email: string) => Promise<string>;
};

export function registerReminderTests(getContext: () => Context) {
	test("unacknowledged schedule reminders enqueue inbox notifications and push outbox rows", async () => {
		const { database, app, token } = getContext();
		const {
			db,
			profiles,
			workplaces,
			locations,
			employments,
			schedules,
			scheduleVersions,
			workerDeliveries,
			notifications,
			notificationOutbox,
			auditEvents,
		} = database;

		const managerId = crypto.randomUUID();
		const workerProfileId = crypto.randomUUID();
		const acknowledgedWorkerProfileId = crypto.randomUUID();
		await db.insert(profiles).values([
			{ id: managerId, email: "reminder-manager@example.test" },
			{ id: workerProfileId, email: "reminder-worker@example.test" },
			{
				id: acknowledgedWorkerProfileId,
				email: "reminder-acked@example.test",
			},
		]);
		const [workplace] = await db
			.insert(workplaces)
			.values({ name: "Reminder workplace" })
			.returning();
		if (!workplace) throw new Error("Missing workplace");
		const [location] = await db
			.insert(locations)
			.values({
				workplaceId: workplace.id,
				name: "Reminder location",
				timezone: "America/Chicago",
			})
			.returning();
		if (!location) throw new Error("Missing location");
		const createdEmployments = await db
			.insert(employments)
			.values([
				{
					workplaceId: workplace.id,
					profileId: managerId,
					kind: "manager",
				},
				{
					workplaceId: workplace.id,
					profileId: workerProfileId,
					kind: "worker",
				},
				{
					workplaceId: workplace.id,
					profileId: acknowledgedWorkerProfileId,
					kind: "worker",
				},
			])
			.returning();
		const pendingWorker = createdEmployments.find(
			(row) => row.profileId === workerProfileId,
		);
		const acknowledgedWorker = createdEmployments.find(
			(row) => row.profileId === acknowledgedWorkerProfileId,
		);
		if (!pendingWorker || !acknowledgedWorker)
			throw new Error("Missing worker employments");

		const [schedule] = await db
			.insert(schedules)
			.values({
				locationId: location.id,
				weekStartDate: "2026-09-07",
			})
			.returning();
		if (!schedule) throw new Error("Missing schedule");
		const [version] = await db
			.insert(scheduleVersions)
			.values({
				scheduleId: schedule.id,
				versionNumber: 1,
				publishedBy: managerId,
			})
			.returning();
		if (!version) throw new Error("Missing version");
		await db.insert(workerDeliveries).values([
			{
				versionId: version.id,
				employmentId: pendingWorker.id,
				status: "delivered",
			},
			{
				versionId: version.id,
				employmentId: acknowledgedWorker.id,
				status: "acknowledged",
				acknowledgedAt: new Date(),
			},
		]);

		const response = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${workplace.id}/reminders/unacknowledged`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${await token(
							managerId,
							"reminder-manager@example.test",
						)}`,
						"idempotency-key": "reminder-once",
					},
				},
			),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ reminded: 1 });

		const inbox = await db
			.select()
			.from(notifications)
			.where(
				inArray(notifications.employmentId, [
					pendingWorker.id,
					acknowledgedWorker.id,
				]),
			);
		expect(inbox).toHaveLength(1);
		expect(inbox[0]?.employmentId).toBe(pendingWorker.id);
		expect(inbox[0]?.kind).toBe("schedule_reminder");

		const outbox = await db
			.select()
			.from(notificationOutbox)
			.where(eq(notificationOutbox.notificationId, inbox[0]?.id ?? ""));
		expect(outbox).toHaveLength(1);
		expect(outbox[0]?.processedAt).toBeNull();

		const audits = await db
			.select()
			.from(auditEvents)
			.where(eq(auditEvents.workplaceId, workplace.id));
		expect(
			audits.some((event) => event.action === "schedule.reminder"),
		).toBe(true);
	});
}
