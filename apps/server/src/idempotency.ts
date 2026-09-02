import { db, idempotencyRecords } from "@SchedulesManager/db";
import { and, eq, sql } from "drizzle-orm";

import { ConflictError } from "./errors";

function requestHash(value: unknown): string {
	return new Bun.CryptoHasher("sha256")
		.update(JSON.stringify(value))
		.digest("hex");
}

export async function withIdempotency<T>(input: {
	actorProfileId: string;
	scope: string;
	key: string | undefined;
	request: unknown;
	execute: () => Promise<T>;
}): Promise<T> {
	const key = input.key;
	if (!key) return db.transaction(() => input.execute());

	const hash = requestHash(input.request);
	const lockKey = `${input.actorProfileId}:${input.scope}:${key}`;

	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
		);

		const [existing] = await tx
			.select()
			.from(idempotencyRecords)
			.where(
				and(
					eq(idempotencyRecords.actorProfileId, input.actorProfileId),
					eq(idempotencyRecords.scope, input.scope),
					eq(idempotencyRecords.key, key),
				),
			)
			.limit(1);

		if (existing) {
			if (existing.requestHash !== hash) {
				throw new ConflictError(
					"This idempotency key was already used for a different request",
				);
			}
			return existing.response as T;
		}

		const response = await input.execute();
		await tx.insert(idempotencyRecords).values({
			actorProfileId: input.actorProfileId,
			scope: input.scope,
			key,
			requestHash: hash,
			response,
		});
		return response;
	});
}
