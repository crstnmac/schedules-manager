CREATE TYPE "public"."worker_schedule_visibility" AS ENUM('own', 'full');--> statement-breakpoint
CREATE TYPE "public"."leave_cap_reset" AS ENUM('none', 'calendar_year', 'hire_date', 'custom_date');--> statement-breakpoint
CREATE TYPE "public"."time_format" AS ENUM('12h', '24h');--> statement-breakpoint
CREATE TYPE "public"."name_format" AS ENUM('full', 'first_last_initial', 'first');--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "messaging_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "announcements_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "tasks_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "contact_details_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "worker_schedule_visibility" "worker_schedule_visibility" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "worker_time_off_visibility" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "breaks_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "shift_exchanges_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "unavailability_requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "clopening_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "max_consecutive_work_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "geofence_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "late_arrival_grace_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "timesheet_notes_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "leave_cap_reset" "leave_cap_reset" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "leave_cap_reset_month_day" text;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "workers_can_request_time_off" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "time_format" "time_format" DEFAULT '12h' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "name_format" "name_format" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "notification_preferences" jsonb DEFAULT '{"schedule":true,"messages":true,"timeOff":true,"timeClock":true}'::jsonb NOT NULL;
