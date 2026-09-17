# Schema simplification review

Reviewed the 78 current Drizzle tables in `packages/db/src/schema` against the
server routes, web screens, and domain terms in `CONTEXT.md` (2026-09-17).

## Consolidated

`day_parts` and `time_blocks` had the same fields and location scope. Both were
named time windows. Time blocks now serve both shift creation and schedule
filtering. Migration 0033 copies distinct Day parts into Time blocks before
dropping `day_parts`. An equal name and time range is already represented and
is skipped; an equal name with different times is copied with a distinct name.
The separate Day parts API, settings page, seed data, and client query field
were removed.

`approval_policy_groups` and `approval_policy_rules` duplicated the
Workplace's auto-approval settings. The per-Schedule group selector, API, and
tables were removed. Migration 0034 preserves auto-approval for Shift Releases
and Pickups from the most recently assigned group in each Workplace, while
keeping any existing Workplace auto-approval switches on. The other group
rules were not enforced by the server; their removal does not change request
decisions. Approval settings now live in the Workplace policy settings.

## Similar names with different responsibilities

| Tables | Reason to keep separate |
| --- | --- |
| `worker_groups`, `schedule_teams` | Groups filter Employments; teams partition Schedules at a Location. |
| `shift_templates`, `schedule_templates` + `template_shifts`, `shift_patterns` + their shifts and members | Single Shift defaults, a saved week, and a recurring multiweek rotation have different application rules and data. |
| `leave_types`, `leave_policies`, `leave_approval_chains` + steps | A request category, its accrual rules, and its approver sequence. |
| `shifts`, `version_shifts`, `open_shifts` | Editable draft, immutable published snapshot, and offer/pickup lifecycle. |
| `unavailability`, `work_preferences`, `time_off_requests` | Hard constraint, nonbinding preference, and approval request. |
| `notifications`, `notification_outbox`, `email_deliveries`, `push_deliveries`, `worker_deliveries` | In-app content, retry queue, transport attempts, and published-Schedule acknowledgement. |
| `time_entries`, `attendance_marks` | Worked time versus a Manager's note on a published Shift. |

The other tables have a distinct product record, relationship, history, or
delivery role. Similar foreign keys such as `schedule_teams.workplace_id` and
`leave_policies.workplace_id` repeat an ancestor ID, but are columns within an
entity rather than duplicate entities. Their removal would require query and
constraint changes without simplifying a Manager's workflow.

## Migration tradeoff

When a Workplace used different approval groups on different Schedules, one
Workplace-wide policy cannot retain all week-specific differences. The newest
assigned group's Release and Pickup auto-approval choices become the
Workplace default. Review those two settings after migration if a Workplace
used week-specific rules.
