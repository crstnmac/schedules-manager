# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Managers of independent full-service restaurants plan and communicate weekly work by location. Workers need to understand their next shift, the rest of their published week, and any action that requires their response.

## Product Purpose

jooling gives managers and workers one dependable source of truth for scheduled work. Success means a manager can build and publish a normal week without a spreadsheet or chat thread, and a worker can understand what they work next within seconds.

## Positioning

Published schedules are immutable versions. Managers prepare successor drafts, workers explicitly acknowledge seeing schedules, and late material changes require separate worker acceptance.

## Operating Context

The product is used by independent full-service restaurants. Managers work in a weekly schedule builder organized around locations, workers, positions, shifts, constraints, and publication. Workers check schedules quickly, often from a phone, and may request release or pickup of shifts.

## Capabilities and Constraints

- Manager web and worker mobile are the primary clients; the web worker experience mirrors the worker flow.
- Managers navigate by location and workweek, create and edit shifts, copy a previous week, review conflicts and worker constraints, and publish atomically.
- Workers see the next shift and published current and next weeks, acknowledge delivery, respond to late material changes, and request shift release.
- Unavailability is a hard constraint unless a manager records an override reason. Work preferences are advisory.
- Acknowledgement and shift acceptance must remain separate actions.
- The familiar operating model is the HotSchedules flow: a weekly worker-by-day manager grid and a My Schedule experience centered on the next shift and current week.

## Evidence on Hand

Repository domain language lives in `CONTEXT.md`. Product scope and acceptance criteria live in `docs/IMPLEMENTATION_PLAN.md`. No testimonials, customer logos, or performance claims are available and none should be invented.

## Product Principles

- Make the next required action obvious.
- Keep the full workweek scannable without hiding conflicts.
- Preserve a clear boundary between draft work and published truth.
- Explain responsibility-changing actions in plain language.
- Optimize worker screens for one-handed, quick checks.

## Accessibility & Inclusion

Controls must remain keyboard and screen-reader usable on the web, touch targets must be comfortably sized on mobile, and status cannot rely on color alone.
