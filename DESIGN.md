---
name: jooling
description: A fast, operational scheduling system for hourly teams, built entirely from shadcn/ui components.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.141 0.005 285.823)"
  sidebar-canvas: "oklch(0.975 0.002 286)"
  muted: "oklch(0.967 0.001 286.375)"
  muted-foreground: "oklch(0.52 0.016 285.938)"
  border: "oklch(0.92 0.004 286.32)"
  primary: "oklch(0.551 0.188 255.97)"
  primary-foreground: "oklch(0.985 0.004 250)"
  destructive: "oklch(0.577 0.245 27.325)"
  success: "oklch(0.6 0.13 155)"
  success-muted: "oklch(0.96 0.035 155)"
  warning: "oklch(0.95 0.06 88)"
  warning-foreground: "oklch(0.42 0.1 62)"
  warning-border: "oklch(0.84 0.1 82)"
typography:
  heading:
    fontFamily: "Geist Variable, Inter Variable, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.025em"
  page-title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
  body:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  control: "calc(var(--radius) - 2px)"
  card: "0.875rem"
  hero: "1rem"
  radius: "0.625rem"
spacing:
  page-gutter: "1.5rem"
  page-gutter-mobile: "1rem"
  card: "1.25rem"
  card-sm: "0.875rem"
components:
  card:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    height: "2rem"
  next-shift-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.hero}"
---

# Design System: jooling

## Overview

**North star: a calm shadcn workspace.** Stock shadcn/ui structure on cool zinc neutrals, with one brand hue (the logo blue) for action, selection, and the current day. Amber, red, and green are reserved for operational state. The interface earns trust through consistent framing: every screen is a page header followed by cards or one framed panel.

Every control is a component from `packages/ui` (shadcn, base-nova style). `apps/web` never restyles a component's color, shape, or typography inline; `.oxlintrc.json` (`@shadcn/lint`) enforces this. When a design needs a treatment no variant provides, add a variant in `packages/ui` (for example `Alert variant="warning"`).

## Colors

- **Zinc neutrals** carry all surfaces. The sidebar canvas is a hair darker than the white inset, so the work area reads as a sheet on a desk.
- **Primary blue** (`#006EDC`) is for primary buttons, links, focus rings, selection, the current day, and the worker next-shift hero. There is no second accent.
- **Warning amber** means unassigned work or a response the worker owes. Open-shift rows and tiles, and the "shift change needs your response" alert.
- **Destructive red** means conflict or destructive action.
- **Success green** means published, confirmed, or caught up.
- **Category 1–6** tint shift tiles by position. They avoid the amber and red hues so position color never reads as status.

**Status has words.** Every state pairs color with a label, count, or icon.

## Typography

Geist for headings and figures (page titles, card titles, stat values, the hero time); Inter for everything else. Page titles are `text-xl md:text-2xl font-semibold tracking-tight`. Times, dates, counts, and money use tabular numerals.

## Layout

- **Shell:** shadcn `Sidebar variant="inset" collapsible="icon"`. Manager nav is grouped Plan / Team / Time, with Activity and Settings pinned at the bottom. The header holds the sidebar trigger, a vertical separator, and a `Breadcrumb`.
- **Page:** `AppPageHeader` (title, description, actions; no border) then `AppPageBody`.
- **List pages:** `AppPageBody scroll={false}` renders one framed panel (`data-slot="app-panel"`): toolbar, tinted table header, rows, and a borderless empty state all live in a single card.
- **Document pages:** `AppDocument` holds a stack of `Card`s at `gap-6`.
- **Settings:** a secondary nav rail and `SettingsSection` rendered as a `Card` (header with `CardAction`, content, muted `CardFooter` for save actions), constrained to `max-w-5xl`.
- **Auth:** a split screen, with the form on the left and on the right a muted panel with a static miniature of the week board.

**The week stays a week.** The manager schedule is a sticky-staff-column grid with horizontal scroll, never day cards. Headers sit on `bg-muted`, today's column carries a faint primary tint, and the open-shift row is amber.

## Elevation

Cards use a 1px ring plus a 1px soft shadow (set through `--tw-shadow` so ring and shadow compose). A card nested in another card loses its frame. No floating stacks.

## Signature components

- **Next-shift hero (worker):** a primary-filled `rounded-2xl` panel showing the time range in Geist 3xl–4xl, the long date and position, a relative-day badge, and the clock-in/out control (`NextShiftBar variant="hero"`). It is always the first block on the worker home. Required responses follow it as `Alert`s, then the schedule sections as `Tabs`.
- **Shift tile:** time on the first line with an optional status badge, then position (with a category dot) on the second line. Conflict tiles are red, open tiles amber.
- **Overview stat cards:** label, icon chip (tinted amber or red only when the value is an exception), a large Geist value, and a hint. Daily coverage uses a `Progress` bar per day for assigned vs. total.
- **Kiosk:** a large live clock above a single card, with 44–48px touch targets.

## Native app (`apps/native`)

The same system, expressed with native parts. Tokens live in `apps/native/theme/index.ts` (colors for light and dark, spacing, radius, type ramp, motion); primitives live in `apps/native/components/ui/`. Screens compose primitives and never set raw colors or font sizes.

- **Navigation:** `NativeTabs` with a native Stack inside every tab (`TabStack`), so iOS gets collapsing large titles and a translucent bar. Header actions use `headerRight`, not in-page headers.
- **Screen:** every route starts with `Screen` (a ScrollView with `contentInsetAdjustmentBehavior="automatic"` and optional pull-to-refresh).
- **Surfaces:** `Card`, `Callout` (tone = meaning: warning is a response owed, danger is a failure), `Badge` (status always has words), `ListGroup`/`ListRow` with `IconTile`, `Section` for titled groups.
- **Controls:** `Button` (primary, secondary, tinted, outline, ghost, destructive, and inverse variants for the hero), `SegmentedControl`, `ChoiceChips`. Form fields are native: SwiftUI date pickers and `@expo/ui` switches and checkboxes on iOS, Compose text fields, pickers, and chips on Android (`form-controls.android.tsx`).
- **Icons:** `Icon` from one registry, rendering SF Symbols on iOS (expo-image) and Material icons elsewhere.
- **Motion:** Reanimated only. `PressableScale` is the shared press spring; `Appear` staggers blocks in as data arrives; `Skeleton` holds space while loading. All motion honours Reduce Motion.
- **Worker home order:** next-shift hero with the time clock, then responses owed (late-change acceptance, "I saw this"), then swaps, then the week grouped by day (My shifts / Everyone), then next week, then history.

## Do / Don't

- **Do** add variants to `packages/ui` instead of overriding component styles in pages.
- **Do** keep acknowledgement ("I saw this"), late-change acceptance, and release as separate, plainly worded actions.
- **Don't** use amber or red decoratively, or hide conflicts and open shifts behind filters.
- **Don't** reintroduce raw `<table>`, `<label>`, `<details>` or unstyled buttons; use `Table`, `Label`/`FieldLabel`, `Collapsible`, `Button`/`Item render`.
