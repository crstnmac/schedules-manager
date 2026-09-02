# MVP Implementation Plan

## Current implementation status — September 2, 2026

The repository contains the complete product path described in Phases 1–6 across the Drizzle schema, Elysia API, manager web application, and worker web/native clients. Phase 7 has closed most delivery and reliability gaps: invitation email, idempotency, rate limits, readiness/logging, push, invitation-led join policy, and a PostgreSQL integration suite. Phases 1–6 remain **feature-complete in code**; pilot readiness still needs ops drills, broader acceptance coverage, client hardening, and metrics.

| Phase | Status | Evidence in the repository |
| --- | --- | --- |
| 1. Identity and Workplace setup | Feature-complete | Auth bootstrap, invitation-led onboarding, Workplace/Location/Position management, scoped Employments, invite create/accept, Worker directory, and sign-out |
| 2. Worker constraints and requests | Feature-complete | Unavailability, preferences, time-off requests and decisions, Manager constraint views, and override reasons |
| 3. Schedule drafting | Feature-complete | Weekly Location grid, shift CRUD/copy, previous-week copy, server conflict checks, overnight support, and hours summaries |
| 4. Publication and acknowledgement | Feature-complete | Immutable version tables, atomic publication flow, Worker schedules/history, delivery state, and explicit acknowledgement |
| 5. Successor drafts and late changes | Feature-complete | Change previews, version comparisons, notice-window classification, Worker acceptance/decline, and Manager acceptance status |
| 6. Basic shift coverage | Feature-complete | Release, open-shift, pickup, eligibility, Manager decision, notification, audit, and successor publication flows |
| 7. Notifications and pilot hardening | In progress | Inbox, audit, email outbox, push, idempotency, rate limits, `/ready`, request logs, join policy, and integration tests exist; ops restore, error alerting, a11y/native drills, and pilot metrics remain |

“Feature-complete” describes repository coverage, not production readiness. Database migrations must still be exercised against a clean environment and a migrated pilot-like environment.

## Product boundary

Build the authoritative scheduling system for hourly teams in any industry. Managers use the web application; Workers use the Expo mobile application. The Workplace pays and Workers use the product for free.

The MVP includes scheduling, publication, acknowledgement, late-change acceptance, basic shift coverage, time clock, labor visibility, and the compared Sling operations surfaces. It excludes payroll runs, Toast/POS sync, SMS, hiring, performance management, forecasting, and AI scheduling.

## Delivery principles

- Build vertical slices through database, API, web, and mobile.
- Keep Elysia as one capability-based modular monolith.
- Keep scheduling rules deterministic; do not introduce AI scheduling in the MVP.
- Use Supabase only for PostgreSQL and identity. All Workplace data goes through Elysia.
- Optimize the Worker experience for one obvious primary action per screen.
- Add infrastructure only when the Austin pilot demonstrates a real need.

## Phase 1 — Identity and Workplace setup

**Status:** Feature-complete in code; broader end-to-end acceptance scenarios remain under Phase 7.

**Outcome:** A Manager can create a Workplace, add its first Location, define Positions, and invite Workers by email. An invited Worker can sign in and see the correct Workplace.

### Domain and database

- Profile linked one-to-one with a Supabase Auth identity
- Workplace
- Location with IANA time zone (`America/Chicago` initially)
- Position
- Employment connecting a Worker to a Workplace
- Employment access to Locations and Positions
- Manager authorization for one or more Locations
- Pending email invitation with expiry and single-use acceptance

### API

- Authenticated identity endpoint
- Create and read Workplace
- Create and update Locations
- Create and update Positions
- Invite, list, deactivate, and resend invitations for Workers
- Resolve the signed-in person's active Employments
- Enforce Workplace and Location authorization in reusable Elysia guards

### Manager web

- First-run Workplace setup
- Location and Position settings
- Simple Worker directory
- Invite Worker form

### Worker mobile

- Invitation-aware sign-in
- Workplace selection only when the person has multiple Employments
- Empty home state explaining that no schedule has been published yet

### Acceptance criteria

- A new Manager can complete setup without database intervention.
- An uninvited identity cannot access Workplace data.
- A deactivated Employment immediately loses access.
- A Worker never sees manager controls.

## Phase 2 — Worker constraints and requests

**Status:** Feature-complete in code; edge-case and time-zone verification remains under Phase 7.

**Outcome:** Workers can tell Managers when they cannot work, express non-binding preferences, and request time off before scheduling begins.

### Domain and database

- Unavailability, including recurring weekly windows and date-specific exceptions
- Work Preference
- Time-off Request with pending, approved, and declined states
- Manager decision, reason, and timestamp

