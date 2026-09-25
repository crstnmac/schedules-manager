import {
	db,
	employmentLocations,
	employmentPositions,
	employments,
	invitationLocations,
	invitationPositions,
	invitations,
	locations,
	positions,
	profiles,
} from "@SchedulesManager/db";
import { and, eq, gt, inArray } from "drizzle-orm";

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

/**
 * Directory sync CSV: each row matches a person by email and maps to one
 * reviewed action — hire (invite), update (role/location/position access),
 * or deactivate. Column lists are semicolon-separated so the file opens
 * cleanly in spreadsheet software; commas are accepted too.
 */
export const DIRECTORY_IMPORT_TEMPLATE = csvTemplate(
	"email,name,kind,positions,locations,status",
	[
		"alex@example.com,Alex Morgan,worker,Server;Barista,Downtown,active",
		"sam@example.com,Sam Rivera,,Host,Main location,",
		"taylor@example.com,Taylor Brooks,manager,,Uptown,active",
	],
);

const HEADER_ALIASES: HeaderAliases = {
	email: "email",
	email_address: "email",
	employee_email: "email",
	worker_email: "email",
	employment_email: "email",
	name: "name",
	full_name: "name",
	worker_name: "name",
	employee_name: "name",
	user_name: "name",
	first_name: "firstName",
	firstname: "firstName",
	last_name: "lastName",
	surname: "lastName",
	kind: "kind",
	employment_kind: "kind",
	worker_type: "kind",
	positions: "positions",
	position: "positions",
	job_title: "positions",
	department: "positions",
	locations: "locations",
	location: "locations",
	job_site: "locations",
	site: "locations",
	branch: "locations",
	status: "status",
	employment_status: "status",
};

const KINDS = ["worker", "manager", "viewer"] as const;
type ImportKind = (typeof KINDS)[number];

