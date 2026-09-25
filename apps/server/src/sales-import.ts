import {
	db,
	locationSales,
	locations,
	salesImportSources,
} from "@SchedulesManager/db";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
	cell,
	csvTemplate,
	type HeaderAliases,
	type ImportFailure,
	isValidDateKey,
	parseCsvHeader,
	requireHeaders,
} from "./csv-import";
import { BadRequestError, ConflictError } from "./errors";
import { writeAudit } from "./notify";

/**
 * Daily sales import: a provider-neutral path into the same `location_sales`
 * figures the Square connector and the Schedule day drawer write. The CSV
 * carries one row per location and business date; dates are taken as the
 * location's own business dates with no timezone conversion.
 */
export const SALES_IMPORT_TEMPLATE = csvTemplate("location,date,amount", [
	"Downtown,2026-09-07,1250.50",
	"Main location,2026-09-07,892",
]);

const HEADER_ALIASES: HeaderAliases = {
	location: "location",
	store: "location",
	site: "location",
	branch: "location",
	date: "date",
	sale_date: "date",
	business_date: "date",
	day: "date",
	amount: "amount",
	net_sales: "amount",
	net_sales_amount: "amount",
	sales: "amount",
	sales_amount: "amount",
};

/** Longest span a single file may cover, matching the calendar-year cap. */
const MAX_SPAN_DAYS = 366;

export interface ParsedSalesImportRow {
	line: number;
	location: string;
	date: string;
	amountCents: number;
}

export function parseAmountToCents(value: string): number {
	const trimmed = value.trim();
	if (!trimmed) throw new Error("amount is required");
	if (/^[=+@\t]/.test(trimmed)) {
		throw new Error(`Amount "${trimmed}" looks like a spreadsheet formula`);
	}
	const normalized = trimmed
		.replace(/^[$€£¥\s]+/, "")
		.replace(/[$€£¥\s]+$/, "")
		.replaceAll(",", "");
	if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
		throw new Error(`"${value}" is not a valid amount`);
	}
	const negative = normalized.startsWith("-");
	const [whole, fraction = ""] = normalized.replace("-", "").split(".");
	const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
	if (!Number.isSafeInteger(cents)) {
		throw new Error(`"${value}" is too large to import`);
	}
	return negative ? -cents : cents;
}

export function parseSalesImportCsv(text: string): {
	rows: ParsedSalesImportRow[];
	errors: ImportFailure[];
} {
	const { rows: dataRows, map } = parseCsvHeader(text, HEADER_ALIASES);
	requireHeaders(map, ["location", "date", "amount"]);

	const rows: ParsedSalesImportRow[] = [];
	const errors: ImportFailure[] = [];
	for (const row of dataRows) {
		const line = row.line;
		const location = cell(row.values, map, "location");
		const rawDate = cell(row.values, map, "date");
		const rawAmount = cell(row.values, map, "amount");
		if (!location) {
			errors.push({ line, message: "location is required" });
			continue;
		}
		if (!rawDate || !isValidDateKey(rawDate)) {
			errors.push({
				line,
				message: `"${rawDate}" is not a valid date (use YYYY-MM-DD)`,
			});
			continue;
		}
		try {
			rows.push({
				line,
				location,
				date: rawDate,
				amountCents: parseAmountToCents(rawAmount),
			});
		} catch (error) {
			errors.push({
				line,
				message:
					error instanceof Error ? error.message : "Could not parse this row",
			});
		}
	}
	return { rows, errors };
}

export interface SalesImportEntry {
	line: number;
	location: string;
	locationId: string;
	date: string;
	amountCents: number;
	currentAmountCents: number | null;
	/** Provenance of the current figure: "square", "csv", or null (manual). */
	source: string | null;
	change: boolean;
}

export interface SalesImportPreview {
	dryRun: boolean;
	total: number;
	imported: number;
	failed: ImportFailure[];
	entries: SalesImportEntry[];
	changes: number;
	reviewHash: string;
}

/**
 * Validates a sales CSV and diffs every row against the stored figures.
 * Nothing is written; the returned review hash must accompany the commit so
 * figures that changed after the preview are caught.
 */
