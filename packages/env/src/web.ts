import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		VITE_DOCS_URL: z.url().default("https://docs.jooling.com"),
		/** Marketing site that hosts the legal pages (Terms, Privacy, DPA). */
		VITE_LANDING_URL: z.url().default("https://jooling.com"),
		/**
		 * Version stamped into consent records. Keep identical to the landing and
		 * server values so an acceptance can be matched to the published Terms.
		 */
		VITE_TERMS_VERSION: z.string().min(1).default("2026-09-17"),
		VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
		VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
