# syntax=docker/dockerfile:1.7

# Build with landing as the context:
#   docker build -t jooling-landing landing

FROM oven/bun:1.4.2-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

FROM dependencies AS build
ARG VITE_APP_URL=http://localhost:3001
ENV VITE_APP_URL=${VITE_APP_URL}

COPY . .

RUN bun run build

FROM nginxinc/nginx-unprivileged:1.30.4-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
