import {
	date,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { locations, workplaces } from "./workplaces";

export const squareOAuthStates = pgTable("square_oauth_states", {
	stateHash: text("state_hash").primaryKey(),
	workplaceId: uuid("workplace_id")
		.notNull()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	createdByProfileId: uuid("created_by_profile_id").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const squareConnections = pgTable("square_connections", {
	workplaceId: uuid("workplace_id")
		.primaryKey()
		.references(() => workplaces.id, { onDelete: "cascade" }),
	merchantId: text("merchant_id").notNull(),
	accessTokenEncrypted: text("access_token_encrypted").notNull(),
	refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
	accessTokenExpiresAt: timestamp("access_token_expires_at", {
		withTimezone: true,
	}).notNull(),
	connectedAt: timestamp("connected_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const squareLocationMappings = pgTable(
	"square_location_mappings",
	{
		locationId: uuid("location_id")
			.primaryKey()
			.references(() => locations.id, { onDelete: "cascade" }),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		squareLocationId: text("square_location_id").notNull(),
	},
	(table) => [
		unique("square_location_once_per_workplace").on(
			table.workplaceId,
			table.squareLocationId,
		),
	],
);

export const squareSalesImports = pgTable(
	"square_sales_imports",
	{
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
		saleDate: date("sale_date").notNull(),
		amountCents: integer("amount_cents").notNull(),
		importedAt: timestamp("imported_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.locationId, table.saleDate] })],
);
