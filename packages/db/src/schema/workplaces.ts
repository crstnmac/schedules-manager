import { sql } from "drizzle-orm";
import {
	boolean,
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

export const workerScheduleVisibilityEnum = pgEnum(
	"worker_schedule_visibility",
	["own", "full"],
);

export const leaveCapResetEnum = pgEnum("leave_cap_reset", [
	"none",
	"calendar_year",
	"hire_date",
	"custom_date",
]);

/**
 * When Workers may see planned (unpublished) Shifts. `never` keeps drafts
 * invisible until publication; `always` exposes the current draft; `within_days`
 * exposes only Shifts within `plannedShiftLeadDays` of their start.
 */
export const plannedShiftsVisibilityEnum = pgEnum("planned_shifts_visibility", [
	"never",
	"always",
	"within_days",
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
	/** Minutes after published shift end before an open Time Entry is closed. 0 disables. */
	autoClockOutGraceMinutes: integer("auto_clock_out_grace_minutes")
		.notNull()
		.default(30),
	overtimeWeeklyMinutes: integer("overtime_weekly_minutes")
		.notNull()
		.default(2400),
	messagingEnabled: boolean("messaging_enabled").notNull().default(true),
	announcementsEnabled: boolean("announcements_enabled")
		.notNull()
		.default(true),
	tasksEnabled: boolean("tasks_enabled").notNull().default(true),
	contactDetailsVisible: boolean("contact_details_visible")
		.notNull()
		.default(true),
	workerScheduleVisibility: workerScheduleVisibilityEnum(
		"worker_schedule_visibility",
	)
		.notNull()
		.default("full"),
	workerTimeOffVisibility: boolean("worker_time_off_visibility")
		.notNull()
		.default(true),
	plannedShiftsVisibility: plannedShiftsVisibilityEnum(
		"planned_shifts_visibility",
	)
		.notNull()
		.default("never"),
	/** Used when plannedShiftsVisibility is within_days. */
	plannedShiftLeadDays: integer("planned_shift_lead_days").notNull().default(7),
	breaksEnabled: boolean("breaks_enabled").notNull().default(true),
	shiftExchangesEnabled: boolean("shift_exchanges_enabled")
		.notNull()
		.default(true),
	unavailabilityRequiresApproval: boolean("unavailability_requires_approval")
		.notNull()
		.default(false),
	/** Skips manager approval for Open Shift pickups when on. */
	autoAcceptShiftPickups: boolean("auto_accept_shift_pickups")
		.notNull()
		.default(false),
	/** Skips manager approval for agreed Worker-to-Worker shift swaps when on. */
	autoAcceptShiftSwaps: boolean("auto_accept_shift_swaps")
		.notNull()
		.default(false),
	/** Skips manager approval for Shift Release requests when on. */
	autoAcceptShiftReleases: boolean("auto_accept_shift_releases")
		.notNull()
		.default(false),
	/** Auto-accepts material Schedule Changes instead of requiring Shift Acceptance. */
	autoAcceptLateChanges: boolean("auto_accept_late_changes")
		.notNull()
		.default(false),
	/** Minimum rest between shifts, in minutes. 0 disables. */
	clopeningMinutes: integer("clopening_minutes").notNull().default(0),
	/** Maximum consecutive scheduled workdays. 0 disables. */
	maxConsecutiveWorkDays: integer("max_consecutive_work_days")
		.notNull()
		.default(0),
	geofenceRequired: boolean("geofence_required").notNull().default(false),
	lateArrivalGraceMinutes: integer("late_arrival_grace_minutes")
		.notNull()
		.default(5),
	timesheetNotesEnabled: boolean("timesheet_notes_enabled")
		.notNull()
		.default(true),
	leaveCapReset: leaveCapResetEnum("leave_cap_reset").notNull().default("none"),
	/** MM-DD used when leaveCapReset is custom_date. */
	leaveCapResetMonthDay: text("leave_cap_reset_month_day"),
	/** Weekdays that are not working days, 0 = Sunday. Defaults to Sat/Sun. */
	weekendDays: integer("weekend_days").array().notNull().default(sql`'{0,6}'`),
	workersCanRequestTimeOff: boolean("workers_can_request_time_off")
		.notNull()
		.default(true),
	/** Daily overtime threshold in minutes. 0 disables. */
	overtimeDailyMinutes: integer("overtime_daily_minutes").notNull().default(0),
	/** Target labor cost as a percent of sales. Null means no goal. */
	laborCostPercentGoal: integer("labor_cost_percent_goal"),
	managersCanViewLaborCost: boolean("managers_can_view_labor_cost")
		.notNull()
		.default(true),
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
		/** Minutes from midnight. Null with closeMinute null means 24h / unbounded. */
		openMinute: integer("open_minute"),
		closeMinute: integer("close_minute"),
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
