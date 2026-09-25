import { Elysia, t } from "elysia";
import { requirePrivilege, requireSession } from "../context";
import { csvAttachment } from "../csv-import";
import { BadRequestError } from "../errors";
import { withIdempotency } from "../idempotency";
import { consumeRateLimitOrThrow } from "../rate-limit";
import {
	commitSalesImport,
	previewSalesImport,
	SALES_IMPORT_TEMPLATE,
} from "../sales-import";

const uuid = t.String({ format: "uuid" });

const importHeaders = t.Object(
	{
		authorization: t.Optional(t.String()),
		"idempotency-key": t.Optional(t.String({ minLength: 8, maxLength: 200 })),
	},
	{ additionalProperties: true },
);

export const salesRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Sales"],
})
	.post(
		"/workplaces/:workplaceId/sales/import",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");
			if (body.dryRun ?? false) {
				return {
					preview: await previewSalesImport({
						workplaceId: params.workplaceId,
						csv: body.csv,
					}),
				};
			}
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const reviewHash = body.reviewHash;
			if (!reviewHash) {
				throw new BadRequestError("Preview the file to review the import");
			}
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `sales.import:${params.workplaceId}`,
				key: headers["idempotency-key"],
				request: {
					csv: body.csv,
					overwriteExisting: body.overwriteExisting ?? false,
				},
				execute: async () => {
					consumeRateLimitOrThrow(`sales.import:${profile.id}`, "salesImport");
					return {
						imported: await commitSalesImport({
							workplaceId: params.workplaceId,
							profileId: profile.id,
							csv: body.csv,
							reviewHash,
							overwriteExisting: body.overwriteExisting ?? false,
						}),
					};
				},
			});
		},
		{
			headers: importHeaders,
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				csv: t.String({ minLength: 1, maxLength: 2_000_000 }),
				dryRun: t.Optional(t.Boolean()),
				reviewHash: t.Optional(t.String({ pattern: "^[a-f0-9]{64}$" })),
				overwriteExisting: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Preview or commit a daily sales import from CSV (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/sales/import/template.csv",
		async ({ headers, params, set }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "reports.view");
			csvAttachment(set, "sales-import-template.csv");
			return SALES_IMPORT_TEMPLATE;
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "Download the daily sales import CSV template (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
