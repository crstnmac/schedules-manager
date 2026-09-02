import { describe, expect, test } from "bun:test";

import {
	filterTimeZones,
	groupTimeZones,
	ianaTimeZones,
	timeZoneOptions,
	timezoneLabel,
} from "./timezones";

describe("IANA time zones", () => {
	test("includes zones across continents", () => {
		const zones = ianaTimeZones();
		expect(zones).toContain("America/Chicago");
		expect(zones).toContain("Europe/London");
		expect(zones).toContain("Asia/Kolkata");
		expect(zones).toContain("Pacific/Auckland");
		expect(zones).toContain("Africa/Lagos");
		expect(zones.length).toBeGreaterThan(300);
	});

	test("filters by city, region, or UTC offset", () => {
		expect(filterTimeZones("tokyo")).toContain("Asia/Tokyo");
		expect(filterTimeZones("London")).toContain("Europe/London");
		expect(filterTimeZones("new york")).toContain("America/New_York");
		expect(filterTimeZones("utc+5:30").length).toBeGreaterThan(0);
	});

	test("labels a zone with its current offset", () => {
		expect(timezoneLabel("Asia/Tokyo")).toContain("Asia/Tokyo");
		expect(timezoneLabel("Asia/Tokyo")).toMatch(/UTC\+9|UTC\+09/);
	});

	test("groups zones by region", () => {
		const options = timeZoneOptions();
		const groups = groupTimeZones(options);
		expect(groups.some((group) => group.region === "America")).toBe(true);
		expect(groups.some((group) => group.region === "Europe")).toBe(true);
		expect(groups.some((group) => group.region === "Asia")).toBe(true);
		expect(groups.reduce((sum, group) => sum + group.zones.length, 0)).toBe(
			options.length,
		);
	});
});
