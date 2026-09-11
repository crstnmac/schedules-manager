import { BadRequestError } from "./errors";

export interface CsvRow {
	line: number;
	values: string[];
}

/**
 * RFC 4180-ish parser: quoted fields, escaped quotes, CRLF/LF, a UTF-8 BOM and
 * blank lines. Line numbers are 1-based and refer to the source file.
 */
export function parseCsvRows(text: string): CsvRow[] {
	const clean = text.replace(/^\uFEFF/, "");
	const rows: CsvRow[] = [];
	let values: string[] = [];
	let field = "";
	let inQuotes = false;
	let line = 1;
	let rowStartLine = 1;

	const flushRow = () => {
		values.push(field);
		field = "";
		if (values.length > 1 || (values[0] ?? "").trim() !== "") {
			rows.push({ line: rowStartLine, values });
		}
		values = [];
	};

	for (let index = 0; index < clean.length; index += 1) {
		const char = clean[index] as string;
		if (inQuotes) {
			if (char === '"') {
				if (clean[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					inQuotes = false;
				}
			} else {
				if (char === "\n") line += 1;
				field += char;
			}
			continue;
		}
		if (char === '"') {
			inQuotes = true;
			continue;
		}
		if (char === ",") {
			values.push(field);
			field = "";
			continue;
		}
		if (char === "\r") continue;
		if (char === "\n") {
			flushRow();
			line += 1;
			rowStartLine = line;
			continue;
		}
		field += char;
	}
	flushRow();
	return rows;
}

export function normalizeHeader(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export type HeaderAliases = Record<string, string>;
export type HeaderMap = Map<string, number>;

export function buildHeaderMap(row: CsvRow, aliases: HeaderAliases): HeaderMap {
	const map: HeaderMap = new Map();
	row.values.forEach((value, index) => {
		const canonical = aliases[normalizeHeader(value)];
		if (canonical && !map.has(canonical)) map.set(canonical, index);
	});
	return map;
}

export function cell(values: string[], map: HeaderMap, key: string): string {
	const index = map.get(key);
	if (index === undefined) return "";
	return (values[index] ?? "").trim();
}

export function requireHeaders(map: HeaderMap, required: string[]): void {
	const missing = required.filter((key) => !map.has(key));
	if (missing.length > 0) {
		throw new BadRequestError(
			`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
		);
	}
}

export function parseCsvHeader(
	text: string,
	aliases: HeaderAliases,
): {
	rows: CsvRow[];
	map: HeaderMap;
} {
	const parsed = parseCsvRows(text);
	if (parsed.length === 0) {
		throw new BadRequestError("The CSV is empty");
	}
	const [headerRow, ...rows] = parsed as [CsvRow, ...CsvRow[]];
	return { rows, map: buildHeaderMap(headerRow, aliases) };
}

export function isValidDateKey(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(parsed.getTime()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

export function parseTimeToMinute(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value);
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour > 23 || minute > 59) return null;
	return hour * 60 + minute;
}

export function parseCsvBoolean(
	value: string,
	fallback: boolean,
): { value: boolean } | { error: string } {
	const normalized = value.trim().toLowerCase();
	if (normalized === "") return { value: fallback };
	if (["true", "yes", "y", "1"].includes(normalized)) return { value: true };
	if (["false", "no", "n", "0"].includes(normalized)) return { value: false };
	return { error: `"${value}" is not a yes/no value` };
}

export interface ImportFailure {
	line: number;
	message: string;
}

/** Shared shape returned by every CSV import, dry-run or committed. */
export interface ImportResult<TEntry> {
	dryRun: boolean;
	total: number;
	imported: number;
	failed: ImportFailure[];
	entries: TEntry[];
}

/** Builds a CSV template body from a header line and sample rows. */
export function csvTemplate(header: string, sampleRows: string[]): string {
	return [header, ...sampleRows].join("\n");
}

/**
 * Sets the response headers so an Elysia handler's `set` streams a downloadable
 * CSV attachment.
 */
export function csvAttachment(
	set: { headers: Record<string, string | number> },
	filename: string,
): void {
	set.headers["content-type"] = "text/csv; charset=utf-8";
	set.headers["content-disposition"] = `attachment; filename="${filename}"`;
}
