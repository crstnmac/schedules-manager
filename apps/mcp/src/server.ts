import {
	McpServer,
	ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	ApiError,
	type JoolingApi,
	type LaborSummary,
	type PublishResult,
} from "./api";
import {
	formatAvailableWorkers,
	formatDailyRoster,
	formatDraftSchedule,
	formatLaborSummary,
	formatOpenShifts,
	formatPublishedSchedule,
	formatTimeOff,
	formatWorkerOverview,
	formatWorkers,
	minuteToClock,
} from "./format";

const SERVER_NAME = "jooling";
const SERVER_VERSION = "0.1.0";

const dateArg = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must look like 2026-09-21");
const minuteArg = z
	.number()
	.int()
	.min(0)
	.max(1440)
	.describe(
		"Minutes from local midnight; 540 = 9:00 AM. An end at or before the start means the shift ends the next day.",
	);
const isoArg = z
	.string()
	.datetime({ offset: true })
	.describe("ISO 8601 instant with timezone, e.g. 2026-09-21T09:00:00-05:00");

const weekStartHint =
	"The week's start date in the Workplace's calendar (weeks begin on its configured week-start day; ask get_workplace_context if unsure).";

/** Tool results pair a human-readable summary with the raw API payload. */
function toolResult<T extends object>(text: string, structured: T) {
	return {
		content: [{ type: "text" as const, text }],
		structuredContent: structured as Record<string, unknown>,
	};
}

/** API failures become tool errors the assistant can read and react to. */
function toolError(error: unknown) {
	if (error instanceof ApiError) {
		const hint =
			error.status === 401
				? " The API key may be invalid, revoked, or expired."
				: error.status === 403
					? " The API key is missing the scope this tool needs; a Manager can grant it under Integrations."
					: "";
		return {
			content: [
				{
					type: "text" as const,
					text: `jooling API error (${error.status} ${error.code}): ${error.message}.${hint}`,
				},
			],
			isError: true,
		};
	}
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: "text" as const, text: `Unexpected error: ${message}` }],
		isError: true,
	};
}

const readAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

const writeAnnotations = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false,
};

const deleteAnnotations = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: true,
	openWorldHint: false,
};

