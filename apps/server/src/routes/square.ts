import {
	db,
	locationSales,
	locations,
	salesImportSources,
	squareConnections,
	squareLocationMappings,
	squareOAuthStates,
} from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { createHash } from "node:crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { requirePrivilege, requireSession } from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { writeAudit } from "../notify";
import {
	decryptSquareToken,
	encryptSquareToken,
	exchangeSquareToken,
	fetchSquareDailySales,
	fetchSquareLocations,
	revokeSquareToken,
	squareConfig,
	squareRedirectUrl,
	squareStateHash,
} from "../square";

const uuid = t.String({ format: "uuid" });
const date = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

async function connectionFor(workplaceId: string) {
	const [connection] = await db
		.select()
		.from(squareConnections)
		.where(eq(squareConnections.workplaceId, workplaceId))
		.limit(1);
	if (!connection) throw new NotFoundError("Square is not connected");
	return connection;
}

async function accessTokenFor(workplaceId: string) {
	const connection = await connectionFor(workplaceId);
	const { key } = squareConfig();
	if (connection.accessTokenExpiresAt.getTime() > Date.now() + 5 * 60_000) {
		return decryptSquareToken(connection.accessTokenEncrypted, key);
	}
	const refreshed = await exchangeSquareToken({
		grantType: "refresh_token",
		value: decryptSquareToken(connection.refreshTokenEncrypted, key),
	});
	if (refreshed.merchantId !== connection.merchantId) {
		throw new BadRequestError("Square account changed; reconnect it");
	}
	await db
		.update(squareConnections)
		.set({
			accessTokenEncrypted: encryptSquareToken(refreshed.accessToken, key),
			refreshTokenEncrypted: encryptSquareToken(refreshed.refreshToken, key),
			accessTokenExpiresAt: refreshed.expiresAt,
		})
		.where(eq(squareConnections.workplaceId, workplaceId));
	return refreshed.accessToken;
}

async function mappedLocation(workplaceId: string, locationId: string) {
	const [mapping] = await db
		.select()
		.from(squareLocationMappings)
		.innerJoin(locations, eq(locations.id, squareLocationMappings.locationId))
		.where(
			and(
				eq(squareLocationMappings.locationId, locationId),
				eq(squareLocationMappings.workplaceId, workplaceId),
				eq(locations.workplaceId, workplaceId),
			),
		)
		.limit(1);
	if (!mapping) throw new NotFoundError("Square location mapping not found");
	return mapping.square_location_mappings;
}

function validateRange(from: string, to: string) {
	const first = new Date(`${from}T00:00:00Z`);
	const last = new Date(`${to}T00:00:00Z`);
	if (
		Number.isNaN(first.getTime()) ||
		Number.isNaN(last.getTime()) ||
		first.toISOString().slice(0, 10) !== from ||
		last.toISOString().slice(0, 10) !== to ||
		last < first ||
		(last.getTime() - first.getTime()) / 86_400_000 > 31
	) {
		throw new BadRequestError("Choose a valid range of at most 32 days");
	}
}

async function previewSales(
	workplaceId: string,
	input: { locationId: string; from: string; to: string },
) {
	validateRange(input.from, input.to);
	const mapping = await mappedLocation(workplaceId, input.locationId);
	const sales = await fetchSquareDailySales({
		token: await accessTokenFor(workplaceId),
		squareLocationId: mapping.squareLocationId,
		from: input.from,
		to: input.to,
	});
	const salesByDate = new Map<string, number>();
	for (const row of sales) {
		if (salesByDate.has(row.date))
			throw new BadRequestError("Square returned duplicate sales dates");
		salesByDate.set(row.date, row.amountCents);
	}
	const existing = await db
		.select({
			date: locationSales.saleDate,
			amountCents: locationSales.amountCents,
		})
		.from(locationSales)
		.where(
			and(
				eq(locationSales.locationId, input.locationId),
				gte(locationSales.saleDate, input.from),
				lte(locationSales.saleDate, input.to),
			),
		);
	const current = new Map(existing.map((row) => [row.date, row.amountCents]));
	const rows = [];
	for (
		let day = new Date(`${input.from}T00:00:00Z`);
		day <= new Date(`${input.to}T00:00:00Z`);
		day.setUTCDate(day.getUTCDate() + 1)
	) {
		const saleDate = day.toISOString().slice(0, 10);
		const amountCents = salesByDate.get(saleDate) ?? 0;
		rows.push({
			date: saleDate,
			amountCents,
			currentAmountCents: current.get(saleDate) ?? null,
			change: current.has(saleDate) && current.get(saleDate) !== amountCents,
		});
	}
	return {
		rows,
		reviewHash: createHash("sha256")
			.update(
				JSON.stringify({
					locationId: input.locationId,
					from: input.from,
					to: input.to,
					squareLocationId: mapping.squareLocationId,
					rows,
				}),
			)
			.digest("hex"),
	};
}

