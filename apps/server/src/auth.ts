import { db, profiles } from "@SchedulesManager/db";
import * as authSchema from "@SchedulesManager/db";
import { env } from "@SchedulesManager/env/server";
import { expo } from "@better-auth/expo";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { sendPasswordResetEmail } from "./mail";

export class AuthenticationError extends Error {
	constructor(message = "Authentication required") {
		super(message);
		this.name = "AuthenticationError";
	}
}

const authOptions: BetterAuthOptions = {
	appName: "jooling",
	database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
	emailAndPassword: {
		enabled: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user: authUser, url }) => {
			await sendPasswordResetEmail({
				email: authUser.email,
				name: authUser.name,
				url,
			});
		},
	},
	trustedOrigins: [env.APP_URL, "jooling://"],
	advanced: { database: { generateId: "uuid" } },
	databaseHooks: {
		user: {
			create: {
				after: async (createdUser) => {
					await db
						.insert(profiles)
						.values({
							id: createdUser.id,
							email: createdUser.email.toLowerCase(),
							fullName: createdUser.name || null,
						})
						.onConflictDoNothing();
				},
			},
		},
	},
	plugins: [expo(), bearer()],
};

export const auth = betterAuth(authOptions);

export type AuthenticatedUser = typeof auth.$Infer.Session.user;