### API and clients

- Worker mobile: one Availability screen with three clearly separated actions
- Manager web: review requests and view constraints while scheduling
- Server-side validation for overlapping or invalid time ranges
- Explicit Manager override reason when scheduling against Unavailability

### Acceptance criteria

- Unavailability is treated as a hard constraint unless a Manager records an override.
- Work Preferences remain visually distinct and never block scheduling.
- Workers see the current status of every Time-off Request.

## Phase 3 — Schedule drafting

**Status:** Feature-complete in code; automated conflict, overnight, DST, and transactional tests remain.

**Outcome:** A Manager can build a complete weekly Schedule for one Location and detect conflicts before publication.

### Domain and database

- Schedule keyed by Location and workweek
- Mutable initial Draft
- Shift with Worker, Position, start, end, and optional note
- Draft validation result

### Manager web

- Week navigation and Location selector
- Daily columns with compact Shift cards
- Create, edit, copy, and remove Shifts
- Copy the previous week's Schedule into a new Draft
- Clear warnings for overlap, Unavailability, approved time off, and missing Position access
- Hours summary by Worker and Position

### Acceptance criteria

- All times are stored as instants and displayed in the Location time zone.
- Overnight Shifts work correctly.
- Conflicts are calculated on the server, not trusted from the client.
- A Manager can finish a normal weekly Schedule without opening a secondary tool.

## Phase 4 — Immutable publication and acknowledgement

**Status:** Feature-complete in code; publication immutability and concurrent publication are covered by integration tests; fuller phase acceptance scenarios remain under Phase 7.

**Outcome:** A Manager publishes the complete Location workweek atomically. Workers see exactly one current version and can explicitly acknowledge “I saw this.”

### Domain and database

- Immutable Schedule Version containing the complete workweek snapshot
- Publication event and publisher
- Worker-specific Delivery Status: Sent, Delivered, or Acknowledged
- Explicit Acknowledgement event

### API and clients

- Transactional publish command
- Worker mobile home showing the next Shift and current week
- Schedule detail grouped by day
- Explicit `I saw this` action with explanatory copy
- Manager acknowledgement overview without implying Worker consent

### Acceptance criteria

- Published rows cannot be updated or deleted through application commands.
- Publication either succeeds for the complete Location workweek or changes nothing.
- Opening the Schedule does not create an Acknowledgement.
- Workers can still view previously published versions relevant to them.

## Phase 5 — Successor drafts and late-change acceptance

**Status:** Feature-complete in code; change-classification and Notice Window boundary cases need automated tests.

**Outcome:** Managers can change a Published Schedule without silently rewriting history, and Workers explicitly accept late Material Schedule Changes.

### Domain and database

- Successor Draft created from the current Published Schedule
- Schedule Change calculated between consecutive versions
- Configurable Workplace Notice Window
- Material versus non-material change classification
- Shift Acceptance state for affected Workers

### API and clients

- Server-generated change preview before publication
- Atomic publication of the successor version
- Worker change summary showing what changed
- Separate `I saw this` and `Accept shift` actions
- Manager view of pending acceptances

### Acceptance criteria

- Every current Schedule has exactly one Published Schedule Version.
- Workers never see Successor Draft changes before publication.
- Late additions or substantial time/location changes require acceptance.
- Acknowledgement never changes acceptance state.

## Phase 6 — Basic shift coverage

**Status:** Feature-complete in code; competing pickup and swap serialization are covered by integration tests; fuller phase acceptance scenarios remain under Phase 7.

**Outcome:** A Worker can request release from a Shift, another eligible Worker can request pickup, and a Manager makes the final assignment decision.

### Domain and database

- Shift Release
- Open Shift
- Shift Pickup
- Eligibility checks using Employment, Location, Position, conflicts, and Unavailability
- Manager approval and immutable resulting Schedule Version

### Client experience

- Worker mobile: `Request release`, `Open shifts`, and `Request pickup`
- Clear reminder that the original Worker remains responsible until approval
- Manager web: one coverage queue with approve or decline

### Acceptance criteria

- Pickup never silently reassigns a Published Shift.
- Approval creates and publishes a successor Schedule Version.
- Ineligible Workers cannot request pickup.

## Phase 7 — Notifications and pilot hardening

**Outcome:** The product reliably communicates published work and is safe to pilot with hourly workplaces.

### Completed

