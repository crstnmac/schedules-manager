# Operations

Operational guidance for running jooling in production: deployment, migrations, delivery, idempotency, and webhooks.

## Deployment

The server Docker image includes Bash, repository source under `/app`, and installed server/database dependencies, including migration tooling. It runs the compiled server as the non-root `bun` user. Local environment files and Git metadata are excluded from the image; Dokploy supplies runtime environment variables.

To apply committed migrations from Dokploy's Bash terminal, confirm `DATABASE_URL` targets the intended database and take an appropriate backup, then run:

```bash
cd /app/packages/db
bun run db:migrate:deploy
```

Migrations are manual, not run automatically on server startup. Apply migrations before starting the updated server. Container file edits are ephemeral and will be lost on redeployment; change source through Git.

For hosted PostgreSQL, use the connection URI supplied by the provider, enable its required TLS mode, and percent-encode reserved characters in the database password.

## Square sales integration

Create a Square Developer application and register the exact redirect URL
`https://YOUR_API/v1/integrations/square/callback`. Set `SQUARE_APP_ID`,
`SQUARE_APP_SECRET`, and `SQUARE_MODE` (`sandbox` for pilot testing,
`production` for live sellers) on the server. Set
`SQUARE_TOKEN_ENCRYPTION_KEY` to a stable 32-byte base64 key, generated with
`openssl rand -base64 32`. Back it up securely: rotating it without re-encrypting
stored tokens requires every workplace to reconnect. Apply the database
migrations before enabling the connector.

A manager connects Square in Settings → Integrations, maps Square and Jooling
locations, then previews and confirms a date-range import. Existing sales
changes require an explicit overwrite. Compare the first imported period with
the Square Dashboard before using labor-to-sales figures for decisions.

## Local development notes

The server uses `--watch` to restart on edits and release database connections and background timers; `--hot` preserves process state and can accumulate pools and dispatchers across reloads.

Additional development services: `bun run dev:landing` (port 3002) and `bun run dev:knowledge-base` (port 3003).

## Idempotency

Protected write commands accept an `Idempotency-Key` header, including invitation create/resend/import/accept, publication, acknowledgement, acceptance, coverage, swaps, time clock, and unacknowledged-schedule reminders. Reuse the same key and logical command payload when retrying a command; its mutations and saved response commit atomically. Reusing a key with a different persisted payload returns a conflict. Transient clock-in GPS readings are geofence checks, not persisted payload, so they may vary across retries. Requests without a key remain transactional but are distinct commands.

The PostgreSQL integration suite installs a test-only trigger rejecting updates and deletes of published shift snapshots.

## Email and push delivery

Invitation creation, resend, and import queue email in the same PostgreSQL transaction. Manager "remind unacknowledged" actions enqueue inbox notifications and `notification_outbox` rows through the same path as publication, so Expo push fan-out applies. The server dispatches queued mail and push jobs and polls Expo receipts every five seconds.

Email retries use exponential backoff, recover abandoned leases after five minutes, and become `failed` after eight failed attempts. A manager can resend a pending invitation to create a fresh delivery. Superseded, expired, accepted, and revoked invitation jobs are cancelled before sending.

Outbox delivery is at-least-once: a provider acceptance followed by a process crash before recording success can cause a duplicate email on retry. No provider or DNS configuration is performed by migrations. Validate credentials, webhook events, and device receipts in a staging environment before pilot rollout.

## Rate limits

Abuse-sensitive email endpoints are rate limited in process with fixed windows:

| Endpoint | Limit |
| --- | --- |
| Invitation create | 30 / 10m per manager |
| Invitation resend | 20 / 10m per manager |
| CSV import (invitations, worker directory sync, daily sales) | 10 / 10m per manager |
| ZeptoMail webhook | 120 / 1m per client IP (`X-Forwarded-For` first hop when present) |

Over-limit requests return `429` with `error: "rate_limited"`. Idempotent invitation create/resend replays do not consume a new slot.

## Health and observability

`GET /health` is process liveness only. `GET /ready` pings PostgreSQL and returns `200` with `{ status: "ready", checks: { database: "up" } }` or `503` with `{ status: "not_ready", checks: { database: "down" } }`. Point load balancers and deploy gates at `/ready`.

Every response includes `x-request-id` (echoed from the request when provided). The server writes one JSON log line per request with `level`, `requestId`, `method`, `path`, `status`, `durationMs`, and optional `error`.

## ZeptoMail webhooks

Set `ZEPTOMAIL_WEBHOOK_SECRET` (at least 16 characters) to the ZeptoMail Agent's webhook Authentication Key. Configure the public HTTPS endpoint `/v1/webhooks/zeptomail` for Delivered, Hard bounce, and Soft bounce events. The endpoint validates the documented `producer-signature` HMAC over the decoded form payload, enforces a five-minute request timestamp tolerance, and deduplicates webhook IDs. Missing configuration fails closed. See [ZeptoMail webhook setup and signing](https://www.zoho.com/zeptomail/help/webhooks.html).

`GET /v1/workplaces/:workplaceId/email-deliveries` returns the latest 100 delivery records to active managers of that workplace, without invitation tokens. `sent` means the provider accepted the send, not mailbox delivery; only a signed Delivered event marks `delivered`.

Expo receipt `delivered` means APNs/FCM accepted the notification, not that a device displayed it.

## Workplace membership

Account signup stays open so a manager can create the first Workplace and an invited worker can make an account for the invited email. Membership is invitation-led:

- `POST /v1/workplaces` creates the caller's first Workplace as a manager only when they have no Employment (including deactivated) and no unexpired pending invitation.
- Joining an existing Workplace happens by accepting an invitation. A deactivated Employment still cannot open a new Workplace. The invite page lets a new person create an account with the invited email locked.
- Web and mobile onboarding ask whether you manage a workplace or are waiting for an invite, so workers are not pushed into workplace setup.

Open registration of *accounts* is acceptable for the pilot because it does not grant Workplace membership.

## Known constraints

- Swaps are limited to a single Schedule. Approval revalidates eligibility in its transaction; policy and unrelated cross-Schedule draft writes do not yet share a global worker-lock protocol, so concurrent policy changes need further serialization before claiming a system-wide eligibility guarantee.

## Security notes

- Environment files and credentials are ignored by Git.
- Server-only database, Better Auth, and Polar secrets must not be included in web or mobile builds.
- Authorization must be enforced by the API and database policies, not only by client navigation.
- Review generated database migrations before applying them to production.
