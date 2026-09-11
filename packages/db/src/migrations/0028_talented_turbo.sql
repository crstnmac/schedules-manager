CREATE TYPE "public"."leave_accrual_method" AS ENUM('none', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'annual', 'per_hour_worked');--> statement-breakpoint
CREATE TYPE "public"."leave_approval_step_status" AS ENUM('pending', 'approved', 'declined', 'skipped', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."leave_approval_step_kind" AS ENUM('workplace_managers', 'specific_employment', 'privilege');--> statement-breakpoint
CREATE TYPE "public"."leave_classification" AS ENUM('standard', 'floating_holiday', 'working_away', 'special');--> statement-breakpoint
CREATE TYPE "public"."leave_encashment_status" AS ENUM('requested', 'approved', 'declined', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_ledger_kind" AS ENUM('initial', 'accrual', 'usage', 'adjustment', 'carry_forward', 'expiry', 'encashment', 'transfer_in', 'transfer_out', 'restoration');--> statement-breakpoint
ALTER TYPE "public"."time_off_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "calendar_feed_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"employment_id" uuid,
	"token" text NOT NULL,
	"label" text,
	"created_by_profile_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "leave_approval_chains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_approval_chains_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "leave_approval_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"delegator_employment_id" uuid NOT NULL,
	"delegate_employment_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_by_profile_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approver_kind" "leave_approval_step_kind" NOT NULL,
	"approver_employment_id" uuid,
	"approver_privilege" text,
	"escalate_after_hours" integer,
	"escalation_kind" "leave_approval_step_kind",
	"escalation_employment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_approval_steps_chain_order_unique" UNIQUE("chain_id","step_order")
);
--> statement-breakpoint
CREATE TABLE "leave_balance_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"from_leave_type_id" uuid NOT NULL,
	"to_leave_type_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"reason" text,
	"created_by_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_encashments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"hourly_wage_cents_snapshot" integer,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" "leave_encashment_status" DEFAULT 'requested' NOT NULL,
	"requested_by_profile_id" uuid,
	"decided_by_profile_id" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"kind" "leave_ledger_kind" NOT NULL,
	"minutes" integer NOT NULL,
	"meta_minutes" integer,
	"balance_after" integer NOT NULL,
	"effective_date" date NOT NULL,
	"leave_year" integer NOT NULL,
	"request_id" uuid,
	"encashment_id" uuid,
	"transfer_id" uuid,
	"created_by_profile_id" uuid,
	"note" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_ledger_entries_idempotency_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "leave_policies" (
	"leave_type_id" uuid PRIMARY KEY NOT NULL,
	"workplace_id" uuid NOT NULL,
	"accrual_method" "leave_accrual_method" DEFAULT 'none' NOT NULL,
	"accrual_minutes" integer DEFAULT 0 NOT NULL,
	"accrual_day" integer DEFAULT 1 NOT NULL,
	"accrual_weekday" integer DEFAULT 0 NOT NULL,
	"annual_accrual_month_day" text,
	"accrual_per_hours_worked" integer DEFAULT 40 NOT NULL,
	"prorate_on_join" boolean DEFAULT true NOT NULL,
	"max_balance_minutes" integer,
	"carry_forward_enabled" boolean DEFAULT false NOT NULL,
	"max_carry_forward_minutes" integer,
	"carry_forward_expiry_months" integer,
	"allow_negative" boolean DEFAULT false NOT NULL,
	"max_negative_minutes" integer DEFAULT 0 NOT NULL,
	"charge_working_days_only" boolean DEFAULT true NOT NULL,
	"min_service_days" integer DEFAULT 0 NOT NULL,
	"notice_days" integer DEFAULT 0 NOT NULL,
	"max_consecutive_days" integer,
	"document_required_after_days" integer,
	"encashment_enabled" boolean DEFAULT false NOT NULL,
	"max_encashment_minutes_per_year" integer,
	"allow_partial_days" boolean DEFAULT true NOT NULL,
	"leave_year_start_month_day" text DEFAULT '01-01' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_request_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"approver_kind" "leave_approval_step_kind" NOT NULL,
	"approver_employment_id" uuid,
	"approver_privilege" text,
	"status" "leave_approval_step_status" DEFAULT 'pending' NOT NULL,
	"decided_by_profile_id" uuid,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"escalate_after_hours" integer,
	"escalation_kind" "leave_approval_step_kind",
	"escalation_employment_id" uuid,
	"escalated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_request_approvals_request_step_unique" UNIQUE("request_id","step_order")
);
--> statement-breakpoint
CREATE TABLE "leave_request_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"uploaded_by_profile_id" uuid,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "classification" "leave_classification" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "approval_chain_id" uuid;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pto_balances" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "charge_minutes" integer;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "is_emergency" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "current_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "joined_at" date;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "weekend_days" integer[] DEFAULT '{0,6}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_feed_tokens" ADD CONSTRAINT "calendar_feed_tokens_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feed_tokens" ADD CONSTRAINT "calendar_feed_tokens_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_chains" ADD CONSTRAINT "leave_approval_chains_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_delegations" ADD CONSTRAINT "leave_approval_delegations_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_delegations" ADD CONSTRAINT "leave_approval_delegations_delegator_employment_id_employments_id_fk" FOREIGN KEY ("delegator_employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_delegations" ADD CONSTRAINT "leave_approval_delegations_delegate_employment_id_employments_id_fk" FOREIGN KEY ("delegate_employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_chain_id_leave_approval_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."leave_approval_chains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_approver_employment_id_employments_id_fk" FOREIGN KEY ("approver_employment_id") REFERENCES "public"."employments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_escalation_employment_id_employments_id_fk" FOREIGN KEY ("escalation_employment_id") REFERENCES "public"."employments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_transfers" ADD CONSTRAINT "leave_balance_transfers_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_transfers" ADD CONSTRAINT "leave_balance_transfers_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_transfers" ADD CONSTRAINT "leave_balance_transfers_from_leave_type_id_leave_types_id_fk" FOREIGN KEY ("from_leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_transfers" ADD CONSTRAINT "leave_balance_transfers_to_leave_type_id_leave_types_id_fk" FOREIGN KEY ("to_leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger_entries" ADD CONSTRAINT "leave_ledger_entries_request_id_time_off_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."time_off_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_approvals" ADD CONSTRAINT "leave_request_approvals_request_id_time_off_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."time_off_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_approvals" ADD CONSTRAINT "leave_request_approvals_approver_employment_id_employments_id_fk" FOREIGN KEY ("approver_employment_id") REFERENCES "public"."employments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_approvals" ADD CONSTRAINT "leave_request_approvals_escalation_employment_id_employments_id_fk" FOREIGN KEY ("escalation_employment_id") REFERENCES "public"."employments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_documents" ADD CONSTRAINT "leave_request_documents_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_documents" ADD CONSTRAINT "leave_request_documents_request_id_time_off_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."time_off_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_feed_tokens_workplace_idx" ON "calendar_feed_tokens" USING btree ("workplace_id");--> statement-breakpoint
CREATE INDEX "leave_approval_delegations_window_idx" ON "leave_approval_delegations" USING btree ("workplace_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "leave_encashments_employment_status_idx" ON "leave_encashments" USING btree ("employment_id","status");--> statement-breakpoint
CREATE INDEX "leave_ledger_employment_type_idx" ON "leave_ledger_entries" USING btree ("employment_id","leave_type_id","effective_date");--> statement-breakpoint
CREATE INDEX "leave_ledger_workplace_effective_idx" ON "leave_ledger_entries" USING btree ("workplace_id","effective_date");--> statement-breakpoint
CREATE INDEX "leave_request_approvals_pending_idx" ON "leave_request_approvals" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "leave_request_documents_request_idx" ON "leave_request_documents" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_approval_chain_id_leave_approval_chains_id_fk" FOREIGN KEY ("approval_chain_id") REFERENCES "public"."leave_approval_chains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_off_requests_employment_status_idx" ON "time_off_requests" USING btree ("employment_id","status");--> statement-breakpoint
CREATE INDEX "time_off_requests_workplace_created_idx" ON "time_off_requests" USING btree ("created_at");