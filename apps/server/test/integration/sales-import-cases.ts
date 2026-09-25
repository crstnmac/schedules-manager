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

export function registerSalesImportTests(getContext: () => Context) {
	test("sales import previews and commits with provenance and overwrite protection", async () => {
		const { database: d, app, token } = getContext();
		const managerProfileId = crypto.randomUUID();
		const managerEmail = "sales-import-manager@example.test";
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Sales Import Co" })
			.returning();
		const locations = await d.db
			.insert(d.locations)
			.values([
				{ workplaceId: required(workplace).id, name: "Downtown" },
				{ workplaceId: required(workplace).id, name: "Uptown" },
			])
			.returning();
		const downtown = required(locations.find((row) => row.name === "Downtown"));
		const uptown = required(locations.find((row) => row.name === "Uptown"));
		await d.db
			.insert(d.profiles)
			.values({ id: managerProfileId, email: managerEmail });
		await d.db.insert(d.employments).values({
			workplaceId: required(workplace).id,
			profileId: managerProfileId,
			kind: "manager",
		});

		// A manually entered day (no provenance), a Square-owned day, and an
		// absent day the import must not touch.
		await d.db.insert(d.locationSales).values([
			{ locationId: downtown.id, saleDate: "2026-09-06", amountCents: 500 },
			{ locationId: downtown.id, saleDate: "2026-09-07", amountCents: 90000 },
			{ locationId: downtown.id, saleDate: "2026-09-08", amountCents: 110000 },
		]);
		await d.db.insert(d.salesImportSources).values({
			locationId: downtown.id,
			saleDate: "2026-09-08",
			source: "square",
			amountCents: 110000,
		});

		const access = await token(managerProfileId, managerEmail);
		const importUrl = `http://localhost/v1/workplaces/${workplace?.id}/sales/import`;
		const csv = [
			"location,date,amount",
			"Downtown,2026-09-07,1250.50",
			"Downtown,2026-09-08,1200",
			"Uptown,2026-09-07,892",
			"Uptown,2026-09-08,0",
			"Ghost,2026-09-07,10",
			"Downtown,2026-09-09,=SUM(A1:A5)",
			"Downtown,2026-09-10,12.505",
			"Downtown,2026-09-11,abc",
			"Downtown,2026-09-12,",
			"Uptown,2026-09-07,95",
			"Downtown,2026-09-07,5",
			"Uptown,09/13/2026,10",
		].join("\n");

		const preview = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ csv, dryRun: true }),
			}),
		);
		expect(preview.status).toBe(200);
		const previewBody = (await preview.json()) as {
			preview: {
				total: number;
				imported: number;
				changes: number;
				reviewHash: string;
				entries: {
					line: number;
					location: string;
					date: string;
					amountCents: number;
					currentAmountCents: number | null;
					source: string | null;
					change: boolean;
				}[];
				failed: { line: number; message: string }[];
			};
		};
		const p = previewBody.preview;
		expect(p.imported).toBe(4);
		expect(p.total).toBe(12);
		expect(p.changes).toBe(2);
		expect(p.reviewHash).toMatch(/^[a-f0-9]{64}$/);
		const entry = (location: string, date: string) =>
			p.entries.find((row) => row.location === location && row.date === date);
		expect(entry("Downtown", "2026-09-07")).toMatchObject({
			amountCents: 125050,
			currentAmountCents: 90000,
			source: null,
			change: true,
		});
		expect(entry("Downtown", "2026-09-08")).toMatchObject({
			source: "square",
			change: true,
		});
		expect(entry("Uptown", "2026-09-07")).toMatchObject({
			currentAmountCents: null,
			change: false,
		});
		expect(p.failed.map((failure) => failure.message)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('Unknown location "Ghost"'),
				expect.stringContaining("spreadsheet formula"),
				expect.stringContaining("is not a valid amount"),
				expect.stringContaining("amount is required"),
				expect.stringContaining("Duplicate sales for"),
				expect.stringContaining("is not a valid date"),
			]),
		);

		// Committing changed rows without the explicit overwrite is refused.
		const refused = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
					"idempotency-key": "sales-import-refused-key",
				},
				body: JSON.stringify({ csv, reviewHash: p.reviewHash }),
			}),
		);
		expect(refused.status).toBe(409);

		// A stale hash (figures changed after the preview) is refused.
		const stale = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
					"idempotency-key": "sales-import-stale-key",
				},
				body: JSON.stringify({
					csv,
					reviewHash: p.reviewHash.replace("a", "b"),
					overwriteExisting: true,
				}),
			}),
		);
		expect(stale.status).toBe(409);

		// New preview, then a manual edit before committing: the hash no longer
		// matches what commit re-computes from stored figures.
		const freshPreview = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ csv, dryRun: true }),
			}),
		);
		const fresh = ((await freshPreview.json()) as typeof previewBody).preview;
		const manualEdit = await app.handle(
			new Request(
				`http://localhost/v1/locations/${downtown.id}/sales/2026-09-07`,
				{
					method: "PUT",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ amountCents: 99900 }),
				},
			),
		);
		expect(manualEdit.status).toBe(200);
		const outdated = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
					"idempotency-key": "sales-import-outdated-key",
				},
				body: JSON.stringify({
					csv,
					reviewHash: fresh.reviewHash,
					overwriteExisting: true,
				}),
			}),
		);
		expect(outdated.status).toBe(409);

		// Fresh preview and commit with the explicit overwrite.
		const commitPreview = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ csv, dryRun: true }),
			}),
		);
		const commitHash = ((await commitPreview.json()) as typeof previewBody)
			.preview.reviewHash;
		const commit = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
					"idempotency-key": "sales-import-commit-key",
				},
				body: JSON.stringify({
					csv,
					reviewHash: commitHash,
					overwriteExisting: true,
				}),
			}),
		);
		expect(commit.status).toBe(200);
		expect(((await commit.json()) as { imported: number }).imported).toBe(4);

		const figures = await d.db
			.select()
			.from(d.locationSales)
			.where(eq(d.locationSales.locationId, downtown.id));
		const figureFor = (date: string) =>
			required(figures.find((row) => row.saleDate === date)).amountCents;
		expect(figureFor("2026-09-06")).toBe(500);
		expect(figureFor("2026-09-07")).toBe(125050);
		expect(figureFor("2026-09-08")).toBe(120000);

		const sources = await d.db
			.select()
			.from(d.salesImportSources)
			.where(eq(d.salesImportSources.locationId, downtown.id));
		expect(sources.map((row) => [row.saleDate, row.source]).sort()).toEqual([
			["2026-09-07", "csv"],
			["2026-09-08", "csv"],
		]);

		const audits = await d.db
			.select()
			.from(d.auditEvents)
			.where(eq(d.auditEvents.workplaceId, required(workplace).id));
		expect(
			audits.filter(
				(row) =>
					row.action === "sales.imported" && row.summary.includes("4 day(s)"),
			),
		).toHaveLength(1);

		// Replaying the same idempotency key does not re-import or re-audit.
		const replay = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					authorization: `Bearer ${access}`,
					"content-type": "application/json",
					"idempotency-key": "sales-import-commit-key",
				},
				body: JSON.stringify({
					csv,
					reviewHash: commitHash,
					overwriteExisting: true,
				}),
			}),
		);
		expect(replay.status).toBe(200);
		const replayAudits = await d.db
			.select()
			.from(d.auditEvents)
			.where(eq(d.auditEvents.workplaceId, required(workplace).id));
		expect(
			replayAudits.filter((row) => row.action === "sales.imported"),
		).toHaveLength(1);

		// A manual edit clears the CSV provenance for that day.
		const manualOverwrite = await app.handle(
			new Request(
				`http://localhost/v1/locations/${downtown.id}/sales/2026-09-07`,
				{
					method: "PUT",
					headers: {
						authorization: `Bearer ${access}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ amountCents: 130000 }),
				},
			),
		);
		expect(manualOverwrite.status).toBe(200);
		const cleared = await d.db
			.select()
			.from(d.salesImportSources)
			.where(
				and(
					eq(d.salesImportSources.locationId, downtown.id),
					eq(d.salesImportSources.saleDate, "2026-09-07"),
				),
			);
		expect(cleared).toHaveLength(0);
	});

	test("sales import splits preview and commit authorization and serves the template", async () => {
		const { database: d, app, token } = getContext();
		const reportsManagerId = crypto.randomUUID();
		const reportsManagerEmail = "sales-reports-manager@example.test";
		const workerId = crypto.randomUUID();
		const workerEmail = "sales-import-worker@example.test";
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Sales Guard Cafe" })
			.returning();
		await d.db.insert(d.profiles).values([
			{ id: reportsManagerId, email: reportsManagerEmail },
			{ id: workerId, email: workerEmail },
		]);
		await d.db.insert(d.employments).values([
			{
				workplaceId: required(workplace).id,
				profileId: reportsManagerId,
				kind: "manager",
				privileges: ["reports.view"],
			},
			{
				workplaceId: required(workplace).id,
				profileId: workerId,
				kind: "worker",
			},
		]);
		const importUrl = `http://localhost/v1/workplaces/${workplace?.id}/sales/import`;
		const csv = "location,date,amount\nDowntown,2026-09-07,10";
		const jsonHeaders = { "content-type": "application/json" };

		expect(
			(
				await app.handle(
					new Request(importUrl, {
						method: "POST",
						headers: jsonHeaders,
						body: JSON.stringify({ csv, dryRun: true }),
					}),
				)
			).status,
		).toBe(401);

		const workerAccess = await token(workerId, workerEmail);
		expect(
			(
				await app.handle(
					new Request(importUrl, {
						method: "POST",
						headers: {
							...jsonHeaders,
							authorization: `Bearer ${workerAccess}`,
						},
						body: JSON.stringify({ csv, dryRun: true }),
					}),
				)
			).status,
		).toBe(403);

		// A reports-only manager may preview and download the template but not
		// commit, which needs manual-sales access.
		const reportsAccess = await token(reportsManagerId, reportsManagerEmail);
		const preview = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					...jsonHeaders,
					authorization: `Bearer ${reportsAccess}`,
				},
				body: JSON.stringify({ csv, dryRun: true }),
			}),
		);
		expect(preview.status).toBe(200);
		const { reviewHash } = (
			(await preview.json()) as {
				preview: { reviewHash: string };
			}
		).preview;
		const forbiddenCommit = await app.handle(
			new Request(importUrl, {
				method: "POST",
				headers: {
					...jsonHeaders,
					authorization: `Bearer ${reportsAccess}`,
					"idempotency-key": "sales-import-forbidden-key",
				},
				body: JSON.stringify({ csv, reviewHash, overwriteExisting: true }),
			}),
		);
		expect(forbiddenCommit.status).toBe(403);

		const template = await app.handle(
			new Request(`${importUrl}/template.csv`, {
				headers: { authorization: `Bearer ${reportsAccess}` },
			}),
		);
		expect(template.status).toBe(200);
		expect(await template.text()).toContain("location,date,amount");
	});
}
