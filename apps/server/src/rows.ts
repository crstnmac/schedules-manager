import { ConflictError } from "./errors";

export function firstRow<T>(rows: T[]): T {
	const row = rows[0];
	if (row === undefined) {
		throw new ConflictError("The operation could not be completed");
	}
	return row;
}
