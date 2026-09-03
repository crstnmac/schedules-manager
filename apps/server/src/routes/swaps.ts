import {
	db,
	employments,
	positions,
	profiles,
	schedules,
	scheduleVersions,
	shiftSwaps,
	shifts as shiftsTable,
	versionShifts,
} from "@SchedulesManager/db";
import { and, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Elysia, t } from "elysia";

import {
	listActiveEmployments,
	requireManager,
	requireSession,
} from "../context";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { withIdempotency } from "../idempotency";
import { managerEmploymentIds, notifyEmployments, writeAudit } from "../notify";
import { assertWorkplaceEnabled } from "../workplace-policy";
import { assertEligible } from "./coverage";
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

async function loadSwapDetail(
	swapId: string,
	reader: Pick<typeof db, "select"> = db,
): Promise<SwapDetail> {
	const [row] = await reader
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

async function assertNoOverlaps(
	input: {
		employmentId: string;
		keepDraftShiftId: string | null;
		startsAt: Date;
		endsAt: Date;
	},
	reader: Pick<typeof db, "select"> = db,
) {
	const conditions = [
		eq(shiftsTable.employmentId, input.employmentId),
		lt(shiftsTable.startsAt, input.endsAt),
		gt(shiftsTable.endsAt, input.startsAt),
	];
	if (input.keepDraftShiftId) {
		conditions.push(ne(shiftsTable.id, input.keepDraftShiftId));
	}
	const [overlap] = await reader
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

export async function reserveShiftSwap(input: {
	requesterEmploymentId: string;
	requesterShiftId: string;
	counterpartEmploymentId: string;
	counterpartShiftId: string;
}) {
	const shiftIds = [input.requesterShiftId, input.counterpartShiftId].sort();
	return db.transaction(async (tx) => {
		for (const shiftId of shiftIds) {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${shiftId}, 0))`,
			);
		}

		const [active] = await tx
			.select({ id: shiftSwaps.id })
			.from(shiftSwaps)
			.where(
				and(
					inArray(shiftSwaps.status, [
						"pending_counterpart",
						"pending_manager",
					]),
					or(
						inArray(shiftSwaps.requesterShiftId, shiftIds),
						inArray(shiftSwaps.counterpartShiftId, shiftIds),
					),
				),
			)
			.limit(1);
		if (active) {
			throw new ConflictError("That shift already has a pending swap");
		}

		const [swap] = await tx.insert(shiftSwaps).values(input).returning();
		if (!swap) throw new ConflictError("Swap could not be created");
		return swap;
	});
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
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `swap.propose:${body.requesterShiftId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const mine = await myEmploymentIds(profile.id);
					if (mine.length === 0)
						throw new NotFoundError("No active employment");

					const [requesterShift] = await db
						.select({
							shift: versionShifts,
							workplaceId: employments.workplaceId,
						})
						.from(versionShifts)
						.innerJoin(
							employments,
							eq(employments.id, versionShifts.employmentId),
						)
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
					await assertWorkplaceEnabled(
						requesterShift.workplaceId,
						"shiftExchangesEnabled",
						"Shift exchanges are turned off for this Workplace",
					);
					await assertFutureShift(requesterShift.shift.startsAt, "Your shift");

					const [counterpartShift] = await db
						.select({
							shift: versionShifts,
							workplaceId: employments.workplaceId,
						})
						.from(versionShifts)
						.innerJoin(
							employments,
							eq(employments.id, versionShifts.employmentId),
						)
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

					const requesterDraftId = await draftShiftIdFor(
						requesterShift.shift.id,
					);
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

					const swap = await reserveShiftSwap({
						requesterEmploymentId: requesterShift.shift.employmentId,
						requesterShiftId: requesterShift.shift.id,
						counterpartEmploymentId: body.counterpartEmploymentId,
						counterpartShiftId: body.counterpartShiftId,
					});

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
			});
		},
		{
			headers: t.Object({
				authorization: t.String(),
				"idempotency-key": t.Optional(
					t.String({ minLength: 8, maxLength: 200 }),
				),
			}),
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
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `swap.respond:${params.swapId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const mine = await myEmploymentIds(profile.id);
					const swap = await loadSwapDetail(params.swapId);

					if (swap.status !== "pending_counterpart") {
						throw new ConflictError("This swap is not awaiting a response");
					}
					if (!mine.includes(swap.counterpart.employmentId)) {
						throw new NotFoundError("Swap request not found");
					}

					const accepted = body.decision === "accept";
					return db.transaction(async (tx) => {
						const changed = await tx
							.update(shiftSwaps)
							.set({
								status: accepted
									? "pending_manager"
									: "declined_by_counterpart",
								respondedAt: new Date(),
							})
							.where(
								and(
									eq(shiftSwaps.id, swap.id),
									eq(shiftSwaps.status, "pending_counterpart"),
								),
							)
							.returning({ id: shiftSwaps.id });
						if (!changed.length)
							throw new ConflictError("This swap is not awaiting a response");

						await notifyEmployments(
							[swap.requester.employmentId],
							{
								kind: accepted
									? "swap_counterpart_accepted"
									: "swap_counterpart_declined",
								title: accepted
									? "Swap accepted — awaiting manager approval"
									: "Swap declined",
								body: accepted
									? `${swap.counterpart.name} agreed to the swap. A manager can now approve it.`
									: `${swap.counterpart.name} declined the swap. You keep your shift.`,
							},
							tx,
						);
						if (accepted) {
							await notifyEmployments(
								await managerEmploymentIds(swap.workplaceId),
								{
									kind: "swap_request",
									title: "Shift swap needs approval",
									body: `${swap.requester.name} and ${swap.counterpart.name} agreed to exchange shifts.`,
								},
								tx,
							);
						}
						await writeAudit(
							{
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
							},
							tx,
						);

						return { swap: await loadSwapDetail(swap.id, tx) };
					});
				},
			});
		},
		{
			headers: t.Object({
				authorization: t.String(),
				"idempotency-key": t.Optional(
					t.String({ minLength: 8, maxLength: 200 }),
				),
			}),
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
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `swap.cancel:${params.swapId}`,
				key: headers["idempotency-key"],
				request: { swapId: params.swapId },
				execute: async () => {
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

					return db.transaction(async (tx) => {
						const changed = await tx
							.update(shiftSwaps)
							.set({ status: "cancelled", decidedAt: new Date() })
							.where(
								and(
									eq(shiftSwaps.id, swap.id),
									eq(shiftSwaps.status, swap.status),
								),
							)
							.returning({ id: shiftSwaps.id });
						if (!changed.length)
							throw new ConflictError("This swap changed before cancellation");
						await notifyEmployments(
							[swap.counterpart.employmentId],
							{
								kind: "swap_cancelled",
								title: "Swap cancelled",
								body: `${swap.requester.name} cancelled the swap request.`,
							},
							tx,
						);

						return { swap: await loadSwapDetail(swap.id, tx) };
					});
				},
			});
		},
		{
			headers: t.Object({
				authorization: t.String(),
				"idempotency-key": t.Optional(
					t.String({ minLength: 8, maxLength: 200 }),
				),
			}),
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
			return withIdempotency({
				actorProfileId: profile.id,
				scope: `swap.decision:${params.swapId}`,
				key: headers["idempotency-key"],
				request: body,
				execute: async () => {
					const swap = await loadSwapDetail(params.swapId);
					if (swap.workplaceId !== params.workplaceId) {
						throw new NotFoundError("Swap request not found");
					}
					if (swap.status !== "pending_manager") {
						throw new ConflictError(
							"This swap is not awaiting manager approval",
						);
					}

					if (body.decision === "declined") {
						await db.transaction(async (tx) => {
							const declined = await tx
								.update(shiftSwaps)
								.set({
									status: "declined_by_manager",
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
							if (declined.length === 0) {
								throw new ConflictError("This swap was already decided");
							}
							await notifyEmployments(
								[swap.requester.employmentId, swap.counterpart.employmentId],
								{
									kind: "swap_declined",
									title: "Swap declined",
									body: "A manager declined the shift swap. Everyone keeps their own shift.",
								},
								tx,
							);
							await writeAudit(
								{
									workplaceId: params.workplaceId,
									actorProfileId: profile.id,
									action: "swap.declined",
									entityType: "shift_swap",
									entityId: swap.id,
									summary: "Declined a shift swap",
								},
								tx,
							);
						});
						return { status: "declined" as const };
					}

					const requesterDraftId = await draftShiftIdFor(
						swap.requesterShift.id,
					);
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
						.where(
							inArray(shiftsTable.id, [requesterDraftId, counterpartDraftId]),
						);
					if (draftRows.length !== 2) {
						throw new ConflictError("The underlying shifts could not be found");
					}
					const scheduleIds = [
						...new Set(draftRows.map((row) => row.scheduleId)),
					];
					if (scheduleIds.length !== 1) {
						throw new ConflictError(
							"Swaps between different Schedules are not supported",
						);
					}

					const published = await publishScheduleNow(
						scheduleIds[0] ?? "",
						profile.id,
						{
							beforePublish: async (tx) => {
								const [lockedSwap] = await tx
									.select()
									.from(shiftSwaps)
									.where(eq(shiftSwaps.id, swap.id))
									.for("update");
								if (lockedSwap?.status !== "pending_manager") {
									throw new ConflictError("This swap was already decided");
								}
								if (
									lockedSwap.requesterEmploymentId ===
									lockedSwap.counterpartEmploymentId
								) {
									throw new ConflictError(
										"A worker cannot swap with themselves",
									);
								}

								const lockedEmployments = await tx
									.select()
									.from(employments)
									.where(
										inArray(employments.id, [
											lockedSwap.requesterEmploymentId,
											lockedSwap.counterpartEmploymentId,
										]),
									)
									.for("update");
								if (
									lockedEmployments.length !== 2 ||
									lockedEmployments.some(
										(employment) =>
											employment.status !== "active" ||
											employment.workplaceId !== params.workplaceId,
									)
								) {
									throw new ConflictError(
										"Both workers must still be active in this workplace",
									);
								}

								const lockedVersionShifts = await tx
									.select()
									.from(versionShifts)
									.where(
										inArray(versionShifts.id, [
											lockedSwap.requesterShiftId,
											lockedSwap.counterpartShiftId,
										]),
									)
									.for("update");
								const requesterVersionShift = lockedVersionShifts.find(
									(row) => row.id === lockedSwap.requesterShiftId,
								);
								const counterpartVersionShift = lockedVersionShifts.find(
									(row) => row.id === lockedSwap.counterpartShiftId,
								);
								if (
									!requesterVersionShift ||
									!counterpartVersionShift ||
									!requesterVersionShift.shiftId ||
									!counterpartVersionShift.shiftId ||
									requesterVersionShift.versionId !==
										counterpartVersionShift.versionId ||
									requesterVersionShift.employmentId !==
										lockedSwap.requesterEmploymentId ||
									counterpartVersionShift.employmentId !==
										lockedSwap.counterpartEmploymentId
								) {
									throw new ConflictError(
										"The published swap shifts are stale",
									);
								}
								const [latestVersion] = await tx
									.select()
									.from(scheduleVersions)
									.where(eq(scheduleVersions.scheduleId, scheduleIds[0] ?? ""))
									.orderBy(desc(scheduleVersions.versionNumber))
									.limit(1);
								if (
									!latestVersion ||
									latestVersion.id !== requesterVersionShift.versionId
								) {
									throw new ConflictError(
										"This swap is based on an outdated Schedule Version",
									);
								}

								const lockedDrafts = await tx
									.select()
									.from(shiftsTable)
									.where(
										inArray(shiftsTable.id, [
											requesterVersionShift.shiftId,
											counterpartVersionShift.shiftId,
										]),
									)
									.for("update");
								const requesterDraft = lockedDrafts.find(
									(row) => row.id === requesterVersionShift.shiftId,
								);
								const counterpartDraft = lockedDrafts.find(
									(row) => row.id === counterpartVersionShift.shiftId,
								);
								if (
									!requesterDraft ||
									!counterpartDraft ||
									requesterDraft.scheduleId !== (scheduleIds[0] ?? "") ||
									counterpartDraft.scheduleId !== (scheduleIds[0] ?? "") ||
									requesterDraft.employmentId !==
										lockedSwap.requesterEmploymentId ||
									counterpartDraft.employmentId !==
										lockedSwap.counterpartEmploymentId ||
									requesterDraft.positionId !==
										requesterVersionShift.positionId ||
									counterpartDraft.positionId !==
										counterpartVersionShift.positionId ||
									requesterDraft.startsAt.getTime() !==
										requesterVersionShift.startsAt.getTime() ||
									counterpartDraft.startsAt.getTime() !==
										counterpartVersionShift.startsAt.getTime() ||
									requesterDraft.endsAt.getTime() !==
										requesterVersionShift.endsAt.getTime() ||
									counterpartDraft.endsAt.getTime() !==
										counterpartVersionShift.endsAt.getTime()
								) {
									throw new ConflictError(
										"The underlying shifts changed after this swap was proposed",
									);
								}

								const [schedule] = await tx
									.select({ locationId: schedules.locationId })
									.from(schedules)
									.where(eq(schedules.id, requesterDraft.scheduleId));
								if (!schedule)
									throw new ConflictError("The Schedule no longer exists");
								await assertFutureShift(requesterDraft.startsAt, "Your shift");
								await assertFutureShift(
									counterpartDraft.startsAt,
									"Counterpart shift",
								);
								for (const [employmentId, incoming, outgoing] of [
									[
										lockedSwap.requesterEmploymentId,
										counterpartDraft,
										requesterDraft,
									],
									[
										lockedSwap.counterpartEmploymentId,
										requesterDraft,
										counterpartDraft,
									],
								] as const) {
									await assertEligible(
										employmentId,
										schedule.locationId,
										incoming.positionId,
										incoming.startsAt,
										incoming.endsAt,
										tx,
									);
									await assertNoOverlaps(
										{
											employmentId,
											keepDraftShiftId: outgoing.id,
											startsAt: incoming.startsAt,
											endsAt: incoming.endsAt,
										},
										tx,
									);
								}

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

								const reassignedRequester = await tx
									.update(shiftsTable)
									.set({
										employmentId: swap.counterpart.employmentId,
										updatedAt: new Date(),
									})
									.where(
										and(
											eq(shiftsTable.id, requesterDraft.id),
											eq(
												shiftsTable.employmentId,
												lockedSwap.requesterEmploymentId,
											),
										),
									)
									.returning({ id: shiftsTable.id });
								const reassignedCounterpart = await tx
									.update(shiftsTable)
									.set({
										employmentId: swap.requester.employmentId,
										updatedAt: new Date(),
									})
									.where(
										and(
											eq(shiftsTable.id, counterpartDraft.id),
											eq(
												shiftsTable.employmentId,
												lockedSwap.counterpartEmploymentId,
											),
										),
									)
									.returning({ id: shiftsTable.id });
								if (
									reassignedRequester.length !== 1 ||
									reassignedCounterpart.length !== 1
								) {
									throw new ConflictError(
										"The underlying shifts changed during approval",
									);
								}
								await notifyEmployments(
									[swap.requester.employmentId, swap.counterpart.employmentId],
									{
										kind: "swap_approved",
										title: "Swap approved",
										body: "The shift swap was approved and the schedule was republished. Check your schedule for your new shift.",
									},
									tx,
								);
								await writeAudit(
									{
										workplaceId: params.workplaceId,
										actorProfileId: profile.id,
										action: "swap.approved",
										entityType: "shift_swap",
										entityId: swap.id,
										summary:
											"Approved a shift swap and republished the schedule",
									},
									tx,
								);
							},
						},
					);

					return {
						status: "approved" as const,
						publishedVersion: published.version.versionNumber,
					};
				},
			});
		},
		{
			headers: t.Object({
				authorization: t.String(),
				"idempotency-key": t.Optional(
					t.String({ minLength: 8, maxLength: 200 }),
				),
			}),
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
