ALTER TABLE "workplaces" ADD COLUMN "auto_accept_shift_pickups" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "auto_accept_shift_swaps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "auto_accept_shift_releases" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workplaces" ADD COLUMN "auto_accept_late_changes" boolean DEFAULT false NOT NULL;