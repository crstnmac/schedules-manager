CREATE TYPE "public"."attendance_mark_kind" AS ENUM('late', 'no_show', 'sick');--> statement-breakpoint
CREATE TYPE "public"."position_section" AS ENUM('foh', 'boh');--> statement-breakpoint
CREATE TABLE "attendance_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_shift_id" uuid NOT NULL,
	"kind" "attendance_mark_kind" NOT NULL,
	"marked_by_profile_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_marks_version_shift_unique" UNIQUE("version_shift_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_templates_location_name_unique" UNIQUE("location_id","name")
);
--> statement-breakpoint
CREATE TABLE "template_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"employment_id" uuid,
	"position_id" uuid NOT NULL,
	"weekday_offset" smallint NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"overnight" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "section" "position_section";--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "edited_by_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "edit_reason" text;--> statement-breakpoint
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_version_shift_id_version_shifts_id_fk" FOREIGN KEY ("version_shift_id") REFERENCES "public"."version_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_marked_by_profile_id_profiles_id_fk" FOREIGN KEY ("marked_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shifts" ADD CONSTRAINT "template_shifts_template_id_schedule_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."schedule_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shifts" ADD CONSTRAINT "template_shifts_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_shifts" ADD CONSTRAINT "template_shifts_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_edited_by_profile_id_profiles_id_fk" FOREIGN KEY ("edited_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "open_shifts_one_open_per_shift" ON "open_shifts" USING btree ("shift_id") WHERE status = 'open';