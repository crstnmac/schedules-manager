ALTER TABLE "calendar_feed_tokens" ADD COLUMN "fetch_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_feed_tokens" ADD COLUMN "last_fetch_user_agent" text;