import { db, scheduleTeams } from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";

import { NotFoundError } from "./errors";

/**
 * Validates an optional team segment against a Location. `null` or `undefined`
 * means the Location's primary schedule, which has no team row.
 */
export async function resolveScheduleTeam(
	locationId: string,
	teamId: string | null | undefined,
): Promise<string | null> {
	if (!teamId) return null;
	const [team] = await db
		.select({ id: scheduleTeams.id })
		.from(scheduleTeams)
		.where(
			and(
				eq(scheduleTeams.id, teamId),
				eq(scheduleTeams.locationId, locationId),
			),
		)
		.limit(1);
	if (!team) throw new NotFoundError("Schedule team not found");
	return team.id;
}
