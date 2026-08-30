CREATE TYPE "public"."employment_kind" AS ENUM('manager', 'worker');--> statement-breakpoint
CREATE TYPE "public"."employment_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TABLE "employment_locations" (
	"employment_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "employment_locations_employment_id_location_id_pk" PRIMARY KEY("employment_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "employment_positions" (
	"employment_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	CONSTRAINT "employment_positions_employment_id_position_id_pk" PRIMARY KEY("employment_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "employments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "employment_kind" DEFAULT 'worker' NOT NULL,
	"status" "employment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "employments_workplace_profile_unique" UNIQUE("workplace_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "invitation_locations" (
	"invitation_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "invitation_locations_pk" PRIMARY KEY("invitation_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "invitation_positions" (
	"invitation_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	CONSTRAINT "invitation_positions_pk" PRIMARY KEY("invitation_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"kind" text DEFAULT 'worker' NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"accepted_profile_id" uuid,
	"accepted_employment_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"address_line" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_workplace_name_unique" UNIQUE("workplace_id","name")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workplaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employment_locations" ADD CONSTRAINT "employment_locations_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_locations" ADD CONSTRAINT "employment_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_positions" ADD CONSTRAINT "employment_positions_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_positions" ADD CONSTRAINT "employment_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_locations" ADD CONSTRAINT "invitation_locations_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_locations" ADD CONSTRAINT "invitation_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_positions" ADD CONSTRAINT "invitation_positions_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_positions" ADD CONSTRAINT "invitation_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_workplace_email_unique" ON "invitations" USING btree ("workplace_id","email") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");
