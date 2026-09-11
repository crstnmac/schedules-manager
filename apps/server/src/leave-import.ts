import {
	db,
	employments,
	leavePolicies,
	leaveTypes,
	profiles,
	ptoBalances,
} from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";

import {
	cell,
	csvTemplate,
	type HeaderAliases,
	type ImportFailure,
	type ImportResult,
	isValidDateKey,
	parseCsvBoolean,
	parseCsvHeader,
	parseTimeToMinute,
	requireHeaders,
} from "./csv-import";
import { BadRequestError } from "./errors";
import { applyLeaveLedger } from "./leave-ledger";
import {
	insertLeaveRequests,
	type LeaveWindowInput,
	prepareLeaveRequests,
} from "./leave-requests";
import { managerEmploymentIds, notifyEmployments, writeAudit } from "./notify";

export const LEAVE_RECORDS_TEMPLATE = csvTemplate(
	"worker_email,leave_type,start_date,end_date,all_day,start_time,end_time,reason,status,emergency",
	[
		"alex@example.com,Vacation,2026-09-14,2026-09-16,true,,,Family trip,approved,false",
		"sam@example.com,Sick,2026-09-18,2026-09-18,false,09:00,13:00,Appointment,pending,false",
	],
);

export const LEAVE_BALANCES_TEMPLATE = csvTemplate(
	"worker_email,leave_type,hours,minutes,mode,effective_date,note",
	[
		"alex@example.com,Vacation,40,,set,2026-01-01,Opening balance",
		"sam@example.com,Sick,,480,add,2026-01-01,Carry-over correction",
	],
);

const HEADER_ALIASES: HeaderAliases = {
	worker_email: "worker_email",
	email: "worker_email",
	worker: "worker_email",
	employment_email: "worker_email",
	leave_type: "leave_type",
	type: "leave_type",
	leave_type_name: "leave_type",
	leave_type_code: "leave_type",
	code: "leave_type",
	start_date: "start_date",
	from: "start_date",
	from_date: "start_date",
	start: "start_date",
	end_date: "end_date",
	to: "end_date",
	to_date: "end_date",
	end: "end_date",
	all_day: "all_day",
	allday: "all_day",
	start_time: "start_time",
	end_time: "end_time",
	reason: "reason",
	note: "reason",
	notes: "reason",
	status: "status",
	emergency: "emergency",
	is_emergency: "emergency",
	hours: "hours",
	minutes: "minutes",
	mode: "mode",
	effective_date: "effective_date",
	effective: "effective_date",
};

export interface RawLeaveRecordRow {
	line: number;
	workerEmail: string;
	leaveType: string;
	startDate: string;
	endDate: string;
	allDay: boolean;
	startMinute: number | null;
	endMinute: number | null;
	reason: string | null;
	status: "approved" | "pending";
	isEmergency: boolean;
}

export interface RawLeaveBalanceRow {
	line: number;
	workerEmail: string;
	leaveType: string;
	minutes: number;
	mode: "set" | "add";
	effectiveDate: string;
	note: string | null;
}

function parseStatus(
	value: string,
	fallback: "approved" | "pending",
): { value: "approved" | "pending" } | { error: string } {
	const normalized = value.trim().toLowerCase();
	if (normalized === "") return { value: fallback };
	if (normalized === "approved") return { value: "approved" };
	if (normalized === "pending") return { value: "pending" };
	return { error: `status must be "approved" or "pending", got "${value}"` };
}

