import {
	db,
	employmentLocations,
	locations,
	profiles,
} from "@SchedulesManager/db";
import { asc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { hasActiveSubscription, planAllows } from "../billing";
import { listActiveEmployments, requireSession } from "../context";
import { firstRow } from "../rows";
import {
	mergeNotificationPreferences,
	profilePreferencesPayload,
	workplaceWorkerPolicies,
} from "../workplace-policy";

export const meRoutes = new Elysia({ prefix: "/v1", tags: ["Identity"] })
	.get(
		"/me",
		async ({ headers }) => {
			const { profile } = await requireSession(headers);
			const memberships = await listActiveEmployments(profile.id);
			// Rows carry their own Location's zone; this default covers views
			// that aren't tied to one Location. A person's assigned Location
			// comes first, then the workplace's first Location.
			const workplaceIds = memberships.map(({ workplace }) => workplace.id);
			const locationZones =
				workplaceIds.length === 0
					? []
					: await db
							.select({
								workplaceId: locations.workplaceId,
								timezone: locations.timezone,
							})
							.from(locations)
							.where(inArray(locations.workplaceId, workplaceIds))
							.orderBy(asc(locations.createdAt));
			const employmentIds = memberships.map(({ employment }) => employment.id);
			const assignedZones =
				employmentIds.length === 0
					? []
					: await db
							.select({
								employmentId: employmentLocations.employmentId,
								timezone: locations.timezone,
							})
							.from(employmentLocations)
							.innerJoin(
								locations,
								eq(locations.id, employmentLocations.locationId),
							)
							.where(inArray(employmentLocations.employmentId, employmentIds))
							.orderBy(asc(locations.createdAt));
			const timezoneFor = (employmentId: string, workplaceId: string) =>
				assignedZones.find((row) => row.employmentId === employmentId)
					?.timezone ??
				locationZones.find((row) => row.workplaceId === workplaceId)
					?.timezone ??
				null;

			return {
				profile: profilePreferencesPayload(profile),
				employments: memberships.map(
					({ employment, workplace, subscription }) => ({
						id: employment.id,
						kind: employment.kind,
						privileges: employment.privileges ?? [],
						capabilities: {
							scheduling: Boolean(
								subscription && hasActiveSubscription(subscription.status),
							),
							operations: Boolean(
								subscription &&
									hasActiveSubscription(subscription.status) &&
									planAllows(subscription.plan, "time_clock"),
							),
						},
						workplace: {
							id: workplace.id,
							name: workplace.name,
							timezone: timezoneFor(employment.id, workplace.id),
							policies: workplaceWorkerPolicies(workplace),
						},
					}),
				),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			detail: {
				summary: "Return the current profile and active Employments",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/me",
		async ({ headers, body }) => {
			const { profile } = await requireSession(headers);
			const updated = firstRow(
				await db
					.update(profiles)
					.set({
						timeFormat: body.timeFormat ?? profile.timeFormat,
						nameFormat: body.nameFormat ?? profile.nameFormat,
						notificationPreferences: mergeNotificationPreferences(
							profile.notificationPreferences,
							body.notificationPreferences,
						),
						updatedAt: new Date(),
					})
					.where(eq(profiles.id, profile.id))
					.returning(),
			);

			return { profile: profilePreferencesPayload(updated) };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			body: t.Object({
				timeFormat: t.Optional(t.Union([t.Literal("12h"), t.Literal("24h")])),
				nameFormat: t.Optional(
					t.Union([
						t.Literal("full"),
						t.Literal("first_last_initial"),
						t.Literal("first"),
					]),
				),
				notificationPreferences: t.Optional(
					t.Object({
						schedule: t.Optional(t.Boolean()),
						messages: t.Optional(t.Boolean()),
						timeOff: t.Optional(t.Boolean()),
						timeClock: t.Optional(t.Boolean()),
					}),
				),
			}),
			detail: {
				summary: "Update personal display and notification preferences",
				security: [{ bearerAuth: [] }],
			},
		},
	);
