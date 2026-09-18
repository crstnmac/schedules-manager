import { INTEGRATION_PREFIX } from "./config";

/**
 * Error surfaced by the jooling API. The `code` mirrors the API's error
 * taxonomy (`unauthorized`, `forbidden`, `not_found`, ...) so MCP tool
 * handlers can phrase failures precisely for the assistant.
 */
export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
	}
}

export interface WorkplaceContext {
	workplace: {
		id: string;
		name: string;
		weekStartDay: number;
		noticeWindowHours: number;
		overtimeWeeklyMinutes: number;
		overtimeDailyMinutes: number;
		laborCostPercentGoal: number | null;
	};
	locations: {
		id: string;
		name: string;
		timezone: string;
		addressLine: string | null;
	}[];
	positions: { id: string; name: string }[];
	credential: { kind: string; scopes: string[] };
}

export interface WorkerSummary {
	employmentId: string;
	name: string;
	email: string;
	kind: string;
	wageCentsPerHour: number | null;
	joinedAt: string | null;
	positions: { id: string; name: string }[];
	locations: { id: string; name: string }[];
}

export interface RosterShift {
	id: string;
	workerName: string | null;
	positionName: string | null;
	startsAt: string;
	endsAt: string;
	date: string;
	startMinute: number;
	endMinute: number;
	note: string | null;
}

export interface PublishedSchedule {
	weekStart: string;
	locations: {
		locationId: string;
		locationName: string;
		timezone: string;
		version: { id: string; versionNumber: number; publishedAt: string };
		shifts: RosterShift[];
	}[];
}

export interface DraftShift {
	id: string;
	employmentId: string | null;
	workerName: string | null;
	workerEmail: string | null;
	positionId: string;
	positionName: string;
	startsAt: string;
	endsAt: string;
	date: string;
	startMinute: number;
	endMinute: number;
	overnight: boolean;
	note: string | null;
	unavailabilityOverrideReason: string | null;
	conflicts: { shiftId: string; type: string; message: string }[];
}

export interface DraftSchedule {
	exists: boolean;
	locationId: string;
	locationName: string;
	weekStart: string;
	scheduleId?: string;
	publishedVersion?: { versionNumber: number; publishedAt: string } | null;
	shifts: DraftShift[];
}

export interface DailyRoster {
	date: string;
	locations: {
		locationId: string;
		locationName: string;
		timezone: string;
		published: RosterShift[];
		draft: RosterShift[];
	}[];
}

export interface OpenShifts {
	weekStart: string;
	openShifts: {
		openShiftId: string;
		shiftId: string;
		locationId: string;
		locationName: string;
		positionId: string;
		positionName: string;
		date: string;
		startMinute: number;
		endMinute: number;
		startsAt: string;
		endsAt: string;
		note: string | null;
		pickupRequests: { workerName: string; status: string }[];
	}[];
}

export interface TimeOffRequests {
	requests: {
		id: string;
		employmentId: string;
		workerName: string;
		startsAt: string;
		endsAt: string;
		status: string;
		reason: string | null;
		leaveTypeName: string | null;
		chargeMinutes: number | null;
		createdAt: string;
	}[];
}

export interface LaborSummary {
	weekStart: string;
	basis: "draft";
	totals: {
		scheduledMinutes: number;
		unassignedMinutes: number;
		laborCents: number;
		salesCents: number | null;
		laborPercent: number | null;
	};
	byWorker: {
		employmentId: string;
		name: string;
		minutes: number;
		regularCents: number | null;
		overtimeCents: number | null;
		totalCents: number | null;
	}[];
	byDate: {
		date: string;
		minutes: number;
		hours: number;
		salesCents: number | null;
	}[];
}

export interface WorkerOverview {
	worker: {
		employmentId: string;
		name: string;
		email: string;
		kind: string;
		wageCentsPerHour: number | null;
		positionIds: string[];
		positionNames: string[];
		locationIds: string[];
	};
	weekStart: string;
	scheduledMinutes: number;
	shifts: {
		shiftId: string;
		locationName: string;
		positionName: string;
		date: string;
		startMinute: number;
		endMinute: number;
		startsAt: string;
		endsAt: string;
		note: string | null;
	}[];
	unavailability: {
		kind: string;
		weekday: number | null;
		specificDate: string | null;
		startMinute: number;
		endMinute: number;
		status: string;
		note: string | null;
	}[];
	timeOff: {
		id: string;
		startsAt: string;
		endsAt: string;
		status: string;
		reason: string | null;
	}[];
}

export interface AvailableWorkers {
	window: { startsAt: string; endsAt: string };
	overtimeWeeklyMinutes: number;
	available: {
		employmentId: string;
		name: string;
		email: string;
		kind: string;
		wageCentsPerHour: number | null;
		weekScheduledMinutes: number;
	}[];
	unavailable: { employmentId: string; name: string; reasons: string[] }[];
}

