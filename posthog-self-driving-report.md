# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for the Jooling scheduling product. Session Replay, Error Tracking, and Support were confirmed enabled; the native health, error, and support signal sources were already enabled; and the existing scout troop and Replay Vision monitors were verified as correctly configured. Findings will begin appearing in the [Self-driving inbox](https://eu.posthog.com/project/265168/inbox) within about 30 minutes after new activity arrives.

## AI data processing

Approved by the setup gate.

## GitHub

GitHub was already connected before this setup. No GitHub Issues responder was enabled because no connected tools were selected.

## Products enabled

| Product | Result | App check / note |
| --- | --- | --- |
| Session Replay | Already enabled | The web PostHog initialization in `apps/web/src/routes/__root.tsx` does not disable recording. No recordings were present at setup time. The native app has no PostHog SDK, so replay is inert there until a native integration is added. |
| Error Tracking | Already enabled | The web initialization explicitly enables exception capture. No active error issues were returned at setup time. The native app likewise requires its own PostHog SDK integration to capture exceptions. |
| Support | Already enabled | An inbound channel (email, inbox, or Slack) must be connected in PostHog before support tickets arrive. |

## Signal sources

| source_product | source_type | Action |
| --- | --- | --- |
| `signals_scout` | `cross_source_issue` | Deliberately not created: scout findings route to the inbox by default. |
| `health_checks` | `health_issue` | Already enabled (source config `01a06847-960c-7bc2-b1d6-547464098a13`). |
| `error_tracking` | `issue_created` | Already enabled (source config `01a06847-96b9-700a-ab7d-7d247408f820`). |
| `error_tracking` | `issue_reopened` | Already enabled (source config `01a06847-9643-771c-9269-6c16d90aa732`). |
| `error_tracking` | `issue_spiking` | Already enabled (source config `01a06847-9624-70f3-b57e-d09317b116d3`). |
| `conversations` | `ticket` | Already enabled (source config `01a06847-9642-7a4e-a394-63dfeb637c7e`). |
| `session_replay` | `session_analysis_cluster` | Skipped: this retired route is replaced by Replay Vision scanners. |
| `replay_vision` | `scanner_finding` | Deliberately not created: each scanner’s `emits_signals: true` is its responder configuration. |

## Connected tools

No connected tools were selected, so no connected-tool responders were enabled.

| Tool | Status |
| --- | --- |
| GitHub Issues | Not used |
| Linear | Not used |
| Jira | Not used |
| Sentry | Not used |
| Zendesk | Not used |

## Scout troop

The enforced scout budget is **100 runs/day**; **3** had been used at configuration time, leaving **97**. The active early-access notice says: “Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more.”

### Enabled scouts

| Scout | What it watches |
| --- | --- |
| `signals-scout-general` | Cross-product patterns and surfaces outside specialist coverage. |
| `signals-scout-health-checks` | Actionable PostHog setup and instrumentation health issues. |
| `signals-scout-product-analytics` | Product-flow conversion, retention, lifecycle, stickiness, and path regressions. |
| `signals-scout-web-analytics` | Web traffic, attribution, landing-page, bounce, and 404 health changes. |
| `signals-scout-schedule-publishing` | Sustained schedule-publication drop-offs while schedule-building activity holds. |
| `signals-scout-worker-invitation-activation` | Invitation acceptance and first-access activation drop-offs. |

### Disabled built-in scouts