- In-app notification inbox as the durable source of truth
- Read-one and read-all notification actions
- Manager activity view backed by an audit log
- Notifications emitted for core publication, change, and coverage workflows
- Persistent client sessions and explicit sign-out with user-cache cleanup
- Expo push notifications: mobile device-token registration, outbox fan-out, and receipt polling
- ZeptoMail invitation email outbox with retries, bounce/delivered webhook handling, and manager delivery reports
- Idempotency keys and replay-safe behavior for invitation, publication, acknowledgement, acceptance, coverage, swaps, time clock, and unacknowledged-schedule reminders
- In-process rate limits on invitation create/resend/import and ZeptoMail webhooks
- `GET /ready` database readiness check and structured JSON request logs with `x-request-id`
- PostgreSQL integration suite covering publication immutability, concurrent publication/swaps/pickups, invitations, email delivery, rate limits, readiness, reminders, time clock, push receipts, and join policy
- Unit coverage for Notice Window boundaries, overnight minutes, and DST overnight durations
- Invitation-led Workplace membership: open account signup; `POST /v1/workplaces` refused when any Employment or pending invitation exists; web/mobile waiting-for-invite onboarding; invite-page create-account with locked email

### Remaining before pilot

- Error tracking and alerting beyond structured request logs
- Document and test database backup restoration, not only backup creation
- Staging validation of ZeptoMail credentials, webhook events, and Expo device receipts before rollout
- Broader end-to-end acceptance scenarios for each phase, including authorization boundaries and deactivated Employments
- Expand edge-case coverage where still thin: Notice Window API flows, additional concurrent publication/coverage decisions, and transactional rollback proofs
- Run accessibility checks and keyboard/screen-reader testing on manager and worker web flows
- Test native offline/read-only behavior, slow networks, expired sessions, notification permission denial, and recovery after reconnect
- Instrument pilot metrics: time to publish, acknowledgement rate, late-change acceptance time, release/pickup resolution time, missed-shift reports, and weekly active Workers

### Known deferrals

- Global worker-lock protocol for concurrent policy and eligibility changes across unrelated writes
- Attendance Marks (late / no-show / sick), manager Time Entry correction, Breaks, punch rounding, and Timesheet Approval exist

## Recommended implementation order inside each phase

1. Write the Drizzle schema and migration.
2. Add domain functions and transaction boundaries.
3. Expose validated Elysia endpoints and OpenAPI contracts.
4. Add focused API integration tests.
5. Implement the Manager web workflow.
6. Implement the Worker mobile workflow.
7. Run the complete acceptance scenario before moving to the next phase.

## Immediate next slice

Close the remaining pilot-readiness gaps in this order:

1. Document backup restore and run a restore drill against a disposable database.
2. Add error tracking and alerting on the API (and wire it to the existing request-id logs).
3. Validate ZeptoMail and Expo delivery in a staging environment with real provider events and device receipts.
4. Run the web accessibility and keyboard/screen-reader checklist on manager and worker flows.
5. Run the native resilience checklist: offline/read-only, slow network, expired session, notification permission denial, reconnect.
6. Fill remaining acceptance gaps: deactivated Employment boundaries and any missing concurrent coverage/publication cases.
7. Instrument pilot metrics and a simple weekly readout for pilot workplaces.

Do not add AI scheduling, Toast/POS sync, SMS, or blob file storage until a pilot demonstrates a concrete need. Compared Sling rows (including Auto-assign, Workplace Messages, Announcements, hours CSV, Kiosk, Geofence, Labor Cost, and Daily Sales) are implemented.

## Shipped after Phase 7 (2 Sep 2026)

Manager gaps vs Sling, now in schema/API/clients:

- Publishing an unassigned Shift offers it for pickup (no duplicate open row on republish)
- **Shift Swap** propose / accept / decline / manager approve on web and native
- **Today** focus on the week grid, **Attendance Marks**, and native today roster actions
- Named **Schedule Templates** (save a week, apply to a draft; not RRULE recurrence)
- Manager **Time Entry** create/correct with clock-in/out times, reason, and audit
- **Worker Groups**, **Shift Tags**, **Leave Types**, **PTO Balances**
- Day / week / month schedule views, bulk edit, copy/paste, **Time Blocks**, **Day Parts**, **Shift Templates**, repeat N weeks, **Auto-assign**
- Dedicated **Daily Roster** with print, **Breaks**, punch rounding, **Timesheet Approval**
- Configurable early clock-in, **Geofence**, **Kiosk** PIN clock
- **Wage Rate**, overtime, **Labor Cost**, manual **Daily Sales**, hours CSV
- **Shift Tasks**, **Announcements**, **Workplace Messages**
- Employment wages, emergency contacts, Worker PIN, **Employment Documents** (title/url/note)

Honest limits: no Toast/POS API, no SMS, no blob file storage, Auto-assign is eligibility-based rather than AI.
