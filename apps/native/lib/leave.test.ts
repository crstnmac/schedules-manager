import { describe, expect, test } from "bun:test";
import { formatDateKey } from "./leave";

// Regression guard for the native worker home screen date-key off-by-one.
// See apps/native/app/(tabs)/index.tsx — date-key call sites route through
// formatDateKey (noon-anchor) so a YYYY-MM-DD key is not re-shifted across
// timezones. Bun honors runtime TZ changes, so each test sets process.env.TZ.
describe("formatDateKey (date-only keys, noon-anchor)", () => {
	test("US negative-offset tz renders the key's calendar day", () => {
		process.env.TZ = "America/New_York";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
		process.env.TZ = "America/Chicago";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
		process.env.TZ = "America/Los_Angeles";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
	});

	test("UTC+0 and east-of-UTC unchanged", () => {
		process.env.TZ = "Europe/London";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
		process.env.TZ = "Asia/Tokyo";
		expect(formatDateKey("2026-09-04")).toBe("Fri, Sep 4");
	});

	test("year boundary & DST transition in US/Eastern", () => {
		process.env.TZ = "America/New_York";
		expect(formatDateKey("2026-12-31")).toBe("Thu, Dec 31");
		expect(formatDateKey("2026-03-08")).toBe("Sun, Mar 8");
	});
});
