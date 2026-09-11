import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

interface Fixture {
	workplaceId: string;
	locationId: string;
	positionId: string;
	scheduleId: string;
	managerProfileId: string;
	workerAProfileId: string;
	workerBProfileId: string;
	managerEmploymentId: string;
	workerAEmploymentId: string;
	workerBEmploymentId: string;
}

async function seedFixture(
	d: Context["database"],
	label: string,
	flags: Partial<{
		autoAcceptShiftReleases: boolean;
		autoAcceptShiftPickups: boolean;
		autoAcceptShiftSwaps: boolean;
		autoAcceptLateChanges: boolean;
	}>,
): Promise<Fixture> {
	const slug = label.toLowerCase().replaceAll(" ", "-");
	const managerProfileId = crypto.randomUUID();
	const workerAProfileId = crypto.randomUUID();
	const workerBProfileId = crypto.randomUUID();

	const [workplace] = await d.db
		.insert(d.workplaces)
		.values({ name: label, ...flags })
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
		{ id: workerAProfileId, email: `${slug}-worker-a@example.test` },
		{ id: workerBProfileId, email: `${slug}-worker-b@example.test` },
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

	return {
		workplaceId: required(workplace).id,
		locationId: required(location).id,
		positionId: required(position).id,
		scheduleId: "",
		managerProfileId,
		workerAProfileId,
		workerBProfileId,
		managerEmploymentId: required(
			employments.find((row) => row.profileId === managerProfileId),
		).id,
		workerAEmploymentId: required(
			employments.find((row) => row.profileId === workerAProfileId),
		).id,
		workerBEmploymentId: required(
			employments.find((row) => row.profileId === workerBProfileId),
		).id,
	};
}

