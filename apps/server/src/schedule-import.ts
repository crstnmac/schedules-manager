import {
	cell,
	csvTemplate,
	type ImportFailure,
	isValidDateKey,
	normalizeHeader,
	parseCsvHeader,
	parseCsvRows,
	parseTimeToMinute,
	requireHeaders,
} from "./csv-import";
import { BadRequestError } from "./errors";

/** A portable export layout. Common Sling labels are accepted where their meaning is unambiguous. */
const aliases = {
	date: "date",
	shift_date: "date",
	start_date: "date",
	start: "start",
	start_time: "start",
	shift_start: "start",
	end: "end",
	end_time: "end",
	shift_end: "end",
	position: "position",
	role: "position",
	job_title: "position",
	department: "position",
	shift_position: "position",
	worker_email: "email",
	employee_email: "email",
	email: "email",
	worker_name: "workerName",
	employee_name: "workerName",
	employee: "workerName",
	user: "workerName",
	first_name: "firstName",
	firstname: "firstName",
	last_name: "lastName",
	surname: "lastName",
	location: "sourceLocation",
	location_name: "sourceLocation",
	job_site: "sourceLocation",
	note: "note",
	notes: "note",
} as const;

export const SCHEDULE_IMPORT_TEMPLATE = csvTemplate(
	"date,start_time,end_time,position,worker_email,note",
	[
		"2026-09-21,09:00,17:00,Server,alex@example.com,",
		"2026-09-22,16:00,23:00,Host,,Open shift",
	],
);

export interface ScheduleImportRow {
	line: number;
	date: string;
	startMinute: number;
	endMinute: number;
	position: string;
	email: string | null;
	workerName: string | null;
	sourceLocation: string | null;
	note: string | null;
}

const slingTimeLine =
	/^(\d{1,2}:\d{2}\s*[AP]M)\s*[-–—]\s*(\d{1,2}:\d{2}\s*[AP]M)(?:\s*•.*)?$/i;

function parseSlingTime(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(value.trim());
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour < 1 || hour > 12 || minute > 59) return null;
	return (
		((hour % 12) + (match[3]?.toUpperCase() === "P" ? 12 : 0)) * 60 + minute
	);
}

function parseSlingCalendarCsv(rawRows: ReturnType<typeof parseCsvRows>): {
	rows: ScheduleImportRow[];
	errors: ImportFailure[];
} {
	const dateColumns =
		rawRows[0]?.values.slice(1).map((value) => value.trim()) ?? [];
	const rows: ScheduleImportRow[] = [];
	const errors: ImportFailure[] = [];
	let section: "unassigned" | "available" | "scheduled" | null = null;
	for (const row of rawRows.slice(1)) {
		const label = (row.values[0] ?? "").trim();
		const sectionMatch = /^(unassigned|available|scheduled) shifts$/i.exec(
			label,
		);
		if (sectionMatch) {
			section = sectionMatch[1]?.toLowerCase() as
				| "unassigned"
				| "available"
				| "scheduled";
			continue;
		}
		for (let index = 0; index < dateColumns.length; index += 1) {
			const cellText = row.values[index + 1]?.replaceAll("\u00a0", " ").trim();
			if (!cellText) continue;
			if (!section) {
				errors.push({
					line: row.line,
					message: "Shift appears before a Sling schedule section",
				});
				continue;
			}
			const lines = cellText
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean);
			const groups: string[][] = [];
			let unreadableLeadingText = false;
			for (const line of lines) {
				if (slingTimeLine.test(line)) groups.push([line]);
				else if (groups.length) groups[groups.length - 1]?.push(line);
				else unreadableLeadingText = true;
			}
			if (groups.length === 0) {
				errors.push({
					line: row.line,
					message: `No readable shift time on ${dateColumns[index]}`,
				});
				continue;
			}
			if (unreadableLeadingText) {
				errors.push({
					line: row.line,
					message: `Unrecognized text before Sling shift on ${dateColumns[index]}`,
				});
			}
			for (const group of groups) {
				const timeMatch = slingTimeLine.exec(group[0] ?? "");
				const startMinute = parseSlingTime(timeMatch?.[1] ?? "");
				const endMinute = parseSlingTime(timeMatch?.[2] ?? "");
				const [positionText, locationText] = (group[1] ?? "").split("•", 2);
				const position = positionText?.trim() ?? "";
				const sourceLocation = locationText?.trim() || null;
				const note = group.slice(2).join("; ") || null;
				if (
					startMinute === null ||
					endMinute === null ||
					startMinute === endMinute ||
					!position ||
					(section === "scheduled" && !label) ||
					(note?.length ?? 0) > 200
				) {
					errors.push({
						line: row.line,
						message: `Incomplete or invalid Sling shift on ${dateColumns[index]}`,
					});
					continue;
				}
				rows.push({
					line: row.line,
					date: dateColumns[index] as string,
					startMinute,
					endMinute,
					position,
					email: null,
					workerName: section === "scheduled" ? label : null,
					sourceLocation,
					note,
				});
			}
		}
	}
	if (rows.length === 0 && errors.length === 0) {
		throw new BadRequestError(
			"This Sling schedule export contains no shifts. Export a week with scheduled shifts, or use the row-per-shift template.",
		);
	}
	return { rows, errors };
}

