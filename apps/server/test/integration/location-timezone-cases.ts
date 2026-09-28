import { expect, test } from "bun:test";

type Context = {
	database: typeof import("@SchedulesManager/db");
	app: ReturnType<typeof import("../../src/app").createApp>;
	token: (profileId: string, email: string) => Promise<string>;
};

/**
 * Each Location keeps its own time zone, and rows are shown on their
 * Location's clock. /v1/me carries the default for views that aren't tied to
 * one Location: the person's assigned Location, else the workplace's first.
 */
export function registerLocationTimezoneTests(getContext: () => Context) {
	test("/me defaults to the person's assigned Location time zone", async () => {
		const { database: d, app, token } = getContext();
		const [workplace] = await d.db
			.insert(d.workplaces)
			.values({ name: "Two Zone Diner" })
			.returning();
		if (!workplace) throw new Error("Missing workplace fixture");
		const [chicago, newYork] = await d.db
			.insert(d.locations)
			.values([
				{
					workplaceId: workplace.id,
					name: "Austin",
					timezone: "America/Chicago",
					createdAt: new Date("2026-01-01T00:00:00Z"),
				},
				{
					workplaceId: workplace.id,
					name: "Brooklyn",
					timezone: "America/New_York",
					createdAt: new Date("2026-02-01T00:00:00Z"),
				},
			])
			.returning();
		if (!chicago || !newYork) throw new Error("Missing location fixtures");

		const me = async (assigned: string | null) => {
			const profileId = crypto.randomUUID();
			const email = `zone-${profileId}@example.test`;
			await d.db.insert(d.profiles).values({ id: profileId, email });
			const [employment] = await d.db
				.insert(d.employments)
				.values({ workplaceId: workplace.id, profileId, kind: "worker" })
				.returning();
			if (!employment) throw new Error("Missing employment fixture");
			if (assigned) {
				await d.db
					.insert(d.employmentLocations)
					.values({ employmentId: employment.id, locationId: assigned });
			}
			const response = await app.handle(
				new Request("http://localhost/v1/me", {
					headers: { authorization: `Bearer ${await token(profileId, email)}` },
				}),
			);
			const body = await response.json();
			return body.employments[0]?.workplace.timezone;
		};

		expect(await me(newYork.id)).toBe("America/New_York");
		expect(await me(null)).toBe("America/Chicago");
	});
}
