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

/**
 * Regression coverage for the coverage-marketplace stale-position bug:
 * `decidePickup` (pickup *approval*) used to validate the requesting worker
 * with `assertEligible` against the `openShifts.positionId` snapshot — frozen
 * at release-approval time and never resynced — while assigning the worker to
 * the live draft inside the publish transaction. A manager's position-only
 * PATCH of the released draft could move the live `positionId` while the
 * snapshot stayed stale, so a worker approved against the old position was
 * committed to the new one, bypassing the "approved positions" guardrail for
 * workers with a non-empty restricted position scope.
 *
 * The fix re-runs `assertEligible` against the *locked* live draft position
 * inside the publish transaction (after `FOR UPDATE`), using `tx` as the
 * reader, making the eligibility check and the assignment atomic.
 */
export function registerStalePositionTests(getContext: () => Context) {
	async function auth(
		app: Context["app"],
		bearer: string,
		path: string,
		init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
	) {
		const headers: Record<string, string> = {
			authorization: `Bearer ${bearer}`,
		};
		if (init.body !== undefined) headers["content-type"] = "application/json";
		if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
		return app.handle(
			new Request(`http://localhost${path}`, {
				method: init.method ?? "GET",
				headers,
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
			}),
		);
	}

	type Seed = {
		workplace: { id: string };
		serverPos: { id: string };
		barPos: { id: string };
		manager: { id: string };
		releaser: { id: string };
		picker: { id: string };
		managerProfileId: string;
		releaserProfileId: string;
		pickerProfileId: string;
		managerEmail: string;
		releaserEmail: string;
		pickerEmail: string;
		schedule: { id: string };
		draftShift: { id: string };
	};

	async function seedRestrictedPickerWorkplace(
		d: Context["database"],
		label: string,
	): Promise<Seed> {
		const managerProfileId = crypto.randomUUID();
		const releaserProfileId = crypto.randomUUID();
		const pickerProfileId = crypto.randomUUID();
		const managerEmail = `${label}-manager@example.test`;
		const releaserEmail = `${label}-releaser@example.test`;
		const pickerEmail = `${label}-picker@example.test`;
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: label })
			.returning();
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: required(workplace).id,
				name: "Floor",
				timezone: "America/Chicago",
			})
			.returning();
		const [serverPos] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Server" })
			.returning();
		const [barPos] = await d.db
			.insert(d.positions)
			.values({ workplaceId: required(workplace).id, name: "Bar" })
			.returning();
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: releaserProfileId, email: releaserEmail },
			{ id: pickerProfileId, email: pickerEmail },
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
					profileId: releaserProfileId,
					kind: "worker",
				},
				{
					workplaceId: required(workplace).id,
					profileId: pickerProfileId,
					kind: "worker",
				},
			])
			.returning();
		const manager = required(
			employments.find((e) => e.profileId === managerProfileId),
		);
		const releaser = required(
			employments.find((e) => e.profileId === releaserProfileId),
		);
		const picker = required(
			employments.find((e) => e.profileId === pickerProfileId),
		);
		// Picker has a *restricted* position scope: approved ONLY for Server.
		// With an empty scope assertEligible is a no-op ("approved for
		// everything"); a non-empty scope is the only configuration the
		// position gate actually gates. This is the opt-in scoping the bug
		// requires (see the bug report's §4).
		await d.db.insert(d.employmentPositions).values({
			employmentId: picker.id,
			positionId: required(serverPos).id,
		});
		const [schedule] = await d.db
			.insert(d.schedules)
			.values({
				locationId: required(location).id,
				weekStartDate: "2026-09-28",
			})
			.returning();
		const [draftShift] = await d.db
			.insert(d.shifts)
			.values({
				scheduleId: required(schedule).id,
				employmentId: releaser.id,
				positionId: required(serverPos).id,
				startsAt: new Date("2026-09-29T16:00:00.000Z"),
				endsAt: new Date("2026-09-29T22:00:00.000Z"),
			})
			.returning();
		return {
			workplace: required(workplace),
			serverPos: required(serverPos),
			barPos: required(barPos),
			manager,
			releaser,
			picker,
			managerProfileId,
			releaserProfileId,
			pickerProfileId,
			managerEmail,
			releaserEmail,
			pickerEmail,
			schedule: required(schedule),
			draftShift: required(draftShift),
		};
	}

	/** Publish, release, approve the release -> returns the openShift row. */
	async function releaseAndGetOpenShift(
		d: Context["database"],
		app: Context["app"],
		tokens: { manager: string; releaser: string; picker: string },
		seed: Seed,
	) {
		const { publishScheduleNow } = await import("../../src/routes/publication");
		const publication = await publishScheduleNow(
			seed.schedule.id,
			seed.managerProfileId,
		);
		const [versionShift] = await d.db
			.select()
			.from(d.versionShifts)
			.where(eq(d.versionShifts.versionId, publication.version.id));
		const vs = required(versionShift);

		const releaseRes = await auth(app, tokens.releaser, "/v1/my/releases", {
			method: "POST",
			idempotencyKey: `release-${seed.draftShift.id}`,
			body: { versionShiftId: vs.id },
		});
		expect(releaseRes.status).toBe(200);
		const releaseBody = (await releaseRes.json()) as {
			release: { id: string };
		};

		const decisionRes = await auth(
			app,
			tokens.manager,
			`/v1/workplaces/${seed.workplace.id}/releases/${releaseBody.release.id}/decision`,
			{
				method: "POST",
				idempotencyKey: `release-decision-${releaseBody.release.id}`,
				body: { decision: "approved" },
			},
		);
		expect(decisionRes.status).toBe(200);

		const [openShift] = await d.db
			.select()
			.from(d.openShifts)
			.where(eq(d.openShifts.shiftId, seed.draftShift.id));
		return required(openShift);
	}

	test("pickup approval rejects when the released draft's position changed to one the picker is not approved for (stale snapshot guardrail)", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedRestrictedPickerWorkplace(d, "Stale Position Cafe");
		const tokens = {
			manager: await token(seed.managerProfileId, seed.managerEmail),
			releaser: await token(seed.releaserProfileId, seed.releaserEmail),
			picker: await token(seed.pickerProfileId, seed.pickerEmail),
		};

		const openShift = await releaseAndGetOpenShift(d, app, tokens, seed);

		// Snapshot was sourced from the live draft at release-approval time: Server.
		expect(openShift.status).toBe("open");
		expect(openShift.positionId).toBe(seed.serverPos.id);

		// Manager makes a position-only PATCH of the released draft to Bar.
		// employmentId is null on the released draft, so the PATCH handler
		// skips assertAssignmentValid and closeOpenMarketplaceForShifts; the
		// openShifts.positionId snapshot stays Server while the draft becomes Bar.
		const patchRes = await auth(
			app,
			tokens.manager,
			`/v1/shifts/${seed.draftShift.id}`,
			{
				method: "PATCH",
				body: { employmentId: null, positionId: seed.barPos.id },
			},
		);
		expect(patchRes.status).toBe(200);

		const [staleOpenShift] = await d.db
			.select()
			.from(d.openShifts)
			.where(eq(d.openShifts.id, openShift.id));
		expect(required(staleOpenShift).positionId).toBe(seed.serverPos.id);
		expect(required(staleOpenShift).status).toBe("open");

		const [editedDraft] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, seed.draftShift.id));
		expect(required(editedDraft).positionId).toBe(seed.barPos.id);
		expect(required(editedDraft).employmentId).toBeNull();

		// Picker (approved only for Server) requests pickup. The request-time
		// assertEligible still reads the stale openShifts.positionId = Server,
		// so the request is admitted — this is the low-severity UX gate the bug
		// report deliberately leaves in scope-deferred-to-approval (§7). The
		// integrity boundary is the approval-time check, exercised below.
		const pickupRes = await auth(
			app,
			tokens.picker,
			`/v1/open-shifts/${openShift.id}/pickups`,
			{ method: "POST", idempotencyKey: `pickup-${openShift.id}` },
		);
		expect(pickupRes.status).toBe(200);
		const pickupBody = (await pickupRes.json()) as {
			pickup: { id: string; status: string };
		};
		expect(pickupBody.pickup.status).toBe("pending");

		// Manager approves the pickup. PRE-FIX this returned 200 and published
		// the picker on Bar (the live draft position) while the gate validated
		// the stale Server snapshot. POST-FIX the in-transaction re-check
		// against the locked draft.positionId = Bar rejects the approval.
		const approvalRes = await auth(
			app,
			tokens.manager,
			`/v1/workplaces/${seed.workplace.id}/pickups/${pickupBody.pickup.id}/decision`,
			{
				method: "POST",
				idempotencyKey: `pickup-decision-${pickupBody.pickup.id}`,
				body: { decision: "approved" },
			},
		);
		expect(approvalRes.status).toBe(409);
		const approvalJson = (await approvalRes.json()) as { message: string };
		expect(approvalJson.message).toBe("You are not approved for this position");

		// No wrongful assignment: the draft keeps employmentId null and the
		// live Bar position.
		const [draftAfter] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, seed.draftShift.id));
		expect(required(draftAfter).employmentId).toBeNull();
		expect(required(draftAfter).positionId).toBe(seed.barPos.id);

		// No new schedule version was published (the publish transaction rolled back).
		const versions = await d.db
			.select()
			.from(d.scheduleVersions)
			.where(eq(d.scheduleVersions.scheduleId, seed.schedule.id));
		expect(versions).toHaveLength(1);

		// The open shift stays open (not filled) and its snapshot stays Server.
		const [openShiftAfter] = await d.db
			.select()
			.from(d.openShifts)
			.where(eq(d.openShifts.id, openShift.id));
		expect(required(openShiftAfter).status).toBe("open");
		expect(required(openShiftAfter).positionId).toBe(seed.serverPos.id);

		// The pickup stays pending (the throw preceded its status update).
		const [pickupAfter] = await d.db
			.select()
			.from(d.shiftPickups)
			.where(eq(d.shiftPickups.id, pickupBody.pickup.id));
		expect(required(pickupAfter).status).toBe("pending");

		// No employmentPositions row for Bar was inserted (the gate rejected,
		// so no spurious standing-approval was granted).
		const barRows = await d.db
			.select()
			.from(d.employmentPositions)
			.where(
				and(
					eq(d.employmentPositions.employmentId, seed.picker.id),
					eq(d.employmentPositions.positionId, seed.barPos.id),
				),
			);
		expect(barRows).toHaveLength(0);

		// Detection Pin 1 (bug report §5): a follow-on direct assignment of the
		// picker to Bar is still rejected with 400 because the restricted scope
		// excludes Bar and approvePosition was not passed.
		const directAssign = await auth(
			app,
			tokens.manager,
			`/v1/shifts/${seed.draftShift.id}`,
			{
				method: "PATCH",
				body: { employmentId: seed.picker.id, positionId: seed.barPos.id },
			},
		);
		expect(directAssign.status).toBe(400);
		const directAssignJson = (await directAssign.json()) as { message: string };
		expect(directAssignJson.message).toBe(
			"Worker is not approved for this position",
		);

		// Revert the position-only edit so the draft is assignable again, then
		// prove the manager CAN still directly assign the picker to the Server
		// position (the picker is approved for Server) — i.e. the marketplace
		// remains functional and the fix did not over-restrict.
		const revert = await auth(
			app,
			tokens.manager,
			`/v1/shifts/${seed.draftShift.id}`,
			{
				method: "PATCH",
				body: { employmentId: null, positionId: seed.serverPos.id },
			},
		);
		expect(revert.status).toBe(200);
		const directServer = await auth(
			app,
			tokens.manager,
			`/v1/shifts/${seed.draftShift.id}`,
			{
				method: "PATCH",
				body: { employmentId: seed.picker.id, positionId: seed.serverPos.id },
			},
		);
		expect(directServer.status).toBe(200);
		const [draftFinal] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, seed.draftShift.id));
		expect(required(draftFinal).employmentId).toBe(seed.picker.id);
	});

	test("pickup approval succeeds when the picker is approved for the live draft position (no regression)", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedRestrictedPickerWorkplace(
			d,
			"Live Position Approved Cafe",
		);
		const tokens = {
			manager: await token(seed.managerProfileId, seed.managerEmail),
			releaser: await token(seed.releaserProfileId, seed.releaserEmail),
			picker: await token(seed.pickerProfileId, seed.pickerEmail),
		};

		const openShift = await releaseAndGetOpenShift(d, app, tokens, seed);

		// Manager makes a position-only PATCH, but to the SAME position (Server),
		// which the picker is approved for. The live re-check should pass.
		const patchRes = await auth(
			app,
			tokens.manager,
			`/v1/shifts/${seed.draftShift.id}`,
			{
				method: "PATCH",
				body: { employmentId: null, positionId: seed.serverPos.id },
			},
		);
		expect(patchRes.status).toBe(200);

		const pickupRes = await auth(
			app,
			tokens.picker,
			`/v1/open-shifts/${openShift.id}/pickups`,
			{ method: "POST", idempotencyKey: `pickup-ok-${openShift.id}` },
		);
		expect(pickupRes.status).toBe(200);
		const pickupBody = (await pickupRes.json()) as {
			pickup: { id: string; status: string };
		};

		const approvalRes = await auth(
			app,
			tokens.manager,
			`/v1/workplaces/${seed.workplace.id}/pickups/${pickupBody.pickup.id}/decision`,
			{
				method: "POST",
				idempotencyKey: `pickup-ok-decision-${pickupBody.pickup.id}`,
				body: { decision: "approved" },
			},
		);
		expect(approvalRes.status).toBe(200);
		const approvalJson = (await approvalRes.json()) as {
			status: string;
			publishedVersion: number;
		};
		expect(approvalJson.status).toBe("approved");

		// The picker was assigned to the draft and a new version was published.
		const [draftAfter] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, seed.draftShift.id));
		expect(required(draftAfter).employmentId).toBe(seed.picker.id);

		const versions = await d.db
			.select()
			.from(d.scheduleVersions)
			.where(eq(d.scheduleVersions.scheduleId, seed.schedule.id));
		expect(versions).toHaveLength(2);

		const [openShiftAfter] = await d.db
			.select()
			.from(d.openShifts)
			.where(eq(d.openShifts.id, openShift.id));
		expect(required(openShiftAfter).status).toBe("filled");
	});

	test("happy path: pickup approval succeeds when the released draft position was never changed", async () => {
		const { database: d, app, token } = getContext();
		const seed = await seedRestrictedPickerWorkplace(d, "Happy Path Cafe");
		const tokens = {
			manager: await token(seed.managerProfileId, seed.managerEmail),
			releaser: await token(seed.releaserProfileId, seed.releaserEmail),
			picker: await token(seed.pickerProfileId, seed.pickerEmail),
		};

		const openShift = await releaseAndGetOpenShift(d, app, tokens, seed);

		// No position edit — the draft stays Server, which the picker is approved for.
		const pickupRes = await auth(
			app,
			tokens.picker,
			`/v1/open-shifts/${openShift.id}/pickups`,
			{ method: "POST", idempotencyKey: `pickup-happy-${openShift.id}` },
		);
		expect(pickupRes.status).toBe(200);
		const pickupBody = (await pickupRes.json()) as {
			pickup: { id: string; status: string };
		};

		const approvalRes = await auth(
			app,
			tokens.manager,
			`/v1/workplaces/${seed.workplace.id}/pickups/${pickupBody.pickup.id}/decision`,
			{
				method: "POST",
				idempotencyKey: `pickup-happy-decision-${pickupBody.pickup.id}`,
				body: { decision: "approved" },
			},
		);
		expect(approvalRes.status).toBe(200);

		const [draftAfter] = await d.db
			.select()
			.from(d.shifts)
			.where(eq(d.shifts.id, seed.draftShift.id));
		expect(required(draftAfter).employmentId).toBe(seed.picker.id);
		expect(required(draftAfter).positionId).toBe(seed.serverPos.id);

		// Sanity: pin the non-empty scope happy path (an open-scope/no-rows
		// picker would be "approved for everything" via the no-op branch).
		const scope = await d.db
			.select({ positionId: d.employmentPositions.positionId })
			.from(d.employmentPositions)
			.where(eq(d.employmentPositions.employmentId, seed.picker.id));
		expect(scope.map((row) => row.positionId)).toEqual([seed.serverPos.id]);
	});
}
