import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const expectedDatabase = "schedules_manager_test";

export function integrationDatabaseUrl(): string {
	const value = process.env.DATABASE_URL;
	if (!value) throw new Error("DATABASE_URL is required for integration tests");

	const url = new URL(value);
	const localHost =
		url.hostname === "127.0.0.1" || url.hostname === "localhost";
	const database = url.pathname.slice(1);
	if (!localHost || database !== expectedDatabase) {
		throw new Error(
			`Refusing to reset database ${url.hostname}/${database}; expected localhost/${expectedDatabase}`,
		);
	}
	return value;
}

export async function resetAndMigrateDatabase() {
	const pool = new Pool({ connectionString: integrationDatabaseUrl() });
	try {
		await pool.query("drop schema if exists public cascade");
		await pool.query("drop schema if exists drizzle cascade");
		await pool.query("create schema public");
		await migrate(drizzle(pool), {
			migrationsFolder: new URL(
				"../../../../packages/db/src/migrations",
				import.meta.url,
			).pathname,
		});
	} finally {
		await pool.end();
	}
}
