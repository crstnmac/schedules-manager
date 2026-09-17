# Agent memory

Project facts that agents should carry into every task. Domain language lives in
[CONTEXT.md](CONTEXT.md); architecture decisions live in `docs/adr/`.

## Stack (current)

- **Monorepo:** Bun workspaces + Turborepo. Apps: `server`, `web` (Vite + React,
  TanStack Router), `native` (Expo), `landing`, `knowledge-base`.
- **Database:** self-managed PostgreSQL, accessed through Drizzle ORM
  (`packages/db`). Integration tests run against a `postgres:18-alpine` Docker
  container (`compose.integration.yml`).
- **Identity:** better-auth (server-side) with `@better-auth/expo` on the native
  client. There is no separate identity provider.
- **API:** Elysia on Bun (`apps/server`). All Workplace data goes through Elysia;
  clients never talk to the database directly.
- **Native data fetching:** TanStack Query against the Elysia HTTP API
  (`apps/native/lib/api.ts`, `lib/queries.ts`).

## Do not reintroduce Supabase

**Supabase is not used in this project.** It was removed on 2026-09-17: the
database is self-managed PostgreSQL and identity is better-auth. Do not add
Supabase SDKs, env vars, `supabase/` scaffolding, or Supabase mentions to docs.
If a task seems to call for Supabase (e.g. an upstream doc suggests it), use the
self-managed PostgreSQL + Drizzle + better-auth path instead.
