# Integration roadmap

Jooling owns the published schedule, shift acceptance, availability, and worker
notices. External systems may supply staffing inputs or consume approved work,
but must not silently republish or overwrite Jooling's schedule.

## 1. Payroll handoff

The Reports page offers an **Approved time CSV** for a selected pay period. Each
row has stable Jooling entry and employment IDs, worker email, Location and
Position, local work date and timezone, UTC clock times, break and worked
minutes, and approval time. Pending, declined, and open entries are excluded.
The existing leave payroll CSV is a separate download. These files are
provider-neutral; managers can map the stable employment ID to their payroll
employee ID outside Jooling until a payroll provider is chosen.

Acceptance: only managers with report access can export; local date boundaries
and overnight work are correct; repeated downloads contain no duplicate rows;
CSV text is safe to open in spreadsheet software; integration tests cover
approval filtering, breaks, authorization, and timezone boundaries.

## 2. Square sales connector

Square is the first provider requested for pilot use. The connector uses server-side OAuth
code flow and store refresh credentials encrypted at rest, scoped to one
Workplace. A manager explicitly maps each Square Location to one Jooling
Location. Import Square Reporting API `Sales.net_sales`, grouped by
`Sales.local_reporting_timestamp` day and Square Location, into Jooling's
existing `location_sales` rows. The query uses `Orders.net_sales`,
`Orders.local_date`, and `Orders.location_id` for closed checks. Do not use order creation timestamps as a
proxy for local sales dates, and do not import tips or taxes as net sales.

Before committing a sync, show its date range and proposed changes. Track the
source, provider location ID, and import time so manual
entries are never silently replaced. Re-running the same range must be
idempotent. Preserve the last good figures on provider errors. Include a
disconnect action that revokes provider access and removes stored credentials.

Acceptance: OAuth state, token refresh, empty days, changed sales,
manual override, provider failure, cross-Workplace authorization, and disconnect
are tested against mocked Square HTTP responses. A pilot manager must verify figures against
their Square Dashboard before production enablement. Square application ID,
secret, redirect URL, and a pilot seller authorization are required for that
last live check.

## 3. Worker directory and payroll providers

The reviewed CSV directory sync is shipped: Workers → **Sync directory** maps
every row to a hire (pending invitation), an update of role and
Location/Position access, or a deactivation, and previews the action for each
row before anything is written. Measure pilot demand before selecting HR or
payroll vendors. Then add the most requested payroll provider, sending only
approved time and leave after a manager reviews the pay period. Persist
provider employee ID mapping and delivery receipts. Payroll remains the source
of truth for pay.

## 4. Calendar and automation

The personal calendar feed now ships with per-app setup guidance and a feed
self-check (fetch counts, last fetcher, event counts, timezone) on the token.
Offer Google or Microsoft account sync only when customers need faster updates
than calendar subscription polling. Zapier, Make, and n8n recipes live in the
knowledge base Developers section, on top of the existing scoped API keys and
signed webhooks; connector changes (Square connect, mapping, import,
disconnect, directory syncs) are also emitted as webhook events.

## Release checks for every connector

- Least-privilege permissions and a visible disconnect path.
- Explicit source ownership, conflict behavior, and timezone handling.
- Retry-safe import IDs, audit records, and actionable failure status.
- Integration tests for authorization, duplicate delivery, partial failure,
  and cross-Workplace isolation.
