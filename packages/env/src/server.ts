import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
		CORS_ORIGIN: z.url(),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		APP_URL: z.url(),
		/**
		 * Canonical MCP protected-resource URL (RFC 8707). MCP access tokens are
		 * audience-bound to it; keep identical to the mcp() plugin's `resource`.
		 * Defaults to `${BETTER_AUTH_URL}/mcp`. HTTP is only valid on loopback.
		 */
		MCP_RESOURCE_URL: z.url().optional(),
		POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
		POLAR_WEBHOOK_SECRET: z.string().min(16).optional(),
		POLAR_MODE: z.enum(["sandbox", "production"]).default("production"),
		POLAR_SCHEDULE_MONTHLY_PRODUCT_ID: z.string().uuid().optional(),
		POLAR_SCHEDULE_ANNUAL_PRODUCT_ID: z.string().uuid().optional(),
		POLAR_OPERATIONS_MONTHLY_PRODUCT_ID: z.string().uuid().optional(),
		POLAR_OPERATIONS_ANNUAL_PRODUCT_ID: z.string().uuid().optional(),
		ZEPTOMAIL_TOKEN: z.string().min(1),
		ZEPTOMAIL_FROM_ADDRESS: z.email(),
		ZEPTOMAIL_FROM_NAME: z.string().min(1).default("Schedules Manager"),
		ZEPTOMAIL_API_URL: z.string().min(1).default("api.zeptomail.com/"),
		ZEPTOMAIL_WEBHOOK_SECRET: z.string().min(16).optional(),
		GEOCODER_BASE_URL: z.url().optional(),
		/** Directory for uploaded leave documents. Defaults to ./uploads/leave. */
		LEAVE_UPLOAD_DIR: z.string().min(1).optional(),
		/**
		 * Version stamped into consent records. Keep identical to
		 * VITE_TERMS_VERSION in the landing and web apps so an acceptance can be
		 * matched to the published Terms.
		 */
		TERMS_VERSION: z.string().min(1).default("2026-09-17"),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
