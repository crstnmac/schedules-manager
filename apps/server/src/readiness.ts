export type ReadinessReport = {
	status: "ready" | "not_ready";
	checks: { database: "up" | "down" };
};

export async function pingDatabase(): Promise<void> {
	const { db } = await import("@SchedulesManager/db");
	const { sql } = await import("drizzle-orm");
	await db.execute(sql`select 1`);
}

export async function getReadinessReport(
	ping: () => Promise<void> = pingDatabase,
): Promise<ReadinessReport> {
	try {
		await ping();
		return { status: "ready", checks: { database: "up" } };
	} catch {
		return { status: "not_ready", checks: { database: "down" } };
	}
}
