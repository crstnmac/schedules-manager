import { db, holidays } from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { requirePrivilege, requireSession } from "../context";
import { BadRequestError, NotFoundError } from "../errors";
import { firstRow } from "../rows";

const uuid = t.String({ format: "uuid" });
const dateKey = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export interface HolidayRow {
	id: string;
	name: string;
	date: string;
	recurring: boolean;
	locationId: string | null;
}

/** Expands annual recurring holidays into concrete occurrences within range. */
function occurrencesInRange(
	rows: HolidayRow[],
	from: string,
	to: string,
): HolidayRow[] {
	const occurrences: HolidayRow[] = [];
	for (const row of rows) {
		if (!row.recurring) {
			if (row.date >= from && row.date <= to) occurrences.push(row);
			continue;
		}
		const [, month, day] = row.date.split("-");
		const startYear = Number(from.slice(0, 4));
		const endYear = Number(to.slice(0, 4));
		for (let year = startYear; year <= endYear; year += 1) {
			const candidate = `${year}-${month}-${day}`;
			if (candidate >= from && candidate <= to) {
				occurrences.push({ ...row, date: candidate });
			}
		}
	}
	return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

export const holidayRoutes = new Elysia({
	prefix: "/v1",
	tags: ["Holidays"],
})
	.get(
		"/workplaces/:workplaceId/holidays",
		async ({ headers, params, query }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "schedule.view");

			const rows = await db
				.select()
				.from(holidays)
				.where(eq(holidays.workplaceId, params.workplaceId));

			const serialized: HolidayRow[] = rows
				.filter(
					(row) =>
						!query.locationId ||
						!row.locationId ||
						row.locationId === query.locationId,
				)
				.map((row) => ({
					id: row.id,
					name: row.name,
					date: row.date,
					recurring: row.recurring,
					locationId: row.locationId,
				}));

			if (query.from && query.to) {
				return {
					holidays: occurrencesInRange(serialized, query.from, query.to),
				};
			}
			return { holidays: serialized };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			query: t.Object({
				from: t.Optional(dateKey),
				to: t.Optional(dateKey),
				locationId: t.Optional(uuid),
			}),
			detail: {
				summary: "List Holidays for a Workplace, optionally within a range",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.post(
		"/workplaces/:workplaceId/holidays",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
				throw new BadRequestError("Date must be YYYY-MM-DD");
			}
			const holiday = firstRow(
				await db
					.insert(holidays)
					.values({
						workplaceId: params.workplaceId,
						locationId: body.locationId ?? null,
						name: body.name.trim(),
						date: body.date,
						recurring: body.recurring ?? false,
					})
					.returning(),
			);
			return {
				holiday: {
					id: holiday.id,
					name: holiday.name,
					date: holiday.date,
					recurring: holiday.recurring,
					locationId: holiday.locationId,
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid }),
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 80 }),
				date: dateKey,
				recurring: t.Optional(t.Boolean()),
				locationId: t.Optional(t.Union([uuid, t.Null()])),
			}),
			detail: {
				summary: "Create a Holiday (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.patch(
		"/workplaces/:workplaceId/holidays/:holidayId",
		async ({ headers, params, body }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			const [holiday] = await db
				.update(holidays)
				.set({
					name: body.name?.trim(),
					date: body.date,
					recurring: body.recurring,
					locationId:
						body.locationId === undefined ? undefined : body.locationId,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(holidays.id, params.holidayId),
						eq(holidays.workplaceId, params.workplaceId),
					),
				)
				.returning();
			if (!holiday) throw new NotFoundError("Holiday not found");
			return {
				holiday: {
					id: holiday.id,
					name: holiday.name,
					date: holiday.date,
					recurring: holiday.recurring,
					locationId: holiday.locationId,
				},
			};
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, holidayId: uuid }),
			body: t.Object({
				name: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
				date: t.Optional(dateKey),
				recurring: t.Optional(t.Boolean()),
				locationId: t.Optional(t.Union([uuid, t.Null()])),
			}),
			detail: {
				summary: "Update a Holiday (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.delete(
		"/workplaces/:workplaceId/holidays/:holidayId",
		async ({ headers, params }) => {
			const { profile } = await requireSession(headers);
			await requirePrivilege(profile.id, params.workplaceId, "settings.manage");
			await db
				.delete(holidays)
				.where(
					and(
						eq(holidays.id, params.holidayId),
						eq(holidays.workplaceId, params.workplaceId),
					),
				);
			return { ok: true as const };
		},
		{
			headers: t.Object(
				{ authorization: t.Optional(t.String()) },
				{ additionalProperties: true },
			),
			params: t.Object({ workplaceId: uuid, holidayId: uuid }),
			detail: {
				summary: "Delete a Holiday (Manager)",
				security: [{ bearerAuth: [] }],
			},
		},
	);
