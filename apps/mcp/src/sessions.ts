import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export interface McpSession {
	id: string;
	transport: WebStandardStreamableHTTPServerTransport;
	server: McpServer;
	/** The principal that opened the session; later requests must match. */
	principalId: string;
	workplaceId: string;
	createdAt: number;
}

const MAX_SESSIONS = 500;

/**
 * In-memory registry of stateful MCP sessions. Each session binds one
 * authenticated principal to one server instance; every request on the session
 * must re-present the same principal identity, so a leaked session id cannot
 * be used by a different credential.
 */
export class McpSessionRegistry {
	private readonly sessions = new Map<string, McpSession>();

	get(sessionId: string | null): McpSession | undefined {
		if (!sessionId) return undefined;
		return this.sessions.get(sessionId);
	}

	set(session: McpSession): void {
		this.sessions.set(session.id, session);
	}

	delete(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	get size(): number {
		return this.sessions.size;
	}

	atCapacity(): boolean {
		return this.sessions.size >= MAX_SESSIONS;
	}
}
