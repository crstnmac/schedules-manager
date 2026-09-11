import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { workplaces } from "./workplaces";

export const unavailabilityKindEnum = pgEnum("unavailability_kind", [
	"recurring",
	"date",
]);

export const unavailabilityStatusEnum = pgEnum("unavailability_status", [
	"pending",
	"approved",
]);

export const unavailability = pgTable(
	"unavailability",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		kind: unavailabilityKindEnum("kind").notNull(),
		weekday: integer("weekday"),
		specificDate: date("specific_date"),
		startMinute: integer("start_minute").notNull(),
		endMinute: integer("end_minute").notNull(),
		note: text("note"),
		status: unavailabilityStatusEnum("status").notNull().default("approved"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"unavailability_range_check",
			sql`${table.startMinute} < ${table.endMinute}`,
		),
	],
);

/**
 * Who must approve a step of a leave approval chain:
 * - workplace_managers: any active Manager with approvals.review
 * - specific_employment: the named Employment, or an active delegate
 * - privilege: any Employment holding the named privilege
 */
export const leaveApproverKindEnum = pgEnum("leave_approval_step_kind", [
	"workplace_managers",
	"specific_employment",
	"privilege",
]);

export const leaveApprovalStepStatusEnum = pgEnum(
	"leave_approval_step_status",
	["pending", "approved", "declined", "skipped", "escalated"],
);

export const leaveApprovalChains = pgTable(
	"leave_approval_chains",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		/** Used for Leave Types that do not name a chain of their own. */
		isDefault: boolean("is_default").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("leave_approval_chains_workplace_name_unique").on(
			table.workplaceId,
			table.name,
		),
	],
);

export const leaveApprovalSteps = pgTable(
	"leave_approval_steps",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chainId: uuid("chain_id")
			.notNull()
			.references(() => leaveApprovalChains.id, { onDelete: "cascade" }),
		stepOrder: integer("step_order").notNull(),
		approverKind: leaveApproverKindEnum("approver_kind").notNull(),
		approverEmploymentId: uuid("approver_employment_id").references(
			() => employments.id,
			{ onDelete: "set null" },
		),
		approverPrivilege: text("approver_privilege"),
		/** Hours before this step escalates. Null means never. */
		escalateAfterHours: integer("escalate_after_hours"),
		escalationKind: leaveApproverKindEnum("escalation_kind"),
		escalationEmploymentId: uuid("escalation_employment_id").references(
			() => employments.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("leave_approval_steps_chain_order_unique").on(
			table.chainId,
			table.stepOrder,
		),
	],
);

export const leaveClassificationEnum = pgEnum("leave_classification", [
	"standard",
	"floating_holiday",
	"working_away",
	"special",
]);

export const leaveAccrualMethodEnum = pgEnum("leave_accrual_method", [
	"none",
	"weekly",
	"biweekly",
	"semimonthly",
	"monthly",
	"annual",
	"per_hour_worked",
]);

export const leaveTypes = pgTable(
	"leave_types",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		paid: boolean("paid").notNull().default(true),
		/** Short label shown in calendars and exports, e.g. "VAC". */
		code: text("code"),
		description: text("description"),
		classification: leaveClassificationEnum("classification")
			.notNull()
			.default("standard"),
		/** Disabled types stay on history but cannot be requested. */
		active: boolean("active").notNull().default(true),
		approvalChainId: uuid("approval_chain_id").references(
			() => leaveApprovalChains.id,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("leave_types_workplace_name_unique").on(
			table.workplaceId,
			table.name,
		),
	],
);

/**
 * Per Leave Type rules: accrual, carry-forward, negative balance, charging,
 * notice and documentation. A missing row means legacy behaviour: no accrual,
 * full-day charging across calendar days, one-step manager approval.
 */
