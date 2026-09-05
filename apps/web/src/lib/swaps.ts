import { formatDay } from "./time";

export type SwapShift = {
	id: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
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
	formatClockTime: (iso?: string) => string,
): string {
	return `${formatDay(shift.startsAt)} · ${formatClockTime(shift.startsAt)}–${formatClockTime(shift.endsAt)} · ${shift.positionName}`;
}

export function formatSwapExchange(
	direction: "incoming" | "outgoing",
	swap: { requesterShift: SwapShift; counterpartShift: SwapShift },
	formatClockTime: (iso?: string) => string,
): string {
	const { give, take } = swapGiveTake(direction, swap);
	return `Give ${formatSwapShift(give, formatClockTime)} · take ${formatSwapShift(take, formatClockTime)}`;
}
