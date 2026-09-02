ALTER TABLE "workplaces" ADD COLUMN "auto_clock_out_grace_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "auto_closed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "time_entries_open_idx" ON "time_entries" USING btree ("clocked_out_at");