export const leavePolicies = pgTable("leave_policies", {
	leaveTypeId: uuid("leave_type_id")
		.primaryKey()
		.references(() => leaveTypes.id, { onDelete: "cascade" }),
	workplaceId: uuid("workplace_id")
		.notNull()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	accrualMethod: leaveAccrualMethodEnum("accrual_method")
		.notNull()
		.default("none"),
	/** Minutes granted per accrual period (or per accrualPerHoursWorked hours). */
	accrualMinutes: integer("accrual_minutes").notNull().default(0),
	/** Day of month for monthly/semimonthly accruals (1-28). */
	accrualDay: integer("accrual_day").notNull().default(1),
	/** Anchor weekday for weekly/biweekly accruals, 0 = Sunday. */
	accrualWeekday: integer("accrual_weekday").notNull().default(0),
	/** MM-DD date for annual grants. */
	annualAccrualMonthDay: text("annual_accrual_month_day"),
	/** Hours worked per accrualMinutes grant for per_hour_worked. */
	accrualPerHoursWorked: integer("accrual_per_hours_worked")
		.notNull()
		.default(40),
	prorateOnJoin: boolean("prorate_on_join").notNull().default(true),
	/** Balance cap. Null means no cap. */
	maxBalanceMinutes: integer("max_balance_minutes"),
	carryForwardEnabled: boolean("carry_forward_enabled")
		.notNull()
		.default(false),
	maxCarryForwardMinutes: integer("max_carry_forward_minutes"),
	/** Months after leave year start before carried minutes expire. */
	carryForwardExpiryMonths: integer("carry_forward_expiry_months"),
	allowNegative: boolean("allow_negative").notNull().default(false),
	maxNegativeMinutes: integer("max_negative_minutes").notNull().default(0),
	/** Charge only working days (weekends and holidays excluded). */
	chargeWorkingDaysOnly: boolean("charge_working_days_only")
		.notNull()
		.default(true),
	/** Minimum service before the type can be requested. */
	minServiceDays: integer("min_service_days").notNull().default(0),
	noticeDays: integer("notice_days").notNull().default(0),
	maxConsecutiveDays: integer("max_consecutive_days"),
	/** Ask for an uploaded document when a request runs this long. */
	documentRequiredAfterDays: integer("document_required_after_days"),
	encashmentEnabled: boolean("encashment_enabled").notNull().default(false),
	maxEncashmentMinutesPerYear: integer("max_encashment_minutes_per_year"),
	allowPartialDays: boolean("allow_partial_days").notNull().default(true),
	/** MM-DD start of the leave year. */
	leaveYearStartMonthDay: text("leave_year_start_month_day")
		.notNull()
		.default("01-01"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const ptoBalances = pgTable(
	"pto_balances",
	{
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		leaveTypeId: uuid("leave_type_id")
			.notNull()
			.references(() => leaveTypes.id, { onDelete: "cascade" }),
		minutes: integer("minutes").notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.employmentId, table.leaveTypeId] })],
);

export const timeOffStatusEnum = pgEnum("time_off_status", [
	"pending",
	"approved",
	"declined",
	"cancelled",
]);

export const timeOffRequests = pgTable(
	"time_off_requests",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		reason: text("reason"),
		status: timeOffStatusEnum("status").notNull().default("pending"),
		decidedBy: uuid("decided_by"),
		decisionReason: text("decision_reason"),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		leaveTypeId: uuid("leave_type_id").references(() => leaveTypes.id, {
			onDelete: "set null",
		}),
		/** Minutes actually taken from the PTO balance (clamped to what remained). */
		deductedMinutes: integer("deducted_minutes"),
		/** Charge computed at submission against the leave policy. */
		chargeMinutes: integer("charge_minutes"),
		/** Groups requests created together by bulk or recurring applications. */
		batchId: uuid("batch_id"),
		isEmergency: boolean("is_emergency").notNull().default(false),
		/** Index of the approval step currently awaiting a decision. */
		currentStep: integer("current_step").notNull().default(0),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("time_off_requests_employment_status_idx").on(
			table.employmentId,
			table.status,
		),
		index("time_off_requests_workplace_created_idx").on(table.createdAt),
	],
);

export const leaveRequestApprovals = pgTable(
	"leave_request_approvals",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		requestId: uuid("request_id")
			.notNull()
			.references(() => timeOffRequests.id, { onDelete: "cascade" }),
		stepOrder: integer("step_order").notNull(),
		approverKind: leaveApproverKindEnum("approver_kind").notNull(),
		approverEmploymentId: uuid("approver_employment_id").references(
			() => employments.id,
			{ onDelete: "set null" },
		),
		approverPrivilege: text("approver_privilege"),
		status: leaveApprovalStepStatusEnum("status").notNull().default("pending"),
		decidedByProfileId: uuid("decided_by_profile_id"),
		decisionReason: text("decision_reason"),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		/** When this step escalates if still pending. */
		dueAt: timestamp("due_at", { withTimezone: true }),
		escalateAfterHours: integer("escalate_after_hours"),
		escalationKind: leaveApproverKindEnum("escalation_kind"),
		escalationEmploymentId: uuid("escalation_employment_id").references(
			() => employments.id,
			{ onDelete: "set null" },
		),
		escalatedAt: timestamp("escalated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("leave_request_approvals_request_step_unique").on(
			table.requestId,
			table.stepOrder,
		),
		index("leave_request_approvals_pending_idx").on(table.status, table.dueAt),
	],
);

