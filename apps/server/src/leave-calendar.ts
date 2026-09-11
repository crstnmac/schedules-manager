import {
	db,
	employmentLocations,
	employments,
	holidays,
	leaveTypes,
	locations,
	profiles,
	timeOffRequests,
	versionShifts,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { shiftDays, zonedDayInfo } from "./time";

export interface CalendarFeedScope {
	workplaceId: string;
	employmentId: string | null;
	label: string | null;
}

function escapeIcs(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

/** RFC 5545 folds content lines at 75 octets. */
function foldLine(line: string): string {
	const bytes = Buffer.from(line, "utf8");
	if (bytes.length <= 75) return line;
	const chunks: string[] = [];
	let current = "";
	for (const char of line) {
		if (Buffer.byteLength(current + char, "utf8") > 74) {
			chunks.push(current);
			current = char;
		} else {
			current += char;
		}
	}
	if (current) chunks.push(current);
	return chunks.join("\r\n ");
}

function dateKeyToIcs(dateKey: string): string {
	return dateKey.replace(/-/g, "");
}

function instantToIcs(instant: Date): string {
	return instant
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
}

function event(input: {
	uid: string;
	start: Date;
	end: Date;
	allDayStart?: string;
	allDayEndExclusive?: string;
	summary: string;
	description?: string | null;
	location?: string | null;
}): string {
	const lines = [
		"BEGIN:VEVENT",
		`UID:${input.uid}`,
		`DTSTAMP:${instantToIcs(new Date())}`,
	];
	if (input.allDayStart) {
		lines.push(`DTSTART;VALUE=DATE:${dateKeyToIcs(input.allDayStart)}`);
		lines.push(
			`DTEND;VALUE=DATE:${dateKeyToIcs(
				input.allDayEndExclusive ?? shiftDays(input.allDayStart, 1),
			)}`,
		);
	} else {
		lines.push(`DTSTART:${instantToIcs(input.start)}`);
		lines.push(`DTEND:${instantToIcs(input.end)}`);
	}
	lines.push(`SUMMARY:${escapeIcs(input.summary)}`);
	if (input.description) {
		lines.push(`DESCRIPTION:${escapeIcs(input.description)}`);
	}
	if (input.location) lines.push(`LOCATION:${escapeIcs(input.location)}`);
	lines.push("END:VEVENT");
	return lines.map(foldLine).join("\r\n");
}

export async function buildLeaveCalendarFeed(
	scope: CalendarFeedScope,
): Promise<string> {
	const [workplace] = await db
		.select({ name: workplaces.name })
		.from(workplaces)
		.where(eq(workplaces.id, scope.workplaceId))
		.limit(1);
	const [fallbackLocation] = await db
		.select({ timezone: locations.timezone })
		.from(locations)
		.where(eq(locations.workplaceId, scope.workplaceId))
		.limit(1);
	const fallbackTimeZone = fallbackLocation?.timezone ?? "America/Chicago";
	const scopedLocations = await db
		.select({
			employmentId: employmentLocations.employmentId,
			timezone: locations.timezone,
		})
		.from(employmentLocations)
		.innerJoin(locations, eq(locations.id, employmentLocations.locationId))
		.innerJoin(
			employments,
			eq(employments.id, employmentLocations.employmentId),
		)
		.where(eq(employments.workplaceId, scope.workplaceId));
	const timeZoneByEmployment = new Map<string, string>();
	for (const row of scopedLocations) {
		if (!timeZoneByEmployment.has(row.employmentId)) {
			timeZoneByEmployment.set(row.employmentId, row.timezone);
		}
	}

	const events: string[] = [];
	const now = new Date();
	const rangeStart = new Date(now.getTime() - 180 * 86_400_000);
	const rangeEnd = new Date(now.getTime() + 400 * 86_400_000);

	const locationIds = scope.employmentId
		? (
				await db
					.select({ locationId: employmentLocations.locationId })
					.from(employmentLocations)
					.where(eq(employmentLocations.employmentId, scope.employmentId))
			).map((row) => row.locationId)
		: [];

	const holidayRows = await db
		.select({
			id: holidays.id,
			name: holidays.name,
			date: holidays.date,
			recurring: holidays.recurring,
			locationId: holidays.locationId,
		})
		.from(holidays)
		.where(
			and(
				eq(holidays.workplaceId, scope.workplaceId),
				scope.employmentId
					? locationIds.length > 0
						? or(
								isNull(holidays.locationId),
								inArray(holidays.locationId, locationIds),
							)
						: isNull(holidays.locationId)
					: undefined,
			),
		);
	for (const holiday of holidayRows) {
		const date = holiday.recurring
			? `${rangeStart.getUTCFullYear()}-${holiday.date.slice(5)}`
			: holiday.date;
		const nextYear = holiday.recurring
			? `${rangeEnd.getUTCFullYear()}-${holiday.date.slice(5)}`
			: holiday.date;
		for (const dateKey of new Set([date, nextYear])) {
			events.push(
				event({
					uid: `holiday-${holiday.id}-${dateKey}@jooling`,
					start: new Date(`${dateKey}T00:00:00Z`),
					end: new Date(`${dateKey}T00:00:00Z`),
					allDayStart: dateKey,
					summary: holiday.name,
					description: "Holiday",
				}),
			);
		}
	}

	const requestRows = await db
		.select({
			id: timeOffRequests.id,
			startsAt: timeOffRequests.startsAt,
			endsAt: timeOffRequests.endsAt,
			reason: timeOffRequests.reason,
			leaveTypeName: leaveTypes.name,
			fullName: profiles.fullName,
			employmentId: timeOffRequests.employmentId,
		})
		.from(timeOffRequests)
		.innerJoin(employments, eq(employments.id, timeOffRequests.employmentId))
		.innerJoin(profiles, eq(profiles.id, employments.profileId))
		.leftJoin(leaveTypes, eq(leaveTypes.id, timeOffRequests.leaveTypeId))
		.where(
			and(
				eq(employments.workplaceId, scope.workplaceId),
				eq(timeOffRequests.status, "approved"),
				scope.employmentId
					? eq(timeOffRequests.employmentId, scope.employmentId)
					: undefined,
				gte(timeOffRequests.endsAt, rangeStart),
				lte(timeOffRequests.startsAt, rangeEnd),
			),
		)
		.limit(1000);

	for (const request of requestRows) {
		const label = request.leaveTypeName ?? "Time off";
		const summary = scope.employmentId
			? label
			: `${request.fullName ?? "Worker"} — ${label}`;
		const timeZone =
			timeZoneByEmployment.get(request.employmentId) ?? fallbackTimeZone;
		const startInfo = zonedDayInfo(request.startsAt, timeZone);
		const endInfo = zonedDayInfo(request.endsAt, timeZone);
		const allDay =
			startInfo.minuteOfDay === 0 &&
			endInfo.minuteOfDay === 0 &&
			startInfo.dateKey < endInfo.dateKey;
		events.push(
			event({
				uid: `leave-${request.id}@jooling`,
				start: request.startsAt,
				end: request.endsAt,
				allDayStart: allDay ? startInfo.dateKey : undefined,
				allDayEndExclusive: allDay ? endInfo.dateKey : undefined,
				summary,
				description: request.reason,
			}),
		);
	}

	if (scope.employmentId) {
		const shiftRows = await db
			.select({
				id: versionShifts.id,
				startsAt: versionShifts.startsAt,
				endsAt: versionShifts.endsAt,
				note: versionShifts.note,
			})
			.from(versionShifts)
			.where(
				and(
					eq(versionShifts.employmentId, scope.employmentId),
					gte(versionShifts.endsAt, rangeStart),
					lte(versionShifts.startsAt, rangeEnd),
				),
			)
			.limit(1000);
		for (const shift of shiftRows) {
			events.push(
				event({
					uid: `shift-${shift.id}@jooling`,
					start: shift.startsAt,
					end: shift.endsAt,
					summary: "Shift",
					description: shift.note,
				}),
			);
		}
	}

	const header = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Jooling//Leave Calendar//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		foldLine(
			`X-WR-CALNAME:${escapeIcs(scope.label ?? workplace?.name ?? "Leave")}`,
		),
	].join("\r\n");

	return `${header}\r\n${events.join("\r\n")}\r\nEND:VCALENDAR\r\n`;
}
