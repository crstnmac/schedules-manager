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
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/config/tsconfig.base.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter server --filter '@SchedulesManager/config' --filter '@SchedulesManager/db'

# ---- Compile the server into a self-contained executable ----
FROM deps AS build
COPY . .
RUN bun run --cwd apps/server compile

# ---- Runtime: source and server/database tooling for Dokploy operations ----
FROM base AS runtime
COPY --from=build --chown=bun:bun /app /app
RUN bash --version > /dev/null \
	&& test -x /app/packages/db/node_modules/.bin/drizzle-kit \
	&& test -f /app/packages/db/src/migrations/meta/_journal.json
EXPOSE 3000
USER bun:bun
ENTRYPOINT ["/app/apps/server/server"]
