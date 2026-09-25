CREATE TABLE "square_connections" (
	"workplace_id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "square_location_mappings" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"workplace_id" uuid NOT NULL,
	"square_location_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "square_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"workplace_id" uuid NOT NULL,
	"created_by_profile_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "square_sales_imports" (
	"location_id" uuid NOT NULL,
	"sale_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "square_sales_imports_location_id_sale_date_pk" PRIMARY KEY("location_id","sale_date")
);
--> statement-breakpoint
ALTER TABLE "square_connections" ADD CONSTRAINT "square_connections_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_location_mappings" ADD CONSTRAINT "square_location_mappings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_location_mappings" ADD CONSTRAINT "square_location_mappings_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_oauth_states" ADD CONSTRAINT "square_oauth_states_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_sales_imports" ADD CONSTRAINT "square_sales_imports_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;