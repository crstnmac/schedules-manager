import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";

export const pushTokenPlatformEnum = pgEnum("push_token_platform", [
	"ios",
	"android",
]);

export const pushTokens = pgTable(
	"push_tokens",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		expoPushToken: text("expo_push_token").notNull(),
		platform: pushTokenPlatformEnum("platform").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("push_tokens_employment_token_unique").on(
			table.employmentId,
			table.expoPushToken,
		),
		index("push_tokens_employment_idx").on(table.employmentId),
	],
);

export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
