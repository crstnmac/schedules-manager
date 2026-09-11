import { describe, expect, test } from "bun:test";

import {
	parseWorkerImportCsv,
	WORKER_IMPORT_TEMPLATE,
} from "../src/worker-import";

describe("parseWorkerImportCsv", () => {
	test("maps supported columns and aliases", () => {
		const { rows, errors } = parseWorkerImportCsv(
			[
				"full_name,email,phone,position,location",
				"Ana,ana@acme.com,5125550101,Server,Downtown",
				'"Doe, Jane",jane@acme.com,,Host,Main location',
			].join("\n"),
		);
		expect(errors).toEqual([]);
		expect(rows).toEqual([
			{
				line: 2,
				name: "Ana",
				email: "ana@acme.com",
				phone: "5125550101",
				position: "Server",
				location: "Downtown",
			},
			{
				line: 3,
				name: "Doe, Jane",
				email: "jane@acme.com",
				phone: null,
				position: "Host",
				location: "Main location",
			},
		]);
	});

	test("requires an email column", () => {
		expect(() => parseWorkerImportCsv("name,phone\nAna,123")).toThrow(/email/);
	});

	test("reports invalid and duplicate emails per line without failing the file", () => {
		const { rows, errors } = parseWorkerImportCsv(
			[
				"email,name",
				"ana@acme.com,Ana",
				"not-an-email,Bad",
				"ana@acme.com,Duplicate",
				",NoEmail",
			].join("\n"),
		);
		expect(rows.map((row) => row.email)).toEqual(["ana@acme.com"]);
		expect(errors.map((error) => error.line)).toEqual([3, 4, 5]);
		expect(errors[0]?.message).toContain("valid email");
		expect(errors[1]?.message).toContain("Duplicate");
		expect(errors[2]?.message).toContain("required");
	});

	test("ships a template with the expected columns", () => {
		expect(WORKER_IMPORT_TEMPLATE.split("\n")[0]).toBe(
			"name,email,phone,position,location",
		);
	});
});
