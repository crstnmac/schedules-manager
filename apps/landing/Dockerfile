# syntax=docker/dockerfile:1

# Build context must be the repository root (landing depends on the
# @SchedulesManager/ui workspace package):
#   docker build -f apps/landing/Dockerfile \
#     --build-arg VITE_APP_URL=https://app.example.com \
#     --build-arg VITE_DOCS_URL=https://docs.example.com \
#     --build-arg VITE_LEGAL_NAME="Example Scheduling, Inc." \
#     --build-arg VITE_LEGAL_ADDRESS="1 Example St, Wilmington, DE 19801, USA" \
#     --build-arg VITE_LEGAL_JURISDICTION="Delaware, USA" \
#     --build-arg VITE_LEGAL_REGISTRATION_NUMBER="0000000" \
#     --build-arg VITE_LEGAL_GOVERNING_LAW="the laws of the State of Delaware, USA" \
#     --build-arg VITE_LEGAL_VENUE="the state and federal courts located in New Castle County, Delaware, USA" \
#     -t jooling-landing .
#
# VITE_* values are inlined into the static bundle, so they are build inputs,
# not runtime settings: changing them requires a rebuild, not a restart.

FROM oven/bun:1.3.11-alpine AS dependencies
WORKDIR /app

# ---- Install dependencies (landing workspace + its workspace deps only) ----
# bun validates every workspace in bun.lock against disk, so all
# workspace package.json files must be present even when filtering.
COPY package.json bun.lock ./
COPY apps/native/package.json apps/native/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/landing/package.json apps/landing/
COPY apps/knowledge-base/package.json apps/knowledge-base/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/env/package.json packages/env/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter jooling-landing

# ---- Build the static site (Vite bakes VITE_* args into the bundle) ----
FROM dependencies AS build
ARG VITE_APP_URL=http://localhost:3001
ARG VITE_DOCS_URL=https://docs.jooling.com
# Legal identity shown on the Terms, Privacy Policy, DPA, and every footer.
# Left unset, the wording that would name the entity is omitted rather than
# filled with a placeholder — so a production build should supply these.
ARG VITE_LEGAL_NAME
ARG VITE_LEGAL_ADDRESS
ARG VITE_LEGAL_JURISDICTION
ARG VITE_LEGAL_REGISTRATION_NUMBER
ARG VITE_LEGAL_GOVERNING_LAW
ARG VITE_LEGAL_VENUE
ARG VITE_LEGAL_CONTACT_EMAIL=legal@jooling.com
ARG VITE_LEGAL_PRIVACY_EMAIL=privacy@jooling.com
ARG VITE_LEGAL_SUPPORT_EMAIL=support@jooling.com
# Terms revision stamped into consent records; keep identical to the server's
# TERMS_VERSION and the web app's VITE_TERMS_VERSION.
ARG VITE_TERMS_VERSION=2026-09-17
ARG VITE_TERMS_UPDATED_AT=2026-09-17
# Analytics stays off entirely when the token is empty.
ARG VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG VITE_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
ENV VITE_APP_URL=${VITE_APP_URL} \
	VITE_DOCS_URL=${VITE_DOCS_URL} \
	VITE_LEGAL_NAME=${VITE_LEGAL_NAME} \
	VITE_LEGAL_ADDRESS=${VITE_LEGAL_ADDRESS} \
	VITE_LEGAL_JURISDICTION=${VITE_LEGAL_JURISDICTION} \
	VITE_LEGAL_REGISTRATION_NUMBER=${VITE_LEGAL_REGISTRATION_NUMBER} \
	VITE_LEGAL_GOVERNING_LAW=${VITE_LEGAL_GOVERNING_LAW} \
	VITE_LEGAL_VENUE=${VITE_LEGAL_VENUE} \
	VITE_LEGAL_CONTACT_EMAIL=${VITE_LEGAL_CONTACT_EMAIL} \
	VITE_LEGAL_PRIVACY_EMAIL=${VITE_LEGAL_PRIVACY_EMAIL} \
	VITE_LEGAL_SUPPORT_EMAIL=${VITE_LEGAL_SUPPORT_EMAIL} \
	VITE_TERMS_VERSION=${VITE_TERMS_VERSION} \
	VITE_TERMS_UPDATED_AT=${VITE_TERMS_UPDATED_AT} \
	VITE_PUBLIC_POSTHOG_PROJECT_TOKEN=${VITE_PUBLIC_POSTHOG_PROJECT_TOKEN} \
	VITE_PUBLIC_POSTHOG_HOST=${VITE_PUBLIC_POSTHOG_HOST}

COPY . .

RUN bun run --cwd apps/landing build

# ---- Runtime: nginx serves the static bundle with SPA fallback ----
FROM nginxinc/nginx-unprivileged:1.30.4-alpine AS runtime
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/apps/landing/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
