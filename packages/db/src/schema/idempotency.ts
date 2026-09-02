import {
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

export const idempotencyRecords = pgTable(
	"idempotency_records",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		actorProfileId: uuid("actor_profile_id")
			.notNull()
			.references(() => profiles.id, { onDelete: "cascade" }),
		scope: text("scope").notNull(),
		key: text("key").notNull(),
		requestHash: text("request_hash").notNull(),
		response: jsonb("response").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("idempotency_records_actor_scope_key_unique").on(
			table.actorProfileId,
			table.scope,
			table.key,
		),
	],
);

export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;
export type NewIdempotencyRecord = typeof idempotencyRecords.$inferInsert;