export function parseLeaveRecordsCsv(text: string): {
	rows: RawLeaveRecordRow[];
	errors: ImportFailure[];
} {
	const { rows: dataRows, map } = parseCsvHeader(text, HEADER_ALIASES);
	requireHeaders(map, ["worker_email", "leave_type", "start_date"]);

	const rows: RawLeaveRecordRow[] = [];
	const errors: ImportFailure[] = [];
	for (const row of dataRows) {
		const line = row.line;
		try {
			const workerEmail = cell(row.values, map, "worker_email");
			if (!workerEmail) throw new Error("worker_email is required");
			const leaveType = cell(row.values, map, "leave_type");
			if (!leaveType) throw new Error("leave_type is required");

			const startDate = cell(row.values, map, "start_date");
			if (!isValidDateKey(startDate)) {
				throw new Error(`start_date "${startDate}" must be YYYY-MM-DD`);
			}
			const endDateRaw = cell(row.values, map, "end_date");
			const endDate = endDateRaw === "" ? startDate : endDateRaw;
			if (!isValidDateKey(endDate)) {
				throw new Error(`end_date "${endDateRaw}" must be YYYY-MM-DD`);
			}
			if (endDate < startDate) {
				throw new Error("end_date must be on or after start_date");
			}

			const allDayParsed = parseCsvBoolean(
				cell(row.values, map, "all_day"),
				true,
			);
			if ("error" in allDayParsed) throw new Error(allDayParsed.error);
			const statusParsed = parseStatus(
				cell(row.values, map, "status"),
				"approved",
			);
			if ("error" in statusParsed) throw new Error(statusParsed.error);
			const emergencyParsed = parseCsvBoolean(
				cell(row.values, map, "emergency"),
				false,
			);
			if ("error" in emergencyParsed) throw new Error(emergencyParsed.error);

			let startMinute: number | null = null;
			let endMinute: number | null = null;
			if (!allDayParsed.value) {
				const startTime = cell(row.values, map, "start_time");
				const endTime = cell(row.values, map, "end_time");
				startMinute = parseTimeToMinute(startTime);
				endMinute = parseTimeToMinute(endTime);
				if (startMinute === null || endMinute === null) {
					throw new Error(
						"start_time and end_time (HH:MM) are required for partial days",
					);
				}
				if (startDate === endDate && startMinute >= endMinute) {
					throw new Error("start_time must be before end_time");
				}
			}

			rows.push({
				line,
				workerEmail,
				leaveType,
				startDate,
				endDate,
				allDay: allDayParsed.value,
				startMinute,
				endMinute,
				reason: cell(row.values, map, "reason") || null,
				status: statusParsed.value,
				isEmergency: emergencyParsed.value,
			});
		} catch (error) {
			errors.push({
				line,
				message: error instanceof Error ? error.message : "Invalid row",
			});
		}
	}
	return { rows, errors };
}

export function parseLeaveBalancesCsv(text: string): {
	rows: RawLeaveBalanceRow[];
	errors: ImportFailure[];
} {
	const { rows: dataRows, map } = parseCsvHeader(text, HEADER_ALIASES);
	requireHeaders(map, ["worker_email", "leave_type"]);
	if (!map.has("hours") && !map.has("minutes")) {
		throw new BadRequestError("Provide either an hours or a minutes column");
	}

	const rows: RawLeaveBalanceRow[] = [];
	const errors: ImportFailure[] = [];
	for (const row of dataRows) {
		const line = row.line;
		try {
			const workerEmail = cell(row.values, map, "worker_email");
			if (!workerEmail) throw new Error("worker_email is required");
			const leaveType = cell(row.values, map, "leave_type");
			if (!leaveType) throw new Error("leave_type is required");

			const minutesText = cell(row.values, map, "minutes");
			const hoursText = cell(row.values, map, "hours");
			let minutes: number | null = null;
			if (minutesText !== "") {
				const parsedMinutes = Number(minutesText);
				if (!Number.isFinite(parsedMinutes)) {
					throw new Error(`minutes "${minutesText}" is not a number`);
				}
				minutes = Math.round(parsedMinutes);
			} else if (hoursText !== "") {
				const parsedHours = Number(hoursText);
				if (!Number.isFinite(parsedHours)) {
					throw new Error(`hours "${hoursText}" is not a number`);
				}
				minutes = Math.round(parsedHours * 60);
			}
			if (minutes === null) {
				throw new Error("Provide hours or minutes for each row");
			}
			if (minutes < -200_000 || minutes > 200_000) {
				throw new Error("Balance is out of range");
			}

			const modeRaw = cell(row.values, map, "mode").toLowerCase();
			if (modeRaw !== "" && modeRaw !== "set" && modeRaw !== "add") {
				throw new Error(`mode must be "set" or "add", got "${modeRaw}"`);
			}
			const effectiveDateRaw = cell(row.values, map, "effective_date");
			const effectiveDate =
				effectiveDateRaw === ""
					? new Date().toISOString().slice(0, 10)
					: effectiveDateRaw;
			if (!isValidDateKey(effectiveDate)) {
				throw new Error(
					`effective_date "${effectiveDateRaw}" must be YYYY-MM-DD`,
				);
			}

			rows.push({
				line,
				workerEmail,
				leaveType,
				minutes,
				mode: modeRaw === "add" ? "add" : "set",
				effectiveDate,
				note: cell(row.values, map, "note") || null,
			});
		} catch (error) {
			errors.push({
				line,
				message: error instanceof Error ? error.message : "Invalid row",
			});
		}
	}
	return { rows, errors };
}

interface WorkplaceEmployment {
	id: string;
	workplaceId: string;
	email: string;
	fullName: string | null;
}

interface WorkplaceLookups {
	byEmail: Map<string, WorkplaceEmployment>;
	leaveTypes: {
		id: string;
		name: string;
		code: string | null;
		classification: string;
	}[];
}

