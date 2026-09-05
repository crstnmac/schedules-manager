import { describe, expect, test } from "bun:test";

import { formatSwapExchange, type SwapShift, swapGiveTake } from "./swaps";
import { formatDay } from "./time";

const requesterShift: SwapShift = {
	id: "shift-a",
	positionName: "Barista",
	startsAt: "2026-09-07T09:00:00",
	endsAt: "2026-09-07T17:00:00",
};

const counterpartShift: SwapShift = {
	id: "shift-b",
	positionName: "Cashier",
	startsAt: "2026-09-07T07:00:00",
	endsAt: "2026-09-07T15:00:00",
};

const swap = { requesterShift, counterpartShift };

const clock = (iso?: string) => (iso ? iso.slice(11, 16) : "");

const fmt = (s: SwapShift) =>
	`${formatDay(s.startsAt)} · ${clock(s.startsAt)}–${clock(s.endsAt)} · ${s.positionName}`;

describe("swapGiveTake", () => {
	test("incoming -> give counterpartShift, take requesterShift", () => {
		const result = swapGiveTake("incoming", swap);
		expect(result.give).toBe(counterpartShift);
		expect(result.take).toBe(requesterShift);
	});

	test("outgoing -> give requesterShift, take counterpartShift", () => {
		const result = swapGiveTake("outgoing", swap);
		expect(result.give).toBe(requesterShift);
		expect(result.take).toBe(counterpartShift);
	});
});

describe("formatSwapExchange", () => {
	test("incoming renders 'Give <counterpartShift> · take <requesterShift>'", () => {
		expect(formatSwapExchange("incoming", swap, clock)).toBe(
			`Give ${fmt(counterpartShift)} · take ${fmt(requesterShift)}`,
		);
	});

	test("outgoing renders 'Give <requesterShift> · take <counterpartShift>'", () => {
		expect(formatSwapExchange("outgoing", swap, clock)).toBe(
			`Give ${fmt(requesterShift)} · take ${fmt(counterpartShift)}`,
		);
	});

	test("regression: incoming does NOT render the reversed Give/take string", () => {
		const reversed = formatSwapExchange("outgoing", swap, clock);
		expect(formatSwapExchange("incoming", swap, clock)).not.toBe(reversed);
	});
});
