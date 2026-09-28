import type { ListFilter, ListSort } from "@/components/list-view";
import type { TimecardEntry } from "@/lib/queries";

/** Worked time so far; an open entry counts up to now. */
export function punchMs(entry: TimecardEntry) {
	return entry.clockedOutAt == null
		? Date.now() - new Date(entry.clockedInAt).getTime()
		: new Date(entry.clockedOutAt).getTime() -
				new Date(entry.clockedInAt).getTime();
}

/** Sorts shared by every list of a worker's own punches. */
export const PUNCH_SORTS: ListSort<TimecardEntry>[] = [
	{
		id: "day",
		label: "Day",
		compare: (a, b) => a.clockedInAt.localeCompare(b.clockedInAt),
	},
	{
		id: "positionName",
		label: "Position",
		compare: (a, b) => a.positionName.localeCompare(b.positionName),
	},
	{
		id: "duration",
		label: "Duration",
		compare: (a, b) => punchMs(a) - punchMs(b),
	},
];

export const PUNCH_STATUS_FILTER: ListFilter<TimecardEntry> = {
	id: "status",
	label: "Status",
	options: [
		{ label: "On the clock", value: "open" },
		{ label: "Completed", value: "closed" },
	],
	value: (entry) => (entry.clockedOutAt === null ? "open" : "closed"),
};

export const punchId = (entry: TimecardEntry) => entry.id;