export function createJoolingServer(api: JoolingApi): McpServer {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{
			instructions:
				"This server operates jooling, the hourly-work scheduling product. Domain language: a Workplace runs Locations; Workers hold Employments; a Schedule is one Location's planned Shifts for one workweek; drafts are edited and then published atomically as an immutable Schedule Version that is communicated to Workers. Before editing, read the draft to see conflicts; after editing, publish to make changes visible to Workers. Read tools are safe; write tools change the draft; publish communicates with real Workers.",
		},
	);

	server.registerTool(
		"get_workplace_context",
		{
			title: "Workplace context",
			description:
				"Get the Workplace's locations, positions, and scheduling policy (week-start day, notice window, overtime rules, labor goal). Call this first to learn the identifiers other tools need.",
			inputSchema: {},
			annotations: readAnnotations,
		},
		async () => {
			try {
				const context = await api.getContext();
				return toolResult(
					[
						`Workplace: ${context.workplace.name}`,
						`Week starts on day ${context.workplace.weekStartDay} (0=Sunday). Overtime after ${context.workplace.overtimeWeeklyMinutes / 60}h/week. Notice window: ${context.workplace.noticeWindowHours}h.`,
						`Locations: ${context.locations.map((l) => `${l.name} (id=${l.id}, ${l.timezone})`).join("; ") || "none"}`,
						`Positions: ${context.positions.map((p) => `${p.name} (id=${p.id})`).join("; ") || "none"}`,
					].join("\n"),
					context,
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"list_workers",
		{
			title: "List workers",
			description:
				"List active Workers with their role, positions, and wage rates. Returns employment ids used by scheduling tools.",
			inputSchema: {},
			annotations: readAnnotations,
		},
		async () => {
			try {
				const result = await api.getWorkers();
				return toolResult(formatWorkers(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"get_published_schedule",
		{
			title: "Get published schedule",
			description:
				"Read the Published Schedule (what Workers were actually told) for one workweek — either one Location or the whole Workplace. Requires the schedule.read scope.",
			inputSchema: {
				weekStart: dateArg.describe(weekStartHint),
				locationId: z
					.string()
					.uuid()
					.optional()
					.describe("Limit to one Location; omit for every Location."),
			},
			annotations: readAnnotations,
		},
		async ({ weekStart, locationId }) => {
			try {
				const result = await api.getPublishedSchedule(weekStart, locationId);
				return toolResult(formatPublishedSchedule(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"get_schedule_draft",
		{
			title: "Get draft schedule",
			description:
				"Read the draft Schedule for one Location and workweek, including server-computed conflicts (overlaps, unavailability, time-off, clopening, consecutive days) and which version is published. This is the manager's working view. Requires the schedule.read scope.",
			inputSchema: {
				locationId: z.string().uuid(),
				weekStart: dateArg.describe(weekStartHint),
			},
			annotations: readAnnotations,
		},
		async ({ locationId, weekStart }) => {
			try {
				const result = await api.getDraft(locationId, weekStart);
				return toolResult(formatDraftSchedule(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"get_daily_roster",
		{
			title: "Get daily roster",
			description:
				"Read the Daily Roster — who is working on a given date, per Location, from both the published version and the current draft. Requires the schedule.read scope.",
			inputSchema: {
				date: dateArg.describe("Calendar date in the Location's timezone."),
				locationId: z.string().uuid().optional(),
			},
			annotations: readAnnotations,
		},
		async ({ date, locationId }) => {
			try {
				const result = await api.getDailyRoster(date, locationId);
				return toolResult(formatDailyRoster(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"get_worker_overview",
		{
			title: "Get worker overview",
			description:
				"One Worker's week: scheduled Shifts and hours, wage, unavailability windows, and time-off. The right tool for 'what does Maria's week look like?'. Requires the workers.read scope.",
			inputSchema: {
				employmentId: z.string().uuid(),
				weekStart: dateArg.describe(weekStartHint),
			},
			annotations: readAnnotations,
		},
		async ({ employmentId, weekStart }) => {
			try {
				const result = await api.getWorkerOverview(employmentId, weekStart);
				return toolResult(formatWorkerOverview(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"find_available_workers",
		{
			title: "Find available workers",
			description:
				"Find Workers who could take a shift in a time window: not already scheduled, no unavailability or time-off, qualified for the position and assigned to the Location. Everyone else is listed with the reason. Use this before offering or assigning a shift. Requires the workers.read scope.",
			inputSchema: {
				startsAt: isoArg.describe("Window start."),
				endsAt: isoArg.describe("Window end."),
				positionId: z.string().uuid().optional(),
				locationId: z.string().uuid().optional(),
			},
			annotations: readAnnotations,
		},
		async ({ startsAt, endsAt, positionId, locationId }) => {
			try {
				const result = await api.getAvailableWorkers({
					startsAt,
					endsAt,
					positionId,
					locationId,
				});
				return toolResult(formatAvailableWorkers(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"list_open_shifts",
		{
			title: "List open shifts",
			description:
				"List Open Shifts (unassigned shifts offered for pickup) for a workweek, with pending pickup requests. Requires the schedule.read scope.",
			inputSchema: {
				weekStart: dateArg.describe(weekStartHint),
			},
			annotations: readAnnotations,
		},
		async ({ weekStart }) => {
			try {
				const result = await api.getOpenShifts(weekStart);
				return toolResult(formatOpenShifts(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"list_time_off_requests",
		{
			title: "List time-off requests",
			description:
				"List Time-off Requests with worker names. Filter by status (pending, approved, declined, cancelled) or date range. Requires the requests.read scope.",
			inputSchema: {
				status: z
					.enum(["pending", "approved", "declined", "cancelled"])
					.optional(),
				from: dateArg
					.optional()
					.describe("Only requests starting on or after this date."),
				to: dateArg
					.optional()
					.describe("Only requests starting on or before this date."),
				employmentId: z.string().uuid().optional(),
			},
			annotations: readAnnotations,
		},
		async ({ status, from, to, employmentId }) => {
			try {
				const result = await api.getTimeOffRequests({
					status,
					from,
					to,
					employmentId,
				});
				return toolResult(formatTimeOff(result), result);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"get_labor_summary",
		{
			title: "Get labor summary",
			description:
				"Scheduled hours and Labor Cost for a workweek from the draft plan, per Worker and per day, with sales and labor percent where recorded. Requires the reports.read scope.",
			inputSchema: {
				weekStart: dateArg.describe(weekStartHint),
				locationId: z.string().uuid().optional(),
			},
			annotations: readAnnotations,
		},
		async ({ weekStart, locationId }) => {
			try {
				const result = await api.getLaborSummary(weekStart, locationId);
				return toolResult(
					formatLaborSummary(result),
					result satisfies LaborSummary,
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"create_draft_shift",
		{
			title: "Create draft shift",
			description:
				"Add a Shift to a Location's draft Schedule for a workweek. Dates and times are local to the Location's timezone. Assigning over a Worker's unavailability requires an override reason; assigning an unqualified Worker fails unless approvePosition is set. Changes stay invisible to Workers until publish_schedule. Requires the schedule.write scope.",
			inputSchema: {
				locationId: z.string().uuid(),
				weekStart: dateArg.describe(weekStartHint),
				date: dateArg.describe("Day the shift starts, within the workweek."),
				startMinute: minuteArg,
				endMinute: minuteArg,
				positionId: z.string().uuid(),
				employmentId: z
					.string()
					.uuid()
					.nullable()
					.optional()
					.describe("Worker to assign; omit or null for an open shift."),
				note: z.string().max(200).optional(),
				unavailabilityOverrideReason: z
					.string()
					.min(1)
					.max(300)
					.optional()
					.describe(
						"Required when the shift overlaps the Worker's unavailability.",
					),
				approvePosition: z
					.boolean()
					.optional()
					.describe(
						"Approve the Worker for the position when not yet trained.",
					),
			},
			annotations: writeAnnotations,
		},
		async (input) => {
			try {
				const result = await api.createDraftShift(input);
				return toolResult(
					`Draft shift created (${minuteToClock(input.startMinute)}–${minuteToClock(input.endMinute)} on ${input.date}). Shift id=${result.shiftId}, schedule id=${result.scheduleId}. It is NOT visible to Workers until published.`,
					result,
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"update_draft_shift",
		{
			title: "Update draft shift",
			description:
				"Update a draft Shift: reassign the Worker, move the times, or change the note. Only the fields you pass change. Changes stay invisible to Workers until publish_schedule. Requires the schedule.write scope.",
			inputSchema: {
				shiftId: z.string().uuid(),
				employmentId: z
					.string()
					.uuid()
					.nullable()
					.optional()
					.describe("New Worker; null makes the shift open."),
				positionId: z.string().uuid().optional(),
				date: dateArg.optional(),
				startMinute: minuteArg.optional(),
				endMinute: minuteArg.optional(),
				note: z.string().max(200).nullable().optional(),
				unavailabilityOverrideReason: z
					.string()
					.min(1)
					.max(300)
					.nullable()
					.optional(),
				approvePosition: z.boolean().optional(),
			},
			annotations: writeAnnotations,
		},
		async ({ shiftId, ...body }) => {
			try {
				await api.updateDraftShift(shiftId, body);
				return toolResult(
					`Draft shift ${shiftId} updated. Publish to make it visible to Workers.`,
					{
						ok: true,
						shiftId,
					},
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"delete_draft_shift",
		{
			title: "Delete draft shift",
			description:
				"Remove a Shift from the draft Schedule. Workers keep seeing the published version until the change is published. Requires the schedule.write scope.",
			inputSchema: {
				shiftId: z.string().uuid(),
			},
			annotations: deleteAnnotations,
		},
		async ({ shiftId }) => {
			try {
				await api.deleteDraftShift(shiftId);
				return toolResult(`Draft shift ${shiftId} deleted.`, {
					ok: true,
					shiftId,
				});
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"publish_schedule",
		{
			title: "Publish schedule",
			description:
				"Atomically publish a Location's draft Schedule as the next immutable Schedule Version and communicate the changes to affected Workers (emails and push, exactly like an in-app publish). Late material changes may require Shift Acceptance per the Workplace's notice window. Requires the schedule.write scope.",
			inputSchema: {
				scheduleId: z
					.string()
					.uuid()
					.optional()
					.describe("Publish this schedule (from get_schedule_draft)."),
				locationId: z.string().uuid().optional(),
				weekStart: dateArg.optional().describe(weekStartHint),
			},
			annotations: writeAnnotations,
		},
		async ({ scheduleId, locationId, weekStart }) => {
			try {
				let target = scheduleId;
				if (!target) {
					if (!locationId || !weekStart) {
						return toolError(
							new Error(
								"Provide either scheduleId, or locationId plus weekStart.",
							),
						);
					}
					const draft = await api.getDraft(locationId, weekStart);
					if (!draft.exists || !draft.scheduleId) {
						return toolError(
							new Error("No draft schedule exists for that Location and week."),
						);
					}
					target = draft.scheduleId;
				}
				const result = await api.publishSchedule(target);
				return toolResult(
					[
						`Published version ${result.version.versionNumber} to ${result.version.workers} workers (${result.version.publishedAt}).`,
						`Changes: ${result.changes.total} affecting workers, ${result.changes.material} material, ${result.changes.acceptancesRequired} requiring shift acceptance.`,
					].join("\n"),
					result satisfies PublishResult,
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerResource(
		"workplace-context",
		"jooling://workplace-context",
		{
			description:
				"Locations, positions, and scheduling policy for the Workplace this API key belongs to.",
			mimeType: "application/json",
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "application/json",
					text: JSON.stringify(await api.getContext(), null, 2),
				},
			],
		}),
	);

	server.registerResource(
		"published-schedule",
		new ResourceTemplate("jooling://schedule/{weekStart}", {
			list: undefined,
		}),
		{
			description:
				"The Published Schedule for a workweek across the Workplace, as Workers saw it.",
			mimeType: "application/json",
		},
		async (uri, { weekStart }) => {
			const schedule = await api.getPublishedSchedule(String(weekStart));
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: JSON.stringify(schedule, null, 2),
					},
				],
			};
		},
	);

	server.registerPrompt(
		"weekly-review",
		{
			title: "Weekly schedule review",
			description:
				"Review a workweek: coverage, conflicts, labor cost, open shifts, and pending time-off.",
			argsSchema: {
				weekStart: dateArg.describe(weekStartHint),
			},
		},
		({ weekStart }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							`Review our scheduling for the week of ${weekStart}.`,
							"1. get_workplace_context for the locations and policy.",
							"2. get_published_schedule and get_schedule_draft for every location, flagging conflicts and draft changes not yet published.",
							"3. list_open_shifts and list_time_off_requests (status=pending).",
							"4. get_labor_summary for hours, cost, and labor percent.",
							"Summarize gaps, conflicts, overtime risk, and anything waiting on a decision, then recommend the next actions.",
						].join("\n"),
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"find-coverage",
		{
			title: "Find coverage for a shift",
			description:
				"Find the best available Worker to cover a time window and prepare the draft change.",
			argsSchema: {
				startsAt: isoArg.describe("Coverage window start."),
				endsAt: isoArg.describe("Coverage window end."),
				position: z.string().optional().describe("Position name to require."),
				location: z.string().optional().describe("Location name to require."),
			},
		},
		({ startsAt, endsAt, position, location }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							`I need coverage ${startsAt} → ${endsAt}${position ? ` for position "${position}"` : ""}${location ? ` at "${location}"` : ""}.`,
							"1. get_workplace_context to resolve location and position ids.",
							"2. find_available_workers for the window, weighing wage, weekly hours against overtime, and position fit.",
							"3. Propose the best candidate with reasons; do not create or publish anything until I confirm.",
						].join("\n"),
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"plan-next-week",
		{
			title: "Plan next week's schedule",
			description:
				"Draft a full workweek from last week's pattern, pending time-off, and the labor budget.",
			argsSchema: {
				weekStart: dateArg.describe(weekStartHint),
			},
		},
		({ weekStart }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							`Help me plan the schedule for the week of ${weekStart}.`,
							"1. get_workplace_context, then the published schedule for the prior week and this week's draft.",
							"2. list_time_off_requests (approved and pending) and get_worker_overview for people with constraints.",
							"3. Propose shift changes with create_draft_shift / update_draft_shift honoring unavailability; flag anything that needs an override reason.",
							"4. get_labor_summary to check hours and cost, then wait for my approval before publish_schedule.",
						].join("\n"),
					},
				},
			],
		}),
	);

	return server;
}
