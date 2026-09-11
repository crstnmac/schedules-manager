import { describe, expect, test } from "bun:test";

import {
	parseLeaveBalancesCsv,
	parseLeaveRecordsCsv,
} from "../src/leave-import";

describe("leave record CSV import", () => {
	test("parses valid rows with aliases and defaults", () => {
		const { rows, errors } = parseLeaveRecordsCsv(
			[
				"email,type,from,to,reason,status",
				"worker@example.com,VAC,2026-09-14,2026-09-16,Family,approved",
				"worker@example.com,Sick,2026-09-18,,Checkup,pending",
			].join("\n"),
		);
		expect(errors).toEqual([]);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			line: 2,
			workerEmail: "worker@example.com",
			leaveType: "VAC",
			startDate: "2026-09-14",
			endDate: "2026-09-16",
			allDay: true,
			status: "approved",
			isEmergency: false,
		});
		expect(rows[1]?.endDate).toBe("2026-09-18");
	});

	test("collects row errors without failing the file", () => {
		const { rows, errors } = parseLeaveRecordsCsv(
			[
				"worker_email,leave_type,start_date,end_date,all_day,start_time,end_time",
				"worker@example.com,Vacation,2026-09-14,2026-09-16,false,09:00,13:00",
				"worker@example.com,Vacation,not-a-date,,true,,",
				"worker@example.com,Vacation,2026-09-20,2026-09-19,true,,",
				"worker@example.com,Vacation,2026-09-21,,maybe,,",
			].join("\n"),
		);
		expect(rows).toHaveLength(1);
		expect(errors.map((error) => error.line)).toEqual([3, 4, 5]);
		expect(errors[0]?.message).toContain("YYYY-MM-DD");
		expect(errors[1]?.message).toContain("on or after");
		expect(errors[2]?.message).toContain("yes/no");
	});

	test("requires time fields for partial days", () => {
		const { errors } = parseLeaveRecordsCsv(
			[
				"worker_email,leave_type,start_date,all_day",
				"worker@example.com,Vacation,2026-09-14,false",
			].join("\n"),
		);
		expect(errors[0]?.message).toContain("start_time and end_time");
	});

	test("rejects files missing required headers", () => {
		expect(() =>
			parseLeaveRecordsCsv(["name,type,date", "a,b,c"].join("\n")),
		).toThrow(/Missing required columns/);
	});
});

describe("leave balance CSV import", () => {
	test("parses hours, minutes, mode, and effective date", () => {
		const { rows, errors } = parseLeaveBalancesCsv(
			[
				"worker_email,leave_type,hours,minutes,mode,effective_date,note",
				"a@example.com,Vacation,40,,set,2026-01-01,Opening",
				"b@example.com,Sick,,480,add,2026-02-01,Correction",
				"c@example.com,Personal,7.5,,,",
			].join("\n"),
		);
		expect(errors).toEqual([]);
		expect(rows.map((row) => row.minutes)).toEqual([2400, 480, 450]);
		expect(rows.map((row) => row.mode)).toEqual(["set", "add", "set"]);
		expect(rows[2]?.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	test("reports invalid numbers and modes per row", () => {
		const { errors } = parseLeaveBalancesCsv(
			[
				"worker_email,leave_type,hours",
				"a@example.com,Vacation,abc",
				"b@example.com,Sick,",
			].join("\n"),
		);
		expect(errors).toHaveLength(2);
		expect(errors[0]?.message).toContain("not a number");
		expect(errors[1]?.message).toContain("Provide hours or minutes");
	});
});