const ACTIVE_STATUS_WORDS = [
	"active",
	"activated",
	"enabled",
	"hired",
	"current",
];
const INACTIVE_STATUS_WORDS = [
	"deactivated",
	"inactive",
	"disabled",
	"terminated",
	"former",
	"left",
	"offboarded",
];

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitList(value: string): string[] {
	return [
		...new Set(
			value
				.split(/[,;]/)
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
}

export interface RawDirectoryImportRow {
	line: number;
	email: string;
	name: string | null;
	kind: ImportKind | null;
	locations: string[];
	positions: string[];
	status: "active" | "deactivated" | null;
}

export function parseDirectoryImportCsv(text: string): {
	rows: RawDirectoryImportRow[];
	errors: ImportFailure[];
} {
	const { rows: dataRows, map } = parseCsvHeader(text, HEADER_ALIASES);
	requireHeaders(map, ["email"]);

	const rows: RawDirectoryImportRow[] = [];
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

		const rawKind = cell(row.values, map, "kind").toLowerCase();
		if (rawKind && !(KINDS as readonly string[]).includes(rawKind)) {
			errors.push({
				line,
				message: `kind must be one of ${KINDS.join(", ")} (got "${rawKind}")`,
			});
			continue;
		}

		const rawStatus = cell(row.values, map, "status").toLowerCase();
		let status: RawDirectoryImportRow["status"] = null;
		if (rawStatus) {
			if (ACTIVE_STATUS_WORDS.includes(rawStatus)) status = "active";
			else if (INACTIVE_STATUS_WORDS.includes(rawStatus)) {
				status = "deactivated";
			} else {
				errors.push({
					line,
					message: `status must be active or deactivated (got "${rawStatus}")`,
				});
				continue;
			}
		}

		rows.push({
			line,
			email,
			name:
				cell(row.values, map, "name") ||
				[cell(row.values, map, "firstName"), cell(row.values, map, "lastName")]
					.filter(Boolean)
					.join(" ") ||
				null,
			kind: (rawKind as ImportKind) || null,
			locations: splitList(cell(row.values, map, "locations")),
			positions: splitList(cell(row.values, map, "positions")),
			status,
		});
	}
	return { rows, errors };
}

export type DirectoryImportAction =
	| "hire"
	| "update"
	| "deactivate"
	| "pending_invitation"
	| "none";

export interface DirectoryImportEntry {
	line: number;
	email: string;
	name: string | null;
	action: DirectoryImportAction;
	kind: ImportKind;
	locations: string[];
	positions: string[];
	/** Human-readable change list for the review screen. */
	changes: string[];
	employmentId: string | null;
	inviteToken: string | null;
}

function sameSet(left: string[], right: string[]): boolean {
	return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function describeDiff(
	label: string,
	currentNames: string[],
	requestedNames: string[],
): string {
	const removed = currentNames.filter((name) => !requestedNames.includes(name));
	const added = requestedNames.filter((name) => !currentNames.includes(name));
	const parts = [
		...added.map((name) => `+${name}`),
		...removed.map((name) => `-${name}`),
	];
	return `${label}: ${parts.join(", ")}`;
}

function describeSet(names: string[]): string {
	return `Set ${names.join(", ")}`;
}

/**
 * Syncs the worker directory from a CSV. Rows map to a hire (pending
 * invitation — no email is queued), an update of role and Location/Position
 * access, or a deactivation. Nothing is written on a dry run; the preview
 * lists the action for every row so managers review before committing.
 * Filled location/position columns replace the current sets; empty columns
 * leave them untouched.
 */
export async function importWorkerDirectory(input: {
	workplaceId: string;
	profileId: string;
	csv: string;
	dryRun?: boolean;
}): Promise<ImportResult<DirectoryImportEntry>> {
	const dryRun = input.dryRun ?? false;
	const parsed = parseDirectoryImportCsv(input.csv);
	const failures: ImportFailure[] = [...parsed.errors];
	const entries: DirectoryImportEntry[] = [];

	const [employmentRows, pendingInvitationRows, locationRows, positionRows] =
		await Promise.all([
			db
				.select({
					id: employments.id,
					profileId: employments.profileId,
					status: employments.status,
					kind: employments.kind,
					email: profiles.email,
				})
				.from(employments)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(eq(employments.workplaceId, input.workplaceId)),
			db
				.select()
				.from(invitations)
				.where(
					and(
						eq(invitations.workplaceId, input.workplaceId),
						eq(invitations.status, "pending"),
						gt(invitations.expiresAt, new Date()),
					),
				),
			db
				.select()
				.from(locations)
				.where(eq(locations.workplaceId, input.workplaceId)),
			db
				.select()
				.from(positions)
				.where(eq(positions.workplaceId, input.workplaceId)),
		]);

	const employmentIds = employmentRows.map((row) => row.id);
	const [employmentLocationRows, employmentPositionRows] =
		employmentIds.length > 0
			? await Promise.all([
					db
						.select()
						.from(employmentLocations)
						.where(inArray(employmentLocations.employmentId, employmentIds)),
					db
						.select()
						.from(employmentPositions)
						.where(inArray(employmentPositions.employmentId, employmentIds)),
				])
			: [
					[] as (typeof employmentLocations.$inferSelect)[],
					[] as (typeof employmentPositions.$inferSelect)[],
				];

	const employmentByEmail = new Map(
		employmentRows.map((row) => [row.email.toLowerCase(), row]),
	);
	const employmentLocationsById = new Map<string, Set<string>>();
	for (const row of employmentLocationRows) {
		const set = employmentLocationsById.get(row.employmentId) ?? new Set();
		set.add(row.locationId);
		employmentLocationsById.set(row.employmentId, set);
	}
	const employmentPositionsById = new Map<string, Set<string>>();
	for (const row of employmentPositionRows) {
		const set = employmentPositionsById.get(row.employmentId) ?? new Set();
		set.add(row.positionId);
		employmentPositionsById.set(row.employmentId, set);
	}
	const pendingInvitationByEmail = new Map(
		pendingInvitationRows.map((row) => [row.email.toLowerCase(), row]),
	);
	const locationByName = new Map(
		locationRows.map((row) => [row.name.toLowerCase(), row]),
	);
	const positionByName = new Map(
		positionRows.map((row) => [row.name.toLowerCase(), row]),
	);

	for (const row of parsed.rows) {
		try {
			const resolveIds = (
				names: string[],
				byName: Map<string, { id: string; name: string }>,
				label: string,
			) => {
				const ids: string[] = [];
				const resolvedNames: string[] = [];
				for (const name of names) {
					const match = byName.get(name.toLowerCase());
					if (!match) throw new Error(`Unknown ${label} "${name}"`);
					ids.push(match.id);
					resolvedNames.push(match.name);
				}
				return { ids, names: resolvedNames };
			};
			const resolvedLocations = resolveIds(
				row.locations,
				locationByName,
				"location",
			);
			const resolvedPositions = resolveIds(
				row.positions,
				positionByName,
				"position",
			);

			const employment = employmentByEmail.get(row.email);
			const pendingInvitation = pendingInvitationByEmail.get(row.email);

			const entry: DirectoryImportEntry = {
				line: row.line,
				email: row.email,
				name: row.name,
				action: "none",
				kind: row.kind ?? employment?.kind ?? "worker",
				locations: resolvedLocations.names,
				positions: resolvedPositions.names,
				changes: [],
				employmentId: employment?.id ?? null,
				inviteToken: null,
			};

			if (employment) {
				const isSelf = employment.profileId === input.profileId;
				if (row.status === "deactivated") {
					if (employment.status === "deactivated") {
						entry.changes.push("Already deactivated");
					} else if (isSelf) {
						throw new Error("You cannot deactivate your own employment");
					} else {
						entry.action = "deactivate";
						entry.changes.push("Deactivate employment");
					}
				} else if (employment.status === "deactivated") {
					throw new Error(
						"This person was deactivated; invite them again from the Workers page instead",
					);
				} else {
					const currentLocationIds = [
						...(employmentLocationsById.get(employment.id) ?? []),
					];
					const currentPositionIds = [
						...(employmentPositionsById.get(employment.id) ?? []),
					];
					const replaceLocations =
						row.locations.length > 0 &&
						!sameSet(currentLocationIds, resolvedLocations.ids);
					const replacePositions =
						row.positions.length > 0 &&
						!sameSet(currentPositionIds, resolvedPositions.ids);
					const replaceKind = Boolean(row.kind && row.kind !== employment.kind);
					if (replaceKind && isSelf) {
						throw new Error("You cannot change your own role");
					}
					if (!replaceLocations && !replacePositions && !replaceKind) {
						entry.changes.push("Nothing to change");
					} else {
						entry.action = "update";
						if (replaceLocations) {
							entry.changes.push(
								describeDiff(
									"Locations",
									currentLocationIds.map(
										(id) =>
											locationRows.find((location) => location.id === id)
												?.name ?? id,
									),
									resolvedLocations.names,
								),
							);
						}
						if (replacePositions) {
							entry.changes.push(
								describeDiff(
									"Positions",
									currentPositionIds.map(
										(id) =>
											positionRows.find((position) => position.id === id)
												?.name ?? id,
									),
									resolvedPositions.names,
								),
							);
						}
						if (replaceKind) {
							entry.changes.push(`Role: ${employment.kind} → ${row.kind}`);
						}
					}
				}
			} else if (pendingInvitation) {
				if (row.status === "deactivated") {
					entry.action = "deactivate";
					entry.changes.push("Revoke pending invitation");
				} else {
					entry.action = "pending_invitation";
					entry.changes.push("Update pending invitation");
					if (row.kind && row.kind !== pendingInvitation.kind) {
						entry.changes.push(`Role: ${pendingInvitation.kind} → ${row.kind}`);
					}
					if (row.locations.length > 0) {
						entry.changes.push(describeSet(resolvedLocations.names));
					}
					if (row.positions.length > 0) {
						entry.changes.push(describeSet(resolvedPositions.names));
					}
				}
			} else if (row.status === "deactivated") {
				throw new Error(
					"No active or invited person with this email, so it cannot be deactivated",
				);
			} else {
				entry.action = "hire";
				entry.changes.push(`${row.kind ?? "worker"} invitation`);
				if (row.locations.length > 0) {
					entry.changes.push(describeSet(resolvedLocations.names));
				}
				if (row.positions.length > 0) {
					entry.changes.push(describeSet(resolvedPositions.names));
				}
			}

			if (!dryRun && entry.action !== "none") {
				await db.transaction(async (tx) => {
					if (entry.action === "hire") {
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
								kind: entry.kind,
								invitedBy: input.profileId,
								expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
							})
							.returning();
						if (!created) throw new Error("Could not create the invitation");
						entry.inviteToken = created.token;
						if (resolvedLocations.ids.length > 0) {
							await tx.insert(invitationLocations).values(
								resolvedLocations.ids.map((locationId) => ({
									invitationId: created.id,
									locationId,
								})),
							);
						}
						if (resolvedPositions.ids.length > 0) {
							await tx.insert(invitationPositions).values(
								resolvedPositions.ids.map((positionId) => ({
									invitationId: created.id,
									positionId,
								})),
							);
						}
					} else if (
						entry.action === "pending_invitation" &&
						pendingInvitation
					) {
						if (row.kind && row.kind !== pendingInvitation.kind) {
							await tx
								.update(invitations)
								.set({ kind: row.kind })
								.where(eq(invitations.id, pendingInvitation.id));
						}
						if (row.locations.length > 0) {
							await tx
								.delete(invitationLocations)
								.where(
									eq(invitationLocations.invitationId, pendingInvitation.id),
								);
							await tx.insert(invitationLocations).values(
								resolvedLocations.ids.map((locationId) => ({
									invitationId: pendingInvitation.id,
									locationId,
								})),
							);
						}
						if (row.positions.length > 0) {
							await tx
								.delete(invitationPositions)
								.where(
									eq(invitationPositions.invitationId, pendingInvitation.id),
								);
							await tx.insert(invitationPositions).values(
								resolvedPositions.ids.map((positionId) => ({
									invitationId: pendingInvitation.id,
									positionId,
								})),
							);
						}
					} else if (entry.action === "update" && employment) {
						if (row.kind && row.kind !== employment.kind) {
							await tx
								.update(employments)
								.set({ kind: row.kind })
								.where(eq(employments.id, employment.id));
						}
						if (
							row.locations.length > 0 &&
							!sameSet(
								[...(employmentLocationsById.get(employment.id) ?? [])],
								resolvedLocations.ids,
							)
						) {
							await tx
								.delete(employmentLocations)
								.where(eq(employmentLocations.employmentId, employment.id));
							await tx.insert(employmentLocations).values(
								resolvedLocations.ids.map((locationId) => ({
									employmentId: employment.id,
									locationId,
								})),
							);
						}
						if (
							row.positions.length > 0 &&
							!sameSet(
								[...(employmentPositionsById.get(employment.id) ?? [])],
								resolvedPositions.ids,
							)
						) {
							await tx
								.delete(employmentPositions)
								.where(eq(employmentPositions.employmentId, employment.id));
							await tx.insert(employmentPositions).values(
								resolvedPositions.ids.map((positionId) => ({
									employmentId: employment.id,
									positionId,
								})),
							);
						}
					} else if (entry.action === "deactivate") {
						if (employment) {
							await tx
								.update(employments)
								.set({ status: "deactivated", deactivatedAt: new Date() })
								.where(eq(employments.id, employment.id));
						} else if (pendingInvitation) {
							await tx
								.update(invitations)
								.set({ status: "revoked" })
								.where(eq(invitations.id, pendingInvitation.id));
						}
					}
				});
			}

			entries.push(entry);
		} catch (error) {
			failures.push({
				line: row.line,
				message:
					error instanceof Error ? error.message : "Could not import this row",
			});
		}
	}

	const applied = entries.filter((entry) => entry.action !== "none").length;
	if (!dryRun) {
		const hired = entries.filter((entry) => entry.action === "hire").length;
		const updated = entries.filter(
			(entry) =>
				entry.action === "update" || entry.action === "pending_invitation",
		).length;
		const deactivated = entries.filter(
			(entry) => entry.action === "deactivate",
		).length;
		await writeAudit({
			workplaceId: input.workplaceId,
			actorProfileId: input.profileId,
			action: "workers.imported",
			entityType: "employment",
			entityId: null,
			summary: `Synced the worker directory from CSV: ${hired} hired, ${updated} updated, ${deactivated} deactivated (${failures.length} skipped)`,
		});
	}

	failures.sort((a, b) => a.line - b.line);
	return {
		dryRun,
		total: parsed.rows.length + parsed.errors.length,
		imported: applied,
		failed: failures,
		entries,
	};
}
