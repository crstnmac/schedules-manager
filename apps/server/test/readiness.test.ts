import { describe, expect, test } from "bun:test";

import { getReadinessReport } from "../src/readiness";

describe("readiness", () => {
	test("getReadinessReport reports ready when the database ping succeeds", async () => {
		await expect(getReadinessReport(async () => undefined)).resolves.toEqual({
			status: "ready",
			checks: { database: "up" },
		});
	});

	test("getReadinessReport reports not_ready when the database ping fails", async () => {
		await expect(
			getReadinessReport(async () => {
				throw new Error("connection refused");
			}),
		).resolves.toEqual({
			status: "not_ready",
			checks: { database: "down" },
		});
	});
});
