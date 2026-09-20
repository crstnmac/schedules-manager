# syntax=docker/dockerfile:1

# Build context must be the repository root:
#   docker build -f apps/knowledge-base/Dockerfile -t jooling-docs .

FROM oven/bun:1.3.11-slim AS dependencies
WORKDIR /app

# Bun validates every workspace in bun.lock against disk, so copy each
# workspace manifest before installing the documentation workspace.
COPY package.json bun.lock ./
COPY patches patches/
COPY apps/mcp/package.json apps/mcp/
COPY apps/knowledge-base/package.json apps/knowledge-base/
COPY apps/landing/package.json apps/landing/
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
	bun install --frozen-lockfile --filter knowledge-base \
	&& mkdir -p node_modules/@SchedulesManager \
	&& ln -s ../../packages/config node_modules/@SchedulesManager/config

FROM dependencies AS build
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run --cwd apps/knowledge-base build

FROM node:22-alpine AS runtime
WORKDIR /app/apps/knowledge-base
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3002
# Nitro currently leaves a small set of React runtime imports external, so keep
# the filtered workspace dependencies alongside the standalone server output.
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/knowledge-base/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/knowledge-base/.output/ ./.output/

USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:3002/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
