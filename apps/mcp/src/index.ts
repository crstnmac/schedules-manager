/**
 * jooling MCP library.
 *
 * `createJoolingServer` builds the McpServer (tools, resources, prompts) and
 * `createMcpRequestHandler` wraps it in an embeddable Streamable HTTP handler
 * with injectable authentication. apps/server hosts it at /mcp with OAuth
 * 2.1 via @better-auth/mcp; the stdio entrypoint (stdio.ts) runs it locally
 * against a Workplace API key.
 */

export type {
	AvailableWorkers,
	DailyRoster,
	DraftSchedule,
	LaborSummary,
	OpenShifts,
	PublishedSchedule,
	PublishResult,
	TimeOffRequests,
	WorkerOverview,
	WorkerSummary,
	WorkplaceContext,
} from "./api";
export { ApiError, JoolingApi } from "./api";
export { env, INTEGRATION_PREFIX } from "./config";
export type {
	McpPrincipal,
	McpRequestHandlerOptions,
} from "./http";
export {
	bearerFromRequest,
	createMcpRequestHandler,
	McpAuthError,
} from "./http";
export { createJoolingServer } from "./server";
