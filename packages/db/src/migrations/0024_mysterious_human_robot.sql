CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('schedule', 'operations');--> statement-breakpoint
CREATE TABLE "polar_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workplace_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"polar_subscription_id" text NOT NULL,
	"polar_customer_id" text NOT NULL,
	"polar_product_id" text NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"billing_interval" "billing_interval" NOT NULL,
	"status" text NOT NULL,
	"location_count" integer DEFAULT 1 NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workplace_subscriptions_workplace_unique" UNIQUE("workplace_id"),
	CONSTRAINT "workplace_subscriptions_polar_unique" UNIQUE("polar_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "workplace_subscriptions" ADD CONSTRAINT "workplace_subscriptions_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;