# syntax=docker/dockerfile:1

# Build context must be the repository root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_SERVER_URL=https://api.example.com \
#     --build-arg VITE_SUPABASE_URL=https://xyz.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=... \
#     -t schedules-manager-web .

FROM oven/bun:1.3.11-slim AS base
WORKDIR /app

# ---- Install dependencies (web workspace + its workspace deps only) ----
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
	bun install --frozen-lockfile --filter web --filter '@SchedulesManager/config' \
	# The root tsconfig.json extends @SchedulesManager/config/tsconfig.base.json, but
	# filtered installs only link workspace deps inside apps/web/node_modules.
	&& mkdir -p node_modules/@SchedulesManager \
	&& ln -s ../../packages/config node_modules/@SchedulesManager/config

# ---- Build the SPA (Vite bakes VITE_* args into the bundle) ----
FROM deps AS build
ARG VITE_SERVER_URL=http://localhost:3000
ARG VITE_SUPABASE_URL=http://127.0.0.1:54321
ARG VITE_SUPABASE_ANON_KEY=replace-with-your-supabase-anon-key
ENV VITE_SERVER_URL=${VITE_SERVER_URL} \
	VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
	VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
COPY . .
RUN bun run --cwd apps/web build

# ---- Runtime: nginx serves the static bundle with SPA fallback ----
FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
	CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
