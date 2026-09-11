import {
	db,
	invitationLocations,
	invitationPositions,
	invitations,
	locations,
	positions,
} from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";

import {
	cell,
	csvTemplate,
	type HeaderAliases,
	type ImportFailure,
	type ImportResult,
	parseCsvHeader,
	requireHeaders,
} from "./csv-import";
import { writeAudit } from "./notify";

export const WORKER_IMPORT_TEMPLATE = csvTemplate(
	"name,email,phone,position,location",
	[
		"Alex Morgan,alex@example.com,+1 512 555 0101,Server,Downtown",
		"Sam Rivera,sam@example.com,,Host,Main location",
	],
);

const HEADER_ALIASES: HeaderAliases = {
	name: "name",
	full_name: "name",
	worker_name: "name",
	employee_name: "name",
	email: "email",
	worker_email: "email",
	employment_email: "email",
	phone: "phone",
	phone_number: "phone",
	mobile: "phone",
	position: "position",
	job_title: "position",
	location: "location",
	site: "location",
	branch: "location",
};

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export interface RawWorkerImportRow {
	line: number;
	name: string | null;
	email: string;
	phone: string | null;
	position: string | null;
	location: string | null;
}

export function parseWorkerImportCsv(text: string): {
	rows: RawWorkerImportRow[];
	errors: ImportFailure[];
} {
	const { rows: dataRows, map } = parseCsvHeader(text, HEADER_ALIASES);
	requireHeaders(map, ["email"]);

	const rows: RawWorkerImportRow[] = [];
	const errors: ImportFailure[] = [];
	const seen = new Map<string, number>();
	for (const row of dataRows) {
		const line = row.line;
		const email = cell(row.values, map, "email").toLowerCase();
		if (!email) {
			errors.push({ line, message: "email is required" });
			continue;
		}
		if (!isEmail(email)) {
			errors.push({ line, message: `"${email}" is not a valid email` });
			continue;
		}
		const duplicateLine = seen.get(email);
		if (duplicateLine !== undefined) {
			errors.push({
				line,
				message: `Duplicate email "${email}" (also on line ${duplicateLine})`,
			});
			continue;
		}
		seen.set(email, line);
		rows.push({
			line,
			email,
			name: cell(row.values, map, "name") || null,
			phone: cell(row.values, map, "phone") || null,
			position: cell(row.values, map, "position") || null,
			location: cell(row.values, map, "location") || null,
		});
	}
	return { rows, errors };
}

export interface WorkerImportEntry {
	line: number;
	email: string;
	name: string | null;
	position: string | null;
	location: string | null;
	invitationId: string | null;
	token: string | null;
}

/**
 * Creates (or previews) pending worker invitations from a CSV. Nothing is
 * written on a dry run, and no email is queued: managers distribute the invite
 * links returned for each row.
 */
export async function importWorkerInvitations(input: {
	workplaceId: string;
	profileId: string;
	csv: string;
	dryRun?: boolean;
}): Promise<ImportResult<WorkerImportEntry>> {
	const dryRun = input.dryRun ?? false;
	const parsed = parseWorkerImportCsv(input.csv);
	const failures: ImportFailure[] = [...parsed.errors];
	const entries: WorkerImportEntry[] = [];

	const [locationRows, positionRows] = await Promise.all([
		db
			.select()
			.from(locations)
			.where(eq(locations.workplaceId, input.workplaceId)),
		db
			.select()
			.from(positions)
			.where(eq(positions.workplaceId, input.workplaceId)),
	]);
	const locationByName = new Map(
		locationRows.map((row) => [row.name.toLowerCase(), row.id]),
	);
	const positionByName = new Map(
		positionRows.map((row) => [row.name.toLowerCase(), row.id]),
	);

	for (const row of parsed.rows) {
		try {
			if (row.location && !locationByName.has(row.location.toLowerCase())) {
				throw new Error(`Unknown location "${row.location}"`);
			}
			if (row.position && !positionByName.has(row.position.toLowerCase())) {
				throw new Error(`Unknown position "${row.position}"`);
			}
			const locationId = row.location
				? locationByName.get(row.location.toLowerCase())
				: undefined;
			const positionId = row.position
				? positionByName.get(row.position.toLowerCase())
				: undefined;

			let invitationId: string | null = null;
			let token: string | null = null;
			if (!dryRun) {
				const invitation = await db.transaction(async (tx) => {
					await tx
						.update(invitations)
						.set({ status: "revoked" })
						.where(
							and(
								eq(invitations.workplaceId, input.workplaceId),
								eq(invitations.email, row.email),
								eq(invitations.status, "pending"),
							),
						);
					const [created] = await tx
						.insert(invitations)
						.values({
							workplaceId: input.workplaceId,
							email: row.email,
							kind: "worker",
							invitedBy: input.profileId,
							expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
						})
						.returning();
					if (!created) return null;
					if (locationId) {
						await tx
							.insert(invitationLocations)
							.values({ invitationId: created.id, locationId });
					}
					if (positionId) {
						await tx
							.insert(invitationPositions)
							.values({ invitationId: created.id, positionId });
					}
					return created;
				});
				invitationId = invitation?.id ?? null;
				token = invitation?.token ?? null;
			}

			entries.push({
				line: row.line,
				email: row.email,
				name: row.name,
				position: row.position,
				location: row.location,
				invitationId,
				token,
			});
		} catch (error) {
			failures.push({
				line: row.line,
				message:
					error instanceof Error ? error.message : "Could not import this row",
			});
		}
	}

	if (!dryRun) {
		await writeAudit({
			workplaceId: input.workplaceId,
			actorProfileId: input.profileId,
			action: "workers.imported",
			entityType: "invitation",
			entityId: null,
			summary: `Imported ${entries.length} worker invitations (${failures.length} failed)`,
		});
	}

	failures.sort((a, b) => a.line - b.line);
	return {
		dryRun,
		total: parsed.rows.length + parsed.errors.length,
		imported: entries.length,
		failed: failures,
		entries,
	};
}
