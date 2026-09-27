-- Remove the Square sales connector. Stored OAuth tokens are deleted, not
-- revoked with Square; sellers can revoke access from their Square Dashboard.
-- Imported figures already in location_sales are kept.
DROP TABLE "square_connections" CASCADE;--> statement-breakpoint
DROP TABLE "square_location_mappings" CASCADE;--> statement-breakpoint
DROP TABLE "square_oauth_states" CASCADE;--> statement-breakpoint
DROP TABLE "square_sales_imports" CASCADE;