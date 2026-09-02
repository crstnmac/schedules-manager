import { describe, expect, test } from "bun:test";

import {
	monthKeys,
	monthStartForView,
	monthStartOf,
} from "./schedule-calendar";

describe("schedule calendar months", () => {
	test("a week starting in August still opens September when Thursday is in September", () => {
		expect(monthStartForView("2026-08-31")).toBe("2026-09-01");
	});

	test("September 2026 with Monday week start includes the trailing August and leading October days", () => {
		const days = monthKeys("2026-09-01", 1);
		expect(days).toHaveLength(42);
		expect(days[0]).toBe("2026-08-31");
		expect(days[1]).toBe("2026-09-01");
		expect(days[41]).toBe("2026-10-11");
		expect(monthStartOf("2026-09-16")).toBe("2026-09-01");
	});
});
