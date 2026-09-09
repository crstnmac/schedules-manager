import { describe, expect, test } from "bun:test";
import { acceptanceHeadline } from "./acceptance-headline";

// Regression guard for the pending-acceptance card headline on the native
// worker Home tab (apps/native/app/(tabs)/index.tsx). `a.date` is a
// YYYY-MM-DD date-key routed through formatDateKey (noon-anchor) so a
// west-of-UTC device tz does not shift it back a calendar day. The timezone
// matrix for formatDateKey itself is covered by leave.test.ts; here we pin
// the helper's noon-anchor wiring and the `<date> · <positionName>` join.
// Bun honors runtime TZ changes, so each test sets process.env.TZ.
describe("acceptanceHeadline (date-key headline, noon-anchor)", () => {
	test("west-of-UTC device tz renders the key's calendar day · positionName", () => {
		process.env.TZ = "America/New_York";
		expect(acceptanceHeadline("2026-09-04", "Bar")).toBe("Fri, Sep 4 · Bar");
	});

	test("positionName with spaces is preserved verbatim across the join", () => {
		process.env.TZ = "America/New_York";
		expect(acceptanceHeadline("2026-12-31", "Front of House")).toBe(
			"Thu, Dec 31 · Front of House",
		);
	});
});