/** Fourth WFM ShiftTimes exports have one or more shift cells per employee and date. */
function parseShiftTimesMatrix(
	rawRows: ReturnType<typeof parseCsvRows>,
): { rows: ScheduleImportRow[]; errors: ImportFailure[] } | null {
	const header = rawRows[0]?.values ?? [];
	const normalized = header.map(normalizeHeader);
	if (
		!normalized.includes("firstname") ||
		!normalized.includes("surname") ||
		!normalized.includes("department")
	)
		return null;
	const dateColumns = header.flatMap((value, index) => {
		const match = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/.exec(value);
		if (!match || !/shift\s*\d/i.test(value)) return [];
		let date = match[1] ?? "";
		if (date.includes("/")) {
			const [day, month, year] = date.split("/");
			date = `${year}-${month?.padStart(2, "0")}-${day?.padStart(2, "0")}`;
		}
		return [{ index, date }];
	});
	if (dateColumns.length === 0) return null;
	const firstIndex = normalized.indexOf("firstname");
	const lastIndex = normalized.indexOf("surname");
	const positionIndex = normalized.indexOf("department");
	const locationIndex = normalized.indexOf("location_name");
	const rows: ScheduleImportRow[] = [];
	const errors: ImportFailure[] = [];
	for (const row of rawRows.slice(1)) {
		const workerName = [row.values[firstIndex], row.values[lastIndex]]
			.filter(Boolean)
			.join(" ")
			.trim();
		const position = (row.values[positionIndex] ?? "").trim();
		for (const column of dateColumns) {
			const value = (row.values[column.index] ?? "").trim();
			if (!value) continue;
			const match =
				/^(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[-–—]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i.exec(
					value,
				);
			const parse = (time: string) =>
				parseTimeToMinute(time) ?? parseSlingTime(time);
			const startMinute = parse(match?.[1] ?? "");
			const endMinute = parse(match?.[2] ?? "");
			if (
				!isValidDateKey(column.date) ||
				!workerName ||
				!position ||
				startMinute === null ||
				endMinute === null ||
				startMinute === endMinute
			) {
				errors.push({
					line: row.line,
					message: `Unrecognized ShiftTimes cell for ${column.date}; use the row-per-shift template if this export has a different layout`,
				});
				continue;
			}
			rows.push({
				line: row.line,
				date: column.date,
				startMinute,
				endMinute,
				position,
				email: null,
				workerName,
				sourceLocation:
					locationIndex >= 0
						? (row.values[locationIndex] ?? "").trim() || null
						: null,
				note: null,
			});
		}
	}
	return { rows, errors };
}

export function parseScheduleImportCsv(text: string): {
	rows: ScheduleImportRow[];
	errors: ImportFailure[];
} {
	const rawRows = parseCsvRows(text);
	const shiftTimes = parseShiftTimesMatrix(rawRows);
	if (shiftTimes) return shiftTimes;
	const dateColumns = rawRows[0]?.values.slice(1) ?? [];
	if (
		dateColumns.length > 0 &&
		dateColumns.every((value) => isValidDateKey(value.trim()))
	) {
		return parseSlingCalendarCsv(rawRows);
	}
	const { rows: dataRows, map } = parseCsvHeader(text, aliases);
	requireHeaders(map, ["date", "start", "end", "position"]);
	const rows: ScheduleImportRow[] = [];
	const errors: ImportFailure[] = [];
	for (const row of dataRows) {
		const date = cell(row.values, map, "date");
		const startMinute =
			parseTimeToMinute(cell(row.values, map, "start")) ??
			parseSlingTime(cell(row.values, map, "start"));
		const endMinute =
			parseTimeToMinute(cell(row.values, map, "end")) ??
			parseSlingTime(cell(row.values, map, "end"));
		const position = cell(row.values, map, "position");
		const email = cell(row.values, map, "email").toLowerCase() || null;
		const note = cell(row.values, map, "note") || null;
		const workerName =
			cell(row.values, map, "workerName") ||
			[cell(row.values, map, "firstName"), cell(row.values, map, "lastName")]
				.filter(Boolean)
				.join(" ") ||
			null;
		const sourceLocation = cell(row.values, map, "sourceLocation") || null;
		const problems = [
			!isValidDateKey(date) && "date must be YYYY-MM-DD",
			startMinute === null && "start time must be HH:MM or h:mm AM/PM",
			endMinute === null && "end time must be HH:MM or h:mm AM/PM",
			startMinute !== null &&
				startMinute === endMinute &&
				"start and end times cannot match",
			!position && "position is required",
			email !== null &&
				!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
				"worker email is invalid",
			note !== null &&
				note.length > 200 &&
				"note must be at most 200 characters",
		].filter((problem): problem is string => Boolean(problem));
		if (problems.length) {
			errors.push({ line: row.line, message: problems.join("; ") });
			continue;
		}
		rows.push({
			line: row.line,
			date,
			startMinute: startMinute as number,
			endMinute: endMinute as number,
			position,
			email,
			workerName,
			sourceLocation,
			note,
		});
	}
	return { rows, errors };
}
