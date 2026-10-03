import { env } from "@SchedulesManager/env/web";
import { createDataColumnHelper } from "@/components/data-table";
import type { ListFilter, ListSort } from "@/components/list-view";
import { formatLeaveHours } from "@/lib/leave";
import type { LeavePolicyDto, WorkerConstraints } from "@/lib/queries";
import { WEEKDAY_NAMES } from "@/lib/time";

export const WEEKDAY_ITEMS = WEEKDAY_NAMES.map((name, index) => ({
	label: name,
	value: String(index),
}));

export const RECURRENCE_ITEMS = [
	{ label: "Weekly", value: "weekly" },
	{ label: "Every 2 weeks", value: "biweekly" },
	{ label: "Monthly", value: "monthly" },
] as const;

export interface RecurringWindow {
	id: string;
	weekday: number;
	startMinute: number;
	endMinute: number;
	note?: string;
	status?: "pending" | "approved";
}

export interface DateWindow {
	id: string;
	date: string;
	startMinute: number;
	endMinute: number;
	note?: string;
	status?: "pending" | "approved";
}

export type ServerUnavailability =
	WorkerConstraints["unavailability"][number] & {
		status?: "pending" | "approved";
	};

export type UnavailabilityRow = {
	id: string;
	kind: "weekly" | "date";
	window: string;
	status: "pending" | "approved";
	note: string | null;
};

export type LeaveRequestMode = "single" | "multiple" | "recurring";

export type LeaveRecurrenceFrequency = "weekly" | "biweekly" | "monthly";

export type LeaveWindowRow = {
	id: string;
	startDate: string;
	endDate: string;
};

export const unavailabilityHelper = createDataColumnHelper<UnavailabilityRow>();
export const timeOffHelper =
	createDataColumnHelper<WorkerConstraints["timeOff"][number]>();

export type TimeOffRow = WorkerConstraints["timeOff"][number];

export const TIME_OFF_FILTERS: ListFilter<TimeOffRow>[] = [
	{
		id: "status",
		label: "Status",
		options: [
			{ label: "Pending", value: "pending" },
			{ label: "Approved", value: "approved" },
			{ label: "Declined", value: "declined" },
			{ label: "Cancelled", value: "cancelled" },
		],
		value: (row) => row.status,
	},
];

export const TIME_OFF_SORTS: ListSort<TimeOffRow>[] = [
	{
		id: "when",
		label: "Date",
		compare: (a, b) => a.startsAt.localeCompare(b.startsAt),
	},
	{
		id: "status",
		label: "Status",
		compare: (a, b) => a.status.localeCompare(b.status),
	},
];

export const UNAVAILABILITY_FILTERS: ListFilter<UnavailabilityRow>[] = [
	{
		id: "kind",
		label: "Type",
		options: [
			{ label: "Weekly", value: "weekly" },
			{ label: "Date", value: "date" },
		],
		value: (row) => row.kind,
	},
	{
		id: "status",
		label: "Status",
		options: [
			{ label: "Pending", value: "pending" },
			{ label: "Approved", value: "approved" },
		],
		value: (row) => row.status,
	},
];

export const UNAVAILABILITY_SORTS: ListSort<UnavailabilityRow>[] = [
	{
		id: "kind",
		label: "Type",
		compare: (a, b) => a.kind.localeCompare(b.kind),
	},
	{
		id: "status",
		label: "Status",
		compare: (a, b) => a.status.localeCompare(b.status),
	},
];

export const searchUnavailability = (row: UnavailabilityRow) => [
	row.kind,
	row.window,
	row.status,
	row.note,
];
export const timeOffId = (row: TimeOffRow) => row.id;
export const unavailabilityId = (row: UnavailabilityRow) =>
	`${row.kind}-${row.id}`;

export function windowId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatFileSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function leavePolicySummary(policy: LeavePolicyDto): string[] {
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

export async function uploadLeaveDocumentFile(
	workplaceId: string,
	requestId: string,
	file: File,
) {
	const formData = new FormData();
	formData.append("file", file);
	const response = await fetch(
		`${env.VITE_SERVER_URL}/v1/workplaces/${workplaceId}/time-off/${requestId}/documents`,
		{
			method: "POST",
			credentials: "include",
			body: formData,
		},
	);
	if (!response.ok) {
		let message = `Upload failed (${response.status}).`;
		try {
			const payload = (await response.json()) as { message?: string };
			if (payload.message) message = payload.message;
		} catch {
			// keep default message
		}
		throw new Error(message);
	}
	return (await response.json()) as {
		document: {
			id: string;
			fileName: string;
			mimeType: string;
			sizeBytes: number;
		};
	};
}

export async function deleteLeaveDocumentFile(
	workplaceId: string,
	documentId: string,
) {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/v1/workplaces/${workplaceId}/leave-documents/${documentId}`,
		{ method: "DELETE", credentials: "include" },
	);
	if (!response.ok) {
		let message = `Couldn’t remove the document (${response.status}).`;
		try {
			const payload = (await response.json()) as { message?: string };
			if (payload.message) message = payload.message;
		} catch {
			// keep default message
		}
		throw new Error(message);
	}
}

export async function openLeaveDocumentFile(documentId: string) {
	const response = await fetch(
		`${env.VITE_SERVER_URL}/v1/leave-documents/${documentId}`,
		{ credentials: "include" },
	);
	if (!response.ok) {
		throw new Error(`Couldn’t open the document (${response.status}).`);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	window.open(url, "_blank", "noopener,noreferrer");
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
