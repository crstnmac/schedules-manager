import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		CORS_ORIGIN: z.url(),
		SUPABASE_URL: z.url(),
		APP_URL: z.url(),
		ZEPTOMAIL_TOKEN: z.string().min(1),
		ZEPTOMAIL_FROM_ADDRESS: z.email(),
		ZEPTOMAIL_FROM_NAME: z.string().min(1).default("Schedules Manager"),
		ZEPTOMAIL_API_URL: z.string().min(1).default("api.zeptomail.com/"),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