| Scout | Reason |
| --- | --- |
| `signals-scout-ai-observability` | No AI or LLM surface was found. |
| `signals-scout-anomaly-detection` | Current product-specific scouts are more targeted while the analytics baseline matures. |
| `signals-scout-apm` | No APM or OpenTelemetry surface was found. |
| `signals-scout-conversations` | No inbound support channel is confirmed. |
| `signals-scout-csp-violations` | No PostHog CSP-reporting configuration was found. |
| `signals-scout-customer-analytics` | Customer Analytics usage was not established. |
| `signals-scout-data-pipelines` | No CDP, export, or Hog Flow surface was found. |
| `signals-scout-data-warehouse` | No warehouse sources are connected. |
| `signals-scout-error-tracking` | Covered by enabled native Error Tracking responders. |
| `signals-scout-experiments` | No active experiment surface was found. |
| `signals-scout-feature-flags` | No active feature-flag surface was found. |
| `signals-scout-inbox-validation` | There are no resolved Self-driving reports to validate yet. |
| `signals-scout-insight-alerts` | No insight alerts are configured. |
| `signals-scout-logs` | No PostHog Logs surface was found. |
| `signals-scout-mcp-tool-calls` | MCP-tool telemetry is outside product operational monitoring scope. |
| `signals-scout-observability-gaps` | Current event volume is too early for a useful coverage baseline. |
| `signals-scout-replay-vision` | Scanner-level findings cover replay; aggregate observations have not accumulated yet. |
| `signals-scout-revenue-analytics` | No payment or revenue surface was found. |
| `signals-scout-session-replay` | Covered by the enabled Replay Vision scanners. |
| `signals-scout-skills-store` | Skills-store hygiene is outside product operational monitoring scope. |
| `signals-scout-surveys` | No surveys are configured. |
| `signals-scout-tasks` | PostHog Tasks monitoring is outside product operational monitoring scope. |
| `signals-scout-web-vitals` | Web Vitals data was not established. |

## Custom scouts

Two existing product-specific scouts remain active: `signals-scout-schedule-publishing` and `signals-scout-worker-invitation-activation`. They cover the core schedule-release handoff and worker onboarding activation using sustained drop-off discriminators, rather than flagging ordinary day-to-day variation.

A time-off resolution-health scout was proposed because `apps/web/src/routes/dashboard/timeoff.tsx` captures request and manager-decision milestones. It was declined, so no new custom scout was created. Time-clock and open-shift workflows were considered but lack a sufficiently complete event funnel for a high-confidence scheduled check. If any custom scout becomes noisy, set its config’s `emit` field to `false` in PostHog to keep it in dry-run mode without writing inbox reports.

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes clearly observed defects to the inbox. These scanners are the only part of this setup that spends Replay Vision quota. Scanner findings arrive at half weight and need independent corroboration before promotion into a report.

No recordings were present at setup time, so both scanners are armed for the first incoming recordings. The authoritative sizing skill was unavailable on this deployment; the current API estimate is zero observations and zero monthly credits because no recordings match yet.

| Brief | Scanner | Status | Query scope | Sampling | Estimated monthly spend |
| --- | --- | --- | --- | --- | --- |
| Breakage monitor | `Broken schedule publishing` | Existing scanner verified | Recordings whose URL contains `/dashboard/schedule`, the manager’s core flow for building and publishing a weekly schedule. | 0.5 | 0 observations / 0 credits currently; 5 credits per observation once recordings match. |
| Frustration monitor | `Scheduling workflow frustration` | Existing scanner verified | Recordings with `$rageclick` only; no URL filter, preserving disjoint targeting. | 1.0 | 0 observations / 0 credits currently; 5 credits per observation once recordings match. |

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so enabled ticket responders can receive support conversations.
- [ ] Generate normal browser activity in the web application so Session Replay records sessions and the Replay Vision scanners can begin observing them.
- [ ] Add a PostHog native SDK integration if mobile Session Replay and mobile Error Tracking are required.
- [ ] Consider enabling paused specialists when the product adopts their surfaces, such as Feature Flags, Surveys, Web Vitals, Revenue Analytics, Logs, or APM.

## Repository changes

| File | Change |
| --- | --- |
| `posthog-self-driving-report.md` | Updated setup report. |
| `.claude/skills/replay-vision-setup/` | Installed Replay Vision setup reference skill. |
| `.claude/skills/replay-vision-scanners-core/` | Installed scanner mechanics reference skill. |
| `.claude/skills/replay-vision-scanner-broken-experiences/` | Installed breakage-monitor brief. |
| `.claude/skills/replay-vision-scanner-user-frustration/` | Installed frustration-monitor brief. |

No existing application source files were modified.

## What happens next

Fresh scout configurations are normally picked up within about 30 minutes and draw from the verified daily scout budget. Findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/265168/inbox); immediately actionable reports can then begin coding tasks.
