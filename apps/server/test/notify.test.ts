import { describe, expect, test } from "bun:test";

import { notificationTopicForKind } from "../src/notify";

describe("notificationTopicForKind", () => {
	test("maps schedule-related kinds", () => {
		expect(notificationTopicForKind("schedule_published")).toBe("schedule");
		expect(notificationTopicForKind("late_change")).toBe("schedule");
		expect(notificationTopicForKind("open_shift")).toBe("schedule");
		expect(notificationTopicForKind("swap_request")).toBe("schedule");
		expect(notificationTopicForKind("acceptance_response")).toBe("schedule");
	});

	test("maps time-off kinds", () => {
		expect(notificationTopicForKind("time_off_requested")).toBe("timeOff");
		expect(notificationTopicForKind("time_off_approved")).toBe("timeOff");
		expect(notificationTopicForKind("unavailability_requested")).toBe(
			"timeOff",
		);
	});

	test("maps time-clock kinds", () => {
		expect(notificationTopicForKind("time_entry.auto_clocked_out")).toBe(
			"timeClock",
		);
	});

	test("maps message kinds", () => {
		expect(notificationTopicForKind("announcement")).toBe("messages");
	});

	test("leaves unknown kinds unfiltered", () => {
		expect(notificationTopicForKind("pilot_feedback")).toBeNull();
	});
});
