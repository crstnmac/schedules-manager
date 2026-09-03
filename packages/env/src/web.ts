import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		VITE_SUPABASE_URL: z.url(),
		VITE_SUPABASE_ANON_KEY: z.string().min(1),
		VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
		VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
