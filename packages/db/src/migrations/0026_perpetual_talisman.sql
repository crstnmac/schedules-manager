CREATE TYPE "public"."approval_request_type" AS ENUM('time_off', 'unavailability', 'shift_release', 'shift_pickup', 'shift_swap');--> statement-breakpoint
CREATE TYPE "public"."api_key_scope" AS ENUM('schedule.read', 'schedule.write', 'workers.read', 'reports.read', 'requests.read', 'requests.write');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
ALTER TYPE "public"."employment_kind" ADD VALUE 'viewer';--> statement-breakpoint
CREATE TABLE "approval_policy_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_policy_groups_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "approval_policy_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"request_type" "approval_request_type" NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	CONSTRAINT "approval_policy_rules_group_type_unique" UNIQUE("group_id","request_type")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_workplace_date_name_unique" UNIQUE("workplace_id","date","name")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" "api_key_scope"[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "shift_pattern_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"rotation_slot" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "shift_pattern_members_pattern_employment_unique" UNIQUE("pattern_id","employment_id")
);
--> statement-breakpoint
CREATE TABLE "shift_pattern_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"week_index" smallint DEFAULT 0 NOT NULL,
	"weekday_offset" smallint NOT NULL,
	"position_id" uuid NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"overnight" boolean DEFAULT false NOT NULL,
	"coverage_target" integer DEFAULT 1 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "shift_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"cycle_weeks" smallint DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_patterns_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"secret" text NOT NULL,
	"event_types" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "privileges" text[];--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "policy_group_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_policy_groups" ADD CONSTRAINT "approval_policy_groups_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_rules" ADD CONSTRAINT "approval_policy_rules_group_id_approval_policy_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."approval_policy_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern_members" ADD CONSTRAINT "shift_pattern_members_pattern_id_shift_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."shift_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern_members" ADD CONSTRAINT "shift_pattern_members_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern_shifts" ADD CONSTRAINT "shift_pattern_shifts_pattern_id_shift_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."shift_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pattern_shifts" ADD CONSTRAINT "shift_pattern_shifts_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_patterns" ADD CONSTRAINT "shift_patterns_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_patterns" ADD CONSTRAINT "shift_patterns_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_policy_group_id_approval_policy_groups_id_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."approval_policy_groups"("id") ON DELETE set null ON UPDATE no action;