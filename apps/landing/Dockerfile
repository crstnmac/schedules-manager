# syntax=docker/dockerfile:1

# Build context must be the repository root (landing depends on the
# @SchedulesManager/ui workspace package):
#   docker build -f apps/landing/Dockerfile \
#     --build-arg VITE_APP_URL=https://app.example.com \
#     -t jooling-landing .

FROM oven/bun:1.4.2-alpine AS dependencies
WORKDIR /app

# ---- Install dependencies (landing workspace + its workspace deps only) ----
# bun validates every workspace in bun.lock against disk, so all
# workspace package.json files must be present even when filtering.
COPY package.json bun.lock ./
COPY apps/native/package.json apps/native/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/landing/package.json apps/landing/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter jooling-landing

# ---- Build the static site (Vite bakes VITE_APP_URL into the bundle) ----
FROM dependencies AS build
ARG VITE_APP_URL=http://localhost:3001
ENV VITE_APP_URL=${VITE_APP_URL}

COPY . .

RUN bun run --cwd apps/landing build

# ---- Runtime: nginx serves the static bundle with SPA fallback ----
FROM nginxinc/nginx-unprivileged:1.30.4-alpine AS runtime
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/apps/landing/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
