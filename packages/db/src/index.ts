import { env } from "@SchedulesManager/env/server";
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export * from "./schema";

export function createDb() {
	const client = new Pool({
		connectionString: env.DATABASE_URL,
		max: env.DATABASE_POOL_MAX,
		connectionTimeoutMillis: 10_000,
		idleTimeoutMillis: 10_000,
		allowExitOnIdle: env.NODE_ENV === "test",
	});
	return drizzle({ client, schema });
}

const database = createDb();
type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
const transactionContext = new AsyncLocalStorage<Transaction>();

// A command and all helpers it awaits share one connection and transaction.
// Nested transactions use savepoints, while concurrent requests remain isolated.
// This also makes the command's idempotency record atomic with its mutations.
export const db = new Proxy(database, {
	get(target, property) {
		if (property === "$client") return target.$client;
		const executor = transactionContext.getStore() ?? target;
		if (property === "transaction") {
			return (
				callback: Parameters<typeof database.transaction>[0],
				config?: Parameters<typeof database.transaction>[1],
			) =>
				executor.transaction(
					(tx) => transactionContext.run(tx, () => callback(tx)),
					config,
				);
		}
		const value = Reflect.get(executor, property);
		return typeof value === "function" ? value.bind(executor) : value;
	},
});
