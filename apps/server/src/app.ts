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
} from "./errors";
import { changesRoutes } from "./routes/changes";
import { constraintsRoutes } from "./routes/constraints";
import { coverageRoutes } from "./routes/coverage";
import { invitationsRoutes } from "./routes/invitations";
import { locationsRoutes } from "./routes/locations";
import { meRoutes } from "./routes/me";
import { notificationsRoutes } from "./routes/notifications";
import { pilotRoutes } from "./routes/pilot";
import { positionsRoutes } from "./routes/positions";
import { publicationRoutes } from "./routes/publication";
import { schedulesRoutes } from "./routes/schedules";
import { workersRoutes } from "./routes/workers";
import { workplacesRoutes } from "./routes/workplaces";

export function createApp() {
	return new Elysia()
		.use(
			openapi({
				documentation: {
					info: {
						title: "jooling API",
						version: "0.1.0",
						description: "Authoritative API for restaurant scheduling.",
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
		.onRequest(({ set }) => {
			set.headers["cache-control"] = "no-store";
		})
		.onError(({ error, status, request }) => {
			const requestId =
				request.headers.get("x-request-id") ?? crypto.randomUUID();
			console.error(
				JSON.stringify({
					level: "error",
					requestId,
					method: request.method,
					path: new URL(request.url).pathname,
					error: error instanceof Error ? error.message : String(error),
					timestamp: new Date().toISOString(),
				}),
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
		})
		.get("/health", () => ({ status: "ok" as const }), {
			response: t.Object({ status: t.Literal("ok") }),
			detail: { tags: ["System"], summary: "Check API health" },
		})
		.use(meRoutes)
		.use(workplacesRoutes)
		.use(locationsRoutes)
		.use(positionsRoutes)
		.use(pilotRoutes)
		.use(workersRoutes)
		.use(invitationsRoutes)
		.use(constraintsRoutes)
		.use(schedulesRoutes)
		.use(publicationRoutes)
		.use(changesRoutes)
		.use(coverageRoutes)
		.use(notificationsRoutes);
}