export const squareRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Integrations"],
})
	.get(
		"/workplaces/:workplaceId/integrations/square/connect",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const { appId, baseUrl } = squareConfig();
			const [existing] = await db
				.select({ workplaceId: squareConnections.workplaceId })
				.from(squareConnections)
				.where(eq(squareConnections.workplaceId, params.workplaceId))
				.limit(1);
			if (existing)
				throw new ConflictError(
					"Disconnect Square before connecting another account",
				);
			const state = crypto.randomUUID();
			await db.insert(squareOAuthStates).values({
				stateHash: squareStateHash(state),
				workplaceId: params.workplaceId,
				createdByProfileId: profile.id,
				expiresAt: new Date(Date.now() + 10 * 60_000),
			});
			const url = new URL(`${baseUrl}/oauth2/authorize`);
			url.searchParams.set("client_id", appId);
			url.searchParams.set("scope", "REPORTING_READ MERCHANT_PROFILE_READ");
			url.searchParams.set("session", "false");
			url.searchParams.set("state", state);
			url.searchParams.set("redirect_uri", squareRedirectUrl());
			return { url: url.toString() };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.get(
		"/integrations/square/callback",
		async ({ query, set }) => {
			if (!query.state || !query.code)
				throw new BadRequestError("Square authorization was cancelled");
			const [pending] = await db
				.delete(squareOAuthStates)
				.where(eq(squareOAuthStates.stateHash, squareStateHash(query.state)))
				.returning();
			if (!pending || pending.expiresAt.getTime() < Date.now()) {
				throw new BadRequestError(
					"Square authorization expired; connect again",
				);
			}
			const result = await exchangeSquareToken({
				grantType: "authorization_code",
				value: query.code,
			});
			const { key } = squareConfig();
			const [created] = await db
				.insert(squareConnections)
				.values({
					workplaceId: pending.workplaceId,
					merchantId: result.merchantId,
					accessTokenEncrypted: encryptSquareToken(result.accessToken, key),
					refreshTokenEncrypted: encryptSquareToken(result.refreshToken, key),
					accessTokenExpiresAt: result.expiresAt,
				})
				.onConflictDoNothing()
				.returning({ workplaceId: squareConnections.workplaceId });
			if (!created) {
				await revokeSquareToken(result.accessToken);
				throw new ConflictError(
					"Square is already connected; disconnect before reconnecting",
				);
			}
			await writeAudit({
				workplaceId: pending.workplaceId,
				actorProfileId: pending.createdByProfileId,
				action: "integration.square_connected",
				entityType: "workplace",
				entityId: pending.workplaceId,
				summary: `Connected Square merchant ${result.merchantId}.`,
			});
			set.status = 302;
			set.headers.location = `${env.APP_URL.replace(/\/$/, "")}/dashboard/settings/integrations?square=connected`;
			return "Connected to Square";
		},
		{
			query: t.Object(
				{ code: t.Optional(t.String()), state: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
		},
	)
	.get(
		"/workplaces/:workplaceId/integrations/square",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const [connection] = await db
				.select({
					merchantId: squareConnections.merchantId,
					connectedAt: squareConnections.connectedAt,
				})
				.from(squareConnections)
				.where(eq(squareConnections.workplaceId, params.workplaceId))
				.limit(1);
			if (!connection)
				return { connected: false as const, mappings: [], squareLocations: [] };
			const mappings = await db
				.select()
				.from(squareLocationMappings)
				.where(eq(squareLocationMappings.workplaceId, params.workplaceId));
			return {
				connected: true as const,
				merchantId: connection.merchantId,
				connectedAt: connection.connectedAt,
				mappings,
				squareLocations: await fetchSquareLocations(
					await accessTokenFor(params.workplaceId),
				),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	)
	.put(
		"/workplaces/:workplaceId/integrations/square/mappings/:locationId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			const [location] = await db
				.select({ id: locations.id })
				.from(locations)
				.where(
					and(
						eq(locations.id, params.locationId),
						eq(locations.workplaceId, params.workplaceId),
					),
				)
				.limit(1);
			if (!location) throw new NotFoundError("Location not found");
			const squareLocations = await fetchSquareLocations(
				await accessTokenFor(params.workplaceId),
			);
			if (!squareLocations.some((item) => item.id === body.squareLocationId))
				throw new BadRequestError("Square Location not found");
			const [duplicateMapping] = await db
				.select({ locationId: squareLocationMappings.locationId })
				.from(squareLocationMappings)
				.where(
					and(
						eq(squareLocationMappings.workplaceId, params.workplaceId),
						eq(squareLocationMappings.squareLocationId, body.squareLocationId),
					),
				)
				.limit(1);
			if (duplicateMapping && duplicateMapping.locationId !== params.locationId)
				throw new ConflictError("Square Location is already mapped");
			await db
				.insert(squareLocationMappings)
				.values({
					locationId: params.locationId,
					workplaceId: params.workplaceId,
					squareLocationId: body.squareLocationId,
				})
				.onConflictDoUpdate({
					target: squareLocationMappings.locationId,
					set: { squareLocationId: body.squareLocationId },
				});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "integration.square_location_mapped",
				entityType: "location",
				entityId: params.locationId,
				summary: `Mapped Square location ${body.squareLocationId} to a Jooling location.`,
			});
			return { mapped: true };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, locationId: uuid }),
			body: t.Object({ squareLocationId: t.String({ minLength: 1 }) }),
		},
	)
	.post(
		"/workplaces/:workplaceId/integrations/square/preview",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");
			return await previewSales(params.workplaceId, body);
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({ locationId: uuid, from: date, to: date }),
		},
	)
	.post(
		"/workplaces/:workplaceId/integrations/square/import",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const { rows, reviewHash } = await previewSales(params.workplaceId, body);
			if (reviewHash !== body.reviewHash) {
				throw new ConflictError(
					"Square sales changed since preview; review again",
				);
			}
			if (rows.some((row) => row.change) && !body.overwriteExisting) {
				throw new ConflictError(
					"Existing sales differ; review the preview and approve replacement",
				);
			}
			await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${body.locationId}))`,
				);
				for (const row of rows) {
					const [existing] = await tx
						.select({ amountCents: locationSales.amountCents })
						.from(locationSales)
						.where(
							and(
								eq(locationSales.locationId, body.locationId),
								eq(locationSales.saleDate, row.date),
							),
						)
						.limit(1);
					if ((existing?.amountCents ?? null) !== row.currentAmountCents) {
						throw new ConflictError(
							"Sales changed since preview; review again",
						);
					}
					await tx
						.insert(locationSales)
						.values({
							locationId: body.locationId,
							saleDate: row.date,
							amountCents: row.amountCents,
							updatedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: [locationSales.locationId, locationSales.saleDate],
							set: { amountCents: row.amountCents, updatedAt: new Date() },
						});
					await tx
						.insert(salesImportSources)
						.values({
							locationId: body.locationId,
							saleDate: row.date,
							source: "square",
							amountCents: row.amountCents,
							importedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: [
								salesImportSources.locationId,
								salesImportSources.saleDate,
							],
							set: {
								source: "square",
								amountCents: row.amountCents,
								importedAt: new Date(),
							},
						});
				}
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "integration.square_sales_imported",
				entityType: "location",
				entityId: body.locationId,
				summary: `Imported ${rows.length} day(s) of Square net sales from ${body.from} to ${body.to}.`,
			});
			return { imported: rows.length };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				locationId: uuid,
				from: date,
				to: date,
				overwriteExisting: t.Boolean(),
				reviewHash: t.String({ pattern: "^[a-f0-9]{64}$" }),
			}),
		},
	)
	.delete(
		"/workplaces/:workplaceId/integrations/square",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"integrations.manage",
			);
			await revokeSquareToken(await accessTokenFor(params.workplaceId));
			await db
				.delete(squareConnections)
				.where(eq(squareConnections.workplaceId, params.workplaceId));
			await db
				.delete(squareLocationMappings)
				.where(eq(squareLocationMappings.workplaceId, params.workplaceId));
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "integration.square_disconnected",
				entityType: "workplace",
				entityId: params.workplaceId,
				summary: "Disconnected Square and removed stored credentials.",
			});
			return { disconnected: true };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
		},
	);
