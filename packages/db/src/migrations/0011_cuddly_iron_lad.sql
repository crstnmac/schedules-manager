CREATE TYPE "public"."pay_period_type" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."swap_status" AS ENUM('pending_counterpart', 'pending_manager', 'approved', 'declined_by_counterpart', 'declined_by_manager', 'cancelled');--> statement-breakpoint
CREATE TABLE "shift_swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_employment_id" uuid NOT NULL,
	"requester_shift_id" uuid NOT NULL,
	"counterpart_employment_id" uuid NOT NULL,
	"counterpart_shift_id" uuid NOT NULL,
	"status" "swap_status" DEFAULT 'pending_counterpart' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_profile_id" uuid
);
--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "pay_period_type" "pay_period_type" DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "pay_period_anchor" date;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_requester_employment_id_employments_id_fk" FOREIGN KEY ("requester_employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_requester_shift_id_version_shifts_id_fk" FOREIGN KEY ("requester_shift_id") REFERENCES "public"."version_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_counterpart_employment_id_employments_id_fk" FOREIGN KEY ("counterpart_employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_counterpart_shift_id_version_shifts_id_fk" FOREIGN KEY ("counterpart_shift_id") REFERENCES "public"."version_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_decided_by_profile_id_profiles_id_fk" FOREIGN KEY ("decided_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_swaps_requester_idx" ON "shift_swaps" USING btree ("requester_employment_id");--> statement-breakpoint
CREATE INDEX "shift_swaps_counterpart_idx" ON "shift_swaps" USING btree ("counterpart_employment_id");