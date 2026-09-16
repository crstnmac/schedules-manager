# Attendance report design QA

- Source visual truth: `/Users/cristonmascarenhas/Downloads/attendance-sheet.webp`
- Source dimensions: 1614 × 1330 px
- Implementation target: `http://localhost:5173/dashboard/reports`
- Browser viewport: 1280 × 720 CSS px at device scale factor 1
- Implementation screenshot: unavailable; the authenticated report route redirected to the sign-in screen
- State: blocked before the attendance report could render
- Density normalization: not applicable because no comparable implementation capture was available

**Full-view comparison evidence**

The source image was opened and inspected. The local app was opened in the in-app browser, but the reports route redirected to the sign-in screen. The local API reported its database readiness check as down, so a signed-in report state could not be established without credentials and seeded workplace data.

**Focused region comparison evidence**

Not performed. The chart, status legend, month controls, worker search, and attendance matrix were not available in the browser-rendered state.

**Findings**

- [P0] Authenticated report state is unavailable for visual comparison.
  - Location: `/dashboard/reports`
  - Evidence: browser rendered the sign-in page; API `/ready` reported `database: down`.
  - Impact: layout, chart fidelity, responsive overflow, and primary interactions cannot be visually verified against the reference.
  - Fix: start the project database with seeded manager/workplace/schedule data, sign in, then capture and compare the Attendance tab.

**Primary interactions tested**

- Direct navigation to `/dashboard/reports`: redirected to sign-in as expected for an unauthenticated session.
- Attendance month, worker search, report tabs, tooltip, and horizontal matrix scrolling: blocked by authentication/database state.
- Browser console errors checked: no browser console errors were reported on the rendered sign-in state.

**Comparison history**

- Initial pass: blocked because the target route could not render in the required authenticated state. No visual fixes were made from this pass.

**Implementation checklist**

- Restore the local PostgreSQL service and seed a subscribed manager workplace.
- Capture the Attendance tab at the reference desktop viewport and a narrow responsive viewport.
- Exercise month selection, worker search, chart tooltip, tabs, and horizontal matrix scrolling.
- Compare the rendered report with the source image and resolve any P0/P1/P2 differences.

**Follow-up polish**

- None classified until a comparable implementation capture exists.

final result: blocked
