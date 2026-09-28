import { formatDay } from "./time";

export type SwapShift = {
	id: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	/** The shift's Location zone; the workplace default when absent. */
	timezone?: string;
};

export function swapGiveTake(
	direction: "incoming" | "outgoing",
	swap: { requesterShift: SwapShift; counterpartShift: SwapShift },
): { give: SwapShift; take: SwapShift } {
	return direction === "incoming"
		? { give: swap.counterpartShift, take: swap.requesterShift }
		: { give: swap.requesterShift, take: swap.counterpartShift };
}

export function formatSwapShift(
	shift: SwapShift,
	formatClockTime: (iso?: string, timeZone?: string | null) => string,
): string {
	return `${formatDay(shift.startsAt, shift.timezone)} · ${formatClockTime(shift.startsAt, shift.timezone)}–${formatClockTime(shift.endsAt, shift.timezone)} · ${shift.positionName}`;
}

export function formatSwapExchange(
	direction: "incoming" | "outgoing",
	swap: { requesterShift: SwapShift; counterpartShift: SwapShift },
	formatClockTime: (iso?: string, timeZone?: string | null) => string,
): string {
	const { give, take } = swapGiveTake(direction, swap);
	return `Give ${formatSwapShift(give, formatClockTime)} · take ${formatSwapShift(take, formatClockTime)}`;
}
