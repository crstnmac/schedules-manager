import { formatDateKey } from "./leave";

export function acceptanceHeadline(date: string, positionName: string): string {
	return `${formatDateKey(date)} · ${positionName}`;
}