async function loadWorkplaceLookups(
	workplaceId: string,
): Promise<WorkplaceLookups> {
	const [employmentRows, typeRows] = await Promise.all([
		db
			.select({
				id: employments.id,
				workplaceId: employments.workplaceId,
				email: profiles.email,
				fullName: profiles.fullName,
			})
			.from(employments)
			.innerJoin(profiles, eq(profiles.id, employments.profileId))
			.where(
				and(
					eq(employments.workplaceId, workplaceId),
					eq(employments.status, "active"),
				),
			),
		db
			.select({
				id: leaveTypes.id,
				name: leaveTypes.name,
				code: leaveTypes.code,
				classification: leaveTypes.classification,
			})
			.from(leaveTypes)
			.where(eq(leaveTypes.workplaceId, workplaceId)),
	]);
	const byEmail = new Map<string, WorkplaceEmployment>();
	for (const row of employmentRows) {
		byEmail.set(row.email.toLowerCase(), {
			id: row.id,
			workplaceId: row.workplaceId,
			email: row.email,
			fullName: row.fullName,
		});
	}
	return { byEmail, leaveTypes: typeRows };
}

function findLeaveType(
	lookups: WorkplaceLookups,
	value: string,
): { id: string; name: string } | null {
	const needle = value.trim().toLowerCase();
	const match = lookups.leaveTypes.find(
		(type) =>
			type.name.toLowerCase() === needle ||
			(type.code ?? "").toLowerCase() === needle,
	);
	return match ? { id: match.id, name: match.name } : null;
}

export interface LeaveImportEntry {
	line: number;
	workerEmail: string;
	workerName: string | null;
	leaveTypeId: string;
	leaveTypeName: string;
	startDate: string;
	endDate: string;
	allDay: boolean;
	chargeMinutes: number;
	status: "approved" | "pending";
	requestId: string | null;
	/** Balance imports only: set vs add and the effective date. */
	mode?: "set" | "add";
	effectiveDate?: string;
}

export type LeaveImportResult = ImportResult<LeaveImportEntry>;

