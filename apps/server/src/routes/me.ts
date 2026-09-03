import { db, profiles } from "@SchedulesManager/db";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

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
			const { profile } = await requireSession(headers.authorization);
			const memberships = await listActiveEmployments(profile.id);

			return {
				profile: profilePreferencesPayload(profile),
				employments: memberships.map(({ employment, workplace }) => ({
					id: employment.id,
					kind: employment.kind,
					workplace: {
						id: workplace.id,
						name: workplace.name,
						policies: workplaceWorkerPolicies(workplace),
					},
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			detail: {
				summary: "Return the current profile and active Employments",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/me",
		async ({ headers, body }) => {
			const { profile } = await requireSession(headers.authorization);
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
			headers: t.Object({ authorization: t.String() }),
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
