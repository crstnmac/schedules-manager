CREATE TYPE "public"."email_delivery_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"token" text NOT NULL,
	"email" text NOT NULL,
	"workplace_name" text NOT NULL,
	"kind" text NOT NULL,
	"status" "email_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"lease_id" uuid,
	"provider_message_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "email_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbox_id" uuid NOT NULL,
	"token" text NOT NULL,
	"ticket_id" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_delivery_ticket_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_outbox_id_notification_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."notification_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_deliveries_pending_idx" ON "email_deliveries" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_workplace_idx" ON "email_deliveries" USING btree ("workplace_id");--> statement-breakpoint
CREATE INDEX "email_deliveries_provider_idx" ON "email_deliveries" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "push_delivery_poll_idx" ON "push_deliveries" USING btree ("status","available_at");