export function registerWorkspaceAutoAcceptTests(getContext: () => Context) {
	test("auto-accept release opens the shift and auto-accept pickup assigns it", async () => {
		const { database: d, app, token } = getContext();
		const { publishScheduleNow } = await import("../../src/routes/publication");
		const fixture = await seedFixture(d, "Auto Accept Coverage", {
			autoAcceptShiftReleases: true,
			autoAcceptShiftPickups: true,
		});

		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: fixture.locationId,
				weekStartDate: "2026-10-05",
			})
			.returning();
		const [draft] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: fixture.workerAEmploymentId,
				positionId: fixture.positionId,
				startsAt: new Date("2026-10-06T16:00:00.000Z"),
				endsAt: new Date("2026-10-06T22:00:00.000Z"),
			})
			.returning();
		const publication = await publishScheduleNow(
			required(schedule).id,
			fixture.managerProfileId,
		);
		const [versionShift] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, publication.version.id));

		const workerAToken = await token(
			fixture.workerAProfileId,
			"auto-accept-coverage-worker-a@example.test",
		);
		const workerBToken = await token(
			fixture.workerBProfileId,
			"auto-accept-coverage-worker-b@example.test",
		);

		const releaseRes = await app.handle(
			new Request("http://localhost/v1/my/releases", {
				method: "POST",
				headers: {
					authorization: `Bearer ${workerAToken}`,
					"content-type": "application/json",
					"idempotency-key": "auto-accept-release",
				},
				body: JSON.stringify({ versionShiftId: required(versionShift).id }),
			}),
		);
		expect(releaseRes.status).toBe(200);
		expect(await releaseRes.json()).toEqual({
			release: expect.objectContaining({ status: "approved" }),
		});

		const [openShift] = await d.db
			.select()
			.from(d.openShifts)
			.where(eq(d.openShifts.shiftId, required(draft).id));
		expect(openShift?.status).toBe("open");
		expect(openShift?.releasedFrom).toBe(fixture.workerAEmploymentId);

		const pickupRes = await app.handle(
			new Request(
				`http://localhost/v1/open-shifts/${required(openShift).id}/pickups`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${workerBToken}`,
						"idempotency-key": "auto-accept-pickup",
					},
				},
			),
		);
		expect(pickupRes.status).toBe(200);
		const pickupBody = (await pickupRes.json()) as {
			pickup: { status: string };
			publishedVersion?: number;
		};
		expect(pickupBody.pickup.status).toBe("approved");
		expect(pickupBody.publishedVersion).toBeGreaterThan(0);

		const [assigned] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, required(draft).id));
		expect(assigned?.employmentId).toBe(fixture.workerBEmploymentId);
	});

	test("auto-accept swap applies the exchange when the counterpart agrees", async () => {
		const { database: d, app, token } = getContext();
		const { publishScheduleNow } = await import("../../src/routes/publication");
		const fixture = await seedFixture(d, "Auto Accept Swap", {
			autoAcceptShiftSwaps: true,
		});

		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: fixture.locationId,
				weekStartDate: "2026-10-12",
			})
			.returning();
		const [draftA] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: fixture.workerAEmploymentId,
				positionId: fixture.positionId,
				startsAt: new Date("2026-10-13T16:00:00.000Z"),
				endsAt: new Date("2026-10-13T22:00:00.000Z"),
			})
			.returning();
		const [draftB] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: fixture.workerBEmploymentId,
				positionId: fixture.positionId,
				startsAt: new Date("2026-10-14T16:00:00.000Z"),
				endsAt: new Date("2026-10-14T22:00:00.000Z"),
			})
			.returning();
		const publication = await publishScheduleNow(
			required(schedule).id,
			fixture.managerProfileId,
		);
		const versionShifts = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, publication.version.id));
		const versionShiftA = required(
			versionShifts.find((row) => row.shiftId === required(draftA).id),
		);
		const versionShiftB = required(
			versionShifts.find((row) => row.shiftId === required(draftB).id),
		);

		const workerAToken = await token(
			fixture.workerAProfileId,
			"auto-accept-swap-worker-a@example.test",
		);
		const workerBToken = await token(
			fixture.workerBProfileId,
			"auto-accept-swap-worker-b@example.test",
		);

		const proposeRes = await app.handle(
			new Request("http://localhost/v1/my/swaps", {
				method: "POST",
				headers: {
					authorization: `Bearer ${workerAToken}`,
					"content-type": "application/json",
					"idempotency-key": "auto-accept-swap-propose",
				},
				body: JSON.stringify({
					requesterShiftId: versionShiftA.id,
					counterpartEmploymentId: fixture.workerBEmploymentId,
					counterpartShiftId: versionShiftB.id,
				}),
			}),
		);
		expect(proposeRes.status).toBe(200);
		const proposed = (await proposeRes.json()) as {
			swap: { id: string; status: string };
		};
		expect(proposed.swap.status).toBe("pending_counterpart");

		const respondRes = await app.handle(
			new Request(`http://localhost/v1/my/swaps/${proposed.swap.id}/respond`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${workerBToken}`,
					"content-type": "application/json",
					"idempotency-key": "auto-accept-swap-respond",
				},
				body: JSON.stringify({ decision: "accept" }),
			}),
		);
		expect(respondRes.status).toBe(200);
		const responded = (await respondRes.json()) as {
			swap: { status: string; decidedAt: string | null };
		};
		expect(responded.swap.status).toBe("approved");
		expect(responded.swap.decidedAt).not.toBeNull();

		const [reassignedA] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, required(draftA).id));
		const [reassignedB] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, required(draftB).id));
		expect(reassignedA?.employmentId).toBe(fixture.workerBEmploymentId);
		expect(reassignedB?.employmentId).toBe(fixture.workerAEmploymentId);
	});

	test("auto-accept late changes records Shift Acceptance as accepted instead of pending", async () => {
		const { database: d } = getContext();
		const { publishScheduleNow } = await import("../../src/routes/publication");
		const fixture = await seedFixture(d, "Auto Accept Late", {
			autoAcceptLateChanges: true,
		});

		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: fixture.locationId,
				weekStartDate: "2026-10-19",
			})
			.returning();
		const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
		const [draft] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: fixture.workerAEmploymentId,
				positionId: fixture.positionId,
				startsAt,
				endsAt: new Date(startsAt.getTime() + 6 * 60 * 60 * 1000),
			})
			.returning();
		await publishScheduleNow(required(schedule).id, fixture.managerProfileId);

		const movedStartsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
		await d.db
			.update(d.shifts)
			.set({
				startsAt: movedStartsAt,
				endsAt: new Date(movedStartsAt.getTime() + 6 * 60 * 60 * 1000),
			})
			.where(eq(d.shifts.id, required(draft).id));

		const second = await publishScheduleNow(
			required(schedule).id,
			fixture.managerProfileId,
		);
		expect(second.changes.material).toBeGreaterThan(0);
		expect(second.changes.acceptancesRequired).toBe(0);

		const acceptances = await d.db
			.select()
			.from(d.shiftAcceptances)
			.where(
				and(
					eq(d.shiftAcceptances.versionId, second.version.id),
					eq(d.shiftAcceptances.employmentId, fixture.workerAEmploymentId),
				),
			);
		expect(acceptances).toHaveLength(1);
		expect(acceptances[0]?.status).toBe("accepted");
		expect(acceptances[0]?.respondedAt).not.toBeNull();
	});
}
