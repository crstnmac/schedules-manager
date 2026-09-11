export const PAID_DAY_MINUTES = 480;

export type LeaveTimeFormat = "12h" | "24h";

export function formatLeaveHours(minutes: number): string {
	const safe = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safe / 60);
	const rest = safe % 60;
	if (hours === 0 && rest === 0) return "0h";
	if (rest === 0) return `${hours}h`;
	if (hours === 0) return `${rest}m`;
	return `${hours}h ${rest}m`;
}

export function hoursToMinutes(value: string): number {
	const hours = Number(value);
	if (!Number.isFinite(hours) || hours < 0) return 0;
	return Math.round(hours * 60);
}

export function minutesToHoursInput(minutes: number): string {
	const hours = minutes / 60;
	return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function formatLeaveMinute(
	minute: number,
	timeFormat: LeaveTimeFormat = "12h",
): string {
	const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
	const hours = Math.floor(normalized / 60);
	const mins = normalized % 60;
	if (timeFormat === "24h") {
		return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
	}
	const suffix = hours >= 12 ? "PM" : "AM";
	const display = hours % 12 === 0 ? 12 : hours % 12;
	return `${display}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatDateKey(dateKey: string): string {
	return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

export function formatLeaveMonth(monthKey: string): string {
	const date = new Date(`${monthKey}-01T12:00:00`);
	if (Number.isNaN(date.getTime())) return monthKey;
	return date.toLocaleDateString(undefined, {
		month: "short",
		year: "numeric",
	});
}

export function formatLeaveRange(
	input: {
		startDate?: string;
		endDate?: string;
		allDay?: boolean;
		startMinute?: number | null;
		endMinute?: number | null;
		startsAt: string;
		endsAt: string;
	},
	timeFormat: LeaveTimeFormat = "12h",
): string {
	if (input.startDate && input.endDate) {
		const start = formatDateKey(input.startDate);
		const end = formatDateKey(input.endDate);
		if (input.allDay) {
			return input.startDate === input.endDate ? start : `${start} – ${end}`;
		}
		if (input.startMinute == null || input.endMinute == null) {
			return input.startDate === input.endDate ? start : `${start} – ${end}`;
		}
		const startTime = formatLeaveMinute(input.startMinute, timeFormat);
		const endTime = formatLeaveMinute(input.endMinute, timeFormat);
		return input.startDate === input.endDate
			? `${start} · ${startTime}–${endTime}`
			: `${start} ${startTime} – ${end} ${endTime}`;
	}
	const start = new Date(input.startsAt).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
	const end = new Date(input.endsAt).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
	return start === end ? start : `${start} – ${end}`;
}

export interface LeavePolicySummaryInput {
	accrualMethod:
		| "none"
		| "weekly"
		| "biweekly"
		| "semimonthly"
		| "monthly"
		| "annual"
		| "per_hour_worked";
	accrualMinutes: number;
	accrualPerHoursWorked: number;
	maxBalanceMinutes: number | null;
	carryForwardEnabled: boolean;
	maxCarryForwardMinutes: number | null;
	encashmentEnabled: boolean;
}

export function leavePolicySummary(policy: LeavePolicySummaryInput): string[] {
	const chips: string[] = [];
	if (policy.accrualMethod === "per_hour_worked") {
		chips.push(
			`Accrues ${formatLeaveHours(policy.accrualMinutes)} per ${policy.accrualPerHoursWorked}h worked`,
		);
	} else if (policy.accrualMethod !== "none") {
		const period =
			policy.accrualMethod === "weekly"
				? "weekly"
				: policy.accrualMethod === "biweekly"
					? "every 2 weeks"
					: policy.accrualMethod === "semimonthly"
						? "twice a month"
						: policy.accrualMethod === "monthly"
							? "monthly"
							: "yearly";
		chips.push(`Accrues ${formatLeaveHours(policy.accrualMinutes)} ${period}`);
	}
	if (policy.maxBalanceMinutes != null) {
		chips.push(`Caps at ${formatLeaveHours(policy.maxBalanceMinutes)}`);
	}
	if (policy.carryForwardEnabled) {
		chips.push(
			policy.maxCarryForwardMinutes != null
				? `Carries up to ${formatLeaveHours(policy.maxCarryForwardMinutes)}`
				: "Carry-over enabled",
		);
	}
	if (policy.encashmentEnabled) chips.push("Encashable");
	return chips;
}

export function todayIsoDate(): string {
	return new Date().toLocaleDateString("sv-SE");
}

export function shiftDays(dateKey: string, days: number): string {
	const parsed = new Date(`${dateKey}T00:00:00Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}
