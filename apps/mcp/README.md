# jooling MCP server

Exposes jooling — hourly workforce scheduling — to AI assistants over the
Model Context Protocol. An assistant becomes a Manager's scheduling copilot:
it reads the same published schedules, drafts, conflicts, and labor numbers
the apps show, and edits drafts through the same business rules before
publishing atomically to Workers.

The MCP endpoint is hosted **inside the API process** (`apps/server`, route
`/mcp`). This package is the embeddable library the server uses — the tool
catalog (`createJoolingServer`) and the Streamable HTTP transport with
injectable authentication (`createMcpRequestHandler`) — plus a `stdio`
entrypoint for local clients. It holds no business logic: tools execute
against jooling's `/v1/integration/*` endpoints (in-process on the server),
so conflicts, unavailability overrides, notice windows, scopes, and
publication atomicity live in one place.

## Authentication

Two credential types, one authorization model:

- **OAuth 2.1 (the MCP standard).** `@better-auth/mcp` is the authorization
  server; access tokens are audience-bound to the MCP resource and carry
  jooling's integration scopes. Unauthenticated calls receive an RFC 9728
  `WWW-Authenticate` challenge, which MCP clients (Claude, assistants, CLIs)
  follow to register, sign in through the web app, and consent.
  Dynamic client registration is enabled; public clients use PKCE.
- **Workplace API keys** (`jl_live_…`), created by Managers under Workplace
  settings → Integrations. Accepted directly for CLI/local use.

Scopes are shared: `schedule.read`, `schedule.write`, `workers.read`, `workers.write`,
`reports.read`, `requests.read`, `requests.write`. API keys carry them
literally; human principals get scopes derived from their Employment
privileges. Principals spanning several Workplaces pass `x-workplace-id`.
Publishing requires `schedule.write` plus the `schedule.publish` capability
and is attributed to the acting Manager (or, for keys, the Manager who
created the key) — Workers get the same notifications as an in-app publish.

## Running

```sh
bun run dev:server   # the API (and /mcp) on :3000
```

Server env: `MCP_RESOURCE_URL` (optional; canonical resource/audience, default
`<BETTER_AUTH_URL>/mcp`). The OAuth provider tables arrive with migration
0035 (`bun run db:migrate`).

Set the public URLs independently in every deployment. The web settings page
builds the install URL from `VITE_SERVER_URL`; the server uses
`MCP_RESOURCE_URL` as the OAuth resource and token audience. They must identify
the same public `/mcp` endpoint:

```sh
# Staging
VITE_SERVER_URL=https://api.staging.example.com
BETTER_AUTH_URL=https://api.staging.example.com
MCP_RESOURCE_URL=https://api.staging.example.com/mcp

# Production
VITE_SERVER_URL=https://api.example.com
BETTER_AUTH_URL=https://api.example.com
MCP_RESOURCE_URL=https://api.example.com/mcp
```

Do not point a staging web build at the production MCP resource (or vice
versa). OAuth access tokens are audience-bound and are not portable between
environments. `MCP_RESOURCE_URL` may be omitted when the MCP endpoint is
exactly `<BETTER_AUTH_URL>/mcp`; setting it explicitly in deployed environments
makes the intended audience clear.

stdio (local clients):

```sh
bun run start:stdio  # requires JOOLING_API_KEY, API_BASE_URL
```

## Client configuration

MCP clients that speak Streamable HTTP discover OAuth automatically:

```json
{
	"mcpServers": {
		"jooling": {
			"type": "http",
			"url": "http://localhost:3000/mcp"
		}
	}
}
```

The first connection opens the browser for sign-in and consent; the client
stores its tokens and refreshes them transparently.

For a local stdio client with an API key:

```json
{
	"mcpServers": {
		"jooling": {
			"type": "stdio",
			"command": "bun",
			"args": ["run", "apps/mcp/src/stdio.ts"],
			"env": {
				"JOOLING_API_KEY": "jl_live_YOUR_KEY",
				"API_BASE_URL": "http://localhost:3000"
			}
		}
	}
}
```

## Tools

Reads (`readOnlyHint`) return both a compact human-readable summary and the
raw payload as structured content.

| Tool                    | Scope           | What it answers                                    |
| ----------------------- | --------------- | -------------------------------------------------- |
| `get_workplace_context` | any credential  | Locations, positions, week-start day, overtime, labor goal |
| `list_workers`          | `workers.read`  | Workers with roles, positions, wage rates          |
| `invite_worker`         | `workers.write` | Invite a Worker and grant Location/Position access |
| `get_published_schedule`| `schedule.read` | What Workers were told, per Location and week      |
| `get_schedule_draft`    | `schedule.read` | The working draft, with server-computed conflicts  |
| `get_daily_roster`      | `schedule.read` | Who works a given date (published + draft)         |
| `get_worker_overview`   | `workers.read`  | One Worker's week: shifts, hours, unavailability, time-off |
| `find_available_workers`| `workers.read`  | Who can cover a window, and why everyone else can't |
| `list_open_shifts`      | `schedule.read` | Open shifts offered for pickup, with requests      |
| `list_time_off_requests`| `requests.read` | Time-off requests by status/date                   |
| `list_manager_actions`  | `requests.read` | Pending releases, pickups, and Timesheets          |
| `decide_time_off_request` | `requests.write` | Approve or decline the current leave approval step |
| `decide_shift_release`  | `requests.write` | Approve or decline a Shift Release                 |
| `decide_shift_pickup`   | `requests.write` + publish authority | Decide a pickup; approval publishes |
| `decide_timesheet`      | `requests.write` | Approve or decline a Time Entry                    |
| `get_labor_summary`     | `reports.read`  | Scheduled hours/cost by Worker and day, sales, labor % |
| `create_draft_shift`    | `schedule.write`| Add a shift to a draft (invisible to Workers until published) |
| `update_draft_shift`    | `schedule.write`| Re-time or reassign a draft shift                  |
| `delete_draft_shift`    | `schedule.write`| Remove a shift from the draft                      |
| `publish_schedule`      | `schedule.write`| Publish a Location-week atomically; notifies Workers |

Resources: `jooling://workplace-context` and the template
`jooling://schedule/{weekStart}`. Prompts: `weekly-review`,
`find-coverage`, `plan-next-week`.

Dates are `YYYY-MM-DD` in the Location's timezone; times are minutes from
local midnight (540 = 9:00 AM; an end at or before the start means the shift
ends the next day).

## Server-side surface

- `POST/DELETE /mcp` (apps/server) — MCP Streamable HTTP, OAuth-protected;
  API keys accepted.
- `GET /mcp` — authenticated Streamable HTTP notification channel. The server
  advertises `tools.listChanged`; compatible clients automatically re-fetch
  `tools/list` when a live catalog changes. Deployments close old sessions, so
  clients reconnect and receive the current catalog during initialization.
- `/v1/integration/*` (apps/server) — the endpoints tools execute against,
  accepting API keys, MCP access tokens, or user sessions
  (`apps/server/src/routes/integration-api.ts`).
- `/oauth` and `/consent` (apps/web) — the authorize flow's sign-in and
  consent pages.

Tool updates never silently expand authorization. Existing connections can use
new tools covered by scopes they already granted. A tool requiring a newly
introduced scope remains unavailable until the Manager reconnects or
reauthorizes and explicitly grants that scope.

## Tests

```sh
bun test apps/mcp                                        # tools + transport over stubs
RUN_INTEGRATION_TESTS=1 ./scripts/test-integration.sh    # endpoints + /mcp against Postgres
```
