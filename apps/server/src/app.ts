import { env } from "@SchedulesManager/env/server";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia, t } from "elysia";

import { AuthenticationError } from "./auth";
import {
	BadRequestError,
	ConflictError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
} from "./errors";
import { getReadinessReport, type ReadinessReport } from "./readiness";
import { newRequestId, writeRequestLog } from "./request-log";
import { changesRoutes } from "./routes/changes";
import { constraintsRoutes } from "./routes/constraints";
import { coverageRoutes } from "./routes/coverage";
import { emailDeliveryRoutes } from "./routes/email-delivery";
import { invitationsRoutes } from "./routes/invitations";
import { kioskRoutes } from "./routes/kiosk";
import { locationsRoutes } from "./routes/locations";
import { meRoutes } from "./routes/me";
import { notificationsRoutes } from "./routes/notifications";
import { pilotRoutes } from "./routes/pilot";
import { placesRoutes } from "./routes/places";
import { positionsRoutes } from "./routes/positions";
import { publicationRoutes } from "./routes/publication";
import { reportRoutes } from "./routes/reports";
import { rosterRoutes } from "./routes/roster";
import { schedulesRoutes } from "./routes/schedules";
import { surfaceRoutes } from "./routes/surface";
import { swapRoutes } from "./routes/swaps";
import { templateRoutes } from "./routes/templates";
import { timeEntryRoutes } from "./routes/time-entries";
import { workersRoutes } from "./routes/workers";
import { workplacesRoutes } from "./routes/workplaces";

export type CreateAppOptions = {
	getReadiness?: () => Promise<ReadinessReport>;
};

const startedAtByRequest = new WeakMap<Request, number>();
const errorByRequest = new WeakMap<Request, string>();

function responseStatus(set: { status?: number | string }): number {
	if (typeof set.status === "number") return set.status;
	if (typeof set.status === "string") {
		const parsed = Number(set.status);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 200;
}

export function createApp(options: CreateAppOptions = {}) {
	const getReadiness = options.getReadiness ?? getReadinessReport;

	return new Elysia()
		.use(
			openapi({
				documentation: {
					info: {
						title: "jooling API",
						version: "0.1.0",
						description: "Authoritative API for hourly workforce scheduling.",
					},
					components: {
						securitySchemes: {
							bearerAuth: {
								type: "http",
								scheme: "bearer",
								bearerFormat: "JWT",
								description: "A Supabase Auth access token.",
							},
						},
					},
				},
			}),
		)
		.use(
			cors({
				origin: env.CORS_ORIGIN,
				methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			}),
		)
		.onRequest(({ request, set }) => {
			startedAtByRequest.set(request, Date.now());
			set.headers["cache-control"] = "no-store";
			set.headers["x-request-id"] = newRequestId(request);
		})
		.onAfterResponse(({ request, set }) => {
			const startedAt = startedAtByRequest.get(request) ?? Date.now();
			const status = responseStatus(set);
			const requestId =
				typeof set.headers["x-request-id"] === "string"
					? set.headers["x-request-id"]
					: newRequestId(request);
			writeRequestLog({
				level: status >= 500 ? "error" : "info",
				requestId,
				method: request.method,
				path: new URL(request.url).pathname,
				status,
				durationMs: Date.now() - startedAt,
				error: errorByRequest.get(request),
				timestamp: new Date().toISOString(),
			});
		})
		.onError(({ error, status, request, set }) => {
			const requestId =
				typeof set.headers["x-request-id"] === "string"
					? set.headers["x-request-id"]
					: newRequestId(request);
			set.headers["x-request-id"] = requestId;
			errorByRequest.set(
				request,
				error instanceof Error ? error.message : String(error),
			);
			if (error instanceof AuthenticationError) {
				return status(401, {
					error: "unauthorized",
					message: error.message,
				});
			}
			if (error instanceof ForbiddenError) {
				return status(403, {
					error: "forbidden",
					message: error.message,
				});
			}
			if (error instanceof NotFoundError) {
				return status(404, {
					error: "not_found",
					message: error.message,
				});
			}
			if (error instanceof ConflictError) {
				return status(409, {
					error: "conflict",
					message: error.message,
				});
			}
			if (error instanceof BadRequestError) {
				return status(400, {
					error: "bad_request",
					message: error.message,
				});
			}
			if (error instanceof RateLimitError) {
				return status(429, {
					error: "rate_limited",
					message: error.message,
				});
			}
		})
		.get("/health", () => ({ status: "ok" as const }), {
			response: t.Object({ status: t.Literal("ok") }),
			detail: { tags: ["System"], summary: "Check API process liveness" },
		})
		.get(
			"/ready",
			async ({ set }) => {
				const report = await getReadiness();
				if (report.status !== "ready") {
					set.status = 503;
				}
				return report;
			},
			{
				response: t.Object({
					status: t.Union([t.Literal("ready"), t.Literal("not_ready")]),
					checks: t.Object({
						database: t.Union([t.Literal("up"), t.Literal("down")]),
					}),
				}),
				detail: {
					tags: ["System"],
					summary: "Check whether the API is ready to serve traffic",
				},
			},
		)
		.use(meRoutes)
		.use(workplacesRoutes)
		.use(locationsRoutes)
		.use(placesRoutes)
		.use(positionsRoutes)
		.use(pilotRoutes)
		.use(workersRoutes)
		.use(invitationsRoutes)
		.use(constraintsRoutes)
		.use(schedulesRoutes)
		.use(templateRoutes)
		.use(publicationRoutes)
		.use(changesRoutes)
		.use(coverageRoutes)
		.use(emailDeliveryRoutes)
		.use(notificationsRoutes)
		.use(timeEntryRoutes)
		.use(swapRoutes)
		.use(rosterRoutes)
		.use(surfaceRoutes)
		.use(kioskRoutes)
		.use(reportRoutes);
}
