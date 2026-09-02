import {
	date,
	integer,
	pgEnum,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

export const payPeriodTypeEnum = pgEnum("pay_period_type", [
	"weekly",
	"biweekly",
	"semimonthly",
	"monthly",
]);

export const workplaces = pgTable("workplaces", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	noticeWindowHours: integer("notice_window_hours").notNull().default(48),
	weekStartDay: smallint("week_start_day").notNull().default(1),
	payPeriodType: payPeriodTypeEnum("pay_period_type")
		.notNull()
		.default("weekly"),
	payPeriodAnchor: date("pay_period_anchor"),
	earlyClockInMinutes: integer("early_clock_in_minutes").notNull().default(15),
	clockRoundMinutes: integer("clock_round_minutes").notNull().default(0),
	overtimeWeeklyMinutes: integer("overtime_weekly_minutes")
		.notNull()
		.default(2400),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const locations = pgTable(
	"locations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		timezone: text("timezone").notNull().default("America/Chicago"),
		addressLine: text("address_line"),
		latitude: text("latitude"),
		longitude: text("longitude"),
		geofenceRadiusMeters: integer("geofence_radius_meters"),
		kioskPinHash: text("kiosk_pin_hash"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("locations_workplace_name_unique").on(table.workplaceId, table.name),
	],
);

export const positions = pgTable(
	"positions",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("positions_workplace_name_unique").on(table.workplaceId, table.name),
	],
);

export type Workplace = typeof workplaces.$inferSelect;
export type NewWorkplace = typeof workplaces.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
