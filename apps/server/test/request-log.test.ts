import { afterEach, describe, expect, test } from "bun:test";

import {
	newRequestId,
	resetRequestLogSink,
	setRequestLogSinkForTests,
	writeRequestLog,
	type RequestLogEntry,
} from "../src/request-log";

afterEach(() => {
	resetRequestLogSink();
});

describe("request log", () => {
	test("newRequestId reuses a provided header or generates one", () => {
		expect(
			newRequestId(
				new Request("http://localhost/health", {
					headers: { "x-request-id": " fixed-id " },
				}),
			),
		).toBe("fixed-id");
		expect(
			newRequestId(new Request("http://localhost/health")).length,
		).toBeGreaterThan(10);
	});

	test("writeRequestLog forwards structured entries to the sink", () => {
		const entries: RequestLogEntry[] = [];
		setRequestLogSinkForTests((entry) => {
			entries.push(entry);
		});
		writeRequestLog({
			level: "info",
			requestId: "abc",
			method: "GET",
			path: "/health",
			status: 200,
			durationMs: 4,
			timestamp: "2026-09-02T00:00:00.000Z",
		});
		expect(entries).toEqual([
			{
				level: "info",
				requestId: "abc",
				method: "GET",
				path: "/health",
				status: 200,
				durationMs: 4,
				timestamp: "2026-09-02T00:00:00.000Z",
			},
		]);
	});
});
