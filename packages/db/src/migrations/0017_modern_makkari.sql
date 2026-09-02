CREATE TYPE "public"."conversation_kind" AS ENUM('workplace', 'direct');--> statement-breakpoint
CREATE TYPE "public"."timesheet_approval_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"paid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "pto_balances" (
	"employment_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pto_balances_employment_id_leave_type_id_pk" PRIMARY KEY("employment_id","leave_type_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"author_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	CONSTRAINT "conversation_members_conversation_id_employment_id_pk" PRIMARY KEY("conversation_id","employment_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "day_parts_location_name_unique" UNIQUE("location_id","name")
);
--> statement-breakpoint
CREATE TABLE "employment_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employment_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_groups" (
	"employment_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "employment_groups_employment_id_group_id_pk" PRIMARY KEY("employment_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "location_sales" (
	"location_id" uuid NOT NULL,
	"sale_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_sales_location_id_sale_date_pk" PRIMARY KEY("location_id","sale_date")
);
--> statement-breakpoint
CREATE TABLE "shift_tag_assignments" (
	"shift_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "shift_tag_assignments_shift_id_tag_id_pk" PRIMARY KEY("shift_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "shift_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_tags_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "shift_task_completions" (
	"task_id" uuid NOT NULL,
	"version_shift_id" uuid NOT NULL,
	"completed_by_profile_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_task_completions_task_id_version_shift_id_pk" PRIMARY KEY("task_id","version_shift_id")
);
--> statement-breakpoint
CREATE TABLE "shift_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position_id" uuid NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_templates_location_name_unique" UNIQUE("location_id","name")
);
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	CONSTRAINT "time_blocks_location_name_unique" UNIQUE("location_id","name")
);
--> statement-breakpoint
CREATE TABLE "time_entry_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "worker_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_groups_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "workplace_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_employment_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD COLUMN "leave_type_id" uuid;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "hourly_wage_cents" integer;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "kiosk_pin_hash" text;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "emergency_contact_name" text;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "emergency_contact_phone" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "latitude" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "longitude" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "geofence_radius_meters" integer;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "kiosk_pin_hash" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "approval_status" timesheet_approval_status DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "approved_by_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "early_clock_in_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "clock_round_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "overtime_weekly_minutes" integer DEFAULT 2400 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pto_balances" ADD CONSTRAINT "pto_balances_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pto_balances" ADD CONSTRAINT "pto_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_profile_id_profiles_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_parts" ADD CONSTRAINT "day_parts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_documents" ADD CONSTRAINT "employment_documents_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_groups" ADD CONSTRAINT "employment_groups_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_groups" ADD CONSTRAINT "employment_groups_group_id_worker_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."worker_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_sales" ADD CONSTRAINT "location_sales_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_tag_assignments" ADD CONSTRAINT "shift_tag_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_tag_assignments" ADD CONSTRAINT "shift_tag_assignments_tag_id_shift_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."shift_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_tags" ADD CONSTRAINT "shift_tags_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_task_completions" ADD CONSTRAINT "shift_task_completions_task_id_shift_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."shift_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_task_completions" ADD CONSTRAINT "shift_task_completions_version_shift_id_version_shifts_id_fk" FOREIGN KEY ("version_shift_id") REFERENCES "public"."version_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_task_completions" ADD CONSTRAINT "shift_task_completions_completed_by_profile_id_profiles_id_fk" FOREIGN KEY ("completed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_tasks" ADD CONSTRAINT "shift_tasks_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_breaks" ADD CONSTRAINT "time_entry_breaks_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_groups" ADD CONSTRAINT "worker_groups_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workplace_messages" ADD CONSTRAINT "workplace_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workplace_messages" ADD CONSTRAINT "workplace_messages_author_employment_id_employments_id_fk" FOREIGN KEY ("author_employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entry_breaks_entry_idx" ON "time_entry_breaks" USING btree ("time_entry_id");--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_profile_id_profiles_id_fk" FOREIGN KEY ("approved_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;