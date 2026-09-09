# syntax=docker/dockerfile:1.7

# Build from the repository root:
#   docker build -f landing/Dockerfile -t jooling-landing .

FROM oven/bun:1.4.2-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY landing/package.json landing/
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
	bun install --frozen-lockfile --filter jooling-landing --filter '@SchedulesManager/ui' --filter '@SchedulesManager/config'

FROM dependencies AS build
ARG VITE_APP_URL=http://localhost:3001
ENV VITE_APP_URL=${VITE_APP_URL}

COPY landing landing
COPY packages/ui packages/ui

RUN bun run --cwd landing build

FROM nginxinc/nginx-unprivileged:1.30.4-alpine AS runtime
COPY landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/landing/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
