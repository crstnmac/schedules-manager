# syntax=docker/dockerfile:1

# Build context must be the repository root:
#   docker build -f apps/server/Dockerfile -t schedules-manager-server .

FROM oven/bun:1.3.11-slim AS base
WORKDIR /app

# ---- Install dependencies (server workspace + its workspace deps only) ----
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/native/package.json apps/native/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/config/tsconfig.base.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter server --filter '@SchedulesManager/config'

# ---- Compile the server into a self-contained executable ----
FROM deps AS build
COPY . .
RUN bun run --cwd apps/server compile

# ---- Runtime: distroless, no shell, no node_modules ----
FROM gcr.io/distroless/base-debian12:nonroot
COPY --from=build /app/apps/server/server /usr/local/bin/server
EXPOSE 3000
USER nonroot:nonroot
ENTRYPOINT ["server"]
