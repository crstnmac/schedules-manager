CREATE TYPE "public"."coverage_request_status" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."open_shift_status" AS ENUM('open', 'filled', 'closed');--> statement-breakpoint
CREATE TABLE "open_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"released_from" uuid,
	"note" text,
	"status" "open_shift_status" DEFAULT 'open' NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_pickups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"open_shift_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "coverage_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_shift_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reason" text,
	"status" "coverage_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "open_shifts" ADD CONSTRAINT "open_shifts_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_shifts" ADD CONSTRAINT "open_shifts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_shifts" ADD CONSTRAINT "open_shifts_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_shifts" ADD CONSTRAINT "open_shifts_released_from_employments_id_fk" FOREIGN KEY ("released_from") REFERENCES "public"."employments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pickups" ADD CONSTRAINT "shift_pickups_open_shift_id_open_shifts_id_fk" FOREIGN KEY ("open_shift_id") REFERENCES "public"."open_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_pickups" ADD CONSTRAINT "shift_pickups_requested_by_employments_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_releases" ADD CONSTRAINT "shift_releases_version_shift_id_version_shifts_id_fk" FOREIGN KEY ("version_shift_id") REFERENCES "public"."version_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_releases" ADD CONSTRAINT "shift_releases_requested_by_employments_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;