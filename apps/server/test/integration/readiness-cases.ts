import { afterEach, expect, test } from "bun:test";

import {
	resetRequestLogSink,
	setRequestLogSinkForTests,
	type RequestLogEntry,
} from "../../src/request-log";

type Context = {
	app: ReturnType<typeof import("../../src/app").createApp>;
};

export function registerReadinessTests(getContext: () => Context) {
	afterEach(() => {
		resetRequestLogSink();
	});

	test("GET /ready reports database readiness and request logs include x-request-id", async () => {
		const { app } = getContext();
		const entries: RequestLogEntry[] = [];
		setRequestLogSinkForTests((entry) => {
			entries.push(entry);
		});

		const ready = await app.handle(
			new Request("http://localhost/ready", {
				headers: { "x-request-id": "ready-check-1" },
			}),
		);
		expect(ready.status).toBe(200);
		expect(ready.headers.get("x-request-id")).toBe("ready-check-1");
		expect(await ready.json()).toEqual({
			status: "ready",
			checks: { database: "up" },
		});

		const health = await app.handle(new Request("http://localhost/health"));
		expect(health.status).toBe(200);
		expect(health.headers.get("x-request-id")).toBeTruthy();

		const downApp = (await import("../../src/app")).createApp({
			getReadiness: async () => ({
				status: "not_ready",
				checks: { database: "down" },
			}),
		});
		const notReady = await downApp.handle(new Request("http://localhost/ready"));
		expect(notReady.status).toBe(503);
		expect(await notReady.json()).toEqual({
			status: "not_ready",
			checks: { database: "down" },
		});

		const deadline = Date.now() + 500;
		while (
			Date.now() < deadline &&
			!entries.some(
				(entry) =>
					entry.level === "info" &&
					entry.path === "/ready" &&
					entry.requestId === "ready-check-1" &&
					entry.status === 200,
			)
		) {
			await Bun.sleep(5);
		}
		expect(
			entries.some(
				(entry) =>
					entry.level === "info" &&
					entry.path === "/ready" &&
					entry.requestId === "ready-check-1" &&
					entry.status === 200,
			),
		).toBe(true);
	});
}
