# MVP Implementation Plan

## Current implementation status — August 30, 2026

The repository now contains the complete product path described in Phases 1–6 across the Drizzle schema, Elysia API, manager web application, and worker web/native clients. Those phases are **feature-complete in code**, but their acceptance criteria are not considered pilot-verified until integration tests and the end-to-end acceptance scenarios exist.

| Phase | Status | Evidence in the repository |
| --- | --- | --- |
| 1. Identity and Workplace setup | Feature-complete | Auth bootstrap, onboarding, Workplace/Location/Position management, scoped Employments, invitation acceptance, Worker directory, and sign-out |
| 2. Worker constraints and requests | Feature-complete | Unavailability, preferences, time-off requests and decisions, Manager constraint views, and override reasons |
| 3. Schedule drafting | Feature-complete | Weekly Location grid, shift CRUD/copy, previous-week copy, server conflict checks, overnight support, and hours summaries |
| 4. Publication and acknowledgement | Feature-complete | Immutable version tables, atomic publication flow, Worker schedules/history, delivery state, and explicit acknowledgement |
| 5. Successor drafts and late changes | Feature-complete | Change previews, version comparisons, notice-window classification, Worker acceptance/decline, and Manager acceptance status |
| 6. Basic shift coverage | Feature-complete | Release, open-shift, pickup, eligibility, Manager decision, notification, audit, and successor publication flows |
| 7. Notifications and pilot hardening | In progress | In-app inbox and audit log exist; delivery infrastructure, reliability controls, automated verification, operations, and metrics remain |

“Feature-complete” describes repository coverage, not production readiness. Database migrations must still be exercised against a clean environment and a migrated pilot-like environment.

## Product boundary

Build the authoritative scheduling system for independent full-service restaurants in Austin, Texas. Managers use the web application; Workers use the Expo mobile application. The Workplace pays and Workers use the product for free.

The MVP includes scheduling, publication, acknowledgement, late-change acceptance, and basic shift coverage. It excludes payroll, attendance, time clocks, tips, hiring, performance management, forecasting, and complex labor optimization.

## Delivery principles

- Build vertical slices through database, API, web, and mobile.
- Keep Elysia as one capability-based modular monolith.
- Keep scheduling rules deterministic; do not introduce AI scheduling in the MVP.
- Use Supabase only for PostgreSQL and identity. All Workplace data goes through Elysia.
- Optimize the Worker experience for one obvious primary action per screen.
- Add infrastructure only when the Austin pilot demonstrates a real need.

## Phase 1 — Identity and Workplace setup

**Status:** Feature-complete in code; invitation email delivery and automated authorization coverage remain under Phase 7.

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

**Status:** Feature-complete in code; database immutability and atomic rollback need integration tests against PostgreSQL.

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

**Status:** Feature-complete in code; concurrency and eligibility race cases need integration tests.

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

**Outcome:** The product reliably communicates published work and is safe to pilot with Austin restaurants.

### Completed

- In-app notification inbox as the durable source of truth
- Read-one and read-all notification actions
- Manager activity view backed by an audit log
- Notifications emitted for core publication, change, and coverage workflows
- Persistent client sessions and explicit sign-out with user-cache cleanup
- Expo push notifications: mobile device-token registration and fan-out on every notification
- Invitation-led Workplace membership: open account signup, refused Workplace create when any Employment or pending invitation exists, and a waiting-for-invite onboarding path

### Remaining before pilot

- Send real invitation and schedule emails; define retry, bounce, and delivery-status handling
- Add idempotency keys and replay-safe behavior for invitation, publication, acknowledgement, acceptance, release, pickup, and Manager decision commands
- Add rate limits to authentication-adjacent, invitation, and other abuse-sensitive endpoints
- Add structured request logs, error tracking, health/readiness checks, and alerting
- Document and test database backup restoration, not only backup creation
- Add focused API integration tests; the repository currently has no automated test suite
- Add end-to-end acceptance scenarios for each phase, including authorization boundaries and deactivated Employments
- Test DST transitions, overnight Shifts, Notice Window boundaries, concurrent publication/coverage decisions, and transactional rollback
- Run accessibility checks and keyboard/screen-reader testing on manager and worker web flows
- Test native offline/read-only behavior, slow networks, expired sessions, notification permission denial, and recovery after reconnect
- Instrument pilot metrics: time to publish, acknowledgement rate, late-change acceptance time, release/pickup resolution time, missed-shift reports, and weekly active Workers

## Recommended implementation order inside each phase

1. Write the Drizzle schema and migration.
2. Add domain functions and transaction boundaries.
3. Expose validated Elysia endpoints and OpenAPI contracts.
4. Add focused API integration tests.
5. Implement the Manager web workflow.
6. Implement the Worker mobile workflow.
7. Run the complete acceptance scenario before moving to the next phase.

## Immediate next slice

Close the largest production-readiness gap with a pilot verification slice:

1. Establish the test harness with an isolated PostgreSQL database and authenticated Manager/Worker fixtures.
2. Add Phase 1 authorization tests and one full setup → invitation → acceptance scenario.
3. Add atomic publication tests covering success, rollback, immutable history, acknowledgement, and successor versions.
4. Add late-change and coverage concurrency tests so duplicate or competing commands cannot create contradictory versions.
5. Introduce idempotency for the tested write commands and prove replay behavior in integration tests.
6. Connect invitation email delivery with observable retries and delivery failures.
7. Run the clean-database migration, backup/restore, accessibility, DST, and slow-network pilot checklist.

After this slice, add push delivery and pilot metrics. Do not add more scheduling scope until the existing Phases 1–6 pass their acceptance scenarios.
