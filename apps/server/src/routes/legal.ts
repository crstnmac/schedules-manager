import { db, legalAcceptances } from "@SchedulesManager/db";
import { desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requireSession } from "../context";
import { TERMS_VERSION } from "../legal-version";

/**
 * Consent records for the Terms & Conditions and the pre-checkout billing
 * disclosure. Records are kept for at least three years after the account
 * closes so we can prove affirmative consent under auto-renewal laws.
 */
export const legalRoutes = new Elysia({ prefix: "/v1/legal", tags: ["Legal"] })
	.get(
		"/acceptances",
		async ({ headers }) => {
			const { profile } = await requireSession(headers);
			const rows = await latestAcceptances(profile.id);
			return {
				terms: rows.find((row) => row.kind === "terms") ?? null,
				billing: rows.find((row) => row.kind === "billing") ?? null,
				currentVersion: TERMS_VERSION,
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			detail: {
				summary: "List the requesting profile's legal acceptances",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/acceptances",
		async ({ body, headers, request }) => {
			const { profile } = await requireSession(headers);
			const [record] = await db
				.insert(legalAcceptances)
				.values({
					profileId: profile.id,
					kind: body.kind,
					version: body.version,
					surface: body.surface,
					userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
				})
				.returning();
			return {
				id: record?.id,
				kind: body.kind,
				version: body.version,
				acceptedAt: record?.acceptedAt.toISOString() ?? null,
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			body: t.Object({
				kind: t.Union([t.Literal("terms"), t.Literal("billing")]),
				version: t.String({ minLength: 1, maxLength: 40 }),
				surface: t.String({ minLength: 1, maxLength: 60 }),
			}),
			detail: {
				summary: "Record acceptance of a legal document",
				security: [{ bearerAuth: [] }],
			},
		},
	);

function latestAcceptances(profileId: string) {
	return db
		.select({
			kind: legalAcceptances.kind,
			version: legalAcceptances.version,
			acceptedAt: legalAcceptances.acceptedAt,
		})
		.from(legalAcceptances)
		.where(eq(legalAcceptances.profileId, profileId))
		.orderBy(desc(legalAcceptances.acceptedAt))
		.limit(10);
}
