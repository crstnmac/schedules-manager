import { expect, test } from "bun:test";
import { type DiffableShift, diffShiftSets } from "../src/routes/changes";

function shift(input: {
	id: string;
	shiftId?: string;
	positionId: string;
	startHour: number;
	note?: string | null;
}): DiffableShift {
	const day = Date.parse("2026-09-07T00:00:00Z");
	return {
		id: input.id,
		shiftId: input.shiftId ?? null,
		employmentId: "emp-1",
		positionId: input.positionId,
		startsAt: new Date(day + input.startHour * 3_600_000),
		endsAt: new Date(day + (input.startHour + 8) * 3_600_000),
		note: input.note ?? null,
	};
}

test("identity (shiftId) matching pairs the same Shift across versions", () => {
	const previous = [
		shift({ id: "v1", shiftId: "s1", positionId: "pos-a", startHour: 9 }),
		shift({ id: "v2", shiftId: "s2", positionId: "pos-a", startHour: 17 }),
	];
	const next = [
		shift({ id: "d1", shiftId: "s1", positionId: "pos-a", startHour: 10 }),
		shift({ id: "d2", shiftId: "s2", positionId: "pos-a", startHour: 17 }),
	];
	const changes = diffShiftSets(previous, next, "UTC");
	expect(changes).toHaveLength(1);
	expect(changes[0].kind).toBe("time_changed");
	expect(changes[0].draftShiftId).toBe("d1");
});

test("fallback matching pairs same-position shifts by nearest start", () => {
	const previous = [
		shift({ id: "v1", positionId: "pos-a", startHour: 9 }),
		shift({ id: "v2", positionId: "pos-a", startHour: 17 }),
	];
	const next = [
		shift({ id: "d1", positionId: "pos-a", startHour: 10 }),
		shift({ id: "d2", positionId: "pos-a", startHour: 18 }),
	];
	const changes = diffShiftSets(previous, next, "UTC");
	expect(
		changes.filter((change) => change.kind === "time_changed"),
	).toHaveLength(2);
	expect(changes.filter((change) => change.kind === "added")).toHaveLength(0);
	expect(changes.filter((change) => change.kind === "removed")).toHaveLength(0);
});

test("moved shift stays paired with its own counterpart, not the wrong shift", () => {
	const previous = [
		shift({ id: "v1", positionId: "pos-a", startHour: 8 }),
		shift({ id: "v2", positionId: "pos-a", startHour: 16 }),
	];
	// The early shift moved three hours later; the late one did not move.
	const next = [
		shift({ id: "d1", positionId: "pos-a", startHour: 11 }),
		shift({ id: "d2", positionId: "pos-a", startHour: 16 }),
	];
	const changes = diffShiftSets(previous, next, "UTC");
	const moved = changes.filter(
		(change) => change.kind === "time_changed" && change.draftShiftId === "d1",
	);
	const stationary = changes.filter(
		(change) => change.kind === "time_changed" && change.draftShiftId === "d2",
	);
	expect(moved).toHaveLength(1);
	expect(stationary).toHaveLength(0);
});
