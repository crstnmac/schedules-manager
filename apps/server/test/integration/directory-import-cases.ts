import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

function required<T>(value: T | undefined | null): T {
	if (value === undefined || value === null) {
		throw new Error("Expected test fixture row");
	}
	return value;
}

export function registerDirectoryImportTests(getContext: () => Context) {
	test("directory import previews and commits hires, updates, and deactivations", async () => {
		const { database: d, app, token } = getContext();
		const managerProfileId = crypto.randomUUID();
		const managerEmail = "directory-manager@example.test";
		const workerAProfileId = crypto.randomUUID();
		const workerBProfileId = crypto.randomUUID();
		const workerCProfileId = crypto.randomUUID();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Directory Sync Co" })
			.returning();
		const downtown = required(
			(
				await d.db
					.insert(d.locations)
					.values([
						{ workplaceId: required(workplace).id, name: "Downtown" },
						{ workplaceId: required(workplace).id, name: "Uptown" },
					])
					.returning()
			).find((row) => row.name === "Downtown"),
		);
		const uptown = required(
			(
				await d.db
					.select()
					.from(d.locations)
					.where(eq(d.locations.workplaceId, required(workplace).id))
			).find((row) => row.name === "Uptown"),
		);
		const positions = await d.db
			.insert(d.positions)
			.values([
				{ workplaceId: required(workplace).id, name: "Barista" },
				{ workplaceId: required(workplace).id, name: "Server" },
			])
			.returning();
		const barista = required(positions.find((row) => row.name === "Barista"));
		const server = required(positions.find((row) => row.name === "Server"));
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: workerAProfileId, email: "worker-a@example.test" },
			{ id: workerBProfileId, email: "worker-b@example.test" },
			{ id: workerCProfileId, email: "worker-c@example.test" },
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
				{
					workplaceId: required(workplace).id,
					profileId: workerCProfileId,
					kind: "worker",
					status: "deactivated",
					deactivatedAt: new Date(),
				},
			])
			.returning();
		const workerAEmployment = required(
			employments.find((row) => row.profileId === workerAProfileId),
		);
		const workerBEmployment = required(
			employments.find((row) => row.profileId === workerBProfileId),
		);
		await d.db.insert(d.employmentLocations).values({
			employmentId: workerAEmployment.id,
			locationId: downtown.id,
		});
		await d.db.insert(d.employmentPositions).values({
			employmentId: workerAEmployment.id,
			positionId: server.id,
		});
		const [pendingInvitation] = await d.db
			.insert(d.invitations)
			.values({
				workplaceId: required(workplace).id,
				email: "invite-pending@example.test",
				kind: "worker",
				invitedBy: managerProfileId,
				token: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			})
			.returning();

		const access = await token(managerProfileId, managerEmail);
		const authHeaders = { authorization: `Bearer ${access}` };
		const importUrl = `http://localhost/v1/workplaces/${workplace?.id}/workers/directory/import`;
		const csv = [
			"email,name,kind,positions,locations,status",
			"new-hire@example.test,Nova Reyes,worker,Barista,Uptown,",
			"worker-a@example.test,,worker,Barista;Server,Downtown;Uptown,",
			"worker-b@example.test,,,,,deactivated",
			"invite-pending@example.test,,manager,,Uptown,",
			"directory-manager@example.test,,,,,deactivated",
			"worker-c@example.test,,,,,active",
			"nobody@example.test,,,,,deactivated",
			"ghost@example.test,,,,Nowhere,",
			"bad-status@example.test,,,,,furloughed",
			"worker-a@example.test,,,,,",
		].join("\n");

		// Preview (dry run) writes nothing.
		const preview = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: { ...authHeaders, "content-type": "application/json" },
				body: JSON.stringify({ csv, dryRun: true }),
			}),
		);
		expect(preview.status).toBe(200);
		const previewBody = (await preview.json()) as {
			import: {
				total: number;
				imported: number;
				failed: { line: number; message: string }[];
				entries: { email: string; action: string; changes: string[] }[];
			};
		};
		expect(previewBody.import.imported).toBe(4);
		const byEmail = new Map(
			previewBody.import.entries.map((entry) => [entry.email, entry]),
		);
		expect(byEmail.get("new-hire@example.test")?.action).toBe("hire");
		expect(byEmail.get("worker-a@example.test")?.action).toBe("update");
		expect(
			byEmail
				.get("worker-a@example.test")
				?.changes.some((change) => change.includes("+Uptown")),
		).toBe(true);
		expect(byEmail.get("worker-b@example.test")?.action).toBe("deactivate");
		expect(byEmail.get("invite-pending@example.test")?.action).toBe(
			"pending_invitation",
		);
		expect(previewBody.import.failed.map((failure) => failure.message)).toEqual(
			expect.arrayContaining([
				expect.stringContaining("own employment"),
				expect.stringContaining("deactivated"),
				expect.stringContaining("Unknown location"),
				expect.stringContaining("Duplicate email"),
				expect.stringContaining("status must be"),
			]),
		);
		const previewInvitations = await d.db
			.select()
			.from(d.invitations)
			.where(eq(d.invitations.workplaceId, required(workplace).id));
		expect(previewInvitations).toHaveLength(1);

		// Commit applies every reviewed change exactly once.
		const commit = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					...authHeaders,
					"content-type": "application/json",
					"idempotency-key": "directory-import-commit-key",
				},
				body: JSON.stringify({ csv }),
			}),
		);
		expect(commit.status).toBe(200);
		const commitBody = (await commit.json()) as typeof previewBody;
		expect(commitBody.import.imported).toBe(4);
		const hireEntry = required(
			commitBody.import.entries.find(
				(entry) => entry.email === "new-hire@example.test",
			),
		);
		expect(hireEntry.inviteToken).toBeTruthy();

		const hireInvitations = await d.db
			.select()
			.from(d.invitations)
			.where(
				and(
					eq(d.invitations.workplaceId, required(workplace).id),
					eq(d.invitations.email, "new-hire@example.test"),
				),
			);
		expect(hireInvitations).toHaveLength(1);
		expect(required(hireInvitations[0]).status).toBe("pending");

		const updatedLocationIds = (
			await d.db
				.select()
				.from(d.employmentLocations)
				.where(eq(d.employmentLocations.employmentId, workerAEmployment.id))
		).map((row) => row.locationId);
		expect(updatedLocationIds.sort()).toEqual([downtown.id, uptown.id].sort());
		const updatedPositionIds = (
			await d.db
				.select()
				.from(d.employmentPositions)
				.where(eq(d.employmentPositions.employmentId, workerAEmployment.id))
		).map((row) => row.positionId);
		expect(updatedPositionIds.sort()).toEqual([barista.id, server.id].sort());

		const [deactivated] = await d.db
			.select()
			.from(d.employments)
			.where(eq(d.employments.id, workerBEmployment.id));
		expect(required(deactivated).status).toBe("deactivated");
		expect(required(deactivated).deactivatedAt).not.toBeNull();

		const [updatedInvitation] = await d.db
			.select()
			.from(d.invitations)
			.where(eq(d.invitations.id, required(pendingInvitation).id));
		expect(required(updatedInvitation).kind).toBe("manager");

		// Replaying the same idempotency key does not duplicate invitations.
		const replay = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					...authHeaders,
					"content-type": "application/json",
					"idempotency-key": "directory-import-commit-key",
				},
				body: JSON.stringify({ csv }),
			}),
		);
		expect(replay.status).toBe(200);
		const replayInvitations = await d.db
			.select()
			.from(d.invitations)
			.where(
				and(
					eq(d.invitations.workplaceId, required(workplace).id),
					eq(d.invitations.email, "new-hire@example.test"),
				),
			);
		expect(replayInvitations).toHaveLength(1);

		const audits = await d.db
			.select()
			.from(d.auditEvents)
			.where(eq(d.auditEvents.workplaceId, required(workplace).id));
		expect(
			audits.some(
				(row) =>
					row.action === "workers.imported" &&
					row.summary.includes("1 hired") &&
					row.summary.includes("2 updated"),
			),
		).toBe(true);
	});

	test("directory import endpoint guards authorization and serves the template", async () => {
		const { database: d, app, token } = getContext();
		const managerProfileId = crypto.randomUUID();
		const managerEmail = "directory-guard-manager@example.test";
		const workerProfileId = crypto.randomUUID();
		const workerEmail = "directory-guard-worker@example.test";
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Directory Guard Cafe" })
			.returning();
		await d.db.insert(d.profiles).values([
			{ id: managerProfileId, email: managerEmail },
			{ id: workerProfileId, email: workerEmail },
		]);
		await d.db.insert(d.employments).values([
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
		]);
		const importUrl = `http://localhost/v1/workplaces/${workplace?.id}/workers/directory/import`;

		const unauthenticated = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ csv: "email\nx@example.test" }),
			}),
		);
		expect(unauthenticated.status).toBe(401);

		const workerAccess = await token(workerProfileId, workerEmail);
		const forbidden = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${workerAccess}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ csv: "email\nx@example.test" }),
			}),
		);
		expect(forbidden.status).toBe(403);

		const managerAccess = await token(managerProfileId, managerEmail);
		const template = await app.handle(
			new Request(`${importUrl}/template.csv`, {
				headers: { authorization: `Bearer ${managerAccess}` },
			}),
		);
		expect(template.status).toBe(200);
		expect(template.headers.get("content-type")).toContain("text/csv");
		const templateBody = await template.text();
		expect(
			templateBody.startsWith("email,name,kind,positions,locations,status"),
		).toBe(true);
	});
}
