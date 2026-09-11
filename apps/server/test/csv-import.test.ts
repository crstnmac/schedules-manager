import { describe, expect, test } from "bun:test";

import { parseCsvRows } from "../src/csv-import";

describe("parseCsvRows", () => {
	test("handles BOM, CRLF, quotes, escaped quotes, and blank lines", () => {
		const rows = parseCsvRows(
			'\uFEFFa,b,c\r\n"one, two","say ""hi""",3\r\n\r\nlast,row,here\r\n',
		);
		expect(rows.map((row) => row.values)).toEqual([
			["a", "b", "c"],
			["one, two", 'say "hi"', "3"],
			["last", "row", "here"],
		]);
		expect(rows.map((row) => row.line)).toEqual([1, 2, 4]);
	});

	test("keeps newlines inside quoted fields", () => {
		const rows = parseCsvRows('a,"line1\nline2",c');
		expect(rows[0]?.values).toEqual(["a", "line1\nline2", "c"]);
	});
});
