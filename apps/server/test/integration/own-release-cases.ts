import { expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture row");
	return value;
}

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

export function registerOwnReleaseTests(getContext: () => Context) {
	test("open-shift listing hides a worker's own released shift but keeps manager-opened and third-party releases visible", async () => {
		const { database, app, token } = getContext();
		const { publishScheduleNow } = await import("../../src/routes/publication");
		const managerProfileId = crypto.randomUUID();
		const releaserProfileId = crypto.randomUUID();
		const coworkerProfileId = crypto.randomUUID();

		const [workplace] = await database.db
			.insert(database.workplaces)
			.values({ name: "Own Release Listing" })
			.returning();
		const workplaceId = required(workplace).id;
		const [location] = await database.db
			.insert(database.locations)
			.values({
				workplaceId,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [position] = await database.db
			.insert(database.positions)
			.values({ workplaceId, name: "Server" })
			.returning();
		await database.db.insert(database.profiles).values([
			{ id: managerProfileId, email: "mgr@own-release.test" },
			{ id: releaserProfileId, email: "releaser@own-release.test" },
			{ id: coworkerProfileId, email: "coworker@own-release.test" },
		]);
		const employments = await database.db
			.insert(database.employments)
			.values([
				{ workplaceId, profileId: managerProfileId, kind: "manager" },
				{ workplaceId, profileId: releaserProfileId, kind: "worker" },
				{ workplaceId, profileId: coworkerProfileId, kind: "worker" },
			])
			.returning();
		const releaser = employments.find((e) => e.profileId === releaserProfileId);
		const coworker = employments.find((e) => e.profileId === coworkerProfileId);

		const [schedule] = await database.db
			.insert(database.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: "2026-09-28",
			})
			.returning();
		const scheduleId = required(schedule).id;
		const [assignedDraft] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId,
				employmentId: required(releaser).id,
				positionId: required(position).id,
				startsAt: new Date("2026-09-29T16:00:00.000Z"),
				endsAt: new Date("2026-09-29T22:00:00.000Z"),
			})
			.returning();
		const [unassignedDraft] = await database.db
			.insert(database.shifts)
			.values({
				scheduleId,
				employmentId: null,
				positionId: required(position).id,
				startsAt: new Date("2026-09-30T16:00:00.000Z"),
				endsAt: new Date("2026-09-30T22:00:00.000Z"),
			})
			.returning();
		const draftIds = [required(assignedDraft).id, required(unassignedDraft).id];

		const publication = await publishScheduleNow(scheduleId, managerProfileId);
		const versionShiftRows = await database.db
			.select()
			.from(database.versionShifts)
			.where(eq(database.versionShifts.versionId, publication.version.id));
		const assignedVersionShift = required(
			versionShiftRows.find((vs) => vs.shiftId === assignedDraft?.id),
		);

		const releaserToken = await token(
			releaserProfileId,
			"releaser@own-release.test",
		);
		const coworkerToken = await token(
			coworkerProfileId,
			"coworker@own-release.test",
		);
		const managerTokenValue = await token(
			managerProfileId,
			"mgr@own-release.test",
		);

		async function listOpenShifts(bearer: string) {
			const res = await app.handle(
				new Request(
					`http://localhost/v1/workplaces/${workplaceId}/open-shifts`,
					{
						headers: { authorization: `Bearer ${bearer}` },
					},
				),
			);
			expect(res.status).toBe(200);
			return (await res.json()) as {
				openShifts: { id: string; myPickupStatus: string | null }[];
			};
		}

		const releaseRes = await app.handle(
			new Request("http://localhost/v1/my/releases", {
				method: "POST",
				headers: {
					authorization: `Bearer ${releaserToken}`,
					"content-type": "application/json",
					"idempotency-key": "own-release-request",
				},
				body: JSON.stringify({ versionShiftId: assignedVersionShift.id }),
			}),
		);
		expect(releaseRes.status).toBe(200);
		const releaseBody = (await releaseRes.json()) as {
			release: { id: string };
		};

		const decisionRes = await app.handle(
			new Request(
				`http://localhost/v1/workplaces/${workplaceId}/releases/${releaseBody.release.id}/decision`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${managerTokenValue}`,
						"content-type": "application/json",
						"idempotency-key": "own-release-approve",
					},
					body: JSON.stringify({ decision: "approved" }),
				},
			),
		);
		expect(decisionRes.status).toBe(200);

		const openRows = await database.db
			.select()
			.from(database.openShifts)
			.where(inArray(database.openShifts.shiftId, draftIds));
		expect(openRows).toHaveLength(2);
		expect(openRows.every((row) => row.status === "open")).toBe(true);
		const ownReleased = required(
			openRows.find((row) => row.releasedFrom === releaser?.id),
		);
		const managerOpened = required(
			openRows.find((row) => row.releasedFrom === null),
		);

		const releaserListing = await listOpenShifts(releaserToken);
		const releaserIds = releaserListing.openShifts.map((row) => row.id);
		expect(releaserIds).not.toContain(ownReleased.id);
		expect(releaserIds).toContain(managerOpened.id);
		expect(releaserListing.openShifts).toHaveLength(1);

		const coworkerListing = await listOpenShifts(coworkerToken);
		const coworkerIds = coworkerListing.openShifts.map((row) => row.id);
		expect(coworkerIds).toContain(ownReleased.id);
		expect(coworkerIds).toContain(managerOpened.id);
		expect(coworkerListing.openShifts).toHaveLength(2);
		for (const row of coworkerListing.openShifts) {
			expect(row.myPickupStatus).toBeNull();
		}

		const stillOpen = await database.db
			.select()
			.from(database.openShifts)
			.where(eq(database.openShifts.id, ownReleased.id));
		expect(stillOpen).toHaveLength(1);
		expect(stillOpen[0]?.status).toBe("open");

		const pickupRes = await app.handle(
			new Request(`http://localhost/v1/open-shifts/${ownReleased.id}/pickups`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${releaserToken}`,
					"idempotency-key": "own-release-pickup",
				},
			}),
		);
		expect(pickupRes.status).toBe(409);
		const pickupBody = (await pickupRes.json()) as { message: string };
		expect(pickupBody.message).toContain("released yourself");

		const releaserPickups = await database.db
			.select()
			.from(database.shiftPickups)
			.where(eq(database.shiftPickups.openShiftId, ownReleased.id));
		expect(releaserPickups).toHaveLength(0);

		const coworkerPickupRes = await app.handle(
			new Request(`http://localhost/v1/open-shifts/${ownReleased.id}/pickups`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${coworkerToken}`,
					"idempotency-key": "coworker-pickup",
				},
			}),
		);
		expect(coworkerPickupRes.status).toBe(200);
		const coworkerPickupBody = (await coworkerPickupRes.json()) as {
			pickup: { id: string; status: string };
		};
		expect(coworkerPickupBody.pickup.status).toBe("pending");

		const coworkerPickups = await database.db
			.select()
			.from(database.shiftPickups)
			.where(eq(database.shiftPickups.openShiftId, ownReleased.id));
		expect(coworkerPickups).toHaveLength(1);
		expect(coworkerPickups[0]?.requestedBy).toBe(required(coworker).id);
		expect(coworkerPickups[0]?.status).toBe("pending");
	});
}