export async function importLeaveRecords(input: {
	workplaceId: string;
	profileId: string;
	csv: string;
	dryRun?: boolean;
	defaultStatus?: "approved" | "pending";
}): Promise<LeaveImportResult> {
	const dryRun = input.dryRun ?? false;
	const records = parseLeaveRecordsCsv(input.csv);
	const lookups = await loadWorkplaceLookups(input.workplaceId);
	const failures: ImportFailure[] = [...records.errors];
	const entries: LeaveImportEntry[] = [];
	const processedByEmployment = new Map<
		string,
		{ startsAt: Date; endsAt: Date }[]
	>();
	const batchId = crypto.randomUUID();
	const notifiedApproved = new Set<string>();
	let pendingCreated = false;

	for (const row of records.rows) {
		try {
			const employment =
				lookups.byEmail.get(row.workerEmail.toLowerCase()) ?? null;
			if (!employment) {
				throw new Error(
					`No active worker with email "${row.workerEmail}" in this Workplace`,
				);
			}
			const leaveType = findLeaveType(lookups, row.leaveType);
			if (!leaveType) {
				throw new Error(`Unknown leave type "${row.leaveType}"`);
			}

			const window: LeaveWindowInput = {
				startDate: row.startDate,
				endDate: row.endDate,
				allDay: row.allDay,
				...(row.allDay
					? {}
					: {
							startMinute: row.startMinute ?? 0,
							endMinute: row.endMinute ?? 0,
						}),
				reason: row.reason ?? undefined,
				leaveTypeId: leaveType.id,
			};

			const prepared = await prepareLeaveRequests({
				workplaceId: input.workplaceId,
				employmentId: employment.id,
				windows: [window],
				isEmergency: row.isEmergency,
				autoApprove: row.status === "approved",
				checkOverlaps: true,
				skipNotice: true,
				batchId,
			});
			const item = prepared[0];
			if (!item) throw new Error("Could not resolve this window");

			// Also reject overlaps between rows of the same import.
			const seen = processedByEmployment.get(employment.id) ?? [];
			for (const existing of seen) {
				if (
					item.window.startsAt < existing.endsAt &&
					item.window.endsAt > existing.startsAt
				) {
					throw new Error("Overlaps another row in this CSV");
				}
			}

			let requestId: string | null = null;
			if (!dryRun) {
				const created = await db.transaction(async () =>
					insertLeaveRequests({
						workplaceId: input.workplaceId,
						employmentId: employment.id,
						profileId: input.profileId,
						prepared: [item],
						autoApprove: row.status === "approved",
					}),
				);
				requestId = created[0]?.id ?? null;
				if (row.status === "approved") notifiedApproved.add(employment.id);
				else pendingCreated = true;
			}
			seen.push({ startsAt: item.window.startsAt, endsAt: item.window.endsAt });
			processedByEmployment.set(employment.id, seen);

			entries.push({
				line: row.line,
				workerEmail: employment.email,
				workerName: employment.fullName,
				leaveTypeId: leaveType.id,
				leaveTypeName: leaveType.name,
				startDate: item.window.startDate,
				endDate: item.window.endDate,
				allDay: item.window.allDay,
				chargeMinutes: item.chargeMinutes,
				status: row.status,
				requestId,
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
		if (notifiedApproved.size > 0) {
			await notifyEmployments([...notifiedApproved], {
				kind: "time_off_approved",
				title: "Time off imported",
				body: "A manager imported time off for you.",
			});
		}
		if (pendingCreated) {
			await notifyEmployments(await managerEmploymentIds(input.workplaceId), {
				kind: "time_off_requested",
				title: "Imported leave needs a decision",
				body: "Imported time-off requests are waiting for approval.",
			});
		}
		await writeAudit({
			workplaceId: input.workplaceId,
			actorProfileId: input.profileId,
			action: "time_off.imported",
			entityType: "time_off_request",
			entityId: null,
			summary: `Imported ${entries.length} leave records (${failures.length} failed)`,
		});
	}

	failures.sort((a, b) => a.line - b.line);
	return {
		dryRun,
		total: records.rows.length + records.errors.length,
		imported: entries.length,
		failed: failures,
		entries,
	};
}

export async function importLeaveBalances(input: {
	workplaceId: string;
	profileId: string;
	csv: string;
	dryRun?: boolean;
}): Promise<LeaveImportResult> {
	const dryRun = input.dryRun ?? false;
	const records = parseLeaveBalancesCsv(input.csv);
	const lookups = await loadWorkplaceLookups(input.workplaceId);
	const failures: ImportFailure[] = [...records.errors];
	const entries: LeaveImportEntry[] = [];

	for (const row of records.rows) {
		try {
			const employment =
				lookups.byEmail.get(row.workerEmail.toLowerCase()) ?? null;
			if (!employment) {
				throw new Error(
					`No active worker with email "${row.workerEmail}" in this Workplace`,
				);
			}
			const leaveType = findLeaveType(lookups, row.leaveType);
			if (!leaveType) {
				throw new Error(`Unknown leave type "${row.leaveType}"`);
			}
			if (!dryRun) {
				await db.transaction(async () => {
					await db
						.insert(ptoBalances)
						.values({
							employmentId: employment.id,
							leaveTypeId: leaveType.id,
							minutes: 0,
						})
						.onConflictDoNothing();
					const [current] = await db
						.select({ minutes: ptoBalances.minutes })
						.from(ptoBalances)
						.where(
							and(
								eq(ptoBalances.employmentId, employment.id),
								eq(ptoBalances.leaveTypeId, leaveType.id),
							),
						)
						.for("update");
					const delta =
						row.mode === "set"
							? row.minutes - (current?.minutes ?? 0)
							: row.minutes;
					if (delta !== 0) {
						const [policy] = await db
							.select()
							.from(leavePolicies)
							.where(eq(leavePolicies.leaveTypeId, leaveType.id))
							.limit(1);
						await applyLeaveLedger({
							workplaceId: input.workplaceId,
							employmentId: employment.id,
							leaveTypeId: leaveType.id,
							kind: "adjustment",
							minutes: delta,
							effectiveDate: row.effectiveDate,
							leaveYearStartMonthDay: policy?.leaveYearStartMonthDay ?? "01-01",
							allowNegative: true,
							note: row.note ?? `CSV balance import (${row.mode})`,
							createdByProfileId: input.profileId,
						});
					}
				});
			}
			entries.push({
				line: row.line,
				workerEmail: employment.email,
				workerName: employment.fullName,
				leaveTypeId: leaveType.id,
				leaveTypeName: leaveType.name,
				startDate: row.effectiveDate,
				endDate: row.effectiveDate,
				allDay: true,
				chargeMinutes: row.minutes,
				status: "approved",
				requestId: null,
				mode: row.mode,
				effectiveDate: row.effectiveDate,
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
			action: "leave.balances_imported",
			entityType: "leave_ledger_entry",
			entityId: null,
			summary: `Imported ${entries.length} leave balances (${failures.length} failed)`,
		});
	}

	failures.sort((a, b) => a.line - b.line);
	return {
		dryRun,
		total: records.rows.length + records.errors.length,
		imported: entries.length,
		failed: failures,
		entries,
	};
}
