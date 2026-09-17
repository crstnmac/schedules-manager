CREATE TYPE "public"."legal_acceptance_kind" AS ENUM('terms', 'billing');--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "legal_acceptance_kind" NOT NULL,
	"version" text NOT NULL,
	"surface" text NOT NULL,
	"user_agent" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workplace_subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workplace_subscriptions" ADD COLUMN "trial_notice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workplace_subscriptions" ADD COLUMN "renewal_notice_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_acceptances_profile_idx" ON "legal_acceptances" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "legal_acceptances_kind_version_idx" ON "legal_acceptances" USING btree ("kind","version");