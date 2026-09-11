import type {
	Employment,
	EmploymentPrivilege,
	Profile,
} from "@SchedulesManager/db";
import {
	db,
	employmentLocations,
	employments,
	locations,
	profiles,
	workplaceSubscriptions,
	workplaces,
} from "@SchedulesManager/db";
import { and, eq } from "drizzle-orm";

import { type AuthenticatedUser, AuthenticationError, auth } from "./auth";
import { ForbiddenError, NotFoundError } from "./errors";

export interface SessionContext {
	user: AuthenticatedUser;
	profile: Profile;
}

export async function requireSession(
	headers: Headers | Record<string, string | undefined>,
): Promise<SessionContext> {
	const requestHeaders =
		headers instanceof Headers
			? headers
			: new Headers(
					Object.entries(headers).filter(
						(entry): entry is [string, string] => entry[1] !== undefined,
					),
				);
	const session = await auth.api.getSession({ headers: requestHeaders });
	if (!session) throw new AuthenticationError();
	const user = session.user;
	const profile = await ensureProfile(user);
	return { user, profile };
}

async function ensureProfile(user: AuthenticatedUser): Promise<Profile> {
	const [existing] = await db
		.select()
		.from(profiles)
		.where(eq(profiles.id, user.id))
		.limit(1);

	if (existing) return existing;

	const [created] = await db
		.insert(profiles)
		.values({
			id: user.id,
			email: user.email.toLowerCase(),
			fullName: extractFullName(user),
		})
		.onConflictDoNothing()
		.returning();

	if (created) return created;

	const [fallback] = await db
		.select()
		.from(profiles)
		.where(eq(profiles.id, user.id))
		.limit(1);

	if (!fallback) throw new AuthenticationError("Profile could not be resolved");
	return fallback;
}

function extractFullName(user: AuthenticatedUser): string | null {
	return user.name || null;
}

export async function listActiveEmployments(profileId: string) {
	return db
		.select({
			employment: employments,
			workplace: workplaces,
			subscription: workplaceSubscriptions,
		})
		.from(employments)
		.innerJoin(workplaces, eq(workplaces.id, employments.workplaceId))
		.leftJoin(
			workplaceSubscriptions,
			eq(workplaceSubscriptions.workplaceId, workplaces.id),
		)
		.where(
			and(
				eq(employments.profileId, profileId),
				eq(employments.status, "active"),
			),
		);
}

export async function requireWorkplaceMember(
	profileId: string,
	workplaceId: string,
): Promise<Employment> {
	const [employment] = await db
		.select()
		.from(employments)
		.where(
			and(
				eq(employments.profileId, profileId),
				eq(employments.workplaceId, workplaceId),
				eq(employments.status, "active"),
			),
		)
		.limit(1);

	if (!employment) throw new ForbiddenError("Not a member of this workplace");
	return employment;
}

export async function requireManager(
	profileId: string,
	workplaceId: string,
): Promise<Employment> {
	const [employment] = await db
		.select()
		.from(employments)
		.where(
			and(
				eq(employments.profileId, profileId),
				eq(employments.workplaceId, workplaceId),
				eq(employments.status, "active"),
				eq(employments.kind, "manager"),
			),
		)
		.limit(1);

	if (!employment) throw new ForbiddenError("Manager access required");
	return employment;
}

/**
 * A manager with no explicit privileges keeps full access. A viewer only ever
 * receives the capabilities listed explicitly; other kinds never hold them.
 */
export function hasPrivilege(
	employment: Employment,
	privilege: EmploymentPrivilege,
): boolean {
	if (employment.kind === "viewer") {
		return (employment.privileges ?? []).includes(privilege);
	}
	if (employment.kind !== "manager") return false;
	const explicit = employment.privileges;
	if (!explicit || explicit.length === 0) return true;
	return explicit.includes(privilege);
}

export async function requirePrivilege(
	profileId: string,
	workplaceId: string,
	privilege: EmploymentPrivilege,
): Promise<Employment> {
	const employment = await requireWorkplaceMember(profileId, workplaceId);
	if (!hasPrivilege(employment, privilege)) {
		throw new ForbiddenError(
			`This action requires the ${privilege} capability`,
		);
	}
	return employment;
}

export async function requireLocationAccess(
	profileId: string,
	locationId: string,
): Promise<{
	location: typeof locations.$inferSelect;
	employment: Employment;
}> {
	const [location] = await db
		.select()
		.from(locations)
		.where(eq(locations.id, locationId))
		.limit(1);

	if (!location) throw new NotFoundError("Location not found");

	const employment = await requireWorkplaceMember(
		profileId,
		location.workplaceId,
	);

	if (employment.kind === "manager") return { location, employment };

	const scopedRows = await db
		.select()
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, employment.id));

	if (scopedRows.length === 0) return { location, employment };

	const scoped = scopedRows.find((row) => row.locationId === locationId);
	if (!scoped) throw new ForbiddenError("No access to this location");
	return { location, employment };
}

export async function weekStartDayFor(workplaceId: string): Promise<number> {
	const [row] = await db
		.select({ weekStartDay: workplaces.weekStartDay })
		.from(workplaces)
		.where(eq(workplaces.id, workplaceId))
		.limit(1);
	return row?.weekStartDay ?? 1;
}

export async function locationScopeFor(
	employment: Employment,
): Promise<string[]> {
	if (employment.kind === "manager") {
		const rows = await db
			.select({ id: locations.id })
			.from(locations)
			.where(eq(locations.workplaceId, employment.workplaceId));
		return rows.map((row) => row.id);
	}

	const rows = await db
		.select({ id: employmentLocations.locationId })
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, employment.id));
	if (rows.length === 0) {
		const all = await db
			.select({ id: locations.id })
			.from(locations)
			.where(eq(locations.workplaceId, employment.workplaceId));
		return all.map((row) => row.id);
	}
	return rows.map((row) => row.id);
}
