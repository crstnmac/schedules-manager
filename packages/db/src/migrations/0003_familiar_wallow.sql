CREATE TYPE "public"."delivery_status" AS ENUM('sent', 'delivered', 'acknowledged');--> statement-breakpoint
CREATE TABLE "schedule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "schedule_versions_schedule_number_unique" UNIQUE("schedule_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "version_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"shift_id" uuid,
	"employment_id" uuid,
	"position_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "worker_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"status" "delivery_status" DEFAULT 'sent' NOT NULL,
	"delivered_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "worker_deliveries_version_employment_unique" UNIQUE("version_id","employment_id")
);
--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_shifts" ADD CONSTRAINT "version_shifts_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_deliveries" ADD CONSTRAINT "worker_deliveries_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_deliveries" ADD CONSTRAINT "worker_deliveries_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "worker_deliveries_employment_idx" ON "worker_deliveries" USING btree ("employment_id");