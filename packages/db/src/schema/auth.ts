import { relations, sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const session = pgTable(
	"session",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

// --- OAuth 2.1 provider (@better-auth/mcp) ---------------------------------
//
// Tables backing the OAuth authorization server that issues audience-bound
// access tokens to MCP clients. Field sets mirror the provider plugin's schema
// definition; column names follow this repo's snake_case convention.

export const jwks = pgTable("jwks", {
	id: uuid("id").primaryKey().defaultRandom(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
	alg: text("alg"),
	crv: text("crv"),
});

export const oauthClient = pgTable("oauth_client", {
	id: uuid("id").primaryKey().defaultRandom(),
	clientId: text("client_id").notNull().unique(),
	clientSecret: text("client_secret"),
	clientDiscoveryId: text("client_discovery_id"),
	disabled: boolean("disabled").default(false),
	skipConsent: boolean("skip_consent"),
	enableEndSession: boolean("enable_end_session"),
	subjectType: text("subject_type"),
	scopes: text("scopes").array(),
	clientCredentialsScopes: text("client_credentials_scopes")
		.array()
		.default(sql`'{}'::text[]`),
	userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	name: text("name"),
	uri: text("uri"),
	icon: text("icon"),
	contacts: text("contacts").array(),
	tos: text("tos"),
	policy: text("policy"),
	softwareId: text("software_id"),
	softwareVersion: text("software_version"),
	softwareStatement: text("software_statement"),
	redirectUris: text("redirect_uris").array().notNull(),
	postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
	backchannelLogoutUri: text("backchannel_logout_uri"),
	backchannelLogoutSessionRequired: boolean(
		"backchannel_logout_session_required",
	),
	tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
	applicationType: text("application_type"),
	jwks: text("jwks"),
	jwksUri: text("jwks_uri"),
	grantTypes: text("grant_types").array(),
	responseTypes: text("response_types").array(),
	requirePKCE: boolean("require_pkce"),
	dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
	referenceId: text("reference_id"),
	metadata: jsonb("metadata"),
});

export const oauthResource = pgTable("oauth_resource", {
	id: uuid("id").primaryKey().defaultRandom(),
	identifier: text("identifier").notNull().unique(),
	name: text("name").notNull(),
	accessTokenTtl: integer("access_token_ttl"),
	refreshTokenTtl: integer("refresh_token_ttl"),
	signingAlgorithm: text("signing_algorithm"),
	signingKeyId: text("signing_key_id"),
	allowedScopes: text("allowed_scopes").array(),
	customClaims: jsonb("custom_claims"),
	dpopBoundAccessTokensRequired: boolean(
		"dpop_bound_access_tokens_required",
	).default(false),
	disabled: boolean("disabled").default(false),
	createdAt: timestamp("created_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true }),
	policyVersion: integer("policy_version").default(1),
	metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable(
	"oauth_client_resource",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		resourceId: text("resource_id")
			.notNull()
			.references(() => oauthResource.identifier, { onDelete: "cascade" }),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("oauth_client_resource_pair_unique").on(
			table.clientId,
			table.resourceId,
		),
		index("oauth_client_resource_client_idx").on(table.clientId),
		index("oauth_client_resource_resource_idx").on(table.resourceId),
	],
);

export const oauthRefreshToken = pgTable(
	"oauth_refresh_token",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId),
		sessionId: uuid("session_id").references(() => session.id, {
			onDelete: "set null",
		}),
		userId: uuid("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		revoked: timestamp("revoked", { withTimezone: true }),
		rotatedAt: timestamp("rotated_at", { withTimezone: true }),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", {
			withTimezone: true,
		}),
		authTime: timestamp("auth_time", { withTimezone: true }),
		confirmation: jsonb("confirmation"),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_refresh_token_client_idx").on(table.clientId),
		index("oauth_refresh_token_session_idx").on(table.sessionId),
		index("oauth_refresh_token_user_idx").on(table.userId),
		index("oauth_refresh_token_code_idx").on(table.authorizationCodeId),
	],
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		token: text("token").unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId),
		sessionId: uuid("session_id").references(() => session.id, {
			onDelete: "set null",
		}),
		userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		refreshId: uuid("refresh_id").references(() => oauthRefreshToken.id),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		revoked: timestamp("revoked", { withTimezone: true }),
		confirmation: jsonb("confirmation"),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_access_token_client_idx").on(table.clientId),
		index("oauth_access_token_session_idx").on(table.sessionId),
		index("oauth_access_token_user_idx").on(table.userId),
		index("oauth_access_token_code_idx").on(table.authorizationCodeId),
		index("oauth_access_token_refresh_idx").on(table.refreshId),
	],
);

export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId),
		userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		scopes: text("scopes").array().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [index("oauth_consent_client_idx").on(table.clientId)],
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
	id: uuid("id").primaryKey().defaultRandom(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type OauthClient = typeof oauthClient.$inferSelect;
export type OauthAccessToken = typeof oauthAccessToken.$inferSelect;
export type OauthRefreshToken = typeof oauthRefreshToken.$inferSelect;

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export type AuthUser = typeof user.$inferSelect;
export type AuthSession = typeof session.$inferSelect;
