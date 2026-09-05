---
name: jooling
description: A fast, operational scheduling system for hourly teams.
colors:
  cool-canvas: "oklch(0.978 0.008 245)"
  navy-ink: "oklch(0.22 0.03 255)"
  white-card: "oklch(1 0 0)"
  service-blue: "oklch(0.55 0.19 255)"
  service-blue-foreground: "oklch(0.985 0.006 245)"
  action-teal: "oklch(0.52 0.13 185)"
  action-teal-foreground: "oklch(0.985 0.006 185)"
  seafoam-secondary: "oklch(0.94 0.025 205)"
  slate-muted: "oklch(0.95 0.012 250)"
  muted-ink: "oklch(0.46 0.03 255)"
  teal-accent: "oklch(0.92 0.045 185)"
  sidebar-navy: "oklch(0.235 0.045 255)"
  conflict-red: "oklch(0.58 0.22 27)"
  hairline: "oklch(0.875 0.018 65)"
  open-shift-amber: "rgb(254 243 199)"
  native-blue: "hsl(221.2 83.2% 53.3%)"
  native-success: "hsl(142 71% 32%)"
  native-notification: "hsl(0 84.2% 60.2%)"
typography:
  headline:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
rounded:
  square: "0"
  compact: "0.5rem"
  surface: "0.75rem"
  feature: "1rem"
  native-control: "10px"
  native-card: "14px"
  native-feature: "18px"
spacing:
  unit: "0.25rem"
  xs: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  native-page: "20px"
components:
  button-primary:
    backgroundColor: "{colors.action-teal}"
    textColor: "{colors.action-teal-foreground}"
    rounded: "{rounded.square}"
    height: "2rem"
    padding: "0 0.625rem"
  button-outline:
    backgroundColor: "{colors.cool-canvas}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.square}"
    height: "2rem"
    padding: "0 0.625rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.square}"
    height: "2rem"
    padding: "0 0.625rem"
  card:
    backgroundColor: "{colors.white-card}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.square}"
    padding: "1rem"
  next-shift:
    backgroundColor: "{colors.service-blue}"
    textColor: "{colors.service-blue-foreground}"
    rounded: "{rounded.feature}"
    padding: "1.5rem"
---

# Design System: jooling

## Overview

**Creative North Star: "The Calm Service Board"**

jooling should feel like the dependable operations board at the center of a well-run workplace: fast enough to staff a week or a last-minute gap, disciplined enough to support staffing decisions, and quiet enough for dense weekly scanning. The interface favors explicit status, compact controls, strong alignment, and plain-language consequences over decorative display.

The web manager experience is a high-density workspace built around a worker-by-day week grid. Worker experiences reverse that density: the next shift leads, required responses follow, and the current week provides context. Native preserves platform-appropriate touch sizing and a clear blue action color while sharing the same hierarchy and responsibility language.

**Key Characteristics:**

- White web surfaces, a soft neutral navigation rail, and crisp blue actions with restrained teal support.
- Dense, table-like manager composition; calm, stacked worker composition.
- Status is expressed with words, counts, icons, and color together.
- Square web primitives sit inside selectively softened feature surfaces.
- Times and operational counts use tabular numerals.

## Colors

Blue and teal give the web product clearer depth and wayfinding; amber and red remain reserved for operational exceptions, while native keeps a familiar platform blue for primary action.

### Primary

- **Action Teal:** This color is reserved for actions.
- **Service Blue:** Filled web buttons, text links, selection, informational emphasis, the worker next-shift feature, and focus rings.
- **Native Action Blue:** Primary buttons and the next-shift feature in the native worker client.

### Secondary

- **Seafoam Secondary:** Low-priority filled controls and supportive information on the web.
- **Teal Accent:** Hover feedback and lightweight current-day emphasis.

### Tertiary

- **Open-Shift Amber:** Unassigned work only; it distinguishes a staffing gap from a worker conflict.
- **Native Success:** Confirmed and completed worker states on native surfaces.
- **Native Notification:** Errors and destructive feedback on native surfaces; always consumed through the active theme rather than embedded in component styles.

### Neutral

- **Cool Canvas:** Default web canvas.
- **White Card:** Raised or bounded work surfaces.
- **Navy Ink:** Primary text and decisive labels.
- **Muted Ink:** Supporting copy, metadata, and secondary counts.
- **Sidebar:** Persistent navigation surface, visually separating wayfinding from the work canvas.
- **Hairline:** Dividers, inputs, cards, and the weekly grid structure.
- **Conflict Red:** Scheduling conflicts, destructive feedback, and invalid states.

### Named Rules

**The Exception Color Rule.** Amber means unassigned work and red means conflict or destructive state; never use either as decoration.

**The Status Has Words Rule.** Every meaningful state includes a readable label, count, icon, or explanation in addition to color.

## Typography

**Display Font:** Geist Variable (with sans-serif fallback)  
**Body Font:** Inter Variable (with sans-serif fallback)

**Character:** Neutral, compact, and highly legible. Hierarchy comes from weight, size, spacing, and alignment rather than a decorative type pairing.

### Hierarchy

- **Headline** (800, 1.875rem, 1.2): Native screen identity and top-level worker context.
- **Title** (600, 1.5rem, 1.25): The next upcoming shift on web worker surfaces.
- **Body** (400, 0.875rem, 1.5): Explanations, summaries, and standard application copy.
- **Label** (600, 0.75rem, 1.33): Grid shifts, badges, controls, metadata, and compact operational facts.

### Named Rules

