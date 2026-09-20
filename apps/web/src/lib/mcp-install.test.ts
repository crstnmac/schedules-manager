import { describe, expect, test } from "vitest";

import { createMcpInstallPrompt } from "./mcp-install";

describe("createMcpInstallPrompt", () => {
	test("includes the deployment-specific MCP URL and safe setup constraints", () => {
		const prompt = createMcpInstallPrompt(
			"https://staging-api.jooling.com/mcp",
		);

		expect(prompt).toContain("Server URL: https://staging-api.jooling.com/mcp");
		expect(prompt).toContain("Transport: Streamable HTTP");
		expect(prompt).toContain("Preserve all existing MCP servers");
		expect(prompt).toContain(
			"Do not create, request, store, or embed an API key",
		);
	});
});
