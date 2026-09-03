# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for the Jooling scheduling product. Session Replay, Error Tracking, and Support were enabled; health, error-tracking, and support responders were enabled; the scout troop was tuned; and two Replay Vision monitors were created. Findings should start appearing in the [Self-driving inbox](https://eu.posthog.com/project/265168/inbox) within about 30 minutes after new activity arrives.

## AI data processing

Approved by the setup gate.

## GitHub

GitHub was already connected before this setup. No GitHub Issues responder was enabled because no connected tools were selected.

## Products enabled

| Product | Result | App check / note |
| --- | --- | --- |
| Session Replay | enabled | The web PostHog initialization does not disable session recording. No recordings were present at setup time. |
| Error Tracking | enabled | The web initialization explicitly enables exception capture. No active error issues were returned at setup time. |
| Support | enabled | An inbound channel (email, inbox, or Slack) must be connected in PostHog before support tickets arrive. |

The repository already uses `@posthog/react` / `posthog-js` in `apps/web`, and `apps/web/src/routes/__root.tsx` has no disabling override for Replay or Error Tracking. No application source files needed changes.

## Signal sources

| source_product | source_type | Action |
| --- | --- | --- |
| signals_scout | cross_source_issue | Deliberately not created: scout findings are routed to the inbox by default. |
| health_checks | health_issue | Enabled (source config `01a06847-960c-7bc2-b1d6-547464098a13`). |
| error_tracking | issue_created | Enabled (source config `01a06847-96b9-700a-ab7d-7d247408f820`). |
| error_tracking | issue_reopened | Enabled (source config `01a06847-9643-771c-9269-6c16d90aa732`). |
| error_tracking | issue_spiking | Enabled (source config `01a06847-9624-70f3-b57e-d09317b116d3`). |
| conversations | ticket | Enabled (source config `01a06847-9642-7a4e-a394-63dfeb637c7e`). |
| session_replay | session_analysis_cluster | Skipped: retired route; Replay Vision scanners provide replay coverage. |
| replay_vision | scanner_finding | Deliberately not created: each scanner’s `emits_signals: true` is its responder configuration. |

## Connected tools

No connected tools were selected. The warehouse source inventory was empty, so no connected-tool responders were enabled.

| Tool | Status |
| --- | --- |
| GitHub Issues | not used |
| Linear | not used |
| Jira | not used |
| Sentry | not used |
| Zendesk | not used |

## Scout troop

The enforced scout budget is **100 runs/day**; **0** had been used at setup time, with **100** remaining. The active early-access notice says: “Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more.”

### Enabled built-in scouts

| Scout | What it watches |
| --- | --- |
| `signals-scout-general` | Cross-product correlations and gaps outside specialist coverage. |
| `signals-scout-product-analytics` | Core flow conversion, retention, lifecycle, stickiness, and path regressions. |
| `signals-scout-web-analytics` | Web traffic, attribution, landing-page, bounce, and 404 health changes. |
| `signals-scout-health-checks` | Actionable PostHog setup and instrumentation health issues. |

### Disabled built-in scouts

| Scout | Reason |
| --- | --- |
| `signals-scout-ai-observability` | No AI/LLM surface was found. |
| `signals-scout-anomaly-detection` | No established dashboards or insights were found to monitor. |
| `signals-scout-apm` | No APM/OpenTelemetry surface was found. |
| `signals-scout-conversations` | Support has no connected inbound channel yet. |
| `signals-scout-csp-violations` | No PostHog CSP-reporting configuration was found. |
| `signals-scout-customer-analytics` | Customer Analytics usage was not established. |
| `signals-scout-data-pipelines` | No CDP, export, or Hog Flow surface was found. |
| `signals-scout-data-warehouse` | No warehouse sources are connected. |
| `signals-scout-error-tracking` | Covered by the enabled native Error Tracking responders. |
| `signals-scout-experiments` | No active experiment surface was found. |
| `signals-scout-feature-flags` | No active feature-flag surface was found. |
| `signals-scout-inbox-validation` | Fresh setup has no resolved Self-driving reports to validate yet. |
| `signals-scout-insight-alerts` | No insight-alert surface was found. |
| `signals-scout-logs` | No PostHog Logs surface was found. |
| `signals-scout-mcp-tool-calls` | MCP-tool telemetry is not a product monitoring priority. |
| `signals-scout-observability-gaps` | Health checks provide the targeted configuration coverage for this fresh project. |
| `signals-scout-replay-vision` | New scanners have no accumulated observations yet; keep the aggregate analyst layer off initially. |
| `signals-scout-revenue-analytics` | No payment or revenue surface was found. |
| `signals-scout-session-replay` | Covered by the two enabled Replay Vision scanners. |
| `signals-scout-skills-store` | Skills-store hygiene is outside the product’s operational monitoring scope. |
| `signals-scout-surveys` | No surveys are configured. |
| `signals-scout-tasks` | PostHog Tasks monitoring is outside the product’s operational monitoring scope. |
| `signals-scout-web-vitals` | Web Vitals data was not established; enable later if it becomes a priority. |

