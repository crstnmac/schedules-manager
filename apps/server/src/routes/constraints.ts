import {
	db,
	employments,
	leaveRequestApprovals,
	leaveRequestDocuments,
	leaveTypes,
	locations,
	profiles,
	ptoBalances,
	timeOffRequests,
	unavailability,
	workPreferences,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	requirePrivilege,
	requireSession,
	requireWorkplaceMember,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { describeLeaveWindow } from "../leave";
import {
	authorizeApprovalDecision,
	createRequestApprovalSteps,
	decideLeaveRequest,
	expediteLeaveRequest,
	notifyApprovalStep,
	pendingApprovalForRequest,
	restoreApprovedRequestUsage,
} from "../leave-approvals";
import { applyLeaveLedger } from "../leave-ledger";
import { loadEmploymentLeaveContext } from "../leave-policy";
import {
	insertLeaveRequests,
	prepareLeaveRequests,
	type ResolvedLeaveWindow,
} from "../leave-requests";
import { managerEmploymentIds, notifyEmployments, writeAudit } from "../notify";
import { assertWorkplaceEnabled, loadWorkplace } from "../workplace-policy";

const uuid = t.String({ format: "uuid" });
const minuteSchema = t.Integer({ minimum: 0, maximum: 1440 });
const dateSchema = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const leaveWindowFields = {
	startsAt: t.Optional(t.String({ format: "date-time" })),
	endsAt: t.Optional(t.String({ format: "date-time" })),
	startDate: t.Optional(dateSchema),
	endDate: t.Optional(dateSchema),
	allDay: t.Optional(t.Boolean()),
	startMinute: t.Optional(minuteSchema),
	endMinute: t.Optional(minuteSchema),
	reason: t.Optional(t.String({ maxLength: 300 })),
	leaveTypeId: t.Optional(uuid),
};
const leaveWindowBody = t.Object(leaveWindowFields);
const recurrenceSchema = t.Optional(
	t.Object({
		frequency: t.Union([
			t.Literal("weekly"),
			t.Literal("biweekly"),
			t.Literal("monthly"),
		]),
		count: t.Integer({ minimum: 1, maximum: 52 }),
	}),
);

function unavailabilityKey(window: {
	kind: string;
	weekday: number | null;
	specificDate: string | null;
	startMinute: number;
	endMinute: number;
}) {
	return [
		window.kind,
		window.weekday ?? "",
		window.specificDate ?? "",
		window.startMinute,
		window.endMinute,
	].join(":");
}

function assertRange(startMinute: number, endMinute: number) {
	if (startMinute >= endMinute) {
		throw new BadRequestError("Start time must be before end time");
	}
}

async function workplaceTimeZone(workplaceId: string): Promise<string> {
	const [location] = await db
		.select({ timezone: locations.timezone })
		.from(locations)
		.where(eq(locations.workplaceId, workplaceId))
		.limit(1);
	return location?.timezone ?? "America/Chicago";
}

async function loadWorkplaceTimeOff(workplaceId: string, requestId: string) {
	const [row] = await db
		.select({
			request: timeOffRequests,
			workplaceId: employments.workplaceId,
		})
		.from(timeOffRequests)
		.innerJoin(employments, eq(employments.id, timeOffRequests.employmentId))
		.where(eq(timeOffRequests.id, requestId))
		.limit(1);
	if (!row || row.workplaceId !== workplaceId) {
		throw new NotFoundError("Time-off request not found");
	}
	return row.request;
}

export interface ApprovalDto {
	id: string;
	stepOrder: number;
	approverKind: "workplace_managers" | "specific_employment" | "privilege";
	approverEmploymentId: string | null;
	approverPrivilege: string | null;
	status: "pending" | "approved" | "declined" | "skipped" | "escalated";
	decisionReason: string | null;
	decidedAt: string | null;
	dueAt: string | null;
	escalatedAt: string | null;
}

export interface DocumentDto {
	id: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: string;
	uploadedByProfileId: string | null;
}

async function approvalDtosFor(
	requestIds: string[],
): Promise<Map<string, ApprovalDto[]>> {
	const map = new Map<string, ApprovalDto[]>();
	if (requestIds.length === 0) return map;
	const rows = await db
		.select()
		.from(leaveRequestApprovals)
		.where(inArray(leaveRequestApprovals.requestId, requestIds))
		.orderBy(leaveRequestApprovals.stepOrder);
	for (const row of rows) {
		const list = map.get(row.requestId) ?? [];
		list.push({
			id: row.id,
			stepOrder: row.stepOrder,
			approverKind: row.approverKind,
			approverEmploymentId: row.approverEmploymentId,
			approverPrivilege: row.approverPrivilege,
			status: row.status,
			decisionReason: row.decisionReason,
			decidedAt: row.decidedAt?.toISOString() ?? null,
			dueAt: row.dueAt?.toISOString() ?? null,
			escalatedAt: row.escalatedAt?.toISOString() ?? null,
		});
		map.set(row.requestId, list);
	}
	return map;
}

async function documentDtosFor(
	requestIds: string[],
): Promise<Map<string, DocumentDto[]>> {
	const map = new Map<string, DocumentDto[]>();
	if (requestIds.length === 0) return map;
	const rows = await db
		.select()
		.from(leaveRequestDocuments)
		.where(inArray(leaveRequestDocuments.requestId, requestIds))
		.orderBy(leaveRequestDocuments.createdAt);
	for (const row of rows) {
		const list = map.get(row.requestId) ?? [];
		list.push({
			id: row.id,
			fileName: row.fileName,
			mimeType: row.mimeType,
			sizeBytes: row.sizeBytes,
			createdAt: row.createdAt.toISOString(),
			uploadedByProfileId: row.uploadedByProfileId,
		});
		map.set(row.requestId, list);
	}
	return map;
}

function windowDto(window: ResolvedLeaveWindow) {
	return {
		startsAt: window.startsAt.toISOString(),
		endsAt: window.endsAt.toISOString(),
		startDate: window.startDate,
		endDate: window.endDate,
		allDay: window.allDay,
		startMinute: window.startMinute,
		endMinute: window.endMinute,
	};
}

export const constraintsRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Availability"],
})
	.get(
		"/workplaces/:workplaceId/my/constraints",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const timeZone = await workplaceTimeZone(params.workplaceId);
			const [unavailabilityRows, preferenceRows, timeOffRows] =
				await Promise.all([
					db
						.select()
						.from(unavailability)
						.where(eq(unavailability.employmentId, employment.id)),
					db
						.select()
						.from(workPreferences)
						.where(eq(workPreferences.employmentId, employment.id))
						.limit(1),
					db
						.select()
						.from(timeOffRequests)
						.where(eq(timeOffRequests.employmentId, employment.id))
						.orderBy(desc(timeOffRequests.startsAt)),
				]);
			const approvals = await approvalDtosFor(timeOffRows.map((row) => row.id));
			const documents = await documentDtosFor(timeOffRows.map((row) => row.id));

			return {
				timezone: timeZone,
				unavailability: unavailabilityRows.map((row) => ({
					id: row.id,
					kind: row.kind,
					weekday: row.kind === "recurring" ? row.weekday : null,
					date: row.kind === "date" ? row.specificDate : null,
					startMinute: row.startMinute,
					endMinute: row.endMinute,
					note: row.note,
					status: row.status,
				})),
				preference: preferenceRows[0]?.note ?? null,
				timeOff: timeOffRows.map((row) => {
					const window = describeLeaveWindow(
						row.startsAt,
						row.endsAt,
						timeZone,
					);
					const { chargeMinutes: fallbackChargeMinutes, ...windowFields } =
						window;
					return {
						id: row.id,
						startsAt: row.startsAt.toISOString(),
						endsAt: row.endsAt.toISOString(),
						reason: row.reason,
						status: row.status,
						decisionReason: row.decisionReason,
						leaveTypeId: row.leaveTypeId,
						batchId: row.batchId,
						isEmergency: row.isEmergency,
						currentStep: row.currentStep,
						createdAt: row.createdAt.toISOString(),
						cancelledAt: row.cancelledAt?.toISOString() ?? null,
						approvals: approvals.get(row.id) ?? [],
						documents: documents.get(row.id) ?? [],
						...windowFields,
						chargeMinutes: row.chargeMinutes ?? fallbackChargeMinutes,
					};
				}),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary:
					"Return the caller's Unavailability, Work Preference, and Time-off Requests",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/workplaces/:workplaceId/my/unavailability",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const workplace = await loadWorkplace(params.workplaceId);
			const requiresApproval = workplace.unavailabilityRequiresApproval;

			for (const window of [
				...body.recurring.map((item) => ({
					...item,
					kind: "recurring" as const,
				})),
				...body.dates.map((item) => ({ ...item, kind: "date" as const })),
			]) {
				assertRange(window.startMinute, window.endMinute);
			}

			return db.transaction(async (tx) => {
				const submitted = [
					...body.recurring.map((item) => ({
						employmentId: employment.id,
						kind: "recurring" as const,
						weekday: item.weekday,
						specificDate: null as string | null,
						startMinute: item.startMinute,
						endMinute: item.endMinute,
						note: item.note ?? null,
					})),
					...body.dates.map((item) => ({
						employmentId: employment.id,
						kind: "date" as const,
						weekday: null as number | null,
						specificDate: item.date,
						startMinute: item.startMinute,
						endMinute: item.endMinute,
						note: item.note ?? null,
					})),
				];

				if (!requiresApproval) {
					await tx
						.delete(unavailability)
						.where(eq(unavailability.employmentId, employment.id));
					if (submitted.length > 0) {
						await tx.insert(unavailability).values(
							submitted.map((row) => ({
								...row,
								status: "approved" as const,
							})),
						);
					}
					return { saved: submitted.length, pending: 0 };
				}

				const existing = await tx
					.select()
					.from(unavailability)
					.where(eq(unavailability.employmentId, employment.id));
				const approved = existing.filter((row) => row.status === "approved");
				const approvedKeys = new Set(approved.map(unavailabilityKey));
				const submittedKeys = new Set(
					submitted.map((row) =>
						unavailabilityKey({
							kind: row.kind,
							weekday: row.weekday,
							specificDate: row.specificDate,
							startMinute: row.startMinute,
							endMinute: row.endMinute,
						}),
					),
				);

				await tx
					.delete(unavailability)
					.where(
						and(
							eq(unavailability.employmentId, employment.id),
							eq(unavailability.status, "pending"),
						),
					);

				// Replace semantics: approved windows omitted from the payload are
				// removed. Lifting a constraint is the worker's call; only new
				// windows need manager approval.
				const omittedApproved = approved.filter(
					(row) => !submittedKeys.has(unavailabilityKey(row)),
				);
				if (omittedApproved.length > 0) {
					await tx.delete(unavailability).where(
						inArray(
							unavailability.id,
							omittedApproved.map((row) => row.id),
						),
					);
				}

				const pendingRows = submitted.filter(
					(row) =>
						!approvedKeys.has(
							unavailabilityKey({
								kind: row.kind,
								weekday: row.weekday,
								specificDate: row.specificDate,
								startMinute: row.startMinute,
								endMinute: row.endMinute,
							}),
						),
				);
				if (pendingRows.length > 0) {
					await tx.insert(unavailability).values(
						pendingRows.map((row) => ({
							...row,
							status: "pending" as const,
						})),
					);
					await notifyEmployments(
						await managerEmploymentIds(params.workplaceId),
						{
							kind: "unavailability_requested",
							title: "Unavailability needs approval",
							body: "A worker submitted Unavailability that is waiting for approval.",
						},
					);
				}

				return {
					saved: submittedKeys.size,
					pending: pendingRows.length,
				};
			});
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				recurring: t.Array(
					t.Object({
						weekday: t.Integer({ minimum: 0, maximum: 6 }),
						startMinute: minuteSchema,
						endMinute: minuteSchema,
						note: t.Optional(t.String({ maxLength: 200 })),
					}),
					{ maxItems: 50 },
				),
				dates: t.Array(
					t.Object({
						date: dateSchema,
						startMinute: minuteSchema,
						endMinute: minuteSchema,
						note: t.Optional(t.String({ maxLength: 200 })),
					}),
					{ maxItems: 100 },
				),
			}),
			detail: {
				summary:
					"Replace the caller's Unavailability windows with the submitted set",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/unavailability/:unavailabilityId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);

			const [row] = await db
				.select({
					window: unavailability,
					workplaceId: employments.workplaceId,
				})
				.from(unavailability)
				.innerJoin(employments, eq(employments.id, unavailability.employmentId))
				.where(eq(unavailability.id, params.unavailabilityId))
				.limit(1);
			if (!row || row.workplaceId !== params.workplaceId) {
				throw new NotFoundError("Unavailability not found");
			}
			if (row.window.status !== "pending") {
				throw new ConflictError("Only pending Unavailability can be decided");
			}

			if (body.decision === "declined") {
				await db
					.delete(unavailability)
					.where(eq(unavailability.id, row.window.id));
				return { ok: true as const, status: "declined" as const };
			}

			await db
				.update(unavailability)
				.set({ status: "approved" })
				.where(eq(unavailability.id, row.window.id));
			return { ok: true as const, status: "approved" as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, unavailabilityId: uuid }),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
			}),
			detail: {
				summary: "Approve or decline pending Unavailability (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/workplaces/:workplaceId/my/preference",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			if (body.note === null || body.note.trim() === "") {
				await db
					.delete(workPreferences)
					.where(eq(workPreferences.employmentId, employment.id));
				return { preference: null };
			}

			const [existing] = await db
				.select()
				.from(workPreferences)
				.where(eq(workPreferences.employmentId, employment.id))
				.limit(1);

			if (existing) {
				await db
					.update(workPreferences)
					.set({ note: body.note.trim(), updatedAt: new Date() })
					.where(eq(workPreferences.id, existing.id));
			} else {
				await db.insert(workPreferences).values({
					employmentId: employment.id,
					note: body.note.trim(),
				});
			}

			return { preference: body.note.trim() };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				note: t.Union([t.String({ maxLength: 500 }), t.Null()]),
			}),
			detail: {
				summary: "Set or clear the caller's non-binding Work Preference note",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/my/time-off",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			await assertWorkplaceEnabled(
				params.workplaceId,
				"workersCanRequestTimeOff",
				"Workers cannot request time off at this Workplace",
			);

			const windows =
				body.windows && body.windows.length > 0 ? body.windows : [body];
			const prepared = await prepareLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: employment.id,
				windows,
				recurrence: body.recurrence,
				isEmergency: body.isEmergency ?? false,
				batchId: windows.length > 1 ? crypto.randomUUID() : null,
			});
			const created = await insertLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: employment.id,
				profileId: profile.id,
				prepared,
				autoApprove: false,
			});

			const managerIds = await managerEmploymentIds(params.workplaceId);
			await notifyEmployments(managerIds, {
				kind: "time_off_requested",
				title: "Time-off request",
				body: "Someone submitted a time-off request.",
			});
			for (const request of created) {
				const step = await pendingApprovalForRequest(request.id);
				if (step) {
					await notifyApprovalStep({
						workplaceId: params.workplaceId,
						step,
					});
				}
			}
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action:
					created.length > 1
						? "time_off.batch_requested"
						: "time_off.requested",
				entityType: "time_off_request",
				entityId: created[0]?.id ?? null,
				summary:
					created.length > 1
						? `Requested ${created.length} leave windows`
						: "Requested time off",
			});

			return {
				request: created[0]
					? {
							id: created[0].id,
							status: created[0].status,
							...windowDto(created[0].window),
							chargeMinutes: created[0].chargeMinutes,
						}
					: null,
				requests: created.map((request) => ({
					id: request.id,
					status: request.status,
					batchId: request.batchId,
					chargeMinutes: request.chargeMinutes,
					...windowDto(request.window),
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				...leaveWindowFields,
				windows: t.Optional(t.Array(leaveWindowBody, { maxItems: 30 })),
				recurrence: recurrenceSchema,
				isEmergency: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Submit one or more Time-off Requests",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/my/time-off/batch",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			await assertWorkplaceEnabled(
				params.workplaceId,
				"workersCanRequestTimeOff",
				"Workers cannot request time off at this Workplace",
			);
			const prepared = await prepareLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: employment.id,
				windows: body.windows,
				recurrence: body.recurrence,
				isEmergency: body.isEmergency ?? false,
				batchId: crypto.randomUUID(),
			});
			const created = await insertLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: employment.id,
				profileId: profile.id,
				prepared,
				autoApprove: false,
			});
			await notifyEmployments(await managerEmploymentIds(params.workplaceId), {
				kind: "time_off_requested",
				title: "Bulk time-off request",
				body: `A worker requested ${created.length} leave windows.`,
			});
			return {
				batchId: prepared[0]?.batchId ?? null,
				requests: created.map((request) => ({
					id: request.id,
					status: request.status,
					...windowDto(request.window),
					chargeMinutes: request.chargeMinutes,
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				windows: t.Array(leaveWindowBody, { minItems: 1, maxItems: 30 }),
				recurrence: recurrenceSchema,
				isEmergency: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Submit a batch or recurring set of Time-off Requests",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/my/time-off/:requestId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);

			const [request] = await db
				.select()
				.from(timeOffRequests)
				.where(
					and(
						eq(timeOffRequests.id, params.requestId),
						eq(timeOffRequests.employmentId, employment.id),
					),
				)
				.limit(1);

			if (!request) throw new NotFoundError("Time-off request not found");
			if (request.status !== "pending") {
				throw new ConflictError("Only pending requests can be cancelled");
			}

			await db
				.delete(timeOffRequests)
				.where(eq(timeOffRequests.id, request.id));

			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			detail: {
				summary: "Cancel a pending Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/my/time-off/:requestId/cancel",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [request] = await db
				.select()
				.from(timeOffRequests)
				.where(
					and(
						eq(timeOffRequests.id, params.requestId),
						eq(timeOffRequests.employmentId, employment.id),
					),
				)
				.limit(1);
			if (!request) throw new NotFoundError("Time-off request not found");
			if (request.status === "declined" || request.status === "cancelled") {
				throw new ConflictError("This request is already closed");
			}

			if (request.status === "pending") {
				await db
					.delete(timeOffRequests)
					.where(eq(timeOffRequests.id, request.id));
				return { ok: true as const, status: "cancelled" as const };
			}

			await db.transaction(async () => {
				await restoreApprovedRequestUsage({
					workplaceId: params.workplaceId,
					request,
					profileId: profile.id,
					note: "Cancelled by the worker",
				});
				await db
					.update(timeOffRequests)
					.set({ status: "cancelled", cancelledAt: new Date() })
					.where(eq(timeOffRequests.id, request.id));
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.cancelled",
				entityType: "time_off_request",
				entityId: request.id,
				summary: "Worker cancelled approved time off",
			});
			return { ok: true as const, status: "cancelled" as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			detail: {
				summary: "Cancel a pending or approved Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/time-off",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const timeZone = await workplaceTimeZone(params.workplaceId);

			const rows = await db
				.select({
					request: timeOffRequests,
					email: profiles.email,
					fullName: profiles.fullName,
					kind: employments.kind,
					leaveTypeName: leaveTypes.name,
					leaveTypePaid: leaveTypes.paid,
					remainingMinutes: ptoBalances.minutes,
				})
				.from(timeOffRequests)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.leftJoin(leaveTypes, eq(leaveTypes.id, timeOffRequests.leaveTypeId))
				.leftJoin(
					ptoBalances,
					and(
						eq(ptoBalances.employmentId, timeOffRequests.employmentId),
						eq(ptoBalances.leaveTypeId, timeOffRequests.leaveTypeId),
					),
				)
				.where(eq(employments.workplaceId, params.workplaceId))
				.orderBy(desc(timeOffRequests.startsAt));

			// Per-worker timezone: each request resolves against the calendar of
			// the requester's first scoped location, not the workplace's first
			// location.
			const scopeRows = await db
				.select({
					employmentId: employments.id,
					timezone: locations.timezone,
				})
				.from(employments)
				.innerJoin(
					locations,
					eq(locations.workplaceId, employments.workplaceId),
				)
				.where(eq(employments.workplaceId, params.workplaceId));
			const tzByEmployment = new Map<string, string>();
			for (const row of scopeRows) {
				if (!tzByEmployment.has(row.employmentId)) {
					tzByEmployment.set(row.employmentId, row.timezone);
				}
			}

			const pendingUnavailability = await db
				.select({
					window: unavailability,
					email: profiles.email,
					fullName: profiles.fullName,
					employmentId: unavailability.employmentId,
				})
				.from(unavailability)
				.innerJoin(employments, eq(employments.id, unavailability.employmentId))
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(
					and(
						eq(employments.workplaceId, params.workplaceId),
						eq(unavailability.status, "pending"),
					),
				);

			const approvals = await approvalDtosFor(
				rows.map((row) => row.request.id),
			);
			const documents = await documentDtosFor(
				rows.map((row) => row.request.id),
			);

			const requests = [];
			for (const row of rows) {
				const window = describeLeaveWindow(
					row.request.startsAt,
					row.request.endsAt,
					tzByEmployment.get(row.request.employmentId) ?? timeZone,
				);
				const { chargeMinutes: fallbackChargeMinutes, ...windowFields } =
					window;
				const approvalsForRequest = approvals.get(row.request.id) ?? [];
				const current = approvalsForRequest.find(
					(approval) =>
						approval.status === "pending" || approval.status === "escalated",
				);
				const canDecide = current
					? (
							await authorizeApprovalDecision({
								profileId: profile.id,
								workplaceId: params.workplaceId,
								approval: current,
							})
						).allowed
					: false;
				requests.push({
					id: row.request.id,
					employmentId: row.request.employmentId,
					kind: row.kind,
					worker: { email: row.email, fullName: row.fullName },
					startsAt: row.request.startsAt.toISOString(),
					endsAt: row.request.endsAt.toISOString(),
					reason: row.request.reason,
					status: row.request.status,
					decisionReason: row.request.decisionReason,
					decidedAt: row.request.decidedAt?.toISOString() ?? null,
					cancelledAt: row.request.cancelledAt?.toISOString() ?? null,
					createdAt: row.request.createdAt.toISOString(),
					leaveTypeId: row.request.leaveTypeId,
					leaveTypeName: row.leaveTypeName,
					leaveTypePaid: row.leaveTypePaid ?? null,
					remainingMinutes: row.remainingMinutes ?? 0,
					chargeMinutes: row.request.chargeMinutes ?? fallbackChargeMinutes,
					deductedMinutes: row.request.deductedMinutes,
					batchId: row.request.batchId,
					isEmergency: row.request.isEmergency,
					currentStep: row.request.currentStep,
					approvals: approvalsForRequest,
					documents: documents.get(row.request.id) ?? [],
					canDecide,
					...windowFields,
				});
			}

			return {
				timezone: timeZone,
				pendingUnavailability: pendingUnavailability.map((row) => ({
					id: row.window.id,
					employmentId: row.employmentId,
					worker: { email: row.email, fullName: row.fullName },
					kind: row.window.kind,
					weekday: row.window.weekday,
					date: row.window.specificDate,
					startMinute: row.window.startMinute,
					endMinute: row.window.endMinute,
					note: row.window.note,
					status: row.window.status,
				})),
				requests,
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "List Time-off Requests for the Workplace (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/my/pending-approvals",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const rows = await db
				.select({
					request: timeOffRequests,
					approval: leaveRequestApprovals,
					email: profiles.email,
					fullName: profiles.fullName,
					leaveTypeName: leaveTypes.name,
					remainingMinutes: ptoBalances.minutes,
				})
				.from(timeOffRequests)
				.innerJoin(
					leaveRequestApprovals,
					and(
						eq(leaveRequestApprovals.requestId, timeOffRequests.id),
						eq(leaveRequestApprovals.stepOrder, timeOffRequests.currentStep),
						inArray(leaveRequestApprovals.status, ["pending", "escalated"]),
					),
				)
				.innerJoin(
					employments,
					eq(employments.id, timeOffRequests.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.leftJoin(leaveTypes, eq(leaveTypes.id, timeOffRequests.leaveTypeId))
				.leftJoin(
					ptoBalances,
					and(
						eq(ptoBalances.employmentId, timeOffRequests.employmentId),
						eq(ptoBalances.leaveTypeId, timeOffRequests.leaveTypeId),
					),
				)
				.where(
					and(
						eq(employments.workplaceId, params.workplaceId),
						eq(timeOffRequests.status, "pending"),
					),
				);

			const pending = [];
			for (const row of rows) {
				const authorization = await authorizeApprovalDecision({
					profileId: profile.id,
					workplaceId: params.workplaceId,
					approval: row.approval,
				});
				if (!authorization.allowed) continue;
				const window = describeLeaveWindow(
					row.request.startsAt,
					row.request.endsAt,
					await workplaceTimeZone(params.workplaceId),
				);
				const { chargeMinutes: fallbackChargeMinutes, ...windowFields } =
					window;
				pending.push({
					requestId: row.request.id,
					approvalId: row.approval.id,
					stepOrder: row.approval.stepOrder,
					dueAt: row.approval.dueAt?.toISOString() ?? null,
					escalatedAt: row.approval.escalatedAt?.toISOString() ?? null,
					via: authorization.via,
					worker: { email: row.email, fullName: row.fullName },
					leaveTypeName: row.leaveTypeName,
					remainingMinutes: row.remainingMinutes ?? 0,
					chargeMinutes: row.request.chargeMinutes ?? fallbackChargeMinutes,
					isEmergency: row.request.isEmergency,
					reason: row.request.reason,
					...windowFields,
				});
			}
			return { pending };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			detail: {
				summary: "Leave approval steps waiting on the caller (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);

			const [member] = await db
				.select({
					id: employments.id,
					workplaceId: employments.workplaceId,
					kind: employments.kind,
					status: employments.status,
				})
				.from(employments)
				.where(eq(employments.id, body.employmentId))
				.limit(1);
			if (
				!member ||
				member.workplaceId !== params.workplaceId ||
				member.status !== "active"
			) {
				throw new NotFoundError("Employment not found");
			}

			const windows =
				body.windows && body.windows.length > 0 ? body.windows : [body];
			const prepared = await prepareLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: member.id,
				windows,
				recurrence: body.recurrence,
				isEmergency: body.isEmergency ?? false,
				autoApprove: true,
				batchId: windows.length > 1 ? crypto.randomUUID() : null,
			});
			const created = await insertLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: member.id,
				profileId: profile.id,
				prepared,
				autoApprove: true,
			});

			await notifyEmployments([member.id], {
				kind: "time_off_approved",
				title: "Time off recorded",
				body:
					windows[0]?.reason?.trim() ||
					"Your manager recorded time off on the schedule.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.recorded",
				entityType: "time_off_request",
				entityId: created[0]?.id ?? null,
				summary: "Recorded approved time off for a worker",
			});

			return {
				request: created[0]
					? {
							id: created[0].id,
							status: created[0].status,
							...windowDto(created[0].window),
							chargeMinutes: created[0].chargeMinutes,
						}
					: null,
				requests: created.map((request) => ({
					id: request.id,
					status: request.status,
					...windowDto(request.window),
					chargeMinutes: request.chargeMinutes,
				})),
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				employmentId: uuid,
				...leaveWindowFields,
				windows: t.Optional(t.Array(leaveWindowBody, { maxItems: 30 })),
				recurrence: recurrenceSchema,
				isEmergency: t.Optional(t.Boolean()),
			}),
			detail: {
				summary: "Record approved time off for a worker (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off/:requestId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const result = await decideLeaveRequest({
				workplaceId: params.workplaceId,
				requestId: params.requestId,
				profileId: profile.id,
				decision: body.decision,
				reason: body.reason ?? null,
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: `time_off.${result.status === "pending" ? "step_approved" : result.status}`,
				entityType: "time_off_request",
				entityId: params.requestId,
				summary: `Leave approval step ${result.stepOrder}: ${result.status}`,
			});
			return {
				request: { id: params.requestId, status: result.status },
				completed: result.completed,
				stepOrder: result.stepOrder,
				via: result.via,
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
			detail: {
				summary: "Decide the current approval step of a Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off/:requestId/approvals/:approvalId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requireWorkplaceMember(profile.id, params.workplaceId);
			const result = await decideLeaveRequest({
				workplaceId: params.workplaceId,
				requestId: params.requestId,
				approvalId: params.approvalId,
				profileId: profile.id,
				decision: body.decision,
				reason: body.reason ?? null,
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: `time_off.${result.status === "pending" ? "step_approved" : result.status}`,
				entityType: "time_off_request",
				entityId: params.requestId,
				summary: `Leave approval step ${result.stepOrder}: ${result.status}`,
			});
			return {
				request: { id: params.requestId, status: result.status },
				completed: result.completed,
				stepOrder: result.stepOrder,
				via: result.via,
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({
				workplaceId: uuid,
				requestId: uuid,
				approvalId: uuid,
			}),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
			detail: {
				summary: "Decide a specific approval step of a Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off/:requestId/expedite",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const result = await expediteLeaveRequest({
				workplaceId: params.workplaceId,
				requestId: params.requestId,
				profileId: profile.id,
				reason: body.reason,
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.expedited",
				entityType: "time_off_request",
				entityId: params.requestId,
				summary: `Emergency leave approved: ${body.reason}`,
			});
			return {
				request: { id: params.requestId, status: result.status },
				completed: result.completed,
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			body: t.Object({ reason: t.String({ minLength: 1, maxLength: 300 }) }),
			detail: {
				summary: "Emergency-override the remaining approval steps (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/time-off/bulk-decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			let approved = 0;
			let declined = 0;
			let pending = 0;
			const failed: { requestId: string; message: string }[] = [];
			for (const requestId of body.requestIds) {
				try {
					const result = await decideLeaveRequest({
						workplaceId: params.workplaceId,
						requestId,
						profileId: profile.id,
						decision: body.decision,
						reason: body.reason ?? null,
					});
					if (result.status === "approved") approved += 1;
					else if (result.status === "declined") declined += 1;
					else pending += 1;
				} catch (error) {
					failed.push({
						requestId,
						message: error instanceof Error ? error.message : "Failed",
					});
				}
			}
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: `time_off.bulk_${body.decision}`,
				entityType: "time_off_request",
				entityId: null,
				summary: `Bulk ${body.decision}: ${approved + declined} applied, ${failed.length} failed`,
			});
			return { approved, declined, pending, failed };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				requestIds: t.Array(uuid, { minItems: 1, maxItems: 100 }),
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
				reason: t.Optional(t.String({ maxLength: 300 })),
			}),
			detail: {
				summary: "Decide many Time-off Requests at once (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/workplaces/:workplaceId/time-off/:requestId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const existing = await loadWorkplaceTimeOff(
				params.workplaceId,
				params.requestId,
			);
			if (existing.status === "declined" || existing.status === "cancelled") {
				throw new ConflictError(
					"Closed leave cannot be edited. Delete it and create a new request.",
				);
			}

			const windows =
				body.windows && body.windows.length > 0 ? body.windows : [body];
			const [prepared] = await prepareLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: existing.employmentId,
				windows: [windows[0] as (typeof windows)[number]],
				autoApprove: existing.status === "approved",
			});
			if (!prepared) throw new BadRequestError("Add a leave window");
			const next = prepared.window;
			const nextLeaveTypeId =
				body.leaveTypeId === undefined
					? existing.leaveTypeId
					: body.leaveTypeId;
			const nextReason =
				body.reason === undefined
					? existing.reason
					: body.reason.trim() || null;

			await db.transaction(async () => {
				if (existing.status === "approved" && existing.leaveTypeId) {
					const context = await loadEmploymentLeaveContext({
						workplaceId: params.workplaceId,
						employmentId: existing.employmentId,
						leaveTypeId: existing.leaveTypeId,
					});
					const previousFallback = describeLeaveWindow(
						existing.startsAt,
						existing.endsAt,
						context.timeZone,
					).chargeMinutes;
					const previousActual = existing.deductedMinutes ?? previousFallback;
					if (previousActual > 0) {
						await applyLeaveLedger({
							workplaceId: params.workplaceId,
							employmentId: existing.employmentId,
							leaveTypeId: existing.leaveTypeId,
							kind: "restoration",
							minutes: previousActual,
							effectiveDate: describeLeaveWindow(
								existing.startsAt,
								existing.endsAt,
								context.timeZone,
							).startDate,
							leaveYearStartMonthDay:
								context.policy?.leaveYearStartMonthDay ?? "01-01",
							requestId: existing.id,
							createdByProfileId: profile.id,
							note: "Restored before editing approved leave",
						});
					}
				}

				await db
					.update(timeOffRequests)
					.set({
						startsAt: next.startsAt,
						endsAt: next.endsAt,
						leaveTypeId: nextLeaveTypeId,
						reason: nextReason,
						chargeMinutes: prepared.chargeMinutes,
						updatedAt: new Date(),
					})
					.where(eq(timeOffRequests.id, existing.id));
				if (existing.status === "approved" && nextLeaveTypeId) {
					const applied = await applyLeaveLedger({
						workplaceId: params.workplaceId,
						employmentId: existing.employmentId,
						leaveTypeId: nextLeaveTypeId,
						kind: "usage",
						minutes: -Math.abs(prepared.chargeMinutes),
						effectiveDate: next.startDate,
						leaveYearStartMonthDay:
							prepared.policy?.leaveYearStartMonthDay ?? "01-01",
						allowNegative: prepared.policy?.allowNegative ?? false,
						maxNegativeMinutes: prepared.policy?.maxNegativeMinutes ?? 0,
						requestId: existing.id,
						createdByProfileId: profile.id,
						note: "Edited approved leave",
					});
					await db
						.update(timeOffRequests)
						.set({ deductedMinutes: -applied.appliedMinutes })
						.where(eq(timeOffRequests.id, existing.id));
				}
				if (existing.status === "pending") {
					// Rebuild the approval chain when the type or window changed.
					await db
						.delete(leaveRequestApprovals)
						.where(eq(leaveRequestApprovals.requestId, existing.id));
					await rebuildApprovalSteps({
						workplaceId: params.workplaceId,
						requestId: existing.id,
						leaveTypeId: nextLeaveTypeId,
						employmentId: existing.employmentId,
					});
					await db
						.update(timeOffRequests)
						.set({ currentStep: 0 })
						.where(eq(timeOffRequests.id, existing.id));
				}
			});

			const updated = await loadWorkplaceTimeOff(
				params.workplaceId,
				existing.id,
			);
			const timeZone = await workplaceTimeZone(params.workplaceId);
			await notifyEmployments([existing.employmentId], {
				kind: "time_off_approved",
				title: "Time off updated",
				body: "Your manager updated a time-off entry.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.updated",
				entityType: "time_off_request",
				entityId: updated.id,
				summary: "Updated a time-off entry",
			});

			return {
				request: {
					id: updated.id,
					status: updated.status,
					startsAt: updated.startsAt.toISOString(),
					endsAt: updated.endsAt.toISOString(),
					...describeLeaveWindow(updated.startsAt, updated.endsAt, timeZone),
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			body: t.Object({
				...leaveWindowFields,
				windows: t.Optional(t.Array(leaveWindowBody, { maxItems: 2 })),
			}),
			detail: {
				summary: "Edit a Time-off Request (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/time-off/:requestId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(
				profile.id,
				params.workplaceId,
				"approvals.review",
			);
			const existing = await loadWorkplaceTimeOff(
				params.workplaceId,
				params.requestId,
			);
			await db.transaction(async () => {
				if (existing.status === "approved") {
					await restoreApprovedRequestUsage({
						workplaceId: params.workplaceId,
						request: existing,
						profileId: profile.id,
						note: "Removed by a manager",
					});
				}
				await db
					.delete(timeOffRequests)
					.where(eq(timeOffRequests.id, existing.id));
			});

			await notifyEmployments([existing.employmentId], {
				kind: "time_off_declined",
				title: "Time off removed",
				body: "Your manager removed a time-off entry.",
			});
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "time_off.deleted",
				entityType: "time_off_request",
				entityId: existing.id,
				summary: "Deleted a time-off entry",
			});

			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			detail: {
				summary: "Delete a Time-off Request (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/workplaces/:workplaceId/my/time-off/:requestId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			const employment = await requireWorkplaceMember(
				profile.id,
				params.workplaceId,
			);
			const [existing] = await db
				.select()
				.from(timeOffRequests)
				.where(
					and(
						eq(timeOffRequests.id, params.requestId),
						eq(timeOffRequests.employmentId, employment.id),
					),
				)
				.limit(1);
			if (!existing) throw new NotFoundError("Time-off request not found");
			if (existing.status !== "pending") {
				throw new ConflictError("Only pending requests can be edited");
			}

			const windows =
				body.windows && body.windows.length > 0 ? body.windows : [body];
			const [prepared] = await prepareLeaveRequests({
				workplaceId: params.workplaceId,
				employmentId: employment.id,
				windows: [windows[0] as (typeof windows)[number]],
			});
			if (!prepared) throw new BadRequestError("Add a leave window");
			const next = prepared.window;
			const nextLeaveTypeId =
				body.leaveTypeId === undefined
					? existing.leaveTypeId
					: body.leaveTypeId;

			await db.transaction(async () => {
				await db
					.update(timeOffRequests)
					.set({
						startsAt: next.startsAt,
						endsAt: next.endsAt,
						leaveTypeId: nextLeaveTypeId,
						reason:
							body.reason === undefined
								? existing.reason
								: body.reason.trim() || null,
						chargeMinutes: prepared.chargeMinutes,
						updatedAt: new Date(),
					})
					.where(eq(timeOffRequests.id, existing.id));
				await db
					.delete(leaveRequestApprovals)
					.where(eq(leaveRequestApprovals.requestId, existing.id));
				await rebuildApprovalSteps({
					workplaceId: params.workplaceId,
					requestId: existing.id,
					leaveTypeId: nextLeaveTypeId,
					employmentId: employment.id,
				});
				await db
					.update(timeOffRequests)
					.set({ currentStep: 0 })
					.where(eq(timeOffRequests.id, existing.id));
			});

			return {
				request: {
					id: existing.id,
					status: existing.status,
					...windowDto(next),
					chargeMinutes: prepared.chargeMinutes,
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, requestId: uuid }),
			body: t.Object({
				...leaveWindowFields,
				windows: t.Optional(t.Array(leaveWindowBody, { maxItems: 2 })),
			}),
			detail: {
				summary: "Edit a pending Time-off Request",
				security: [{ bearerAuth: [] }],
			},
		},
	);

async function rebuildApprovalSteps(input: {
	workplaceId: string;
	requestId: string;
	leaveTypeId: string | null;
	employmentId: string;
}): Promise<void> {
	await createRequestApprovalSteps({
		requestId: input.requestId,
		workplaceId: input.workplaceId,
		leaveTypeId: input.leaveTypeId,
	});
	const step = await pendingApprovalForRequest(input.requestId);
	if (step) {
		await notifyApprovalStep({ workplaceId: input.workplaceId, step });
	}
}