**The Numbers Align Rule.** Times, dates, hours, counts, and versions use tabular numerals wherever columns or repeated rows invite comparison.

## Layout

Web pages use a vertical rhythm of 1.5rem between major regions. The manager toolbar wraps compact location, week, status, and copy controls before the weekly schedule. The schedule itself is an eight-column grid: a sticky 180px worker column plus seven day columns with a 132px minimum, contained in horizontal overflow so the operating model stays intact on narrow screens. Worker rows are at least 6rem tall and shift tiles use compact 0.375–0.5rem internal spacing.

Worker web and native screens use a single-column priority stack: next shift first, late-change decisions and acknowledgement second, current week third, then future and historical context. Native uses 20px page insets, 16px section gaps, comfortable 42–50px controls, and concise rows designed for one-handed checks.

**The Week Stays a Week Rule.** Preserve the seven-day worker grid through horizontal scrolling; do not collapse the manager schedule into disconnected day cards.

**The Action Order Rule.** On worker surfaces, never let history or general schedule detail outrank a required response.

## Elevation & Depth

The system is primarily flat and structural. Web depth comes from hairline borders and restrained small shadows on major containers; the dense card primitives themselves use a one-pixel tonal ring. Native relies on bordered cards and color contrast rather than shadows.

### Shadow Vocabulary

- **Surface Low** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): Major toolbar, schedule, acknowledgement, and feature containers on web only.
- **Card Hairline** (`0 0 0 1px color-mix(in oklch, currentColor 10%, transparent)`): Compact web cards that need separation without visual lift.

### Named Rules

**The Flat Operations Rule.** Use structure before shadow; no floating-card stacks or ornamental elevation in the scheduling workspace.

## Shapes

Web primitives are deliberately square: buttons, badges, inputs, and canonical cards use no corner radius. Rounded forms are reserved for meaningful containers and direct-manipulation objects: 0.5rem shift tiles, 0.75rem toolbars and schedule frames, and 1rem next-shift feature panels. Native uses a softer platform language with 10px controls, 14px cards, and an 18px next-shift feature.

**The Softness Signals Scope Rule.** Small square controls belong to the operating system; larger rounded surfaces gather a complete task or priority moment.

## Components

### Buttons

- **Shape:** Compact and square on web; comfortably rounded with at least 42px height on native.
- **Primary:** Service Blue on web and Native Action Blue on native, with high-contrast text and medium-to-bold labels.
- **Hover / Focus:** Web primary controls reduce fill intensity on hover, depress by one pixel when active, and show a visible one-pixel focus ring. Native press states reduce opacity without changing meaning.
- **Secondary / Ghost:** Outlined native controls take border and text from semantic theme tokens and use pressed opacity only as interaction feedback. Web outlined controls retain the canvas fill; ghost controls reveal a muted fill only on interaction.

### Chips

- **Style:** Compact square badges identify draft or published state using primary, secondary, or outline treatments.
- **State:** Always pair publication styling with explicit version or draft language.

### Cards / Containers

- **Corner Style:** Canonical web cards are square; task containers may use the surface radius. Native cards use the native-card radius.
- **Background:** White Card on Cool Canvas; priority features use the platform primary color.
- **Shadow Strategy:** Flat by default, with Surface Low only on major web containers.
- **Border:** Hairline borders define cards, notices, controls, and every grid boundary.
- **Internal Padding:** 1rem for ordinary cards, 1.5rem for a web next-shift feature, and 22px for its native counterpart.

### Inputs / Fields

- **Style:** Square 2rem web fields with a one-pixel Hairline border, transparent fill, and compact 0.75rem type.
- **Focus:** Shift the border to Service Blue and add a restrained matching ring.
- **Error / Disabled:** Invalid fields use Conflict Red plus a ring; disabled fields lower opacity and retain their readable value.

### Navigation

Manager navigation supports persistent application structure while the schedule toolbar owns location and week context. Worker navigation stays subordinate to the current schedule priority. Active state must remain explicit in both light and dark themes.

### Weekly Schedule Grid

The grid is the signature manager component. Keep the worker column sticky, weekday headers aligned, current-day tint subtle, conflict shifts visibly labeled in red, and open shifts in a dedicated amber row. Shift tiles show time first, position second, and conflict status third. Adding and editing remain contextual to a worker-day cell.

### Worker Priority Stack

The next-shift panel is the single strongest block. Late material changes use explicit Accept shift and Decline actions and explain that acceptance is distinct from seeing the schedule. Acknowledgement uses “I saw this.” Release controls must state that responsibility remains with the worker until reassignment is approved.

## Do's and Don'ts

### Do:

- **Do** keep the manager week, worker names, shift times, open shifts, and conflicts simultaneously scannable.
- **Do** use plain, consequential labels such as “Review & publish,” “Accept shift,” and “I saw this.”
- **Do** preserve touch targets of at least 42px on native worker controls.
- **Do** keep acknowledgement, late-change acceptance, and release as visually and verbally distinct actions.
- **Do** support both light and dark themes without changing semantic color roles.
- **Do** consume native secondary text, borders, errors, and success feedback from semantic theme tokens.

### Don't:

- **Don't** hide conflicts or open shifts behind a filter, tooltip, or color-only mark.
- **Don't** treat acknowledgement as agreement to work a late material change.
- **Don't** imply that requesting release transfers responsibility immediately.
- **Don't** soften every web primitive; selective rounding is part of the hierarchy.
- **Don't** replace the weekly manager grid with a generic card dashboard.
