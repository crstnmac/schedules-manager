CREATE TYPE "public"."planned_shifts_visibility" AS ENUM('never', 'always', 'within_days');--> statement-breakpoint
CREATE TABLE "schedule_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_teams_location_name_unique" UNIQUE("location_id","name")
);
--> statement-breakpoint
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_location_week_unique";--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "planned_shifts_visibility" "planned_shifts_visibility" DEFAULT 'never' NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "planned_shift_lead_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_teams" ADD CONSTRAINT "schedule_teams_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_teams" ADD CONSTRAINT "schedule_teams_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_team_id_schedule_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."schedule_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_location_week_primary_unique" ON "schedules" USING btree ("location_id","week_start_date") WHERE "schedules"."team_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_location_week_team_unique" ON "schedules" USING btree ("location_id","week_start_date","team_id") WHERE "schedules"."team_id" is not null;