export const leaveLedgerKindEnum = pgEnum("leave_ledger_kind", [
	"initial",
	"accrual",
	"usage",
	"adjustment",
	"carry_forward",
	"expiry",
	"encashment",
	"transfer_in",
	"transfer_out",
	"restoration",
]);

export const leaveLedgerEntries = pgTable(
	"leave_ledger_entries",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		leaveTypeId: uuid("leave_type_id")
			.notNull()
			.references(() => leaveTypes.id, { onDelete: "cascade" }),
		kind: leaveLedgerKindEnum("kind").notNull(),
		/** Signed balance delta. */
		minutes: integer("minutes").notNull(),
		/** Informational amount when minutes is 0 (carry-forward labels). */
		metaMinutes: integer("meta_minutes"),
		balanceAfter: integer("balance_after").notNull(),
		effectiveDate: date("effective_date").notNull(),
		leaveYear: integer("leave_year").notNull(),
		requestId: uuid("request_id").references(() => timeOffRequests.id, {
			onDelete: "set null",
		}),
		encashmentId: uuid("encashment_id"),
		transferId: uuid("transfer_id"),
		createdByProfileId: uuid("created_by_profile_id"),
		note: text("note"),
		/** Makes automated runs idempotent. */
		idempotencyKey: text("idempotency_key"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("leave_ledger_entries_idempotency_unique").on(table.idempotencyKey),
		index("leave_ledger_employment_type_idx").on(
			table.employmentId,
			table.leaveTypeId,
			table.effectiveDate,
		),
		index("leave_ledger_workplace_effective_idx").on(
			table.workplaceId,
			table.effectiveDate,
		),
	],
);

export const leaveEncashmentStatusEnum = pgEnum("leave_encashment_status", [
	"requested",
	"approved",
	"declined",
	"paid",
	"cancelled",
]);

export const leaveEncashments = pgTable(
	"leave_encashments",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		employmentId: uuid("employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		leaveTypeId: uuid("leave_type_id")
			.notNull()
			.references(() => leaveTypes.id, { onDelete: "cascade" }),
		minutes: integer("minutes").notNull(),
		/** Wage rate captured at request time so later edits cannot rewrite pay. */
		hourlyWageCentsSnapshot: integer("hourly_wage_cents_snapshot"),
		amountCents: integer("amount_cents").notNull().default(0),
		status: leaveEncashmentStatusEnum("status").notNull().default("requested"),
		requestedByProfileId: uuid("requested_by_profile_id"),
		decidedByProfileId: uuid("decided_by_profile_id"),
		decisionReason: text("decision_reason"),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("leave_encashments_employment_status_idx").on(
			table.employmentId,
			table.status,
		),
	],
);

export const leaveBalanceTransfers = pgTable("leave_balance_transfers", {
	id: uuid("id").defaultRandom().primaryKey(),
	workplaceId: uuid("workplace_id")
		.notNull()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	employmentId: uuid("employment_id")
		.notNull()
		.references(() => employments.id, { onDelete: "cascade" }),
	fromLeaveTypeId: uuid("from_leave_type_id")
		.notNull()
		.references(() => leaveTypes.id, { onDelete: "cascade" }),
	toLeaveTypeId: uuid("to_leave_type_id")
		.notNull()
		.references(() => leaveTypes.id, { onDelete: "cascade" }),
	minutes: integer("minutes").notNull(),
	reason: text("reason"),
	createdByProfileId: uuid("created_by_profile_id"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const leaveRequestDocuments = pgTable(
	"leave_request_documents",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		requestId: uuid("request_id")
			.notNull()
			.references(() => timeOffRequests.id, { onDelete: "cascade" }),
		uploadedByProfileId: uuid("uploaded_by_profile_id"),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		sizeBytes: integer("size_bytes").notNull(),
		storageKey: text("storage_key").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("leave_request_documents_request_idx").on(table.requestId)],
);

export const leaveApprovalDelegations = pgTable(
	"leave_approval_delegations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		delegatorEmploymentId: uuid("delegator_employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		delegateEmploymentId: uuid("delegate_employment_id")
			.notNull()
			.references(() => employments.id, { onDelete: "cascade" }),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		reason: text("reason"),
		createdByProfileId: uuid("created_by_profile_id"),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("leave_approval_delegations_window_idx").on(
			table.workplaceId,
			table.startsAt,
			table.endsAt,
		),
	],
);

export const calendarFeedTokens = pgTable(
	"calendar_feed_tokens",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		/** Null means a workplace-wide feed (holidays and all approved leave). */
		employmentId: uuid("employment_id").references(() => employments.id, {
			onDelete: "cascade",
		}),
		token: text("token").notNull().unique(),
		label: text("label"),
		createdByProfileId: uuid("created_by_profile_id"),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("calendar_feed_tokens_workplace_idx").on(table.workplaceId),
	],
);

