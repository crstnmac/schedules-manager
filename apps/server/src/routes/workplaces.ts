import {
	db,
	employments,
	invitations,
	locations,
	positions,
	profiles,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, gt } from "drizzle-orm";
import { Elysia, t } from "elysia";

import {
	listActiveEmployments,
	requireManager,
	requireSession,
} from "../context";
import { BadRequestError, ForbiddenError } from "../errors";
import { fillPlaceFromAddress } from "../geocode";
import { firstRow } from "../rows";
import {
	loadWorkplace,
	normalizeMonthDay,
	workplaceSettingsPayload,
} from "../workplace-policy";

function assertTimeZone(timezone: string) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
	} catch {
		throw new BadRequestError(`Unknown IANA time zone: ${timezone}`);
	}
}

export const workplacesRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Workplace"],
})
	.get(
		"/workplaces",
		async ({ headers }) => {
			const { profile } = await requireSession(headers.authorization);
			const memberships = await listActiveEmployments(profile.id);

			return {
				workplaces: memberships.map(({ employment, workplace }) => ({
					id: workplace.id,
					name: workplace.name,
					kind: employment.kind,
				})),
			};
		},
		{
			headers: t.Object({ authorization: t.String() }),
			detail: {
				summary: "List workplaces connected through active Employments",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces",
		async ({ headers, body }) => {
			const { profile } = await requireSession(headers.authorization);
			const filled = await fillPlaceFromAddress({
				addressLine: body.location.addressLine,
				latitude: body.location.latitude,
				longitude: body.location.longitude,
			});
			const timezone =
				body.location.timezone ?? filled.timezone ?? "America/Chicago";
			assertTimeZone(timezone);

			return db.transaction(async (tx) => {
				const [lockedProfile] = await tx
					.select({ id: profiles.id })
					.from(profiles)
					.where(eq(profiles.id, profile.id))
					.limit(1)
					.for("update");
				if (!lockedProfile) {
					throw new ForbiddenError("Profile could not be resolved");
				}

				const [existingEmployment] = await tx
					.select({ id: employments.id })
					.from(employments)
					.where(eq(employments.profileId, profile.id))
					.limit(1);
				if (existingEmployment) {
					throw new ForbiddenError(
						"You already belong to a Workplace. Workers join by invitation.",
					);
				}

				const [pendingInvite] = await tx
					.select({ id: invitations.id })
					.from(invitations)
					.where(
						and(
							eq(invitations.email, profile.email.toLowerCase()),
							eq(invitations.status, "pending"),
							gt(invitations.expiresAt, new Date()),
						),
					)
					.limit(1);
				if (pendingInvite) {
					throw new ForbiddenError(
						"Accept your invitation instead of creating a Workplace.",
					);
				}

				const workplace = firstRow(
					await tx.insert(workplaces).values({ name: body.name }).returning(),
				);

				await tx.insert(employments).values({
					workplaceId: workplace.id,
					profileId: profile.id,
					kind: "manager",
				});

				const location = firstRow(
					await tx
						.insert(locations)
						.values({
							workplaceId: workplace.id,
							name: body.location.name,
							timezone,
							addressLine: body.location.addressLine?.trim() || null,
							latitude: filled.latitude,
							longitude: filled.longitude,
						})
						.returning(),
				);

				const position = firstRow(
					await tx
						.insert(positions)
						.values({
							workplaceId: workplace.id,
							name: body.position.name,
						})
						.returning(),
				);

				return {
					workplace: { id: workplace.id, name: workplace.name },
					location: {
						id: location.id,
						name: location.name,
						timezone: location.timezone,
					},
					position: { id: position.id, name: position.name },
				};
			});
		},
		{
			headers: t.Object({ authorization: t.String() }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 120 }),
				location: t.Object({
					name: t.String({ minLength: 1, maxLength: 120 }),
					timezone: t.Optional(t.String({ default: "America/Chicago" })),
					addressLine: t.Optional(t.String({ maxLength: 200 })),
					latitude: t.Optional(t.Union([t.String(), t.Null()])),
					longitude: t.Optional(t.Union([t.String(), t.Null()])),
				}),
				position: t.Object({
					name: t.String({ minLength: 1, maxLength: 120 }),
				}),
			}),
			detail: {
				summary:
					"Create the first Workplace when the caller has no Employment and no pending invitation. Additional workplaces are joined by invitation.",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.get(
		"/workplaces/:workplaceId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const workplace = await loadWorkplace(params.workplaceId);
			return { workplace: workplaceSettingsPayload(workplace) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			detail: {
				summary: "Return Workplace settings (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/workplaces/:workplaceId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers.authorization);
			await requireManager(profile.id, params.workplaceId);

			const existing = await loadWorkplace(params.workplaceId);
			const leaveCapReset = body.leaveCapReset ?? existing.leaveCapReset;
			const leaveCapResetMonthDay =
				body.leaveCapResetMonthDay === undefined
					? existing.leaveCapResetMonthDay
					: normalizeMonthDay(body.leaveCapResetMonthDay);
			if (
				body.leaveCapResetMonthDay !== undefined &&
				body.leaveCapResetMonthDay !== null &&
				leaveCapResetMonthDay === null
			) {
				throw new BadRequestError("Reset date must be MM-DD");
			}
			if (leaveCapReset === "custom_date" && !leaveCapResetMonthDay) {
				throw new BadRequestError(
					"A custom leave-cap reset needs a month and day (MM-DD)",
				);
			}

			const updated = firstRow(
				await db
					.update(workplaces)
					.set({
						name: body.name ?? existing.name,
						noticeWindowHours:
							body.noticeWindowHours ?? existing.noticeWindowHours,
						weekStartDay: body.weekStartDay ?? existing.weekStartDay,
						payPeriodType: body.payPeriodType ?? existing.payPeriodType,
						payPeriodAnchor:
							body.payPeriodAnchor === undefined
								? existing.payPeriodAnchor
								: body.payPeriodAnchor,
						earlyClockInMinutes:
							body.earlyClockInMinutes ?? existing.earlyClockInMinutes,
						clockRoundMinutes:
							body.clockRoundMinutes ?? existing.clockRoundMinutes,
						autoClockOutGraceMinutes:
							body.autoClockOutGraceMinutes ??
							existing.autoClockOutGraceMinutes,
						overtimeWeeklyMinutes:
							body.overtimeWeeklyMinutes ?? existing.overtimeWeeklyMinutes,
						overtimeDailyMinutes:
							body.overtimeDailyMinutes ?? existing.overtimeDailyMinutes,
						laborCostPercentGoal:
							body.laborCostPercentGoal === undefined
								? existing.laborCostPercentGoal
								: body.laborCostPercentGoal,
						managersCanViewLaborCost:
							body.managersCanViewLaborCost ?? existing.managersCanViewLaborCost,
						messagingEnabled:
							body.messagingEnabled ?? existing.messagingEnabled,
						announcementsEnabled:
							body.announcementsEnabled ?? existing.announcementsEnabled,
						tasksEnabled: body.tasksEnabled ?? existing.tasksEnabled,
						contactDetailsVisible:
							body.contactDetailsVisible ?? existing.contactDetailsVisible,
						workerScheduleVisibility:
							body.workerScheduleVisibility ??
							existing.workerScheduleVisibility,
						workerTimeOffVisibility:
							body.workerTimeOffVisibility ?? existing.workerTimeOffVisibility,
						breaksEnabled: body.breaksEnabled ?? existing.breaksEnabled,
						shiftExchangesEnabled:
							body.shiftExchangesEnabled ?? existing.shiftExchangesEnabled,
						unavailabilityRequiresApproval:
							body.unavailabilityRequiresApproval ??
							existing.unavailabilityRequiresApproval,
						clopeningMinutes:
							body.clopeningMinutes ?? existing.clopeningMinutes,
						maxConsecutiveWorkDays:
							body.maxConsecutiveWorkDays ?? existing.maxConsecutiveWorkDays,
						geofenceRequired:
							body.geofenceRequired ?? existing.geofenceRequired,
						lateArrivalGraceMinutes:
							body.lateArrivalGraceMinutes ?? existing.lateArrivalGraceMinutes,
						timesheetNotesEnabled:
							body.timesheetNotesEnabled ?? existing.timesheetNotesEnabled,
						leaveCapReset,
						leaveCapResetMonthDay,
						workersCanRequestTimeOff:
							body.workersCanRequestTimeOff ??
							existing.workersCanRequestTimeOff,
						updatedAt: new Date(),
					})
					.where(eq(workplaces.id, existing.id))
					.returning(),
			);

			return { workplace: workplaceSettingsPayload(updated) };
		},
		{
			headers: t.Object({ authorization: t.String() }),
			params: t.Object({ workplaceId: t.String({ format: "uuid" }) }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
				noticeWindowHours: t.Optional(t.Integer({ minimum: 0, maximum: 336 })),
				weekStartDay: t.Optional(t.Integer({ minimum: 0, maximum: 6 })),
				payPeriodType: t.Optional(
					t.Union([
						t.Literal("weekly"),
						t.Literal("biweekly"),
						t.Literal("semimonthly"),
						t.Literal("monthly"),
					]),
				),
				payPeriodAnchor: t.Optional(
					t.Union([t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), t.Null()]),
				),
				earlyClockInMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 180 }),
				),
				clockRoundMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 30 })),
				autoClockOutGraceMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 720 }),
				),
				overtimeWeeklyMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 10_080 }),
				),
				overtimeDailyMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 1440 }),
				),
				laborCostPercentGoal: t.Optional(
					t.Union([t.Integer({ minimum: 0, maximum: 100 }), t.Null()]),
				),
				managersCanViewLaborCost: t.Optional(t.Boolean()),
				messagingEnabled: t.Optional(t.Boolean()),
				announcementsEnabled: t.Optional(t.Boolean()),
				tasksEnabled: t.Optional(t.Boolean()),
				contactDetailsVisible: t.Optional(t.Boolean()),
				workerScheduleVisibility: t.Optional(
					t.Union([t.Literal("own"), t.Literal("full")]),
				),
				workerTimeOffVisibility: t.Optional(t.Boolean()),
				breaksEnabled: t.Optional(t.Boolean()),
				shiftExchangesEnabled: t.Optional(t.Boolean()),
				unavailabilityRequiresApproval: t.Optional(t.Boolean()),
				clopeningMinutes: t.Optional(t.Integer({ minimum: 0, maximum: 2880 })),
				maxConsecutiveWorkDays: t.Optional(
					t.Integer({ minimum: 0, maximum: 31 }),
				),
				geofenceRequired: t.Optional(t.Boolean()),
				lateArrivalGraceMinutes: t.Optional(
					t.Integer({ minimum: 0, maximum: 180 }),
				),
				timesheetNotesEnabled: t.Optional(t.Boolean()),
				leaveCapReset: t.Optional(
					t.Union([
						t.Literal("none"),
						t.Literal("calendar_year"),
						t.Literal("hire_date"),
						t.Literal("custom_date"),
					]),
				),
				leaveCapResetMonthDay: t.Optional(
					t.Union([t.String({ maxLength: 5 }), t.Null()]),
				),
				workersCanRequestTimeOff: t.Optional(t.Boolean()),
			}),
			detail: {
				summary:
					"Update Workplace settings, including the Notice Window for late Material Schedule Changes (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
