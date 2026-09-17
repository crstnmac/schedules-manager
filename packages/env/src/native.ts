import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "EXPO_PUBLIC_",
	client: {
		EXPO_PUBLIC_SERVER_URL: z.url(),
		/** Web app that owns billing settings and the legal pages. */
		EXPO_PUBLIC_APP_URL: z.url().default("https://app.jooling.com"),
	},
	runtimeEnv: {
		EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
		EXPO_PUBLIC_APP_URL: process.env.EXPO_PUBLIC_APP_URL,
	},
	emptyStringAsUndefined: true,
});
