CREATE TABLE "sales_import_sources" (
	"location_id" uuid NOT NULL,
	"sale_date" date NOT NULL,
	"source" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_import_sources_location_id_sale_date_pk" PRIMARY KEY("location_id","sale_date")
);
--> statement-breakpoint
ALTER TABLE "sales_import_sources" ADD CONSTRAINT "sales_import_sources_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "sales_import_sources" ("location_id", "sale_date", "source", "amount_cents", "imported_at") SELECT "location_id", "sale_date", 'square', "amount_cents", "imported_at" FROM "square_sales_imports";--> statement-breakpoint
DROP TABLE "square_sales_imports";
