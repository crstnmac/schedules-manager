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
import {
	type AnyColumn,
	and,
	eq,
	exists,
	inArray,
	notExists,
	or,
	type SQL,
	sql,
} from "drizzle-orm";

import { type AuthenticatedUser, AuthenticationError, auth } from "./auth";
import { requireActiveSubscription } from "./billing";
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

/** A Manager with no explicit privileges: full access, including over other Managers. */
export function isFullManager(
	employment: Pick<Employment, "kind" | "privileges">,
): boolean {
	return (
		employment.kind === "manager" && (employment.privileges ?? []).length === 0
	);
}

/**
 * Nobody grants more than they hold: only a full Manager creates Managers,
 * and a Viewer's privileges must all be ones the actor already has.
 */
export function assertCanAssignRole(
	actor: Employment,
	kind: Employment["kind"] | (string & {}),
	privileges: readonly EmploymentPrivilege[],
): void {
	if (kind === "worker") return;
	if (kind === "manager" && !isFullManager(actor)) {
		throw new ForbiddenError("Only a full Manager can grant the Manager role");
	}
	const missing = privileges.filter(
		(privilege) => !hasPrivilege(actor, privilege),
	);
	if (missing.length > 0) {
		throw new ForbiddenError(
			`You cannot grant privileges you do not hold: ${missing.join(", ")}`,
		);
	}
}

/**
 * Only a full Manager changes or deactivates a Manager, and nobody changes
 * someone holding privileges they lack.
 */
export function assertCanManageEmployment(
	actor: Employment,
	target: Pick<Employment, "kind" | "privileges">,
): void {
	if (target.kind === "manager" && !isFullManager(actor)) {
		throw new ForbiddenError("Only a full Manager can change a Manager");
	}
	const outranks = (target.privileges ?? []).some(
		(privilege) => !hasPrivilege(actor, privilege as EmploymentPrivilege),
	);
	if (outranks) {
		throw new ForbiddenError(
			"You cannot change someone who holds privileges you do not",
		);
	}
}

/**
 * The Locations an actor may hand out access to: `null` when unrestricted
 * (Managers and Viewers without explicit Location assignments).
 */
export async function grantableLocations(
	actor: Employment,
): Promise<Set<string> | null> {
	if (actor.kind === "manager") return null;
	const rows = await db
		.select({ locationId: employmentLocations.locationId })
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, actor.id));
	return rows.length === 0 ? null : new Set(rows.map((row) => row.locationId));
}

/**
 * Location scope, as in other multi-location scheduling tools: a Viewer
 * assigned to Locations only manages those Locations and the people who work
 * there. Full Managers and Viewers without assignments are unrestricted.
 * People without Location assignments work everywhere, so everyone sees them.
 */
export async function requireLocationPrivilege(
	profileId: string,
	location: { id: string; workplaceId: string },
	privilege: EmploymentPrivilege,
	options?: { withoutSubscription?: boolean },
): Promise<Employment> {
	const employment = await requirePrivilege(
		profileId,
		location.workplaceId,
		privilege,
		options,
	);
	const scope = await grantableLocations(employment);
	if (scope && !scope.has(location.id)) {
		throw new ForbiddenError("You do not have access to this Location");
	}
	return employment;
}

/** SQL filter: the Employment is visible within `scope` (null = no filter). */
export function employmentVisibleIn(
	scope: Set<string> | null,
	employmentId: AnyColumn = employments.id,
): SQL | undefined {
	if (scope === null) return undefined;
	const assigned = db
		.select({ one: sql`1` })
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, employmentId));
	return or(
		notExists(assigned),
		exists(
			db
				.select({ one: sql`1` })
				.from(employmentLocations)
				.where(
					and(
						eq(employmentLocations.employmentId, employmentId),
						inArray(employmentLocations.locationId, [...scope]),
					),
				),
		),
	);
}

/** Throws unless the Employment is visible within `scope`. */
export async function assertEmploymentInScope(
	scope: Set<string> | null,
	employmentId: string,
): Promise<void> {
	if (scope === null) return;
	const rows = await db
		.select({ locationId: employmentLocations.locationId })
		.from(employmentLocations)
		.where(eq(employmentLocations.employmentId, employmentId));
	if (rows.length > 0 && !rows.some((row) => scope.has(row.locationId))) {
		throw new ForbiddenError(
			"This person works at a Location you do not manage",
		);
	}
}

/** Throws for Location-scoped actors: the action exposes every Location. */
export async function requireUnscoped(actor: Employment): Promise<void> {
	if ((await grantableLocations(actor)) !== null) {
		throw new ForbiddenError(
			"This action covers every Location, so it needs Workplace-wide access",
		);
	}
}

/**
 * A Location-scoped actor may only grant Viewer access inside their own
 * Locations; an empty set means every Location, so it is refused too.
 */
export function assertLocationsGrantable(
	grantable: Set<string> | null,
	kind: Employment["kind"] | (string & {}),
	locationIds: readonly string[],
): void {
	if (grantable === null || kind === "worker") return;
	if (
		locationIds.length === 0 ||
		locationIds.some((locationId) => !grantable.has(locationId))
	) {
		throw new ForbiddenError(
			"You can only grant access to Locations you are assigned to",
		);
	}
}

/**
 * Privileges that change a Workplace. Using them needs an active
 * subscription (ADR 0016); viewing privileges never do, so history stays
 * readable after a downgrade or lapse.
 */
const SUBSCRIPTION_PRIVILEGES = new Set<EmploymentPrivilege>([
	"schedule.manage",
	"schedule.publish",
	"approvals.review",
	"policies.manage",
	"workers.manage",
	"settings.manage",
	"integrations.manage",
]);

export async function requirePrivilege(
	profileId: string,
	workplaceId: string,
	privilege: EmploymentPrivilege,
	options?: {
		/**
		 * Skip the subscription check: read-only routes (history must survive
		 * a lapse) and billing routes (so an unpaid Workplace can subscribe).
		 */
		withoutSubscription?: boolean;
	},
): Promise<Employment> {
	const employment = await requireWorkplaceMember(profileId, workplaceId);
	if (!hasPrivilege(employment, privilege)) {
		throw new ForbiddenError(
			`This action requires the ${privilege} capability`,
		);
	}
	if (!options?.withoutSubscription && SUBSCRIPTION_PRIVILEGES.has(privilege)) {
		await requireActiveSubscription(workplaceId);
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
