CREATE TYPE "public"."unavailability_status" AS ENUM('pending', 'approved');--> statement-breakpoint
ALTER TABLE "unavailability" ADD COLUMN "status" "unavailability_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "worker_note" text;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "overtime_daily_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "labor_cost_percent_goal" integer;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "managers_can_view_labor_cost" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "open_minute" integer;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "close_minute" integer;
