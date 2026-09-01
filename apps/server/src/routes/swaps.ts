import {
	db,
	employments,
	positions,
	profiles,
	shiftSwaps,
	shifts as shiftsTable,
	versionShifts,
} from "@SchedulesManager/db";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Elysia, t } from "elysia";

import {
	listActiveEmployments,
	requireManager,
	requireSession,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { managerEmploymentIds, notifyEmployments, writeAudit } from "../notify";
import { publishScheduleNow } from "./publication";

const requesterShifts = alias(versionShifts, "requester_shifts");
const counterpartShifts = alias(versionShifts, "counterpart_shifts");
const requesterEmployments = alias(employments, "requester_employments");
const counterpartEmployments = alias(employments, "counterpart_employments");
const requesterProfiles = alias(profiles, "requester_profiles");
const counterpartProfiles = alias(profiles, "counterpart_profiles");
const requesterPositions = alias(positions, "requester_positions");
const counterpartPositions = alias(positions, "counterpart_positions");

type SwapStatusRow = typeof shiftSwaps.$inferSelect;

export interface SwapDetail {
	id: string;
	status: SwapStatusRow["status"];
	requestedAt: string;
	respondedAt: string | null;
	decidedAt: string | null;
	workplaceId: string;
	requester: { employmentId: string; name: string };
	counterpart: { employmentId: string; name: string };
	requesterShift: {
		id: string;
		positionName: string;
		startsAt: string;
		endsAt: string;
	};
	counterpartShift: {
		id: string;
		positionName: string;
		startsAt: string;
		endsAt: string;
	};
}

async function myEmploymentIds(profileId: string): Promise<string[]> {
	const memberships = await listActiveEmployments(profileId);
	return memberships.map((row) => row.employment.id);
}

async function loadSwapDetail(swapId: string): Promise<SwapDetail> {
	const [row] = await db
		.select({
			swap: shiftSwaps,
			workplaceId: requesterEmployments.workplaceId,
			requesterShift: requesterShifts,
			counterpartShift: counterpartShifts,
			requesterName: requesterProfiles.fullName,
			requesterEmail: requesterProfiles.email,
			counterpartName: counterpartProfiles.fullName,
			counterpartEmail: counterpartProfiles.email,
			requesterPositionName: requesterPositions.name,
			counterpartPositionName: counterpartPositions.name,
		})
		.from(shiftSwaps)
		.innerJoin(
			requesterShifts,
			eq(requesterShifts.id, shiftSwaps.requesterShiftId),
		)
		.innerJoin(
			counterpartShifts,
			eq(counterpartShifts.id, shiftSwaps.counterpartShiftId),
		)
		.innerJoin(
			requesterEmployments,
			eq(requesterEmployments.id, shiftSwaps.requesterEmploymentId),
		)
		.innerJoin(
			counterpartEmployments,
			eq(counterpartEmployments.id, shiftSwaps.counterpartEmploymentId),
		)
		.innerJoin(
			requesterProfiles,
			eq(requesterProfiles.id, requesterEmployments.profileId),
		)
		.innerJoin(
			counterpartProfiles,
			eq(counterpartProfiles.id, counterpartEmployments.profileId),
		)
		.innerJoin(
			requesterPositions,
			eq(requesterPositions.id, requesterShifts.positionId),
		)
		.innerJoin(
			counterpartPositions,
			eq(counterpartPositions.id, counterpartShifts.positionId),
		)
		.where(eq(shiftSwaps.id, swapId))
		.limit(1);

	if (!row) throw new NotFoundError("Swap request not found");

	return {
		id: row.swap.id,
		status: row.swap.status,
		requestedAt: row.swap.requestedAt.toISOString(),
		respondedAt: row.swap.respondedAt?.toISOString() ?? null,
		decidedAt: row.swap.decidedAt?.toISOString() ?? null,
		workplaceId: row.workplaceId,
		requester: {
			employmentId: row.swap.requesterEmploymentId,
			name: row.requesterName ?? row.requesterEmail,
		},
		counterpart: {
			employmentId: row.swap.counterpartEmploymentId,
			name: row.counterpartName ?? row.counterpartEmail,
		},
		requesterShift: {
			id: row.requesterShift.id,
			positionName: row.requesterPositionName,
			startsAt: row.requesterShift.startsAt.toISOString(),
			endsAt: row.requesterShift.endsAt.toISOString(),
		},
		counterpartShift: {
			id: row.counterpartShift.id,
			positionName: row.counterpartPositionName,
			startsAt: row.counterpartShift.startsAt.toISOString(),
			endsAt: row.counterpartShift.endsAt.toISOString(),
		},
	};
}

async function draftShiftIdFor(versionShiftId: string): Promise<string | null> {
	const [row] = await db
		.select({ shiftId: versionShifts.shiftId })
		.from(versionShifts)
		.where(eq(versionShifts.id, versionShiftId))
		.limit(1);
	return row?.shiftId ?? null;
}

async function assertNoOverlaps(input: {
	employmentId: string;
	keepDraftShiftId: string | null;
	startsAt: Date;
	endsAt: Date;
}) {
	const conditions = [
		eq(shiftsTable.employmentId, input.employmentId),
		lt(shiftsTable.startsAt, input.endsAt),
		gt(shiftsTable.endsAt, input.startsAt),
	];
	if (input.keepDraftShiftId) {
		conditions.push(ne(shiftsTable.id, input.keepDraftShiftId));
	}
	const [overlap] = await db
		.select({ id: shiftsTable.id })
		.from(shiftsTable)
		.where(and(...conditions))
		.limit(1);
	if (overlap) {
		throw new ConflictError(
			"This swap would create an overlapping shift for a worker",
		);
	}
}

async function assertNoActiveSwapOnShift(versionShiftId: string) {
	const [active] = await db
		.select({ id: shiftSwaps.id })
		.from(shiftSwaps)
		.where(
			and(
				inArray(shiftSwaps.status, ["pending_counterpart", "pending_manager"]),
				ne(shiftSwaps.id, ""),
				eq(shiftSwaps.requesterShiftId, versionShiftId),
			),
		)
		.limit(1);
	if (active) throw new ConflictError("That shift already has a pending swap");
}

async function assertFutureShift(startsAt: Date, label: string) {
	if (startsAt.getTime() <= Date.now()) {
		throw new BadRequestError(`${label} must be a future shift`);
	}
}

export const swapRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Shift Swaps"],
})
	.post(
		"/my/swaps",
		async ({ headers, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const mine = await myEmploymentIds(profile.id);
			if (mine.length === 0) throw new NotFoundError("No active employment");

			const [requesterShift] = await db
				.select({ shift: versionShifts, workplaceId: employments.workplaceId })
				.from(versionShifts)
				.innerJoin(employments, eq(employments.id, versionShifts.employmentId))
				.where(
					and(
						eq(versionShifts.id, body.requesterShiftId),
						eq(employments.profileId, profile.id),
						eq(employments.status, "active"),
					),
				)
				.limit(1);
			if (!requesterShift?.shift.employmentId) {
				throw new NotFoundError("Your shift could not be found");
			}
			await assertFutureShift(requesterShift.shift.startsAt, "Your shift");

			const [counterpartShift] = await db
				.select({ shift: versionShifts, workplaceId: employments.workplaceId })
				.from(versionShifts)
				.innerJoin(employments, eq(employments.id, versionShifts.employmentId))
				.where(
					and(
						eq(versionShifts.id, body.counterpartShiftId),
						eq(employments.id, body.counterpartEmploymentId),
						eq(employments.status, "active"),
					),
				)
				.limit(1);
			if (!counterpartShift?.shift.employmentId) {
				throw new NotFoundError("The coworker shift could not be found");
			}
			if (
				counterpartShift.shift.employmentId ===
				requesterShift.shift.employmentId
			) {
				throw new BadRequestError("Pick a shift from a different coworker");
			}
			if (counterpartShift.workplaceId !== requesterShift.workplaceId) {
				throw new BadRequestError("That coworker is not in this workplace");
			}
			await assertFutureShift(
				counterpartShift.shift.startsAt,
				"The coworker shift",
			);

			await assertNoActiveSwapOnShift(body.requesterShiftId);
			await assertNoActiveSwapOnShift(body.counterpartShiftId);

			const requesterDraftId = await draftShiftIdFor(requesterShift.shift.id);
			const counterpartDraftId = await draftShiftIdFor(
				counterpartShift.shift.id,
			);
			await assertNoOverlaps({
				employmentId: requesterShift.shift.employmentId,
				keepDraftShiftId: requesterDraftId,
				startsAt: counterpartShift.shift.startsAt,
				endsAt: counterpartShift.shift.endsAt,
			});
			await assertNoOverlaps({
				employmentId: counterpartShift.shift.employmentId,
				keepDraftShiftId: counterpartDraftId,
				startsAt: requesterShift.shift.startsAt,
				endsAt: requesterShift.shift.endsAt,
			});

			const [swap] = await db
				.insert(shiftSwaps)
				.values({
					requesterEmploymentId: requesterShift.shift.employmentId,
					requesterShiftId: requesterShift.shift.id,
					counterpartEmploymentId: body.counterpartEmploymentId,
					counterpartShiftId: body.counterpartShiftId,
				})
				.returning();
			if (!swap) throw new ConflictError("Swap could not be created");

			await notifyEmployments([body.counterpartEmploymentId], {
				kind: "swap_request",
				title: "Shift swap request",
				body: `${profile.fullName ?? profile.email} proposed exchanging shifts. Open your schedule to respond.`,
			});
			await writeAudit({
				workplaceId: requesterShift.workplaceId,
				actorProfileId: profile.id,
				action: "swap.proposed",
				entityType: "shift_swap",
				entityId: swap.id,
				summary: "Proposed a shift swap with a coworker",
			});

			return { swap: await loadSwapDetail(swap.id) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			body: t.Object({
				requesterShiftId: t.String({ format: "uuid" }),
				counterpartEmploymentId: t.String({ format: "uuid" }),
				counterpartShiftId: t.String({ format: "uuid" }),
			}),
			detail: {
				summary: "Propose exchanging one of your shifts with a coworker's",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/my/swaps",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const mine = await myEmploymentIds(profile.id);

			const swaps = mine.length
				? await db
						.select({ id: shiftSwaps.id })
						.from(shiftSwaps)
						.innerJoin(
							requesterEmployments,
							eq(requesterEmployments.id, shiftSwaps.requesterEmploymentId),
						)
						.where(
							and(
								eq(requesterEmployments.workplaceId, params.workplaceId),
								inArray(shiftSwaps.requesterEmploymentId, mine),
							),
						)
				: [];
			const incoming = mine.length
				? await db
						.select({ id: shiftSwaps.id })
						.from(shiftSwaps)
						.innerJoin(
							counterpartEmployments,
							eq(counterpartEmployments.id, shiftSwaps.counterpartEmploymentId),
						)
						.where(
							and(
								eq(counterpartEmployments.workplaceId, params.workplaceId),
								inArray(shiftSwaps.counterpartEmploymentId, mine),
							),
						)
				: [];

			const byId = new Map<string, "outgoing" | "incoming">();
			for (const row of swaps) byId.set(row.id, "outgoing");
			for (const row of incoming) {
				if (!byId.has(row.id)) byId.set(row.id, "incoming");
			}

			const detailed = await Promise.all(
				[...byId.entries()].map(async ([id, direction]) => ({
					direction,
					swap: await loadSwapDetail(id),
				})),
			);
			detailed.sort((a, b) =>
				b.swap.requestedAt.localeCompare(a.swap.requestedAt),
			);

			return { swaps: detailed };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Shift swaps you proposed or received",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/my/swaps/:swapId/respond",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const mine = await myEmploymentIds(profile.id);
			const swap = await loadSwapDetail(params.swapId);

			if (swap.status !== "pending_counterpart") {
				throw new ConflictError("This swap is not awaiting a response");
			}
			if (!mine.includes(swap.counterpart.employmentId)) {
				throw new NotFoundError("Swap request not found");
			}

			const accepted = body.decision === "accept";
			await db
				.update(shiftSwaps)
				.set({
					status: accepted ? "pending_manager" : "declined_by_counterpart",
					respondedAt: new Date(),
				})
				.where(eq(shiftSwaps.id, swap.id));

			await notifyEmployments([swap.requester.employmentId], {
				kind: accepted
					? "swap_counterpart_accepted"
					: "swap_counterpart_declined",
				title: accepted
					? "Swap accepted — awaiting manager approval"
					: "Swap declined",
				body: accepted
					? `${swap.counterpart.name} agreed to the swap. A manager can now approve it.`
					: `${swap.counterpart.name} declined the swap. You keep your shift.`,
			});
			if (accepted) {
				await notifyEmployments(await managerEmploymentIds(swap.workplaceId), {
					kind: "swap_request",
					title: "Shift swap needs approval",
					body: `${swap.requester.name} and ${swap.counterpart.name} agreed to exchange shifts.`,
				});
			}
			await writeAudit({
				workplaceId: swap.workplaceId,
				actorProfileId: profile.id,
				action: accepted
					? "swap.counterpart_accepted"
					: "swap.counterpart_declined",
				entityType: "shift_swap",
				entityId: swap.id,
				summary: accepted
					? "Counterpart accepted a shift swap"
					: "Counterpart declined a shift swap",
			});

			return { swap: await loadSwapDetail(swap.id) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ swapId: t.String({ format: "uuid" }) }),
			body: t.Object({
				decision: t.Union([t.Literal("accept"), t.Literal("decline")]),
			}),
			detail: {
				summary: "Accept or decline a swap proposed to you (Counterpart)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/my/swaps/:swapId/cancel",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			const mine = await myEmploymentIds(profile.id);
			const swap = await loadSwapDetail(params.swapId);

			if (!mine.includes(swap.requester.employmentId)) {
				throw new NotFoundError("Swap request not found");
			}
			if (
				swap.status !== "pending_counterpart" &&
				swap.status !== "pending_manager"
			) {
				throw new ConflictError("This swap can no longer be cancelled");
			}

			await db
				.update(shiftSwaps)
				.set({ status: "cancelled", decidedAt: new Date() })
				.where(eq(shiftSwaps.id, swap.id));
			await notifyEmployments([swap.counterpart.employmentId], {
				kind: "swap_cancelled",
				title: "Swap cancelled",
				body: `${swap.requester.name} cancelled the swap request.`,
			});

			return { swap: await loadSwapDetail(swap.id) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ swapId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Cancel a swap you proposed",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId/coverage/swaps",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const rows = await db
				.select({ id: shiftSwaps.id })
				.from(shiftSwaps)
				.innerJoin(
					requesterEmployments,
					eq(requesterEmployments.id, shiftSwaps.requesterEmploymentId),
				)
				.where(
					and(
						eq(requesterEmployments.workplaceId, params.workplaceId),
						eq(shiftSwaps.status, "pending_manager"),
					),
				);

			const swaps = await Promise.all(
				rows.map((row) => loadSwapDetail(row.id)),
			);
			swaps.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
			return { swaps };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Agreed swaps awaiting manager approval",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/swaps/:swapId/decision",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);
			const swap = await loadSwapDetail(params.swapId);
			if (swap.status !== "pending_manager") {
				throw new ConflictError("This swap is not awaiting manager approval");
			}

			if (body.decision === "declined") {
				await db
					.update(shiftSwaps)
					.set({
						status: "declined_by_manager",
						decidedAt: new Date(),
						decidedByProfileId: profile.id,
					})
					.where(eq(shiftSwaps.id, swap.id));
				await notifyEmployments(
					[swap.requester.employmentId, swap.counterpart.employmentId],
					{
						kind: "swap_declined",
						title: "Swap declined",
						body: "A manager declined the shift swap. Everyone keeps their own shift.",
					},
				);
				await writeAudit({
					workplaceId: params.workplaceId,
					actorProfileId: profile.id,
					action: "swap.declined",
					entityType: "shift_swap",
					entityId: swap.id,
					summary: "Declined a shift swap",
				});
				return { status: "declined" as const };
			}

			const requesterDraftId = await draftShiftIdFor(swap.requesterShift.id);
			const counterpartDraftId = await draftShiftIdFor(
				swap.counterpartShift.id,
			);
			if (!requesterDraftId || !counterpartDraftId) {
				throw new ConflictError(
					"The underlying shifts could not be found for this swap",
				);
			}

			const draftRows = await db
				.select({ id: shiftsTable.id, scheduleId: shiftsTable.scheduleId })
				.from(shiftsTable)
				.where(inArray(shiftsTable.id, [requesterDraftId, counterpartDraftId]));
			if (draftRows.length !== 2) {
				throw new ConflictError("The underlying shifts could not be found");
			}

			await db.transaction(async (tx) => {
				const decided = await tx
					.update(shiftSwaps)
					.set({
						status: "approved",
						decidedAt: new Date(),
						decidedByProfileId: profile.id,
					})
					.where(
						and(
							eq(shiftSwaps.id, swap.id),
							eq(shiftSwaps.status, "pending_manager"),
						),
					)
					.returning({ id: shiftSwaps.id });
				if (decided.length === 0) {
					throw new ConflictError("This swap was already decided");
				}

				await tx
					.update(shiftsTable)
					.set({ employmentId: swap.counterpart.employmentId })
					.where(eq(shiftsTable.id, requesterDraftId));
				await tx
					.update(shiftsTable)
					.set({ employmentId: swap.requester.employmentId })
					.where(eq(shiftsTable.id, counterpartDraftId));
				await tx
					.update(versionShifts)
					.set({ employmentId: swap.counterpart.employmentId })
					.where(eq(versionShifts.id, swap.requesterShift.id));
				await tx
					.update(versionShifts)
					.set({ employmentId: swap.requester.employmentId })
					.where(eq(versionShifts.id, swap.counterpartShift.id));
			});

			const scheduleIds = [...new Set(draftRows.map((row) => row.scheduleId))];
			let publishedVersion: number | null = null;
			for (const scheduleId of scheduleIds) {
				const published = await publishScheduleNow(scheduleId, profile.id);
				publishedVersion = published.version.versionNumber;
			}

			await notifyEmployments(
				[swap.requester.employmentId, swap.counterpart.employmentId],
				{
					kind: "swap_approved",
					title: "Swap approved",
					body: "The shift swap was approved and the schedule was republished. Check your schedule for your new shift.",
				},
			);
			await writeAudit({
				workplaceId: params.workplaceId,
				actorProfileId: profile.id,
				action: "swap.approved",
				entityType: "shift_swap",
				entityId: swap.id,
				summary: "Approved a shift swap and republished the schedule",
			});

			return {
				status: "approved" as const,
				publishedVersion,
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({
				workplaceId: t.String({ format: "uuid" }),
				swapId: t.String({ format: "uuid" }),
			}),
			body: t.Object({
				decision: t.Union([t.Literal("approved"), t.Literal("declined")]),
			}),
			detail: {
				summary:
					"Approve an agreed swap: the shifts are exchanged and the schedule is republished (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
