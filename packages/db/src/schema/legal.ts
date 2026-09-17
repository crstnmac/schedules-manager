import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

/**
 * Consent records for the Terms & Conditions and the pre-checkout billing
 * disclosure. Auto-renewal laws (e.g. Cal. Bus. & Prof. Code §17600 et seq.)
 * require keeping proof of affirmative consent for at least three years after
 * consent is given or the relationship ends.
 */
export const legalAcceptanceKindEnum = pgEnum("legal_acceptance_kind", [
	"terms",
	"billing",
]);

export const legalAcceptances = pgTable(
	"legal_acceptances",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		profileId: uuid("profile_id")
			.notNull()
			.references(() => profiles.id, { onDelete: "cascade" }),
		kind: legalAcceptanceKindEnum("kind").notNull(),
		/** Version of the document accepted (e.g. "2026-09-17"). */
		version: text("version").notNull(),
		/** UI surface where acceptance happened (e.g. "sign-up", "checkout"). */
		surface: text("surface").notNull(),
		userAgent: text("user_agent"),
		acceptedAt: timestamp("accepted_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("legal_acceptances_profile_idx").on(table.profileId),
		index("legal_acceptances_kind_version_idx").on(table.kind, table.version),
	],
);

export type LegalAcceptance = typeof legalAcceptances.$inferSelect;
export type NewLegalAcceptance = typeof legalAcceptances.$inferInsert;
