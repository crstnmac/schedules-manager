import { expect, test } from "bun:test";
import { spreadsheetRowsToCsv } from "./import-spreadsheet";

test("preserves quoted cells and Excel dates when converting a schedule sheet", () => {
	expect(
		spreadsheetRowsToCsv([
			["Date", "Start Time", "Worker"],
			[
				new Date("2026-09-21T00:00:00.000Z"),
				new Date("1899-12-30T09:00:00.000Z"),
				'Alex "A"',
			],
		]),
	).toBe('"Date","Start Time","Worker"\r\n"2026-09-21","09:00","Alex ""A"""');
});
