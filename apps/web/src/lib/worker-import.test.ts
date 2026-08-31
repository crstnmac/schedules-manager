import { describe, expect, test } from "bun:test";

import { parseWorkerCsv } from "./worker-import";

describe("parseWorkerCsv", () => {
	test("maps supported columns", () => {
		expect(
			parseWorkerCsv(
				"name,email,phone,position,location\nAna,ana@acme.com,5125550101,Server,Downtown",
			),
		).toEqual([
			{
				name: "Ana",
				email: "ana@acme.com",
				phone: "5125550101",
				position: "Server",
				location: "Downtown",
			},
		]);
	});

	test("supports quoted commas and escaped quotes", () => {
		const [row] = parseWorkerCsv(
			'name,email,location\n"Doe, Jane",jane@acme.com,"Main ""Room"""',
		);
		expect(row?.name).toBe("Doe, Jane");
		expect(row?.location).toBe('Main "Room"');
	});

	test("requires an email column", () => {
		expect(() => parseWorkerCsv("name,phone\nAna,123")).toThrow("email column");
	});
});
