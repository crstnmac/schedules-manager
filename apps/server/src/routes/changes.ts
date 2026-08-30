import {
	db,
	employments,
	locations,
	profiles,
	schedules as schedulesTable,
	scheduleVersions,
	shiftAcceptances,
	shifts,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
	listActiveEmployments,
	requireManager,
	requireSession,
} from "../context";
import { NotFoundError } from "../errors";
import { managerEmploymentIds, notifyEmployments } from "../notify";
import { firstRow } from "../rows";

interface DiffableShift {
	id: string;
	employmentId: string | null;
	positionId: string;
	startsAt: Date;
	endsAt: Date;
	note: string | null;
}

export interface ChangeItem {
	kind: "added" | "removed" | "time_changed" | "note_changed";
	material: boolean;
	employmentId: string | null;
	summary: string;
	draftShiftId?: string;
}

function formatRange(start: Date, end: Date, timeZone: string): string {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
	return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function diffShiftSets(
	previous: DiffableShift[],
	next: DiffableShift[],
	timeZone: string,
): ChangeItem[] {
	const changes: ChangeItem[] = [];
	const previousByEmployment = new Map<string, DiffableShift[]>();
	const nextByEmployment = new Map<string, DiffableShift[]>();

	for (const shift of previous) {
		const key = shift.employmentId ?? "open";
		const list = previousByEmployment.get(key) ?? [];
		list.push(shift);
		previousByEmployment.set(key, list);
	}
	for (const shift of next) {
		const key = shift.employmentId ?? "open";
		const list = nextByEmployment.get(key) ?? [];
		list.push(shift);
		nextByEmployment.set(key, list);
	}
	for (const list of previousByEmployment.values()) {
		list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
	}
	for (const list of nextByEmployment.values()) {
		list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
	}

	const keys = new Set([
		...previousByEmployment.keys(),
		...nextByEmployment.keys(),
	]);

	for (const key of keys) {
		if (key === "open") continue;
		const before = previousByEmployment.get(key) ?? [];
		const after = nextByEmployment.get(key) ?? [];
		const usedBefore = new Set<string>();
		const matchedAfter = new Set<string>();

		for (const candidate of after) {
			const match = before.find(
				(other) =>
					!usedBefore.has(other.id) &&
					other.positionId === candidate.positionId,
			);
			if (!match) continue;
			usedBefore.add(match.id);
			matchedAfter.add(candidate.id);

			const sameTimes =
				match.startsAt.getTime() === candidate.startsAt.getTime() &&
				match.endsAt.getTime() === candidate.endsAt.getTime();
			const sameNote = (match.note ?? null) === (candidate.note ?? null);

			if (!sameTimes) {
				changes.push({
					kind: "time_changed",
					material: true,
					employmentId: candidate.employmentId,
					summary: `Shift moved: was ${formatRange(match.startsAt, match.endsAt, timeZone)}, now ${formatRange(candidate.startsAt, candidate.endsAt, timeZone)}`,
					draftShiftId: candidate.id,
				});
			} else if (!sameNote) {
				changes.push({
					kind: "note_changed",
					material: false,
					employmentId: candidate.employmentId,
					summary: "Shift note updated",
					draftShiftId: candidate.id,
				});
			}
		}

		for (const candidate of after) {
			if (!matchedAfter.has(candidate.id) && candidate.employmentId) {
				changes.push({
					kind: "added",
					material: true,
					employmentId: candidate.employmentId,
					summary: `New shift: ${formatRange(candidate.startsAt, candidate.endsAt, timeZone)}`,
					draftShiftId: candidate.id,
				});
			}
		}

		for (const candidateBefore of before) {
			if (!usedBefore.has(candidateBefore.id)) {
				changes.push({
					kind: "removed",
					material: true,
					employmentId: candidateBefore.employmentId,
					summary: `Shift removed: ${formatRange(candidateBefore.startsAt, candidateBefore.endsAt, timeZone)}`,
				});
			}
		}
	}

	return changes;
}

export async function latestVersionWithShifts(scheduleId: string) {
	const [latest] = await db
		.select()
		.from(scheduleVersions)
		.where(eq(scheduleVersions.scheduleId, scheduleId))
		.orderBy(desc(scheduleVersions.versionNumber))
		.limit(1);
	if (!latest) {
		return {
			version: null as null | typeof latest,
			shifts: [] as DiffableShift[],
		};
	}

	const rows = await db
		.select()
		.from(versionShifts)
		.where(eq(versionShifts.versionId, latest.id));

	return {
		version: latest,
		shifts: rows.map((shift) => ({
			id: shift.id,
			employmentId: shift.employmentId,
			positionId: shift.positionId,
			startsAt: shift.startsAt,
			endsAt: shift.endsAt,
			note: shift.note,
		})),
	};
}

async function scheduleContext(scheduleId: string) {
	const [row] = await db
		.select({ location: locations, workplace: workplaces })
		.from(schedulesTable)
		.innerJoin(locations, eq(locations.id, schedulesTable.locationId))
		.innerJoin(workplaces, eq(workplaces.id, locations.workplaceId))
		.where(eq(schedulesTable.id, scheduleId))
		.limit(1);
	if (!row) throw new NotFoundError("Schedule not found");
	return row;
}

async function respondToAcceptance(
	authorization: string | undefined,
	acceptanceId: string,
	decision: "accepted" | "declined",
) {
	const { profile } = await requireSession(authorization);
	const memberships = await listActiveEmployments(profile.id);
	const employmentIds = memberships.map((row) => row.employment.id);

	const placeholder = "00000000-0000-0000-0000-000000000000";
	const [acceptance] = await db
		.select()
		.from(shiftAcceptances)
		.where(
			and(
				eq(shiftAcceptances.id, acceptanceId),
				employmentIds.length > 0
					? inArray(shiftAcceptances.employmentId, employmentIds)
					: eq(shiftAcceptances.employmentId, placeholder),
			),
		)
		.limit(1);

	if (!acceptance) throw new NotFoundError("Acceptance request not found");
	if (acceptance.status !== "pending") {
		return { status: acceptance.status };
	}

	const updated = firstRow(
		await db
			.update(shiftAcceptances)
			.set({ status: decision, respondedAt: new Date() })
			.where(eq(shiftAcceptances.id, acceptance.id))
			.returning(),
	);

	const [employment] = await db
		.select({ workplaceId: employments.workplaceId })
		.from(employments)
		.where(eq(employments.id, acceptance.employmentId))
		.limit(1);
	if (employment) {
		await notifyEmployments(
			await managerEmploymentIds(employment.workplaceId),
			{
				kind: "acceptance_response",
				title:
					decision === "accepted"
						? "Worker accepted a late change"
						: "Worker declined a late change",
				body: acceptance.changeSummary,
			},
		);
	}

	return { status: updated.status };
}

export const changesRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Changes"],
})
	.get(
		"/schedules/:scheduleId/change-preview",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const { location, workplace } = await scheduleContext(params.scheduleId);
			await requireManager(profile.id, location.workplaceId);

			const previous = await latestVersionWithShifts(params.scheduleId);
			const draftRows = await db
				.select()
				.from(shifts)
				.where(eq(shifts.scheduleId, params.scheduleId));

			const changes = diffShiftSets(
				previous.shifts,
				draftRows.map((shift) => ({
					id: shift.id,
					employmentId: shift.employmentId,
					positionId: shift.positionId,
					startsAt: shift.startsAt,
					endsAt: shift.endsAt,
					note: shift.note,
				})),
				location.timezone,
			);

			const now = Date.now();
			const noticeMs = workplace.noticeWindowHours * 3_600_000;
			const draftById = new Map(draftRows.map((shift) => [shift.id, shift]));
			const wouldRequireAcceptance = changes.filter(
				(change) =>
					change.material &&
					change.draftShiftId !== undefined &&
					(() => {
						const shift = draftById.get(change.draftShiftId ?? "");
						return shift ? shift.startsAt.getTime() - now < noticeMs : false;
					})(),
			).length;

			return {
				hasPublishedVersion: previous.version !== null,
				noticeWindowHours: workplace.noticeWindowHours,
				changes,
				materialCount: changes.filter((change) => change.material).length,
				wouldRequireAcceptance,
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ scheduleId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Server-generated Schedule Change preview between the latest published version and the current draft (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/schedules/:scheduleId/acceptances",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const { location } = await scheduleContext(params.scheduleId);
			await requireManager(profile.id, location.workplaceId);

			const versionRows = await db
				.select()
				.from(scheduleVersions)
				.where(eq(scheduleVersions.scheduleId, params.scheduleId))
				.orderBy(desc(scheduleVersions.versionNumber))
				.limit(5);

			if (versionRows.length === 0) return { acceptances: [] };

			const rows = await db
				.select({
					acceptance: shiftAcceptances,
					shift: versionShifts,
					versionNumber: scheduleVersions.versionNumber,
					email: profiles.email,
					fullName: profiles.fullName,
				})
				.from(shiftAcceptances)
				.innerJoin(
					versionShifts,
					eq(versionShifts.id, shiftAcceptances.versionShiftId),
				)
				.innerJoin(
					scheduleVersions,
					eq(scheduleVersions.id, shiftAcceptances.versionId),
				)
				.innerJoin(
					employments,
					eq(employments.id, shiftAcceptances.employmentId),
				)
				.innerJoin(profiles, eq(profiles.id, employments.profileId))
				.where(
					inArray(
						shiftAcceptances.versionId,
						versionRows.map((version) => version.id),
					),
				);

			return {
				acceptances: rows
					.map((row) => ({
						id: row.acceptance.id,
						versionNumber: row.versionNumber,
						workerName: row.fullName ?? row.email,
						workerEmail: row.email,
						status: row.acceptance.status,
						changeSummary: row.acceptance.changeSummary,
						shiftStartsAt: row.shift.startsAt.toISOString(),
						respondedAt: row.acceptance.respondedAt?.toISOString() ?? null,
					}))
					.sort((a, b) => a.shiftStartsAt.localeCompare(b.shiftStartsAt)),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ scheduleId: t.String({ format: "uuid" }) }),
			detail: {
				summary:
					"Shift Acceptance state for recent published versions (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/my/shift-acceptances/:acceptanceId/accept",
		async ({ headers, params }) => {
			return respondToAcceptance(
				headers.authorization,
				params.acceptanceId,
				"accepted",
			);
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ acceptanceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Accept a materially changed or newly added Shift",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/my/shift-acceptances/:acceptanceId/decline",
		async ({ headers, params }) => {
			return respondToAcceptance(
				headers.authorization,
				params.acceptanceId,
				"declined",
			);
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ acceptanceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Decline a materially changed Shift (Manager can see this)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