export const workPreferences = pgTable("work_preferences", {
	id: uuid("id").defaultRandom().primaryKey(),
	employmentId: uuid("employment_id")
		.notNull()
		.references(() => employments.id, { onDelete: "cascade" }),
	note: text("note").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const unavailabilityRelations = relations(unavailability, ({ one }) => ({
	employment: one(employments, {
		fields: [unavailability.employmentId],
		references: [employments.id],
	}),
}));

export const timeOffRequestRelations = relations(
	timeOffRequests,
	({ one, many }) => ({
		employment: one(employments, {
			fields: [timeOffRequests.employmentId],
			references: [employments.id],
		}),
		approvals: many(leaveRequestApprovals),
		documents: many(leaveRequestDocuments),
	}),
);

export const leaveApprovalChainRelations = relations(
	leaveApprovalChains,
	({ one, many }) => ({
		workplace: one(workplaces, {
			fields: [leaveApprovalChains.workplaceId],
			references: [workplaces.id],
		}),
		steps: many(leaveApprovalSteps),
	}),
);

export const leaveApprovalStepRelations = relations(
	leaveApprovalSteps,
	({ one }) => ({
		chain: one(leaveApprovalChains, {
			fields: [leaveApprovalSteps.chainId],
			references: [leaveApprovalChains.id],
		}),
	}),
);

export const leaveRequestApprovalRelations = relations(
	leaveRequestApprovals,
	({ one }) => ({
		request: one(timeOffRequests, {
			fields: [leaveRequestApprovals.requestId],
			references: [timeOffRequests.id],
		}),
	}),
);

export const leavePolicyRelations = relations(leavePolicies, ({ one }) => ({
	leaveType: one(leaveTypes, {
		fields: [leavePolicies.leaveTypeId],
		references: [leaveTypes.id],
	}),
}));

export type Unavailability = typeof unavailability.$inferSelect;
export type NewUnavailability = typeof unavailability.$inferInsert;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;
export type NewTimeOffRequest = typeof timeOffRequests.$inferInsert;
export type WorkPreference = typeof workPreferences.$inferSelect;
export type NewWorkPreference = typeof workPreferences.$inferInsert;
export type LeaveType = typeof leaveTypes.$inferSelect;
export type NewLeaveType = typeof leaveTypes.$inferInsert;
export type PtoBalance = typeof ptoBalances.$inferSelect;
export type LeavePolicy = typeof leavePolicies.$inferSelect;
export type NewLeavePolicy = typeof leavePolicies.$inferInsert;
export type LeaveApprovalChain = typeof leaveApprovalChains.$inferSelect;
export type NewLeaveApprovalChain = typeof leaveApprovalChains.$inferInsert;
export type LeaveApprovalStep = typeof leaveApprovalSteps.$inferSelect;
export type NewLeaveApprovalStep = typeof leaveApprovalSteps.$inferInsert;
export type LeaveRequestApproval = typeof leaveRequestApprovals.$inferSelect;
export type NewLeaveRequestApproval = typeof leaveRequestApprovals.$inferInsert;
export type LeaveLedgerEntry = typeof leaveLedgerEntries.$inferSelect;
export type NewLeaveLedgerEntry = typeof leaveLedgerEntries.$inferInsert;
export type LeaveEncashment = typeof leaveEncashments.$inferSelect;
export type NewLeaveEncashment = typeof leaveEncashments.$inferInsert;
export type LeaveBalanceTransfer = typeof leaveBalanceTransfers.$inferSelect;
export type NewLeaveBalanceTransfer = typeof leaveBalanceTransfers.$inferInsert;
export type LeaveRequestDocument = typeof leaveRequestDocuments.$inferSelect;
export type NewLeaveRequestDocument = typeof leaveRequestDocuments.$inferInsert;
export type LeaveApprovalDelegation =
	typeof leaveApprovalDelegations.$inferSelect;
export type NewLeaveApprovalDelegation =
	typeof leaveApprovalDelegations.$inferInsert;
export type CalendarFeedToken = typeof calendarFeedTokens.$inferSelect;
export type NewCalendarFeedToken = typeof calendarFeedTokens.$inferInsert;
