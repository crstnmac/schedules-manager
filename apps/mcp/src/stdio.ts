import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JoolingApi } from "./api";
import { env } from "./config";
import { createJoolingServer } from "./server";

/**
 * stdio entrypoint for local clients. A stdio transport cannot present an
 * Authorization header, so the Workplace API key comes from the environment.
 */
async function main() {
	if (!env.JOOLING_API_KEY) {
		console.error(
			"JOOLING_API_KEY is required for stdio mode. Managers create keys (jl_live_...) under Workplace settings → Integrations.",
		);
		process.exit(1);
	}
	const api = new JoolingApi({
		baseUrl: env.API_BASE_URL,
		apiKey: env.JOOLING_API_KEY,
	});
	const server = createJoolingServer(api);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error) => {
	console.error("stdio MCP server failed:", error);
	process.exit(1);
});