export async function previewSalesImport(input: {
	workplaceId: string;
	csv: string;
}): Promise<SalesImportPreview> {
	const parsed = parseSalesImportCsv(input.csv);
	const failures: ImportFailure[] = [...parsed.errors];

	if (parsed.rows.length > 0) {
		const dates = parsed.rows.map((row) => row.date);
		const min = dates.reduce((a, b) => (a < b ? a : b));
		const max = dates.reduce((a, b) => (a > b ? a : b));
		const spanDays =
			(Date.parse(`${max}T00:00:00Z`) - Date.parse(`${min}T00:00:00Z`)) /
			86_400_000;
		if (spanDays > MAX_SPAN_DAYS) {
			throw new BadRequestError(
				"Limit sales imports to one calendar year of dates",
			);
		}
	}

	const locationRows = await db
		.select()
		.from(locations)
		.where(eq(locations.workplaceId, input.workplaceId));
	const locationByName = new Map(
		locationRows.map((row) => [row.name.toLowerCase(), row]),
	);

	const seen = new Map<string, number>();
	const entries: SalesImportEntry[] = [];
	for (const row of parsed.rows) {
		const match = locationByName.get(row.location.toLowerCase());
		if (!match) {
			failures.push({
				line: row.line,
				message: `Unknown location "${row.location}"`,
			});
			continue;
		}
		const key = `${match.id}:${row.date}`;
		const duplicateLine = seen.get(key);
		if (duplicateLine !== undefined) {
			failures.push({
				line: row.line,
				message: `Duplicate sales for "${match.name}" on ${row.date} (also on line ${duplicateLine})`,
			});
			continue;
		}
		seen.set(key, row.line);
		entries.push({
			line: row.line,
			location: match.name,
			locationId: match.id,
			date: row.date,
			amountCents: row.amountCents,
			currentAmountCents: null,
			source: null,
			change: false,
		});
	}

	const locationIds = [...new Set(entries.map((entry) => entry.locationId))];
	const existingRows = locationIds.length
		? await db
				.select({
					locationId: locationSales.locationId,
					saleDate: locationSales.saleDate,
					amountCents: locationSales.amountCents,
					source: salesImportSources.source,
				})
				.from(locationSales)
				.leftJoin(
					salesImportSources,
					and(
						eq(salesImportSources.locationId, locationSales.locationId),
						eq(salesImportSources.saleDate, locationSales.saleDate),
					),
				)
				.where(inArray(locationSales.locationId, locationIds))
		: [];
	const current = new Map(
		existingRows.map((row) => [`${row.locationId}:${row.saleDate}`, row]),
	);
	for (const entry of entries) {
		const existing = current.get(`${entry.locationId}:${entry.date}`);
		entry.currentAmountCents = existing?.amountCents ?? null;
		entry.source = existing?.source ?? null;
		entry.change =
			entry.currentAmountCents !== null &&
			entry.currentAmountCents !== entry.amountCents;
	}

	failures.sort((a, b) => a.line - b.line);
	return {
		dryRun: true,
		total: parsed.rows.length + parsed.errors.length,
		imported: entries.length,
		failed: failures,
		entries,
		changes: entries.filter((entry) => entry.change).length,
		reviewHash: createHash("sha256")
			.update(JSON.stringify({ workplaceId: input.workplaceId, entries }))
			.digest("hex"),
	};
}

/**
 * Commits a reviewed preview. The review hash must match a fresh preview of
 * the same file, and any row whose stored figure differs needs an explicit
 * overwrite. Every row's stored value is re-checked under a per-location
 * advisory lock, so concurrent Square imports or manual edits cannot be
 * silently replaced.
 */
export async function commitSalesImport(input: {
	workplaceId: string;
	profileId: string;
	csv: string;
	reviewHash: string;
	overwriteExisting: boolean;
}): Promise<number> {
	const preview = await previewSalesImport({
		workplaceId: input.workplaceId,
		csv: input.csv,
	});
	if (preview.reviewHash !== input.reviewHash) {
		throw new ConflictError("Sales changed since preview; review again");
	}
	if (preview.changes > 0 && !input.overwriteExisting) {
		throw new ConflictError(
			"Existing sales differ; review the preview and approve replacement",
		);
	}

	const byLocation = new Map<string, SalesImportEntry[]>();
	for (const entry of preview.entries) {
		const rows = byLocation.get(entry.locationId) ?? [];
		rows.push(entry);
		byLocation.set(entry.locationId, rows);
	}

	await db.transaction(async (tx) => {
		for (const locationId of [...byLocation.keys()].sort()) {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${locationId}))`,
			);
			for (const entry of byLocation.get(locationId) ?? []) {
				const [existing] = await tx
					.select({ amountCents: locationSales.amountCents })
					.from(locationSales)
					.where(
						and(
							eq(locationSales.locationId, entry.locationId),
							eq(locationSales.saleDate, entry.date),
						),
					)
					.limit(1);
				if ((existing?.amountCents ?? null) !== entry.currentAmountCents) {
					throw new ConflictError("Sales changed since preview; review again");
				}
				await tx
					.insert(locationSales)
					.values({
						locationId: entry.locationId,
						saleDate: entry.date,
						amountCents: entry.amountCents,
						updatedAt: new Date(),
					})
					.onConflictDoUpdate({
						target: [locationSales.locationId, locationSales.saleDate],
						set: { amountCents: entry.amountCents, updatedAt: new Date() },
					});
				await tx
					.insert(salesImportSources)
					.values({
						locationId: entry.locationId,
						saleDate: entry.date,
						source: "csv",
						amountCents: entry.amountCents,
						importedAt: new Date(),
					})
					.onConflictDoUpdate({
						target: [
							salesImportSources.locationId,
							salesImportSources.saleDate,
						],
						set: {
							source: "csv",
							amountCents: entry.amountCents,
							importedAt: new Date(),
						},
					});
			}
		}
	});

	if (preview.entries.length > 0) {
		await writeAudit({
			workplaceId: input.workplaceId,
			actorProfileId: input.profileId,
			action: "sales.imported",
			entityType: "workplace",
			entityId: input.workplaceId,
			summary: `Imported ${preview.entries.length} day(s) of net sales across ${byLocation.size} location(s) from CSV.`,
		});
	}
	return preview.entries.length;
}
