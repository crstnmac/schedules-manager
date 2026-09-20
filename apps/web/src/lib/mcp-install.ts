export function createMcpInstallPrompt(mcpUrl: string): string {
	return `Install the jooling MCP server in this AI client or agent environment.

Configuration:
- Name: jooling
- Transport: Streamable HTTP
- Server URL: ${mcpUrl}
- Authentication: OAuth 2.1 through the browser

Requirements:
1. Use this client's native MCP configuration or installation command.
2. Preserve all existing MCP servers and unrelated configuration.
3. Add jooling as a remote HTTP server using the exact URL above.
4. Do not create, request, store, or embed an API key. The server supports browser-based OAuth discovery and consent.
5. After installing it, start or verify the connection so I can complete sign-in and approve the requested scopes in jooling.
6. If this client cannot connect to remote Streamable HTTP MCP servers with OAuth, explain that limitation and the supported alternatives before making any workaround changes.

When finished, report what configuration changed and whether the jooling MCP connection is ready for authorization.`;
}
