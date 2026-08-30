import { relations, sql } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { employments } from "./employments";
import { profiles } from "./profiles";
import { locations, positions, workplaces } from "./workplaces";

export const invitationStatusEnum = pgEnum("invitation_status", [
	"pending",
	"accepted",
	"revoked",
]);

export const invitations = pgTable(
	"invitations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workplaceId: uuid("workplace_id")
			.notNull()
			.references(() => workplaces.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		kind: text("kind").notNull().default("worker"),
		token: uuid("token").notNull().defaultRandom().unique(),
		status: invitationStatusEnum("status").notNull().default("pending"),
		invitedBy: uuid("invited_by"),
		acceptedProfileId: uuid("accepted_profile_id"),
		acceptedEmploymentId: uuid("accepted_employment_id"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("invitations_pending_workplace_email_unique")
			.on(table.workplaceId, table.email)
			.where(sql`status = 'pending'`),
		index("invitations_email_idx").on(table.email),
	],
);

export const invitationLocations = pgTable(
	"invitation_locations",
	{
		invitationId: uuid("invitation_id")
			.notNull()
			.references(() => invitations.id, { onDelete: "cascade" }),
		locationId: uuid("location_id")
			.notNull()
			.references(() => locations.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({
			name: "invitation_locations_pk",
			columns: [table.invitationId, table.locationId],
		}),
	],
);

export const invitationPositions = pgTable(
	"invitation_positions",
	{
		invitationId: uuid("invitation_id")
			.notNull()
			.references(() => invitations.id, { onDelete: "cascade" }),
		positionId: uuid("position_id")
			.notNull()
			.references(() => positions.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({
			name: "invitation_positions_pk",
			columns: [table.invitationId, table.positionId],
		}),
	],
);

export const invitationRelations = relations(invitations, ({ one, many }) => ({
	workplace: one(workplaces, {
		fields: [invitations.workplaceId],
		references: [workplaces.id],
	}),
	acceptedEmployment: one(employments, {
		fields: [invitations.acceptedEmploymentId],
		references: [employments.id],
	}),
	acceptedProfile: one(profiles, {
		fields: [invitations.acceptedProfileId],
		references: [profiles.id],
	}),
	locationScope: many(invitationLocations),
	positionScope: many(invitationPositions),
}));

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
