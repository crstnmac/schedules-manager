CREATE TYPE "public"."shift_acceptance_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "shift_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"version_shift_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"change_summary" text NOT NULL,
	"status" "shift_acceptance_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_acceptances_unique" UNIQUE("version_id","version_shift_id","employment_id")
);
--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "notice_window_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_acceptances" ADD CONSTRAINT "shift_acceptances_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_acceptances" ADD CONSTRAINT "shift_acceptances_version_shift_id_version_shifts_id_fk" FOREIGN KEY ("version_shift_id") REFERENCES "public"."version_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_acceptances" ADD CONSTRAINT "shift_acceptances_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;