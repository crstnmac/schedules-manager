CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_shift_id" uuid NOT NULL,
	"employment_id" uuid NOT NULL,
	"clocked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clocked_out_at" timestamp with time zone,
	CONSTRAINT "time_entries_version_shift_unique" UNIQUE("version_shift_id")
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_version_shift_id_version_shifts_id_fk" FOREIGN KEY ("version_shift_id") REFERENCES "public"."version_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_employment_idx" ON "time_entries" USING btree ("employment_id");