export interface PublishResult {
	version: {
		id: string;
		versionNumber: number;
		publishedAt: string;
		workers: number;
	};
	changes: {
		total: number;
		material: number;
		acceptancesRequired: number;
	};
}

type Query = Record<string, string | number | undefined>;

/** Fetch-like callable; hosts may route requests in-process instead of HTTP. */
export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

function queryString(query: Query | undefined): string {
	if (!query) return "";
	const entries = Object.entries(query).filter(
		(entry): entry is [string, string | number] => entry[1] !== undefined,
	);
	if (entries.length === 0) return "";
	const params = new URLSearchParams();
	for (const [key, value] of entries) {
		params.set(key, String(value));
	}
	return `?${params.toString()}`;
}

/**
 * Thin typed client for the jooling `/v1/integration` endpoints. One instance
 * is bound to one Workplace API key; the API is the sole source of truth for
 * every rule (conflicts, notice windows, publication atomicity).
 */
export class JoolingApi {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly fetchImpl: FetchLike;

	constructor(options: {
		baseUrl: string;
		apiKey: string;
		fetchImpl?: FetchLike;
	}) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "");
		this.apiKey = options.apiKey;
		this.fetchImpl = options.fetchImpl ?? fetch;
	}

	private async request<T>(
		method: "GET" | "POST" | "PATCH" | "DELETE",
		path: string,
		options?: { query?: Query; body?: unknown },
	): Promise<T> {
		const response = await this.fetchImpl(
			`${this.baseUrl}${INTEGRATION_PREFIX}${path}${queryString(options?.query)}`,
			{
				method,
				headers: {
					authorization: `Bearer ${this.apiKey}`,
					...(options?.body ? { "content-type": "application/json" } : {}),
				},
				body: options?.body ? JSON.stringify(options.body) : undefined,
			},
		);

		if (!response.ok) {
			let code = "http_error";
			let message = `The jooling API returned ${response.status}`;
			try {
				const payload = (await response.json()) as {
					error?: string;
					message?: string;
				};
				if (payload.error) code = payload.error;
				if (payload.message) message = payload.message;
			} catch {
				// Non-JSON error body; keep the HTTP fallbacks above.
			}
			throw new ApiError(response.status, code, message);
		}

		return (await response.json()) as T;
	}

	getContext() {
		return this.request<WorkplaceContext>("GET", "/context");
	}

	getWorkers() {
		return this.request<{ workers: WorkerSummary[] }>("GET", "/workers");
	}

	getPublishedSchedule(weekStart: string, locationId?: string) {
		return this.request<PublishedSchedule>("GET", "/published", {
			query: { weekStart, locationId },
		});
	}

	getDraft(locationId: string, weekStart: string) {
		return this.request<DraftSchedule>("GET", "/draft", {
			query: { locationId, weekStart },
		});
	}

	getDailyRoster(date: string, locationId?: string) {
		return this.request<DailyRoster>("GET", "/roster", {
			query: { date, locationId },
		});
	}

	getOpenShifts(weekStart: string) {
		return this.request<OpenShifts>("GET", "/open-shifts", {
			query: { weekStart },
		});
	}

	getTimeOffRequests(query?: {
		status?: string;
		employmentId?: string;
		from?: string;
		to?: string;
	}) {
		return this.request<TimeOffRequests>("GET", "/time-off", { query });
	}

	getLaborSummary(weekStart: string, locationId?: string) {
		return this.request<LaborSummary>("GET", "/labor", {
			query: { weekStart, locationId },
		});
	}

	getWorkerOverview(employmentId: string, weekStart: string) {
		return this.request<WorkerOverview>("GET", "/worker", {
			query: { employmentId, weekStart },
		});
	}

	getAvailableWorkers(query: {
		startsAt: string;
		endsAt: string;
		positionId?: string;
		locationId?: string;
	}) {
		return this.request<AvailableWorkers>("GET", "/available-workers", {
			query,
		});
	}

	createDraftShift(body: {
		locationId: string;
		weekStart: string;
		date: string;
		startMinute: number;
		endMinute: number;
		positionId: string;
		employmentId?: string | null;
		note?: string;
		unavailabilityOverrideReason?: string;
		approvePosition?: boolean;
	}) {
		return this.request<{ shiftId: string; scheduleId: string }>(
			"POST",
			"/shifts",
			{ body },
		);
	}

	updateDraftShift(
		shiftId: string,
		body: {
			employmentId?: string | null;
			positionId?: string;
			date?: string;
			startMinute?: number;
			endMinute?: number;
			note?: string | null;
			unavailabilityOverrideReason?: string | null;
			approvePosition?: boolean;
		},
	) {
		return this.request<{ ok: true }>("PATCH", `/shifts/${shiftId}`, { body });
	}

	deleteDraftShift(shiftId: string) {
		return this.request<{ ok: true }>("DELETE", `/shifts/${shiftId}`);
	}

	publishSchedule(scheduleId: string) {
		return this.request<PublishResult>(
			"POST",
			`/schedules/${scheduleId}/publish`,
		);
	}
}
