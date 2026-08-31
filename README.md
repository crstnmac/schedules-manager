# jooling

jooling is a workforce scheduling platform for restaurants. Managers build, publish, and operate schedules from the web, while managers and workers use the Expo mobile app for daily schedule access, coverage, availability, requests, and notifications.

The product treats a published schedule as an immutable operational record. Later changes create a new version, affected workers receive explicit notifications, and material late changes can require acceptance.

## What it supports

### Managers

- Create workplaces, locations, positions, and scoped team access
- Build and publish versioned weekly schedules
- Review time-off, shift-release, and pickup requests
- Monitor coverage, delivery, acknowledgements, and activity
- Use manager-focused views on both web and mobile

### Workers

- Join a workplace through mobile onboarding
- View current, upcoming, and historical schedules
- Acknowledge or respond to material schedule changes
- Submit availability, preferences, and time-off requests
- Release assigned shifts and request available shifts
- Receive scheduling notifications

## Technology

| Area | Stack |
| --- | --- |
| Manager web | React 19, Vite, TanStack Router, Tailwind CSS |
| Mobile | Expo 57, React Native, Expo Router, native tabs, Expo UI |
| API | Bun, Elysia, OpenAPI |
| Data | PostgreSQL, Drizzle ORM |
| Authentication | Supabase Auth with server-side JWKS verification |
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
├── docs/adr/        # Architecture decision records
├── CONTEXT.md       # Product and domain context
└── DESIGN.md        # Design direction
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) 1.3 or newer
- A [Supabase](https://supabase.com/) project
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

Fill the copied files with your Supabase project values:

- `apps/server/.env`: set `DATABASE_URL` and `SUPABASE_URL`.
- `apps/web/.env`: set the public Supabase URL and publishable/anon key.
- `apps/native/.env`: set the same public URL and key, plus an API URL reachable from the device.

Never place a Supabase service-role key in either client application. The clients authenticate directly with Supabase, and the API validates access tokens through the project's JWKS endpoint.

For a physical phone, `localhost` points to the phone itself. Set the mobile API URL to your computer's LAN address, such as `http://192.168.1.20:3000`, and ensure both devices are on the same network.

For hosted Supabase, use the Session pooler URI from **Connect → ORMs**. Keep `sslmode=require&uselibpqcompat=true`, and percent-encode reserved characters in the database password.

### 3. Apply the database schema

```bash
bun run db:push
```

### 4. Start development

Run the complete workspace:

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

The protected `GET /v1/me` endpoint is an authentication smoke test. Send `Authorization: Bearer <supabase-access-token>` to verify a session.

## Useful commands

```bash
bun run check-types  # Type-check the workspace
bun run build        # Build all applications
bun run check        # Format and lint with Biome
bun run db:generate  # Generate database migrations
bun run db:migrate   # Run database migrations
bun run db:studio    # Open Drizzle Studio
```

## Scheduling model

- A **schedule** is a location-specific week.
- A **schedule version** is an immutable published snapshot.
- A **shift** belongs to one version and may be assigned or open.
- A **request** records time off, availability, release, or pickup intent.
- An **acknowledgement** records a worker's response to a material change.

See [CONTEXT.md](./CONTEXT.md) for the domain model and [docs/adr](./docs/adr) for accepted product and architecture decisions.

## Security notes

- Environment files and credentials are ignored by Git.
- Only public Supabase credentials belong in web and mobile builds.
- Authorization must be enforced by the API and database policies, not only by client navigation.
- Review generated database migrations before applying them to production.

## Status

This repository is an active product experiment. Interfaces, workflows, and schemas may change as the scheduling model is validated.
