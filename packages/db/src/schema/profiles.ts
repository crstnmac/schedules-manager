import {
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const timeFormatEnum = pgEnum("time_format", ["12h", "24h"]);
export const nameFormatEnum = pgEnum("name_format", [
	"full",
	"first_last_initial",
	"first",
]);

export type NotificationPreferences = {
	schedule: boolean;
	messages: boolean;
	timeOff: boolean;
	timeClock: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
	schedule: true,
	messages: true,
	timeOff: true,
	timeClock: true,
};

export const profiles = pgTable("profiles", {
	id: uuid("id").primaryKey(),
	email: text("email").notNull().unique(),
	fullName: text("full_name"),
	timeFormat: timeFormatEnum("time_format").notNull().default("12h"),
	nameFormat: nameFormatEnum("name_format").notNull().default("full"),
	notificationPreferences: jsonb("notification_preferences")
		.$type<NotificationPreferences>()
		.notNull()
		.default(DEFAULT_NOTIFICATION_PREFERENCES),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
