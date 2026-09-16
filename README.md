# jooling

jooling is a workforce scheduling platform for hourly teams. Managers build, publish, and operate schedules from the web; managers and workers use the Expo mobile app for daily schedule access, coverage, availability, requests, and notifications.

Published schedules are immutable operational records. Later changes create a new version, affected workers are notified, and material late changes can require acceptance.

## Technology

| Area | Stack |
| --- | --- |
| Manager web | React 19, Vite, TanStack Router, Tailwind CSS |
| Mobile | Expo 57, React Native, Expo Router, Expo UI |
| API | Bun, Elysia, OpenAPI |
| Data | PostgreSQL 18, Drizzle ORM |
| Auth | Better Auth |
| Tooling | Bun workspaces, Turborepo, TypeScript, Biome |

## Repository layout

```text
SchedulesManager/
├── apps/
│   ├── native/      # Manager and worker Expo app
│   ├── server/      # Elysia API
│   └── web/         # Manager web application
├── packages/
│   ├── config/      # Shared TypeScript configuration
│   ├── db/          # Drizzle schema and database utilities
│   ├── env/         # Validated environment configuration
│   └── ui/          # Shared web UI primitives and styles
├── docs/            # Architecture decision records and operations guide
└── CONTEXT.md       # Product and domain context
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) 1.3 or newer
- PostgreSQL 18 (Docker is sufficient for local development)
- [Expo Go](https://expo.dev/go) or a compatible native development environment

### 1. Install dependencies

```bash
bun install
```

### 2. Configure the environment

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
cp apps/native/.env.example apps/native/.env
```

- `apps/server/.env`: set `DATABASE_URL`, `BETTER_AUTH_URL`, and a strong `BETTER_AUTH_SECRET`. `DATABASE_POOL_MAX` defaults to `5` per server process; keep the total across processes below the database connection limit.
- `apps/web/.env`: set the API URL used by the browser.
- `apps/native/.env`: set an API URL reachable from the device. On a physical phone, `localhost` points to the phone itself — use your computer's LAN address (e.g. `http://192.168.1.20:3000`) with both devices on the same network.

Authentication is served by the API. Never place `BETTER_AUTH_SECRET`, database credentials, or Polar access tokens in either client application.

### 3. Apply the database schema

```bash
bun run db:push
```

### 4. Start development

```bash
bun run dev
```

Or start an individual application:

```bash
bun run dev:web
bun run dev:server
bun run dev:native
```

| Service | Local address |
| --- | --- |
| Manager web | `http://localhost:3001` |
| API | `http://localhost:3000` |
| OpenAPI reference | `http://localhost:3000/openapi` |
| Expo dev server | `http://localhost:8081` |

`GET /v1/me` is an authentication smoke test: sign in through Better Auth and call it with the resulting session cookie.

## Commands

```bash
bun run check-types  # Type-check the workspace
bun run build        # Build all applications
bun run check        # Lint and check formatting with Biome
bun run check:write  # Format and autofix with Biome
bun test             # Run fast unit and invariant tests
bun run test:integration # Run isolated PostgreSQL tests (Docker required)
bun run db:generate      # Generate database migrations
bun run db:migrate       # Run database migrations
bun run db:studio        # Open Drizzle Studio
```

`bun run verify` runs checks, types, tests, integration tests, and builds.

## Scheduling model

- A **schedule** is a location-specific week.
- A **schedule version** is an immutable published snapshot.
- A **shift** belongs to one version and may be assigned or open.
- A **request** records time off, availability, release, or pickup intent.
- An **acknowledgement** records a worker's response to a material change.

## Documentation

- [CONTEXT.md](./CONTEXT.md) — product and domain context
- [docs/adr](./docs/adr) — architecture decision records
- [docs/operations.md](./docs/operations.md) — deployment, delivery, idempotency, and webhook operations
- [DESIGN.md](./DESIGN.md) — design direction

## Status

Active development. Interfaces, workflows, and schemas may change as the product evolves.
