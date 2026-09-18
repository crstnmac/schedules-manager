import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment for the stdio MCP entrypoint. The server-hosted /mcp endpoint
 * runs inside apps/server and needs nothing beyond the server's own env.
 */
export const env = createEnv({
	server: {
		/** Base URL of the jooling Elysia API the MCP server talks to. */
		API_BASE_URL: z.url().default("http://localhost:3000"),
		/**
		 * Workplace API key (`jl_live_...`) used by the stdio entrypoint, where
		 * no interactive OAuth flow is available.
		 */
		JOOLING_API_KEY: z.string().min(1).optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
