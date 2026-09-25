import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

export function registerSquareTests(getContext: () => Context) {
	test("Square OAuth, mapping, sales preview/import, manual edit, and disconnect", async () => {
		const { database: d, app, token } = getContext();
		const profileId = crypto.randomUUID();
		const email = "square-manager@example.test";
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Square Pilot" })
			.returning();
		if (!workplace) throw new Error("Missing Square test workplace");
		const [location] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: workplace.id,
				name: "Counter",
				timezone: "America/Chicago",
			})
			.returning();
		if (!location) throw new Error("Missing Square test location");
		const [secondLocation] = await d.db
			.insert(d.locations)
			.values({
				workplaceId: workplace.id,
				name: "Kitchen",
				timezone: "America/Chicago",
			})
			.returning();
		if (!secondLocation) throw new Error("Missing second Square test location");
		await d.db.insert(d.profiles).values({ id: profileId, email });
		await d.db
			.insert(d.employments)
			.values({ workplaceId: workplace.id, profileId, kind: "manager" });
		const access = await token(profileId, email);
		const [otherWorkplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Another Square Pilot" })
			.returning();
		if (!otherWorkplace) throw new Error("Missing second test workplace");
		const base = `http://localhost/v1/workplaces/${workplace.id}/integrations/square`;
		const authHeaders = { authorization: `Bearer ${access}` };
		const jsonHeaders = { ...authHeaders, "content-type": "application/json" };
		let netSales = "125.50";
		let reportUnavailable = false;
		let reportProcessingOnce = false;
		const originalFetch = globalThis.fetch;
		const calls: Array<{ url: string; body: unknown }> = [];
		globalThis.fetch = (async (
			url: string | URL | Request,
			init?: RequestInit,
		) => {
			const target = String(url);
			const body = init?.body
				? (JSON.parse(String(init.body)) as unknown)
				: null;
			calls.push({ url: target, body });
			if (target.endsWith("/oauth2/token")) {
				return Response.json({
					access_token:
						(body as { grant_type?: string })?.grant_type === "refresh_token"
							? "square-access-refreshed"
							: "square-access",
					refresh_token:
						(body as { grant_type?: string })?.grant_type === "refresh_token"
							? "square-refresh-rotated"
							: "square-refresh",
					expires_at: "2030-01-01T00:00:00Z",
					merchant_id: "M123",
				});
			}
			if (target.endsWith("/v2/locations")) {
				return Response.json({
					locations: [{ id: "L123", name: "Square Counter" }],
				});
			}
			if (target.endsWith("/reporting/v1/load")) {
				if (reportProcessingOnce) {
					reportProcessingOnce = false;
					return Response.json({ error: "Continue wait" });
				}
				if (reportUnavailable)
					return Response.json(
						{ errors: [{ detail: "Unavailable" }] },
						{ status: 503 },
					);
				return Response.json({
					data: [
						{ "Orders.local_date": "2026-09-08", "Orders.net_sales": netSales },
					],
				});
			}
			if (target.endsWith("/oauth2/revoke"))
				return Response.json({ success: true });
			throw new Error(`Unexpected Square request: ${target}`);
		}) as typeof fetch;
		try {
			const connect = await app.handle(
				new Request(`${base}/connect`, { headers: authHeaders }),
			);
			expect(connect.status).toBe(200);
			const { url } = (await connect.json()) as { url: string };
			const state = new URL(url).searchParams.get("state");
			const secondConnect = await app.handle(
				new Request(`${base}/connect`, { headers: authHeaders }),
			);
			const secondState = new URL(
				((await secondConnect.json()) as { url: string }).url,
			).searchParams.get("state");
			expect(new URL(url).searchParams.get("scope")).toContain(
				"REPORTING_READ",
			);
			const callback = await app.handle(
				new Request(
					`http://localhost/v1/integrations/square/callback?code=sample-code&state=${state}`,
				),
			);
			expect(callback.status).toBe(302);
			const staleCallback = await app.handle(
				new Request(
					`http://localhost/v1/integrations/square/callback?code=second-code&state=${secondState}`,
				),
			);
			expect(staleCallback.status).toBe(409);
			const replay = await app.handle(
				new Request(
					`http://localhost/v1/integrations/square/callback?code=sample-code&state=${state}`,
				),
			);
			expect(replay.status).toBe(400);
			const status = await app.handle(
				new Request(base, { headers: authHeaders }),
			);
			expect(status.status).toBe(200);
			expect((await status.json()).squareLocations).toEqual([
				{ id: "L123", name: "Square Counter" },
			]);
			const mapping = await app.handle(
				new Request(`${base}/mappings/${location.id}`, {
					method: "PUT",
					headers: jsonHeaders,
					body: JSON.stringify({ squareLocationId: "L123" }),
				}),
			);
			expect(mapping.status).toBe(200);
			const duplicateMapping = await app.handle(
				new Request(`${base}/mappings/${secondLocation.id}`, {
					method: "PUT",
					headers: jsonHeaders,
					body: JSON.stringify({ squareLocationId: "L123" }),
				}),
			);
			expect(duplicateMapping.status).toBe(409);
			const input = {
				locationId: location.id,
				from: "2026-09-08",
				to: "2026-09-09",
			};
			const crossWorkplace = await app.handle(
				new Request(
					`http://localhost/v1/workplaces/${otherWorkplace.id}/integrations/square/preview`,
					{
						method: "POST",
						headers: jsonHeaders,
						body: JSON.stringify(input),
					},
				),
			);
			expect(crossWorkplace.status).toBe(403);
			const previewRequest = () =>
				app.handle(
					new Request(`${base}/preview`, {
						method: "POST",
						headers: jsonHeaders,
						body: JSON.stringify(input),
					}),
				);
			reportProcessingOnce = true;
			const preview = await previewRequest();
			expect(preview.status).toBe(200);
			let reviewed = (await preview.json()) as {
				rows: unknown[];
				reviewHash: string;
			};
			expect(reviewed.rows).toEqual([
				{
					date: "2026-09-08",
					amountCents: 12550,
					currentAmountCents: null,
					change: false,
				},
				{
					date: "2026-09-09",
					amountCents: 0,
					currentAmountCents: null,
					change: false,
				},
			]);
			const importOnce = (overwriteExisting = false) =>
				app.handle(
					new Request(`${base}/import`, {
						method: "POST",
						headers: jsonHeaders,
						body: JSON.stringify({
							...input,
							overwriteExisting,
							reviewHash: reviewed.reviewHash,
						}),
					}),
				);
			expect((await importOnce()).status).toBe(200);
			reviewed = await (await previewRequest()).json();
			expect((await importOnce()).status).toBe(200);
			const [sale] = await d.db
				.select()
				.from(d.locationSales)
				.where(
					and(
						eq(d.locationSales.locationId, location.id),
						eq(d.locationSales.saleDate, "2026-09-08"),
					),
				);
			expect(sale?.amountCents).toBe(12550);
			await d.db
				.update(d.squareConnections)
				.set({ accessTokenExpiresAt: new Date("2020-01-01T00:00:00Z") })
				.where(eq(d.squareConnections.workplaceId, workplace.id));
			expect((await previewRequest()).status).toBe(200);
			expect(
				calls.some(
					(call) =>
						call.url.endsWith("/oauth2/token") &&
						(call.body as { grant_type?: string })?.grant_type ===
							"refresh_token",
				),
			).toBe(true);
			const [refreshedConnection] = await d.db
				.select()
				.from(d.squareConnections)
				.where(eq(d.squareConnections.workplaceId, workplace.id));
			expect(refreshedConnection?.accessTokenEncrypted).not.toContain(
				"square-access-refreshed",
			);
			reportUnavailable = true;
			expect((await previewRequest()).status).toBe(400);
			const [preservedSale] = await d.db
				.select()
				.from(d.locationSales)
				.where(
					and(
						eq(d.locationSales.locationId, location.id),
						eq(d.locationSales.saleDate, "2026-09-08"),
					),
				);
			expect(preservedSale?.amountCents).toBe(12550);
			reportUnavailable = false;
			netSales = "100.00";
			expect((await importOnce()).status).toBe(409);
			reviewed = await (await previewRequest()).json();
			const replace = await importOnce(true);
			expect(replace.status).toBe(200);
			const manual = await app.handle(
				new Request(
					`http://localhost/v1/locations/${location.id}/sales/2026-09-08`,
					{
						method: "PUT",
						headers: jsonHeaders,
						body: JSON.stringify({ amountCents: 11000 }),
					},
				),
			);
			expect(manual.status).toBe(200);
			const source = await d.db
				.select()
				.from(d.squareSalesImports)
				.where(
					and(
						eq(d.squareSalesImports.locationId, location.id),
						eq(d.squareSalesImports.saleDate, "2026-09-08"),
					),
				);
			expect(source).toHaveLength(0);
			const disconnected = await app.handle(
				new Request(base, { method: "DELETE", headers: authHeaders }),
			);
			expect(disconnected.status).toBe(200);
			expect(calls.some((call) => call.url.endsWith("/oauth2/revoke"))).toBe(
				true,
			);
			const reportCall = calls.find((call) =>
				call.url.endsWith("/reporting/v1/load"),
			);
			expect(reportCall?.body).toMatchObject({
				query: {
					segments: ["Orders.closed_checks"],
					filters: [
						{
							member: "Orders.local_date",
							operator: "inDateRange",
							values: ["2026-09-08", "2026-09-09"],
						},
						{
							member: "Orders.location_id",
							operator: "equals",
							values: ["L123"],
						},
					],
				},
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
}
