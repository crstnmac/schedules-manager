import type {
	AvailableWorkers,
	DailyRoster,
	DraftSchedule,
	LaborSummary,
	OpenShifts,
	PublishedSchedule,
	TimeOffRequests,
	WorkerOverview,
} from "./api";

interface WorkersPayload {
	workers: {
		employmentId: string;
		name: string;
		kind: string;
		wageCentsPerHour: number | null;
		positions: { id: string; name: string }[];
	}[];
}

/** "540" → "9:00 AM"; 1440-minute ends render as "12:00 AM" of the next day. */
export function minuteToClock(minute: number): string {
	const normalized = ((minute % 1440) + 1440) % 1440;
	const hour24 = Math.floor(normalized / 60);
	const minutePart = normalized % 60;
	const suffix = hour24 >= 12 ? "PM" : "AM";
	const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
	return `${hour12}:${String(minutePart).padStart(2, "0")} ${suffix}`;
}

const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

export function weekdayName(weekday: number): string {
	return WEEKDAYS[weekday] ?? `weekday ${weekday}`;
}

export function money(cents: number | null | undefined): string {
	if (cents === null || cents === undefined) return "—";
	return `$${(cents / 100).toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

export function hoursFromMinutes(minutes: number): string {
	const hours = minutes / 60;
	return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export function formatPublishedSchedule(result: PublishedSchedule): string {
	if (result.locations.length === 0) {
		return `No published schedules found for the week of ${result.weekStart}.`;
	}
	const lines: string[] = [`Published schedule, week of ${result.weekStart}:`];
	for (const location of result.locations) {
		lines.push(
			"",
			`**${location.locationName}** — version ${location.version.versionNumber} (published ${location.version.publishedAt.slice(0, 16).replace("T", " ")} UTC, ${location.shifts.length} shifts)`,
		);
		if (location.shifts.length === 0) {
			lines.push("No shifts.");
			continue;
		}
		let currentDate = "";
		for (const shift of location.shifts) {
			if (shift.date !== currentDate) {
				currentDate = shift.date;
				lines.push(`- ${currentDate}:`);
			}
			const worker = shift.workerName ?? "**OPEN**";
			lines.push(
				`  - ${minuteToClock(shift.startMinute)}–${minuteToClock(shift.endMinute)} ${worker} (${shift.positionName ?? "position"})`,
			);
		}
	}
	return lines.join("\n");
}

export function formatDraftSchedule(result: DraftSchedule): string {
	if (!result.exists) {
		return `No draft schedule exists yet for ${result.locationName}, week of ${result.weekStart}. Creating a shift with create_draft_shift will start one.`;
	}
	const published = result.publishedVersion
		? `published as version ${result.publishedVersion.versionNumber} (${result.publishedVersion.publishedAt.slice(0, 10)}); the draft holds unpublished changes`
		: "never published";
	const conflictCount = result.shifts.reduce(
		(sum, shift) => sum + shift.conflicts.length,
		0,
	);
	const lines: string[] = [
		`Draft schedule for ${result.locationName}, week of ${result.weekStart} — ${result.shifts.length} shifts, ${conflictCount} conflict${conflictCount === 1 ? "" : "s"}; ${published}.`,
	];
	if (result.shifts.length === 0) {
		lines.push("The draft has no shifts.");
		return lines.join("\n");
	}
	let currentDate = "";
	for (const shift of result.shifts) {
		if (shift.date !== currentDate) {
			currentDate = shift.date;
			lines.push(`- ${currentDate}:`);
		}
		const worker = shift.workerName ?? "**OPEN**";
		const conflictNote =
			shift.conflicts.length > 0
				? ` ⚠ ${shift.conflicts.map((c) => c.message).join("; ")}`
				: "";
		const overrideNote = shift.unavailabilityOverrideReason
			? ` (unavailability overridden: ${shift.unavailabilityOverrideReason})`
			: "";
		lines.push(
			`  - ${minuteToClock(shift.startMinute)}–${minuteToClock(shift.endMinute)} ${worker} (${shift.positionName}) id=${shift.id}${overrideNote}${conflictNote}`,
		);
	}
	return lines.join("\n");
}

export function formatDailyRoster(result: DailyRoster): string {
	if (result.locations.length === 0) {
		return `No locations have shifts on ${result.date}.`;
	}
	const lines: string[] = [`Daily roster for ${result.date}:`];
	for (const location of result.locations) {
		lines.push(
			"",
			`**${location.locationName}** — published ${location.published.length}, draft ${location.draft.length}`,
		);
		const rows =
			location.draft.length > 0 ? location.draft : location.published;
		if (rows.length === 0) {
			lines.push("No shifts planned.");
			continue;
		}
		for (const shift of rows) {
			const worker = shift.workerName ?? "**OPEN**";
			lines.push(
				`- ${minuteToClock(shift.startMinute)}–${minuteToClock(shift.endMinute)} ${worker} (${shift.positionName ?? "position"})`,
			);
		}
	}
	return lines.join("\n");
}

export function formatWorkers(result: WorkersPayload): string {
	if (result.workers.length === 0) {
		return "No active workers at this Workplace.";
	}
	const lines = [`Active workers (${result.workers.length}):`];
	for (const worker of result.workers) {
		const wage =
			worker.wageCentsPerHour !== null
				? `, ${money(worker.wageCentsPerHour)}/h`
				: "";
		const positions =
			worker.positions.map((p) => p.name).join(", ") || "any position";
		lines.push(
			`- ${worker.name} (${worker.kind}${wage}) — ${positions} — id=${worker.employmentId}`,
		);
	}
	return lines.join("\n");
}

export function formatWorkerOverview(result: WorkerOverview): string {
	const lines = [
		`${result.worker.name} (${result.worker.kind}) — week of ${result.weekStart}`,
		`Scheduled: ${hoursFromMinutes(result.scheduledMinutes)} across ${result.shifts.length} shifts.`,
	];
	if (result.worker.wageCentsPerHour !== null) {
		lines.push(`Wage: ${money(result.worker.wageCentsPerHour)}/hour.`);
	}
	if (result.shifts.length > 0) {
		lines.push("Shifts:");
		for (const shift of result.shifts) {
			lines.push(
				`- ${shift.date} ${minuteToClock(shift.startMinute)}–${minuteToClock(shift.endMinute)} ${shift.positionName} @ ${shift.locationName} (id=${shift.shiftId})`,
			);
		}
	}
	if (result.unavailability.length > 0) {
		lines.push("Unavailability:");
		for (const window of result.unavailability) {
			const when =
				window.kind === "recurring"
					? `every ${weekdayName(window.weekday ?? 0)}`
					: `on ${window.specificDate}`;
			const status =
				window.status === "approved"
					? "hard constraint"
					: `pending (currently ${window.status})`;
			lines.push(
				`- ${when} ${minuteToClock(window.startMinute)}–${minuteToClock(window.endMinute)} (${status}${window.note ? `: ${window.note}` : ""})`,
			);
		}
	}
	if (result.timeOff.length > 0) {
		lines.push("Time-off overlapping this week:");
		for (const request of result.timeOff) {
			lines.push(
				`- ${request.startsAt.slice(0, 10)} to ${request.endsAt.slice(0, 10)} — ${request.status}${request.reason ? ` (${request.reason})` : ""}`,
			);
		}
	}
	return lines.join("\n");
}

export function formatAvailableWorkers(result: AvailableWorkers): string {
	const lines: string[] = [
		`Availability ${result.window.startsAt.slice(0, 16).replace("T", " ")} → ${result.window.endsAt.slice(0, 16).replace("T", " ")} UTC (weekly overtime after ${hoursFromMinutes(result.overtimeWeeklyMinutes)}):`,
	];
	if (result.available.length === 0) {
		lines.push("**No one is available in this window.**");
	} else {
		lines.push(`Available (${result.available.length}):`);
		for (const worker of result.available) {
			const wage =
				worker.wageCentsPerHour !== null
					? `, ${money(worker.wageCentsPerHour)}/h`
					: "";
			lines.push(
				`- ${worker.name} (${hoursFromMinutes(worker.weekScheduledMinutes)} already this week${wage}) id=${worker.employmentId}`,
			);
		}
	}
	if (result.unavailable.length > 0) {
		lines.push(`Unavailable (${result.unavailable.length}):`);
		for (const worker of result.unavailable) {
			lines.push(`- ${worker.name}: ${worker.reasons.join("; ")}`);
		}
	}
	return lines.join("\n");
}

export function formatOpenShifts(result: OpenShifts): string {
	if (result.openShifts.length === 0) {
		return `No open shifts for the week of ${result.weekStart}.`;
	}
	const lines = [`Open shifts, week of ${result.weekStart}:`];
	for (const shift of result.openShifts) {
		const pickups =
			shift.pickupRequests.length > 0
				? ` — pickup requests: ${shift.pickupRequests.map((p) => `${p.workerName} (${p.status})`).join(", ")}`
				: "";
		lines.push(
			`- ${shift.date} ${minuteToClock(shift.startMinute)}–${minuteToClock(shift.endMinute)} ${shift.positionName} @ ${shift.locationName} (id=${shift.shiftId})${pickups}`,
		);
	}
	return lines.join("\n");
}

export function formatTimeOff(result: TimeOffRequests): string {
	if (result.requests.length === 0) {
		return "No matching time-off requests.";
	}
	const lines = [`Time-off requests (${result.requests.length}):`];
	for (const request of result.requests) {
		lines.push(
			`- ${request.workerName}: ${request.startsAt.slice(0, 10)} ${request.startsAt.slice(11, 16)} → ${request.endsAt.slice(0, 10)} ${request.endsAt.slice(11, 16)} UTC — ${request.status}${request.leaveTypeName ? ` (${request.leaveTypeName})` : ""}${request.reason ? ` "${request.reason}"` : ""} id=${request.id}`,
		);
	}
	return lines.join("\n");
}

export function formatLaborSummary(result: LaborSummary): string {
	const lines = [
		`Labor summary, week of ${result.weekStart} (draft plan):`,
		`- Scheduled: ${hoursFromMinutes(result.totals.scheduledMinutes)} (${hoursFromMinutes(result.totals.unassignedMinutes)} unassigned)`,
		`- Labor cost: ${money(result.totals.laborCents)}`,
	];
	if (result.totals.salesCents !== null) {
		lines.push(
			`- Sales: ${money(result.totals.salesCents)} → labor ${result.totals.laborPercent}%`,
		);
	} else {
		lines.push("- Sales: not recorded for this week");
	}
	if (result.byWorker.length > 0) {
		lines.push("By worker:");
		for (const worker of result.byWorker) {
			const cost =
				worker.totalCents !== null ? `, ${money(worker.totalCents)}` : "";
			const overtime =
				worker.overtimeCents && worker.overtimeCents > 0
					? ` (incl. ${money(worker.overtimeCents)} overtime)`
					: "";
			lines.push(
				`- ${worker.name}: ${hoursFromMinutes(worker.minutes)}${cost}${overtime}`,
			);
		}
	}
	return lines.join("\n");
}