## Custom scouts

Two approved custom scouts were created and are enabled on the default daily cadence, bringing the total enabled troop to **6**.

| Scout | What it watches | Signal-vs-noise discriminator | Why custom |
| --- | --- | --- | --- |
| `signals-scout-schedule-publishing` | Manager schedule building and publication. | A publication drop is actionable only when shift creation remains healthy across multiple managers or workplaces. | The generic product-analytics scout does not explicitly monitor the operational handoff from schedule construction to publication. Evidence: `apps/web/src/routes/dashboard/schedule.tsx` captures `shift_created` and `schedule_published`. |
| `signals-scout-worker-invitation-activation` | Worker invitations progressing to acceptance and first access. | A downstream activation drop matters only while invitation volume remains normal across multiple workplaces or days. | The generic product-analytics scout does not explicitly distinguish invitation delivery/onboarding friction from a decline in hiring demand. Evidence: invitation and authentication events in `apps/web/src/routes/dashboard/workers/index.tsx`, `apps/web/src/routes/join.tsx`, and `apps/web/src/components/auth-form.tsx`. |

The time-off and timesheet surfaces were considered but not proposed: their current event pairs do not offer a stronger unique discriminator than the two approved funnels. If either custom scout becomes noisy, set its scout config `emit: false` in PostHog to keep it running in dry-run mode without writing inbox reports.

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes clearly observed defects into the inbox. These are the only changes in this setup that spend Replay Vision quota. Scanner findings enter at half weight and require independent corroboration before they are promoted to a report.

No recordings were present at setup time, so both scanners are armed for the first incoming recordings. The authoritative sizing skill was unavailable on this deployment; the scanner API returned a current estimate of zero observations and zero monthly credits because there are no matching recordings yet.

| Brief | Scanner | Status | Query scope | Sampling | Estimated monthly spend |
| --- | --- | --- | --- | --- | --- |
| Breakage monitor | `Broken schedule publishing` | created | Recordings whose URL contains `/dashboard/schedule`, the manager’s core completion flow for building and publishing a weekly schedule. | 0.5 | 0 observations / 0 credits currently; 5 credits per observation once recordings match. |
| Frustration monitor | `Scheduling workflow frustration` | created | Recordings with `$rageclick` only; no URL filter, preserving the required disjoint targeting approach. | 1.0 | 0 observations / 0 credits currently; 5 credits per observation once recordings match. |

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so enabled ticket responders can receive support conversations.
- [ ] Generate normal browser activity with the configured web application so Session Replay records sessions and the two Replay Vision scanners can begin observing them.
- [ ] Create and save operational insights if dashboard-based anomaly monitoring becomes useful; then consider enabling `signals-scout-anomaly-detection`.
- [ ] Enable relevant paused specialists later if the product adopts their surface, such as Feature Flags, Surveys, Web Vitals, Revenue Analytics, Logs, or APM.

## Repository changes

| File | Change |
| --- | --- |
| `posthog-self-driving-report.md` | Created this setup report. |
| `.claude/skills/replay-vision-setup/` | Installed Replay Vision setup reference skill. |
| `.claude/skills/replay-vision-scanners-core/` | Installed shared scanner mechanics reference skill. |
| `.claude/skills/replay-vision-scanner-broken-experiences/` | Installed breakage-monitor brief. |
| `.claude/skills/replay-vision-scanner-user-frustration/` | Installed frustration-monitor brief. |

No existing application source files were modified.

## What happens next

Fresh scout configurations are normally picked up within about 30 minutes and draw from the daily run budget. New findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/265168/inbox); immediately actionable reports can then begin coding tasks.
