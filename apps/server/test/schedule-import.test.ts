import { describe, expect, test } from "bun:test";
import { parseScheduleImportCsv } from "../src/schedule-import";

describe("schedule CSV import", () => {
	test("accepts canonical and common schedule headers, including open and overnight shifts", () => {
		const result = parseScheduleImportCsv(
			"Shift Date,Start Time,End Time,Role,Employee Email,Notes\n2026-09-21,09:00,17:00,Server,Alex@Example.com,Opening\n2026-09-22,22:00,06:00,Host,,Overnight",
		);
		expect(result.errors).toEqual([]);
		expect(result.rows).toMatchObject([
			{
				line: 2,
				date: "2026-09-21",
				startMinute: 540,
				endMinute: 1020,
				position: "Server",
				email: "alex@example.com",
			},
			{
				line: 3,
				startMinute: 1320,
				endMinute: 360,
				email: null,
				note: "Overnight",
			},
		]);
	});

	test("reports malformed rows with source lines and retains valid rows for preview", () => {
		const result = parseScheduleImportCsv(
			"date,start,end,position,email\n2026-02-30,09:00,17:00,Server,a@example.com\n2026-09-21,9am,17:00,Server,a@example.com\n2026-09-22,09:00,17:00,Server,a@example.com",
		);
		expect(result.errors.map((error) => error.line)).toEqual([2, 3]);
		expect(result.rows).toHaveLength(1);
	});

	test("requires every essential column", () => {
		expect(() =>
			parseScheduleImportCsv("date,start,position\n2026-09-21,09:00,Server"),
		).toThrow("end");
	});

	test("recognizes an empty Sling calendar export instead of reporting missing columns", () => {
		expect(() =>
			parseScheduleImportCsv(
				",2026-09-14,2026-09-15\r\nUnassigned shifts\r\n,,\r\nAvailable shifts\r\n,,\r\nScheduled shifts\r\nAlex Worker,,\r\n",
			),
		).toThrow("contains no shifts");
	});

	test("parses populated Sling calendar cells, sections, and repeated shifts in a cell", () => {
		const result = parseScheduleImportCsv(
			',2026-09-14,2026-09-15\r\nUnassigned shifts\r\nOpen,"12:00 PM - 4:00 PM • 4h\nServer • Main\n ",\r\nAvailable shifts\r\n,,\r\nScheduled shifts\r\nAlex Worker,"9:00 AM - 5:00 PM • 8h\nBartender • Main\n \n10:00 PM - 6:00 AM • 8h\nServer • Main",',
		);
		expect(result.errors).toEqual([]);
		expect(result.rows).toMatchObject([
			{
				date: "2026-09-14",
				startMinute: 720,
				endMinute: 960,
				position: "Server",
				workerName: null,
				sourceLocation: "Main",
			},
			{
				date: "2026-09-14",
				startMinute: 540,
				endMinute: 1020,
				position: "Bartender",
				workerName: "Alex Worker",
				sourceLocation: "Main",
			},
			{
				date: "2026-09-14",
				startMinute: 1320,
				endMinute: 360,
				position: "Server",
				workerName: "Alex Worker",
				sourceLocation: "Main",
			},
		]);
	});

	test("reports unrecognized Sling cell contents instead of inventing a shift", () => {
		const result = parseScheduleImportCsv(
			",2026-09-14\nScheduled shifts\nAlex Worker,Unknown format",
		);
		expect(result.rows).toEqual([]);
		expect(result.errors.map((error) => error.line)).toEqual([3]);
	});

	test("reads a date-column ShiftTimes export without pay-rate fields", () => {
		const result = parseScheduleImportCsv(
			"Location Name,Department,Firstname,Surname,21/09/2026 Shift1,21/09/2026 Shift2,Pay Rate\nMain,Server,Alex,Morgan,09:00 - 17:00,18:00 - 22:00,20",
		);
		expect(result.errors).toEqual([]);
		expect(result.rows).toMatchObject([
			{
				date: "2026-09-21",
				workerName: "Alex Morgan",
				position: "Server",
				sourceLocation: "Main",
				startMinute: 540,
				endMinute: 1020,
			},
			{
				date: "2026-09-21",
				workerName: "Alex Morgan",
				startMinute: 1080,
				endMinute: 1320,
			},
		]);
	});

	test("accepts row-wise employee and department columns with AM/PM times", () => {
		const result = parseScheduleImportCsv(
			"Date,Start Time,End Time,Department,Firstname,Surname,Location Name\n2026-09-21,9:00 AM,5:00 PM,Server,Alex,Morgan,Main",
		);
		expect(result.errors).toEqual([]);
		expect(result.rows[0]).toMatchObject({
			workerName: "Alex Morgan",
			position: "Server",
			startMinute: 540,
			endMinute: 1020,
			sourceLocation: "Main",
		});
	});
});
