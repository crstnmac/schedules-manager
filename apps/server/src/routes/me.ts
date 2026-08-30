import { Elysia, t } from "elysia";

import { listActiveEmployments, requireSession } from "../context";

export const meRoutes = new Elysia({ prefix: "/v1", tags: ["Identity"] }).get(
	"/me",
	async ({ headers }) => {
		const { profile } = await requireSession(headers.authorization);
		const memberships = await listActiveEmployments(profile.id);

		return {
			profile: {
				id: profile.id,
				email: profile.email,
				fullName: profile.fullName,
			},
			employments: memberships.map(({ employment, workplace }) => ({
				id: employment.id,
				kind: employment.kind,
				workplace: {
					id: workplace.id,
					name: workplace.name,
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
);
